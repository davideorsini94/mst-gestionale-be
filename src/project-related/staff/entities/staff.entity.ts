import { Entity, Column, OneToMany, JoinColumn, ManyToOne } from 'typeorm';
import { EncryptedColumn } from '../../../common/crypto/encrypted-column';
import { IctBaseEntity } from '../../../common/base-crud/ict-base.entity';

export enum StaffRole {
  INSTRUCTOR = 'INSTRUCTOR',
  DRIVER = 'DRIVER',
  ADMIN = 'ADMIN',
  VOLUNTEER = 'VOLUNTEER',
  OTHER = 'OTHER',
}

export enum StaffStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  ON_LEAVE = 'ON_LEAVE',
}

export enum Gender {
  MALE = 'M',
  FEMALE = 'F',
}

export enum CoachLevel {
  LEVEL_1 = 'I',
  LEVEL_2 = 'II',
  LEVEL_3 = 'III',
  LEVEL_4 = 'IV',
  NATIONAL = 'NAZIONALE',
}

@Entity('staff')
export class Staff extends IctBaseEntity {
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
  postalCode: string;

  @EncryptedColumn({ nullable: true, date: true })
  birthDate: string;

  @EncryptedColumn({ nullable: true })
  birthPlace: string;

  @Column({ type: 'enum', enum: StaffRole, default: StaffRole.OTHER })
  staffRole: StaffRole;

  @Column({ type: 'enum', enum: StaffStatus, default: StaffStatus.ACTIVE })
  status: StaffStatus;

  @Column({ type: 'date', nullable: true })
  hireDate: Date;

  @Column({ type: 'date', nullable: true })
  endDate: Date;

  @EncryptedColumn({ nullable: true })
  emergencyContact: string;

  @EncryptedColumn({ nullable: true })
  emergencyPhone: string;

  @EncryptedColumn({ nullable: true, type: 'text' })
  notes: string;

  // Foto profilo (UUID del file, senza FK constraint per flessibilità)
  @Column({ nullable: true })
  profileImageUuid: string;

  // Collegamento all'utente del sistema (per login e permessi)
  @Column({ nullable: true })
  linkedUserUuid: string;

  // Qualifiche e certificazioni
  @EncryptedColumn({ nullable: true })
  drivingLicense: string;

  @Column({ type: 'date', nullable: true })
  drivingLicenseExpiry: Date;

  @EncryptedColumn({ nullable: true })
  skiInstructorLicense: string;

  @Column({ type: 'date', nullable: true })
  skiInstructorLicenseExpiry: Date;

  @EncryptedColumn({ nullable: true })
  firstAidCertificate: string;

  @Column({ type: 'date', nullable: true })
  firstAidCertificateExpiry: Date;

  // Abilitazione Allenatore
  @Column({ default: false })
  isCoach: boolean;

  @Column({ type: 'enum', enum: CoachLevel, nullable: true })
  coachLevel: CoachLevel;

  @Column({ type: 'date', nullable: true })
  coachLicenseExpiry: Date;

  // Visita medica sportiva
  @Column({ type: 'date', nullable: true })
  medicalExamExpiry: Date;

  @OneToMany(() => StaffDocument, (doc) => doc.staff)
  documents: StaffDocument[];
}

export enum StaffDocumentType {
  MEDICAL_EXAM = 'MEDICAL_EXAM',
  COACH_LICENSE = 'COACH_LICENSE',
  DRIVING_LICENSE = 'DRIVING_LICENSE',
  FIRST_AID = 'FIRST_AID',
  OTHER = 'OTHER',
}

@Entity('staff_documents')
export class StaffDocument extends IctBaseEntity {
  @Column({ type: 'enum', enum: StaffDocumentType, default: StaffDocumentType.OTHER })
  documentType: StaffDocumentType;

  @EncryptedColumn({ nullable: true, type: 'text' })
  description: string;

  // Riferimento al file su MinIO (UUID senza FK constraint)
  @Column()
  fileUuid: string;

  @ManyToOne(() => Staff, (staff) => staff.documents, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'staffUuid' })
  staff: Staff;

  @Column()
  staffUuid: string;
}
