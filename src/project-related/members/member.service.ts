import { Injectable, NotFoundException, Inject, forwardRef } from '@nestjs/common';
import { BaseService } from '../../common/base-crud/base.service';
import { Member, MemberDocument, MemberDocumentType, Gender, MemberType } from './entities/member.entity';
import { CreateMemberDto } from './dto/create-member.dto';
import { UpdateMemberDto } from './dto/update-member.dto';
import { FindOptionsOrder } from 'typeorm';
import { dataSource } from '../../datasources/data-source';
import { FileService } from '../../common/files/file.service';
import { ReminderService } from '../reminders/reminder.service';

export interface HotelBookingEntry {
  firstName: string;
  lastName: string;
  birthDate: string;
  birthPlace: string;
  gender: Gender;
}

export interface HotelBookingList {
  males: HotelBookingEntry[];
  females: HotelBookingEntry[];
  generatedAt: Date;
  totalCount: number;
}

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
    const member = await super.create(dto);
    await this.reminderService.updateMemberReminders(member);
    return member;
  }

  async update(uuid: string, dto: UpdateMemberDto): Promise<Member> {
    const member = await super.update(uuid, dto);
    await this.reminderService.updateMemberReminders(member);
    return member;
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
      throw new NotFoundException(`Member with uuid ${uuid} not found`);
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

  async generateHotelBookingList(memberUuids: string[]): Promise<HotelBookingList> {
    const members = await this.repo.find({
      where: memberUuids.map(uuid => ({ uuid })),
    });

    const males: HotelBookingEntry[] = [];
    const females: HotelBookingEntry[] = [];

    for (const member of members) {
      const entry: HotelBookingEntry = {
        firstName: member.firstName,
        lastName: member.lastName,
        birthDate: member.birthDate,
        birthPlace: member.birthPlace,
        gender: member.gender,
      };

      if (member.gender === Gender.MALE) {
        males.push(entry);
      } else if (member.gender === Gender.FEMALE) {
        females.push(entry);
      }
    }

    // Ordina per cognome e nome
    const sortFn = (a: HotelBookingEntry, b: HotelBookingEntry) => {
      const lastNameCompare = a.lastName.localeCompare(b.lastName);
      if (lastNameCompare !== 0) return lastNameCompare;
      return a.firstName.localeCompare(b.firstName);
    };

    males.sort(sortFn);
    females.sort(sortFn);

    return {
      males,
      females,
      generatedAt: new Date(),
      totalCount: males.length + females.length,
    };
  }

  async uploadDocument(
    memberUuid: string,
    file: { filename: string; buffer: Buffer; mimetype: string },
    documentType: MemberDocumentType,
    description?: string,
    expiryDate?: Date,
  ): Promise<MemberDocument> {
    const member = await this.findByUuid(memberUuid);
    if (!member) {
      throw new NotFoundException(`Member with uuid ${memberUuid} not found`);
    }

    // Struttura: members/{uuid}/documents/{tipo}
    const docTypeFolder = documentType.toLowerCase().replace(/_/g, '-');
    const folder = `members/${memberUuid}/documents/${docTypeFolder}`;

    // Upload file tramite FileService
    const fileEntity = await this.fileService.uploadFile(file, folder, description);

    const document = this.documentRepository.create({
      documentType,
      description,
      expiryDate,
      fileUuid: fileEntity.uuid,
      memberUuid,
    });

    return this.documentRepository.save(document);
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

  async deleteProfileImage(memberUuid: string): Promise<Member> {
    const member = await this.findByUuid(memberUuid);
    if (!member) {
      throw new NotFoundException(`Member with uuid ${memberUuid} not found`);
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

    return savedMember;
  }

  async uploadProfileImage(memberUuid: string, file: { filename: string; buffer: Buffer; mimetype: string }): Promise<Member> {
    console.log(`[MemberService] uploadProfileImage called for member: ${memberUuid}`);
    console.log(`[MemberService] File info - filename: ${file.filename}, mimetype: ${file.mimetype}, bufferSize: ${file.buffer?.length}`);

    const member = await this.findByUuid(memberUuid);
    if (!member) {
      throw new NotFoundException(`Member with uuid ${memberUuid} not found`);
    }

    const oldProfileImageUuid = member.profileImageUuid;

    // Struttura: members/{uuid}/profile
    const folder = `members/${memberUuid}/profile`;
    console.log(`[MemberService] Uploading to folder: ${folder}`);

    const fileEntity = await this.fileService.uploadFile(file, folder, 'Profile image');
    console.log(`[MemberService] File entity created with uuid: ${fileEntity.uuid}`);

    // Prima aggiorna il member con il nuovo file
    member.profileImageUuid = fileEntity.uuid;
    const savedMember = await this.repo.save(member);
    console.log(`[MemberService] Member updated with profileImageUuid: ${savedMember.profileImageUuid}`);

    // Poi elimina il vecchio file
    if (oldProfileImageUuid) {
      console.log(`[MemberService] Deleting old profile image: ${oldProfileImageUuid}`);
      const oldFile = await this.fileService.findByUuid(oldProfileImageUuid);
      if (oldFile?.minioPath) {
        try {
          await this.fileService.deleteFileFromMinio(oldFile.minioPath);
        } catch (e) {
          console.log(`[MemberService] Error deleting old image from MinIO (ignored):`, e);
        }
      }
      await this.fileService.deleteFileRecord(oldProfileImageUuid);
    }

    return savedMember;
  }
}
