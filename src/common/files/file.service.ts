import { Injectable, NotFoundException } from '@nestjs/common';
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
    console.log(`[FileService] uploadFile called - filename: ${file.filename}, folder: ${folder}, bufferSize: ${file.buffer?.length}`);
    
    if (!file.buffer || file.buffer.length === 0) {
      throw new Error('File buffer is empty or undefined');
    }
    
    // Nome opaco: il nome originale (spesso con dati personali) resta solo nel DB, cifrato
    const ext = path.extname(file.filename || '').toLowerCase();
    const safeExt = /^\.[a-z0-9]{1,8}$/.test(ext) ? ext : '';
    const minioPath = `${folder}/${randomUUID()}${safeExt}`;
    
    console.log(`[FileService] Uploading to MinIO path: ${minioPath}`);
    
    // Upload to MinIO
    const savedPath = await this.minioService.uploadFile(minioPath, file.buffer, file.mimetype);
    console.log(`[FileService] MinIO upload complete, savedPath: ${savedPath}`);

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
    console.log(`[FileService] File entity saved to DB with uuid: ${saved.uuid}`);
    
    return saved;
  }

  async getFileStream(fileUuid: string): Promise<{ stream: any; mimeType: string; originalName: string }> {
    const file = await this.fileRepository.findOne({ where: { uuid: fileUuid } });
    if (!file) {
      throw new NotFoundException(`File with uuid ${fileUuid} not found`);
    }

    const stream = await this.minioService.getFile(file.minioPath);
    return {
      stream,
      mimeType: file.mimeType || 'application/octet-stream',
      originalName: file.originalName,
    };
  }

  async findByUuid(uuid: string): Promise<File | null> {
    return this.fileRepository.findOne({ where: { uuid } });
  }

  /**
   * Elimina solo il file da MinIO (senza toccare il DB)
   */
  async deleteFileFromMinio(minioPath: string): Promise<void> {
    try {
      await this.minioService.deleteFile(minioPath);
      console.log(`[FileService] File deleted from MinIO: ${minioPath}`);
    } catch (error) {
      console.error(`[FileService] Error deleting file from MinIO: ${minioPath}`, error);
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
      throw new NotFoundException(`File with uuid ${fileUuid} not found`);
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
