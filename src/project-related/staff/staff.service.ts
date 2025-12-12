import { Injectable, NotFoundException } from '@nestjs/common';
import { BaseService } from '../../common/base-crud/base.service';
import { Staff, StaffDocument, StaffDocumentType } from './entities/staff.entity';
import { CreateStaffDto } from './dto/create-staff.dto';
import { UpdateStaffDto } from './dto/update-staff.dto';
import { FindOptionsOrder } from 'typeorm';
import { dataSource } from '../../datasources/data-source';
import { FileService } from '../../common/files/file.service';

@Injectable()
export class StaffService extends BaseService<Staff, CreateStaffDto, UpdateStaffDto> {
  private documentRepository = dataSource.getRepository(StaffDocument);

  constructor(private readonly fileService: FileService) {
    super(Staff);
  }

  protected getDefaultOrder(): FindOptionsOrder<Staff> {
    return { lastName: 'ASC', firstName: 'ASC' };
  }

  async findByEmail(email: string): Promise<Staff | null> {
    if (!email) return null;
    return this.repo.findOne({ where: { email } });
  }

  async findByLinkedUserUuid(userUuid: string): Promise<Staff | null> {
    if (!userUuid) return null;
    return this.repo.findOne({ where: { linkedUserUuid: userUuid } });
  }

  async findByUuidWithDocuments(uuid: string): Promise<Staff & { profileImage?: any; documents: Array<any> }> {
    const staff = await this.repo.findOne({
      where: { uuid },
      relations: ['documents'],
    });
    if (!staff) {
      throw new NotFoundException(`Staff with uuid ${uuid} not found`);
    }
    
    // Carica manualmente il file della foto profilo
    let profileImage = null;
    if (staff.profileImageUuid) {
      profileImage = await this.fileService.findByUuid(staff.profileImageUuid);
    }
    
    // Carica manualmente i file dei documenti
    const documentsWithFiles = await Promise.all(
      staff.documents.map(async (doc) => {
        const file = doc.fileUuid ? await this.fileService.findByUuid(doc.fileUuid) : null;
        return { ...doc, file };
      })
    );
    
    return { ...staff, profileImage, documents: documentsWithFiles };
  }

  async uploadDocument(
    staffUuid: string,
    file: { filename: string; buffer: Buffer; mimetype: string },
    documentType: StaffDocumentType,
    description?: string,
  ): Promise<StaffDocument> {
    const staff = await this.findByUuid(staffUuid);
    if (!staff) {
      throw new NotFoundException(`Staff with uuid ${staffUuid} not found`);
    }

    // Struttura: staff/{uuid}/documents/{tipo}
    const docTypeFolder = documentType.toLowerCase().replace(/_/g, '-');
    const folder = `staff/${staffUuid}/documents/${docTypeFolder}`;
    
    // Upload file tramite FileService
    const fileEntity = await this.fileService.uploadFile(file, folder, description);

    const document = this.documentRepository.create({
      documentType,
      description,
      fileUuid: fileEntity.uuid,
      staffUuid,
    });

    return this.documentRepository.save(document);
  }

  async getDocuments(staffUuid: string): Promise<StaffDocument[]> {
    const documents = await this.documentRepository.find({
      where: { staffUuid },
      order: { createdAt: 'DESC' },
    });
    
    // Carica manualmente i file
    return Promise.all(
      documents.map(async (doc) => {
        const file = doc.fileUuid ? await this.fileService.findByUuid(doc.fileUuid) : null;
        return { ...doc, file };
      })
    );
  }

  async deleteDocument(documentUuid: string): Promise<void> {
    const document = await this.documentRepository.findOne({
      where: { uuid: documentUuid },
    });
    if (!document) {
      throw new NotFoundException(`Document with uuid ${documentUuid} not found`);
    }
    
    const fileUuid = document.fileUuid;
    
    // Carica il file per ottenere il minioPath
    const file = fileUuid ? await this.fileService.findByUuid(fileUuid) : null;
    
    // 1. Prima elimina il file da MinIO
    if (file?.minioPath) {
      await this.fileService.deleteFileFromMinio(file.minioPath);
    }
    
    // 2. Elimina il documento dal DB
    await this.documentRepository.remove(document);
    
    // 3. Elimina il record file dal DB
    if (fileUuid) {
      await this.fileService.deleteFileRecord(fileUuid);
    }
  }

  async deleteProfileImage(staffUuid: string): Promise<Staff> {
    const staff = await this.findByUuid(staffUuid);
    if (!staff) {
      throw new NotFoundException(`Staff with uuid ${staffUuid} not found`);
    }

    if (!staff.profileImageUuid) {
      throw new NotFoundException('Nessuna foto profilo da eliminare');
    }

    const file = await this.fileService.findByUuid(staff.profileImageUuid);
    
    // 1. Prima elimina il file da MinIO
    if (file?.minioPath) {
      await this.fileService.deleteFileFromMinio(file.minioPath);
    }

    // 2. Rimuovi il riferimento dallo staff
    const fileUuid = staff.profileImageUuid;
    staff.profileImageUuid = null;
    const savedStaff = await this.repo.save(staff);

    // 3. Elimina il record file dal DB
    await this.fileService.deleteFileRecord(fileUuid);

    return savedStaff;
  }

  async uploadProfileImage(staffUuid: string, file: { filename: string; buffer: Buffer; mimetype: string }): Promise<Staff> {
    const staff = await this.findByUuid(staffUuid);
    if (!staff) {
      throw new NotFoundException(`Staff with uuid ${staffUuid} not found`);
    }

    const oldProfileImageUuid = staff.profileImageUuid;

    // Struttura: staff/{uuid}/profile
    const folder = `staff/${staffUuid}/profile`;
    const fileEntity = await this.fileService.uploadFile(file, folder, 'Profile image');

    // Prima aggiorna lo staff con il nuovo file
    staff.profileImageUuid = fileEntity.uuid;
    const savedStaff = await this.repo.save(staff);

    // Poi elimina il vecchio file
    if (oldProfileImageUuid) {
      const oldFile = await this.fileService.findByUuid(oldProfileImageUuid);
      if (oldFile?.minioPath) {
        try {
          await this.fileService.deleteFileFromMinio(oldFile.minioPath);
        } catch (e) {
          console.log(`[StaffService] Error deleting old image from MinIO (ignored):`, e);
        }
      }
      await this.fileService.deleteFileRecord(oldProfileImageUuid);
    }
    
    return savedStaff;
  }
}
