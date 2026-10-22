import { Injectable, NotFoundException, Inject, forwardRef, BadRequestException } from '@nestjs/common';
import { BaseService } from '../../common/base-crud/base.service';
import { Member, MemberDocument, MemberDocumentType, Gender, MemberType } from './entities/member.entity';
import { CreateMemberDto } from './dto/create-member.dto';
import { UpdateMemberDto } from './dto/update-member.dto';
import { FindOptionsOrder, In } from 'typeorm';
import { dataSource } from '../../datasources/data-source';
import { FileService } from '../../common/files/file.service';
import { ReminderService } from '../reminders/reminder.service';
import { assertUniqueFiscalCode, normalizePersonFields } from '../../common/validators/person-fields';
import { isCalendarDate } from '../../common/validators/calendar-date';
import { Staff } from '../staff/entities/staff.entity';
import { PROFILE_IMAGE_TYPES } from '../../common/files/file-types';

export interface HotelBookingEntry {
  firstName: string;
  lastName: string;
  birthDate: string;
  birthPlace: string;
  gender: Gender;
  /** Atleta (tesserato) o Allenatore (staff aggiunto alla lista) */
  role: 'Atleta' | 'Allenatore';
}

export interface HotelBookingGroup {
  males: HotelBookingEntry[];
  females: HotelBookingEntry[];
  /** Persone senza sesso in anagrafica: prima sparivano dalla lista senza avviso */
  unspecified: HotelBookingEntry[];
}

/** Atleti in males/females/unspecified; gli allenatori scelti in un gruppo separato, anch'esso diviso per sesso */
export interface HotelBookingList extends HotelBookingGroup {
  coaches: HotelBookingGroup;
  generatedAt: Date;
  totalCount: number;
  /** Avviso da mostrare (sesso non indicato, tesserati non trovati) */
  warnings: string[];
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Injectable()
export class MemberService extends BaseService<Member, CreateMemberDto, UpdateMemberDto> {
  private documentRepository = dataSource.getRepository(MemberDocument);

  constructor(
    private readonly fileService: FileService,
    @Inject(forwardRef(() => ReminderService))
    private readonly reminderService: ReminderService,
  ) {
    super(Member);
  }

  async create(dto: CreateMemberDto): Promise<Member> {
    await this.prepareDto(dto, null);
    const member = await super.create(dto);
    await this.reminderService.updateMemberReminders(member);
    return member;
  }

  async update(uuid: string, dto: UpdateMemberDto): Promise<Member> {
    await this.prepareDto(dto, uuid);
    const member = await super.update(uuid, dto);
    await this.reminderService.updateMemberReminders(member);
    return member;
  }

  /** Normalizza nome/email/codice fiscale e verifica che il codice fiscale non sia già di un altro tesserato. */
  private async prepareDto(dto: CreateMemberDto | UpdateMemberDto, uuid: string | null): Promise<void> {
    normalizePersonFields(dto as Record<string, any>);
    if ('staffUuid' in dto && (dto as any).staffUuid === '') dto.staffUuid = null;
    if (dto.fiscalCode) {
      await assertUniqueFiscalCode(this.repo, dto.fiscalCode, uuid, 'un tesserato');
    }
  }

  /** Cancella il tesserato con foto e documenti (DB e MinIO) e annulla i suoi reminder. */
  async delete(uuid: string): Promise<Member> {
    const member = await this.repo.findOne({ where: { uuid }, relations: ['documents'] });
    if (!member) {
      throw new NotFoundException('Tesserato non trovato');
    }
    const fileUuids = [member.profileImageUuid, ...member.documents.map((d) => d.fileUuid)].filter(Boolean);
    await this.reminderService.cancelRemindersForEntity(uuid);
    const deleted = await super.delete(uuid);
    // i file dopo il record: se MinIO non risponde resta al massimo un file orfano, mai un tesserato senza file
    await this.fileService.deleteFilesQuietly(fileUuids);
    return deleted;
  }

  protected getDefaultOrder(): FindOptionsOrder<Member> {
    return { lastName: 'ASC', firstName: 'ASC' };
  }

  async findByUuidWithDocuments(uuid: string): Promise<Member & { profileImage?: any; documents: Array<any> }> {
    const member = await this.repo.findOne({
      where: { uuid },
      relations: ['documents', 'staff'],
    });
    if (!member) {
      throw new NotFoundException('Tesserato non trovato');
    }

    // Carica manualmente il file della foto profilo
    let profileImage = null;
    if (member.profileImageUuid) {
      profileImage = await this.fileService.findByUuid(member.profileImageUuid);
    }

    // Carica manualmente i file dei documenti
    const documentsWithFiles = await Promise.all(
      member.documents.map(async (doc) => {
        const file = doc.fileUuid ? await this.fileService.findByUuid(doc.fileUuid) : null;
        return { ...doc, file };
      })
    );

    return { ...member, profileImage, documents: documentsWithFiles };
  }

