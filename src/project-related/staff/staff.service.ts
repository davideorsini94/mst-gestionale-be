import { Injectable, NotFoundException, Inject, forwardRef, BadRequestException } from '@nestjs/common';
import { BaseService } from '../../common/base-crud/base.service';
import { Staff, StaffDocument, StaffDocumentType } from './entities/staff.entity';
import { CreateStaffDto } from './dto/create-staff.dto';
import { UpdateStaffDto } from './dto/update-staff.dto';
import { FindOptionsOrder } from 'typeorm';
import { dataSource } from '../../datasources/data-source';
import { FileService } from '../../common/files/file.service';
import { ReminderService } from '../reminders/reminder.service';
import { blindIndex } from '../../common/crypto/field-crypto';
import { assertUniqueFiscalCode, normalizePersonFields } from '../../common/validators/person-fields';
import { Vehicle } from '../vehicles/entities/vehicle.entity';
import { PROFILE_IMAGE_TYPES } from '../../common/files/file-types';

@Injectable()
export class StaffService extends BaseService<Staff, CreateStaffDto, UpdateStaffDto> {
  private documentRepository = dataSource.getRepository(StaffDocument);

  constructor(
    private readonly fileService: FileService,
    @Inject(forwardRef(() => ReminderService))
    private readonly reminderService: ReminderService,
  ) {
    super(Staff);
  }

  /** Cancella lo staff con foto e documenti, annulla i suoi reminder e lo toglie dai veicoli assegnati. */
  async delete(uuid: string): Promise<Staff> {
    const staff = await this.repo.findOne({ where: { uuid }, relations: ['documents'] });
    if (!staff) {
      throw new NotFoundException('Membro dello staff non trovato');
    }
    const fileUuids = [staff.profileImageUuid, ...staff.documents.map((d) => d.fileUuid)].filter(Boolean);
    const vehicles = await this.assignedVehicles(uuid);
    // tutto o niente: veicoli e tesserati collegati hanno un vincolo verso staff (senza scollegarli: errore 500)
    await dataSource.transaction(async (manager) => {
      await manager.query(`UPDATE vehicles SET "assignedStaffUuid" = NULL WHERE "assignedStaffUuid" = $1`, [uuid]);
      await manager.query(`UPDATE members SET "staffUuid" = NULL WHERE "staffUuid" = $1`, [uuid]);
      await manager.query(`DELETE FROM staff WHERE uuid = $1`, [uuid]);
    });
    await this.reminderService.cancelRemindersForEntity(uuid);
    // i promemoria dei veicoli che aveva in carico tornano all'admin
    for (const vehicle of vehicles) {
      await this.reminderService.updateVehicleReminders({ ...vehicle, assignedStaffUuid: null });
    }
    await this.fileService.deleteFilesQuietly(fileUuids);
    return staff;
  }

  protected getDefaultOrder(): FindOptionsOrder<Staff> {
    return { lastName: 'ASC', firstName: 'ASC' };
  }

  async create(dto: CreateStaffDto): Promise<Staff> {
    await this.prepareDto(dto, null);
    const staff = await super.create(dto);
    await this.reminderService.updateStaffReminders(staff);
    return staff;
  }

  async update(uuid: string, dto: UpdateStaffDto): Promise<Staff> {
    await this.prepareDto(dto, uuid);
    const staff = await super.update(uuid, dto);
    await this.reminderService.updateStaffReminders(staff);
    // email o nome cambiati: anche i promemoria dei veicoli assegnati vanno al nuovo indirizzo
    for (const vehicle of await this.assignedVehicles(uuid)) {
      await this.reminderService.updateVehicleReminders(vehicle);
    }
    return staff;
  }

  private assignedVehicles(staffUuid: string): Promise<Vehicle[]> {
    return dataSource.getRepository(Vehicle).find({ where: { assignedStaffUuid: staffUuid } });
  }

  /**
   * Normalizza e controlla i dati prima del salvataggio. I campi azzerabili (livello allenatore, utente collegato)
   * arrivano come null esplicito: restano nel dto e il salvataggio li scrive come NULL (un campo assente invece
   * lascia il valore precedente).
   */
  private async prepareDto(dto: CreateStaffDto | UpdateStaffDto, uuid: string | null): Promise<void> {
    normalizePersonFields(dto as Record<string, any>);
    for (const field of ['coachLevel', 'linkedUserUuid'] as const) {
      if (field in dto && (dto as any)[field] === '') (dto as any)[field] = null;
    }
    if (dto.fiscalCode) {
      await assertUniqueFiscalCode(this.repo, dto.fiscalCode, uuid, 'un membro dello staff');
    }
    if (dto.linkedUserUuid) {
      const [user] = await this.repo.query(`SELECT 1 FROM users WHERE uuid = $1`, [dto.linkedUserUuid]);
      if (!user) {
        // collegamento rimasto da un utente cancellato in passato: la scheda rimanda il valore salvato, si azzera
        const [current] = uuid ? await this.repo.query(`SELECT "linkedUserUuid" FROM staff WHERE uuid = $1`, [uuid]) : [];
        if (current?.linkedUserUuid && String(current.linkedUserUuid).toLowerCase() === String(dto.linkedUserUuid).toLowerCase()) {
          dto.linkedUserUuid = null;
        } else {
          throw new BadRequestException('Utente collegato inesistente');
        }
      }
    }
  }

  async findByEmail(email: string): Promise<Staff | null> {
    // L'email è cifrata: la ricerca esatta usa il blind index
    const emailHash = blindIndex(email, 'ci');
    if (!emailHash) return null;
    return this.repo.findOne({ where: { emailHash } });
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
      throw new NotFoundException('Membro dello staff non trovato');
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
      throw new NotFoundException('Membro dello staff non trovato');
    }

    // Struttura: staff/{uuid}/documents/{tipo}
    if (!Object.values(StaffDocumentType).includes(documentType)) {
      throw new BadRequestException(`Tipo di documento non valido: ${documentType}`);
    }
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

    try {
      return await this.documentRepository.save(document);
    } catch (error) {
      // il file è già su MinIO: senza il documento resterebbe orfano
      await this.fileService.deleteFilesQuietly([fileEntity.uuid]);
      throw error;
    }
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

  async getDocumentStaffUuid(documentUuid: string): Promise<string> {
    const document = await this.documentRepository.findOne({ where: { uuid: documentUuid } });
    if (!document) {
      throw new NotFoundException('Documento non trovato');
    }
    return document.staffUuid;
  }

  async deleteDocument(documentUuid: string): Promise<void> {
    const document = await this.documentRepository.findOne({
      where: { uuid: documentUuid },
    });
    if (!document) {
      throw new NotFoundException('Documento non trovato');
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
      throw new NotFoundException('Membro dello staff non trovato');
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

    return this.stripSecrets(savedStaff);
  }

  async uploadProfileImage(staffUuid: string, file: { filename: string; buffer: Buffer; mimetype: string }): Promise<Staff> {
    if (!PROFILE_IMAGE_TYPES.includes(String(file?.mimetype ?? '').toLowerCase())) {
      throw new BadRequestException('La foto profilo deve essere un\'immagine JPG, PNG, WEBP, GIF o HEIC');
    }
    const staff = await this.findByUuid(staffUuid);
    if (!staff) {
      throw new NotFoundException('Membro dello staff non trovato');
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
    
    return this.stripSecrets(savedStaff);
  }
}
