import { Entity, Column, OneToMany, ManyToOne, JoinColumn, OneToOne } from 'typeorm';
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
  @Column()
  firstName: string;

  @Column()
  lastName: string;

  @Column({ type: 'enum', enum: Gender, nullable: true })
  gender: Gender;

  @Column({ nullable: true })
  fiscalCode: string;

  @Column({ type: 'date', nullable: true })
  birthDate: Date;

  @Column({ nullable: true })
  birthPlace: string;

  @Column({ nullable: true })
  birthProvince: string;

  @Column({ nullable: true })
  nationality: string;

  @Column({ nullable: true })
  email: string;

  @Column({ nullable: true })
  phone: string;

  @Column({ nullable: true })
  address: string;

  @Column({ nullable: true })
  city: string;

  @Column({ nullable: true })
  province: string;

  @Column({ nullable: true })
  postalCode: string;

  @Column({ type: 'enum', enum: MemberType, default: MemberType.MEMBER })
  memberType: MemberType;

  @Column({ type: 'enum', enum: MemberStatus, default: MemberStatus.ACTIVE })
  status: MemberStatus;

  // Agonista o no
  @Column({ default: false })
  isCompetitor: boolean;

  // Codici federazione
  @Column({ nullable: true })
  fisiCode: string; // Codice FISI (Federazione Italiana Sport Invernali)

  @Column({ nullable: true })
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
  @Column({ nullable: true })
  emergencyContact: string;

  @Column({ nullable: true })
  emergencyPhone: string;

  @Column({ type: 'text', nullable: true })
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

  @Column({ type: 'text', nullable: true })
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
