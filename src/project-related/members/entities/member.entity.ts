import { Entity, Column, OneToMany, ManyToOne, JoinColumn, OneToOne } from 'typeorm';
import { EncryptedColumn } from '../../../common/crypto/encrypted-column';
import { IctBaseEntity } from '../../../common/base-crud/ict-base.entity';
import { Staff } from '../../staff/entities/staff.entity';

export enum Gender {
  MALE = 'M',
  FEMALE = 'F',
}

export enum MemberType {
  ATHLETE = 'ATHLETE',
  PARENT = 'PARENT',
  MEMBER = 'MEMBER', // Persona comune
}

export enum MemberStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  SUSPENDED = 'SUSPENDED',
}

@Entity('members')
export class Member extends IctBaseEntity {
  @EncryptedColumn()
  firstName: string;

  @EncryptedColumn()
  lastName: string;

  @Column({ type: 'enum', enum: Gender, nullable: true })
  gender: Gender;

  @EncryptedColumn({ nullable: true, hash: { property: 'fiscalCodeHash', kind: 'ci' } })
  fiscalCode: string;

  @Column({ nullable: true, select: false })
  fiscalCodeHash: string;

  @EncryptedColumn({ nullable: true, date: true })
  birthDate: string;

  @EncryptedColumn({ nullable: true })
  birthPlace: string;

  @EncryptedColumn({ nullable: true })
  birthProvince: string;

  @EncryptedColumn({ nullable: true })
  nationality: string;

  @EncryptedColumn({ nullable: true, hash: { property: 'emailHash', kind: 'ci' } })
  email: string;

  @Column({ nullable: true, select: false })
  emailHash: string;

  @EncryptedColumn({ nullable: true })
  phone: string;

  @EncryptedColumn({ nullable: true })
  address: string;

  @EncryptedColumn({ nullable: true })
  city: string;

  @EncryptedColumn({ nullable: true })
  province: string;

  @EncryptedColumn({ nullable: true })
  postalCode: string;

  @Column({ type: 'enum', enum: MemberType, default: MemberType.MEMBER })
  memberType: MemberType;

  @Column({ type: 'enum', enum: MemberStatus, default: MemberStatus.ACTIVE })
  status: MemberStatus;

  // Agonista o no
  @Column({ default: false })
  isCompetitor: boolean;

  // Codici federazione
  @EncryptedColumn({ nullable: true })
  fisiCode: string; // Codice FISI (Federazione Italiana Sport Invernali)

  @EncryptedColumn({ nullable: true })
  fisCode: string; // Codice FIS (Federazione Internazionale Sci)

  // Visita medica sportiva
  @Column({ type: 'date', nullable: true })
  medicalExamExpiry: Date;

  @Column({ default: false })
  medicalExamCompetitive: boolean; // true = agonistica, false = non agonistica

  // Foto profilo (UUID del file, senza FK constraint per flessibilità)
  @Column({ nullable: true })
  profileImageUuid: string;

  // Contatto emergenza
  @EncryptedColumn({ nullable: true })
  emergencyContact: string;

  @EncryptedColumn({ nullable: true })
  emergencyPhone: string;

  @EncryptedColumn({ nullable: true, type: 'text' })
  notes: string;

  // Data tesseramento
  @Column({ type: 'date', nullable: true })
  membershipDate: Date;

  @Column({ type: 'date', nullable: true })
  membershipExpiry: Date;

  // Collegamento opzionale a Staff (se il tesserato è anche membro operativo)
  @OneToOne(() => Staff, { nullable: true })
  @JoinColumn({ name: 'staffUuid' })
  staff: Staff;

  @Column({ nullable: true })
  staffUuid: string;

  @OneToMany(() => MemberDocument, (doc) => doc.member)
  documents: MemberDocument[];
}

export enum MemberDocumentType {
  MEDICAL_EXAM = 'MEDICAL_EXAM',
  IDENTITY_DOCUMENT = 'IDENTITY_DOCUMENT',
  FISI_CARD = 'FISI_CARD',
  FIS_CARD = 'FIS_CARD',
  PHOTO = 'PHOTO',
  OTHER = 'OTHER',
}

@Entity('member_documents')
export class MemberDocument extends IctBaseEntity {
  @Column({ type: 'enum', enum: MemberDocumentType, default: MemberDocumentType.OTHER })
  documentType: MemberDocumentType;

  @EncryptedColumn({ nullable: true, type: 'text' })
  description: string;

  @Column({ type: 'date', nullable: true })
  expiryDate: Date;

  // Riferimento al file su MinIO (UUID senza FK constraint)
  @Column()
  fileUuid: string;

  @ManyToOne(() => Member, (member) => member.documents, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'memberUuid' })
  member: Member;

  @Column()
  memberUuid: string;
}