  async findCompetitors(): Promise<Member[]> {
    // L'ordinamento per nome passa da BaseService.find (in memoria: i nomi sono cifrati)
    return this.find({
      where: { isCompetitor: true, memberType: MemberType.ATHLETE },
      order: { lastName: 'ASC', firstName: 'ASC' },
    });
  }

  async generateHotelBookingList(memberUuids: string[], staffUuids: string[] = []): Promise<HotelBookingList> {
    // con un elenco vuoto `where: []` non filtra nulla: la lista conteneva tutti i tesserati
    if (!Array.isArray(memberUuids) || memberUuids.length === 0) {
      throw new BadRequestException('Seleziona almeno un tesserato');
    }
    if (memberUuids.some((uuid) => typeof uuid !== 'string' || !UUID_RE.test(uuid))) {
      throw new BadRequestException('Elenco tesserati non valido');
    }
    if (!Array.isArray(staffUuids) || staffUuids.some((uuid) => typeof uuid !== 'string' || !UUID_RE.test(uuid))) {
      throw new BadRequestException('Elenco allenatori non valido');
    }
    // stesso uuid in maiuscolo e minuscolo = stessa persona (Postgres non distingue)
    const uniqueUuids = Array.from(new Set(memberUuids.map((u) => u.toLowerCase())));
    const uniqueStaff = Array.from(new Set(staffUuids.map((u) => u.toLowerCase())));
    const members = await this.repo.find({ where: { uuid: In(uniqueUuids) } });
    const coaches = uniqueStaff.length
      ? await dataSource.getRepository(Staff).find({ where: { uuid: In(uniqueStaff) } })
      : [];

    const athletes = this.groupByGender(
      members.map((member) => ({
        firstName: member.firstName,
        lastName: member.lastName,
        birthDate: member.birthDate,
        birthPlace: member.birthPlace,
        gender: member.gender,
        role: 'Atleta' as const,
      })),
    );
    // allenatori separati dagli atleti, ma sempre divisi per sesso (le camere si dividono così)
    const staffGroup = this.groupByGender(
      coaches.map((coach) => ({
        firstName: coach.firstName,
        lastName: coach.lastName,
        birthDate: coach.birthDate,
        birthPlace: coach.birthPlace,
        gender: coach.gender as unknown as Gender,
        role: 'Allenatore' as const,
      })),
    );
    const unspecifiedCount = athletes.unspecified.length + staffGroup.unspecified.length;
    const totalCount =
      athletes.males.length + athletes.females.length + athletes.unspecified.length +
      staffGroup.males.length + staffGroup.females.length + staffGroup.unspecified.length;

    const warnings: string[] = [];
    if (unspecifiedCount) {
      warnings.push(
        `${unspecifiedCount} ${unspecifiedCount === 1 ? 'persona' : 'persone'} senza sesso indicato: ` +
          'sono nella sezione "Sesso non indicato", completa l\'anagrafica per assegnarli alla camera giusta',
      );
    }
    const missing = uniqueUuids.length - members.length;
    if (missing > 0) {
      warnings.push(`${missing} tesserat${missing === 1 ? 'o non trovato (forse eliminato)' : 'i non trovati (forse eliminati)'}`);
    }
    const missingStaff = uniqueStaff.length - coaches.length;
    if (missingStaff > 0) {
      warnings.push(`${missingStaff} allenator${missingStaff === 1 ? 'e non trovato (forse eliminato)' : 'i non trovati (forse eliminati)'}`);
    }

    return {
      ...athletes,
      coaches: staffGroup,
      generatedAt: new Date(),
      totalCount,
      warnings,
    };
  }

  /** Divide per sesso e ordina per cognome e nome */
  private groupByGender(entries: HotelBookingEntry[]): HotelBookingGroup {
    const group: HotelBookingGroup = { males: [], females: [], unspecified: [] };
    for (const entry of entries) {
      if (String(entry.gender) === Gender.MALE) group.males.push(entry);
      else if (String(entry.gender) === Gender.FEMALE) group.females.push(entry);
      else group.unspecified.push(entry);
    }
    const byName = (a: HotelBookingEntry, b: HotelBookingEntry) =>
      (a.lastName ?? '').localeCompare(b.lastName ?? '') || (a.firstName ?? '').localeCompare(b.firstName ?? '');
    group.males.sort(byName);
    group.females.sort(byName);
    group.unspecified.sort(byName);
    return group;
  }

