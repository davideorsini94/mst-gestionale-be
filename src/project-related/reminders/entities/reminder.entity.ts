import { Entity, Column } from 'typeorm';
import { IctBaseEntity } from '../../../common/base-crud/ict-base.entity';

export enum ReminderType {
  VEHICLE_TAX = 'VEHICLE_TAX',           // Scadenza bollo
  VEHICLE_INSPECTION = 'VEHICLE_INSPECTION', // Scadenza tagliando
  VEHICLE_INSURANCE = 'VEHICLE_INSURANCE',   // Scadenza assicurazione
  MEDICAL_CERTIFICATE = 'MEDICAL_CERTIFICATE', // Scadenza certificato medico staff
  DRIVING_LICENSE = 'DRIVING_LICENSE',       // Scadenza patente
  SKI_INSTRUCTOR_LICENSE = 'SKI_INSTRUCTOR_LICENSE', // Scadenza licenza maestro
  COACH_LICENSE = 'COACH_LICENSE',           // Scadenza licenza allenatore
  MEMBER_MEDICAL_CERTIFICATE = 'MEMBER_MEDICAL_CERTIFICATE', // Scadenza visita medica tesserato
}

export enum ReminderStatus {
  SCHEDULED = 'SCHEDULED',   // Programmato per invio futuro
  SENT = 'SENT',             // Inviato con successo
  FAILED = 'FAILED',         // Invio fallito
  CANCELLED = 'CANCELLED',   // Annullato
}

@Entity('reminders')
export class Reminder extends IctBaseEntity {
  @Column({ type: 'enum', enum: ReminderType })
  type: ReminderType;

  @Column({ type: 'enum', enum: ReminderStatus, default: ReminderStatus.SCHEDULED })
  status: ReminderStatus;

  @Column({ type: 'date' })
  expiryDate: Date;

  @Column({ type: 'date' })
  scheduledSendDate: Date;

  @Column({ type: 'timestamp', nullable: true })
  sentAt: Date;

  @Column({ nullable: true })
  recipientEmail: string;

  @Column({ nullable: true })
  ccEmail: string;

  @Column({ nullable: true })
  recipientName: string;

  @Column({ nullable: true })
  subjectEntityUuid: string;

  @Column({ nullable: true })
  subjectEntityType: string;

  @Column({ nullable: true })
  subjectDescription: string;

  @Column({ type: 'text', nullable: true })
  errorMessage: string;

  @Column({ default: 0 })
  retryCount: number;
}
