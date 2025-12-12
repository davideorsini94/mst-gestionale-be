import { Entity, Column, OneToMany, JoinColumn, ManyToOne } from 'typeorm';
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
  @Column()
  firstName: string;

  @Column()
  lastName: string;

  @Column({ type: 'enum', enum: Gender, nullable: true })
  gender: Gender;

  @Column({ nullable: true })
  fiscalCode: string;

  @Column({ nullable: true })
  email: string;

  @Column({ nullable: true })
  phone: string;

  @Column({ nullable: true })
  address: string;

  @Column({ nullable: true })
  city: string;

  @Column({ nullable: true })
  postalCode: string;

  @Column({ type: 'date', nullable: true })
  birthDate: Date;

  @Column({ nullable: true })
  birthPlace: string;

  @Column({ type: 'enum', enum: StaffRole, default: StaffRole.OTHER })
  staffRole: StaffRole;

  @Column({ type: 'enum', enum: StaffStatus, default: StaffStatus.ACTIVE })
  status: StaffStatus;

  @Column({ type: 'date', nullable: true })
  hireDate: Date;

  @Column({ type: 'date', nullable: true })
  endDate: Date;

  @Column({ nullable: true })
  emergencyContact: string;

  @Column({ nullable: true })
  emergencyPhone: string;

  @Column({ type: 'text', nullable: true })
  notes: string;

  // Foto profilo (UUID del file, senza FK constraint per flessibilità)
  @Column({ nullable: true })
  profileImageUuid: string;

  // Collegamento all'utente del sistema (per login e permessi)
  @Column({ nullable: true })
  linkedUserUuid: string;

  // Qualifiche e certificazioni
  @Column({ nullable: true })
  drivingLicense: string;

  @Column({ type: 'date', nullable: true })
  drivingLicenseExpiry: Date;

  @Column({ nullable: true })
  skiInstructorLicense: string;

  @Column({ type: 'date', nullable: true })
  skiInstructorLicenseExpiry: Date;

  @Column({ nullable: true })
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

  @Column({ type: 'text', nullable: true })
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