  async uploadDocument(
    memberUuid: string,
    file: { filename: string; buffer: Buffer; mimetype: string },
    documentType: MemberDocumentType,
    description?: string,
    expiryDate?: string,
  ): Promise<MemberDocument> {
    const member = await this.findByUuid(memberUuid);
    if (!member) {
      throw new NotFoundException('Tesserato non trovato');
    }

    // Struttura: members/{uuid}/documents/{tipo}
    if (!Object.values(MemberDocumentType).includes(documentType)) {
      throw new BadRequestException(`Tipo di documento non valido: ${documentType}`);
    }
    // new Date('2026-02-30') è un 2 marzo valido: si controlla la data di calendario
    if (expiryDate !== undefined && expiryDate !== null && !isCalendarDate(expiryDate)) {
      throw new BadRequestException('Data di scadenza non valida (usa AAAA-MM-GG)');
    }
    const docTypeFolder = documentType.toLowerCase().replace(/_/g, '-');
    const folder = `members/${memberUuid}/documents/${docTypeFolder}`;

    // Upload file tramite FileService
    const fileEntity = await this.fileService.uploadFile(file, folder, description);

    const document = this.documentRepository.create({
      documentType,
      description,
      // la stringa 'AAAA-MM-GG' va così com'è nella colonna date (un Date passerebbe dal fuso orario)
      expiryDate: (expiryDate ? expiryDate.slice(0, 10) : expiryDate) as any,
      fileUuid: fileEntity.uuid,
      memberUuid,
    });

    try {
      return await this.documentRepository.save(document);
    } catch (error) {
      // il file è già su MinIO: senza il documento resterebbe orfano
      await this.fileService.deleteFilesQuietly([fileEntity.uuid]);
      throw error;
    }
  }

  async getDocuments(memberUuid: string): Promise<MemberDocument[]> {
    const documents = await this.documentRepository.find({
      where: { memberUuid },
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

  async deleteProfileImage(memberUuid: string): Promise<Member> {
    const member = await this.findByUuid(memberUuid);
    if (!member) {
      throw new NotFoundException('Tesserato non trovato');
    }

    if (!member.profileImageUuid) {
      throw new NotFoundException('Nessuna foto profilo da eliminare');
    }

    const file = await this.fileService.findByUuid(member.profileImageUuid);

    // 1. Prima elimina il file da MinIO
    if (file?.minioPath) {
      await this.fileService.deleteFileFromMinio(file.minioPath);
    }

    // 2. Rimuovi il riferimento dal member
    const fileUuid = member.profileImageUuid;
    member.profileImageUuid = null;
    const savedMember = await this.repo.save(member);

    // 3. Elimina il record file dal DB
    await this.fileService.deleteFileRecord(fileUuid);

    return this.stripSecrets(savedMember);
  }

  async uploadProfileImage(memberUuid: string, file: { filename: string; buffer: Buffer; mimetype: string }): Promise<Member> {
    if (!PROFILE_IMAGE_TYPES.includes(String(file?.mimetype ?? '').toLowerCase())) {
      throw new BadRequestException('La foto profilo deve essere un\'immagine JPG, PNG, WEBP, GIF o HEIC');
    }

    const member = await this.findByUuid(memberUuid);
    if (!member) {
      throw new NotFoundException('Tesserato non trovato');
    }

    const oldProfileImageUuid = member.profileImageUuid;

    // Struttura: members/{uuid}/profile
    const folder = `members/${memberUuid}/profile`;

    const fileEntity = await this.fileService.uploadFile(file, folder, 'Profile image');

    // Prima aggiorna il member con il nuovo file
    member.profileImageUuid = fileEntity.uuid;
    const savedMember = await this.repo.save(member);

    // Poi elimina il vecchio file
    if (oldProfileImageUuid) {
      const oldFile = await this.fileService.findByUuid(oldProfileImageUuid);
      if (oldFile?.minioPath) {
        try {
          await this.fileService.deleteFileFromMinio(oldFile.minioPath);
        } catch {
          // il file vecchio resta su MinIO: non blocca il cambio foto
        }
      }
      await this.fileService.deleteFileRecord(oldProfileImageUuid);
    }

    return this.stripSecrets(savedMember);
  }
}
