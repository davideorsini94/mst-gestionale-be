import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { isActiveContent } from './file-types';
import { randomUUID } from 'crypto';
import * as path from 'path';
import { Repository } from 'typeorm';
import { File, FileType } from './entities/file.entity';
import { MinioService } from '../../minio/minio.service';
import { dataSource } from '../../datasources/data-source';

@Injectable()
export class FileService {
  private readonly fileRepository: Repository<File>;

  constructor(private readonly minioService: MinioService) {
    this.fileRepository = dataSource.getRepository(File);
  }

  async uploadFile(
    file: { filename: string; buffer: Buffer; mimetype: string },
    folder: string,
    description?: string,
  ): Promise<File> {
    if (!file?.buffer || file.buffer.length === 0) {
      throw new BadRequestException('Il file è vuoto');
    }
    if (isActiveContent(file.mimetype, file.filename)) {
      throw new BadRequestException('Tipo di file non consentito (HTML, SVG, XML o script)');
    }
    
    // Nome opaco: il nome originale (spesso con dati personali) resta solo nel DB, cifrato
    const ext = path.extname(file.filename || '').toLowerCase();
    const safeExt = /^\.[a-z0-9]{1,8}$/.test(ext) ? ext : '';
    const minioPath = `${folder}/${randomUUID()}${safeExt}`;

    // Upload to MinIO
    const savedPath = await this.minioService.uploadFile(minioPath, file.buffer, file.mimetype);

    const fileType = this.getFileType(file.mimetype);
    
    const fileEntity = this.fileRepository.create({
      originalName: file.filename,
      minioPath: savedPath,
      mimeType: file.mimetype,
      size: file.buffer.length,
      fileType,
      description,
    });

    const saved = await this.fileRepository.save(fileEntity);
    // nel log solo uuid e dimensione: il nome originale contiene spesso nome e cognome
    console.log(`[FileService] File caricato: ${saved.uuid} (${file.buffer.length} byte)`);
    
    return saved;
  }

  async getFileStream(fileUuid: string): Promise<{ stream: any; mimeType: string; originalName: string }> {
    const file = await this.fileRepository.findOne({ where: { uuid: fileUuid } });
    if (!file) {
      throw new NotFoundException('File non trovato');
    }

    const stream = await this.minioService.getFile(file.minioPath);
    return {
      stream,
      mimeType: file.mimeType || 'application/octet-stream',
      originalName: file.originalName,
    };
  }

  /** A chi appartiene il file (foto o documento di un tesserato/staff); null se non è collegato a nessuno. */
  async findOwner(uuid: string): Promise<{ type: 'member' | 'staff'; ownerUuid: string } | null> {
    if (!/^[0-9a-f-]{36}$/i.test(uuid)) return null;
    const [row] = await this.fileRepository.query(
      `SELECT 'member' AS type, uuid::text AS owner FROM members WHERE "profileImageUuid"::text = $1
       UNION ALL SELECT 'member', "memberUuid"::text FROM member_documents WHERE "fileUuid"::text = $1
       UNION ALL SELECT 'staff', uuid::text FROM staff WHERE "profileImageUuid"::text = $1
       UNION ALL SELECT 'staff', "staffUuid"::text FROM staff_documents WHERE "fileUuid"::text = $1
       LIMIT 1`,
      [uuid],
    );
    return row ? { type: row.type, ownerUuid: row.owner } : null;
  }

  async findByUuid(uuid: string): Promise<File | null> {
    return this.fileRepository.findOne({ where: { uuid } });
  }

  /**
   * Elimina file (MinIO + record) dopo la cancellazione del proprietario: un errore su un file viene registrato e non
   * blocca gli altri (il proprietario è già stato cancellato).
   */
  async deleteFilesQuietly(fileUuids: string[]): Promise<void> {
    for (const uuid of fileUuids) {
      try {
        const file = await this.findByUuid(uuid);
        if (!file) continue;
        if (file.minioPath) await this.minioService.deleteFile(file.minioPath);
        await this.fileRepository.remove(file);
      } catch (error) {
        console.error(`[FileService] File ${uuid} non eliminato: ${error.message}`);
      }
    }
  }

  /**
   * Elimina solo il file da MinIO (senza toccare il DB)
   */
  async deleteFileFromMinio(minioPath: string): Promise<void> {
    try {
      await this.minioService.deleteFile(minioPath);
    } catch (error) {
      // niente percorso nel log: i file delle versioni precedenti hanno nomi con dati personali
      console.error(`[FileService] Errore nella cancellazione di un file da MinIO: ${error?.message ?? error}`);
      throw error;
    }
  }

  /**
   * Elimina solo il record dal DB (senza toccare MinIO)
   */
  async deleteFileRecord(fileUuid: string): Promise<void> {
    const file = await this.fileRepository.findOne({ where: { uuid: fileUuid } });
    if (file) {
      await this.fileRepository.remove(file);
      console.log(`[FileService] File record deleted from DB: ${fileUuid}`);
    }
  }

  /**
   * Elimina file completo (MinIO + DB) - usare solo quando non ci sono FK constraints
   */
  async deleteFile(fileUuid: string): Promise<void> {
    const file = await this.fileRepository.findOne({ where: { uuid: fileUuid } });
    if (!file) {
      throw new NotFoundException('File non trovato');
    }

    await this.minioService.deleteFile(file.minioPath);
    await this.fileRepository.remove(file);
  }

  private getFileType(mimeType: string): FileType {
    if (mimeType.startsWith('image/')) {
      return FileType.IMAGE;
    }
    if (
      mimeType === 'application/pdf' ||
      mimeType === 'application/msword' ||
      mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      mimeType === 'application/vnd.ms-excel' ||
      mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ) {
      return FileType.DOCUMENT;
    }
    return FileType.OTHER;
  }
}
