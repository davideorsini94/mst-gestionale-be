import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import { LessThanOrEqual, MoreThanOrEqual, In } from 'typeorm';
import { BaseService } from '../../common/base-crud/base.service';
import { Reminder, ReminderType, ReminderStatus } from './entities/reminder.entity';
import { EmailService } from './email.service';
import { StaffService } from '../staff/staff.service';
import { VehicleService } from '../vehicles/vehicle.service';
import { Staff } from '../staff/entities/staff.entity';
import { Vehicle } from '../vehicles/entities/vehicle.entity';
import { SettingsService } from '../settings/settings.service';

interface ReminderConfig {
  type: ReminderType;
  daysBeforeEnvVar: string;
  defaultDays: number;
}

@Injectable()
export class ReminderService extends BaseService<Reminder, any, any> {
  private readonly reminderConfigs: ReminderConfig[] = [
    { type: ReminderType.VEHICLE_TAX, daysBeforeEnvVar: 'REMINDER_DAYS_VEHICLE_TAX', defaultDays: 30 },
    { type: ReminderType.VEHICLE_INSPECTION, daysBeforeEnvVar: 'REMINDER_DAYS_VEHICLE_INSPECTION', defaultDays: 30 },
    { type: ReminderType.VEHICLE_INSURANCE, daysBeforeEnvVar: 'REMINDER_DAYS_VEHICLE_INSURANCE', defaultDays: 30 },
    { type: ReminderType.MEDICAL_CERTIFICATE, daysBeforeEnvVar: 'REMINDER_DAYS_MEDICAL_CERTIFICATE', defaultDays: 30 },
    { type: ReminderType.DRIVING_LICENSE, daysBeforeEnvVar: 'REMINDER_DAYS_DRIVING_LICENSE', defaultDays: 60 },
    { type: ReminderType.SKI_INSTRUCTOR_LICENSE, daysBeforeEnvVar: 'REMINDER_DAYS_SKI_INSTRUCTOR_LICENSE', defaultDays: 60 },
    { type: ReminderType.COACH_LICENSE, daysBeforeEnvVar: 'REMINDER_DAYS_COACH_LICENSE', defaultDays: 60 },
    { type: ReminderType.MEMBER_MEDICAL_CERTIFICATE, daysBeforeEnvVar: 'REMINDER_DAYS_MEMBER_MEDICAL_CERTIFICATE', defaultDays: 30 },
  ];

  constructor(
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
    private readonly emailService: EmailService,
    @Inject(forwardRef(() => StaffService))
    private readonly staffService: StaffService,
    @Inject(forwardRef(() => VehicleService))
    private readonly vehicleService: VehicleService,
    private readonly settingsService: SettingsService,
  ) {
    super(Reminder);
  }

  private getDaysBeforeExpiry(type: ReminderType): number {
    const config = this.reminderConfigs.find(c => c.type === type);
    if (!config) return 30;

    const envValue = process.env[config.daysBeforeEnvVar];
    return envValue ? parseInt(envValue, 10) : config.defaultDays;
  }

  private getCronExpression(): string {
    return process.env.REMINDER_CRON || CronExpression.EVERY_DAY_AT_8AM;
  }

  @Cron(CronExpression.EVERY_DAY_AT_8AM)
  async checkAndScheduleReminders() {
    if (process.env.REMINDER_ENABLED !== 'true') {
      return;
    }

    this.logger.info('[ReminderService] Starting daily reminder check');

    try {
      await this.checkStaffReminders();
      await this.checkVehicleReminders();
      await this.sendScheduledReminders();
    } catch (error) {
      this.logger.error('[ReminderService] Error during reminder check', { error: error.message });
    }
  }

  private async checkStaffReminders() {
    const staffMembers = await this.staffService.find({}, null);

    for (const staff of staffMembers) {
      await this.checkAndCreateReminder(
        ReminderType.MEDICAL_CERTIFICATE,
        staff.medicalExamExpiry,
        staff.uuid,
        'Staff',
        `${staff.firstName} ${staff.lastName}`,
        staff.email,
        `${staff.firstName} ${staff.lastName}`,
      );

      await this.checkAndCreateReminder(
        ReminderType.DRIVING_LICENSE,
        staff.drivingLicenseExpiry,
        staff.uuid,
        'Staff',
        `${staff.firstName} ${staff.lastName} - Patente ${staff.drivingLicense || ''}`,
        staff.email,
        `${staff.firstName} ${staff.lastName}`,
      );

      await this.checkAndCreateReminder(
        ReminderType.SKI_INSTRUCTOR_LICENSE,
        staff.skiInstructorLicenseExpiry,
        staff.uuid,
        'Staff',
        `${staff.firstName} ${staff.lastName} - Licenza Maestro ${staff.skiInstructorLicense || ''}`,
        staff.email,
        `${staff.firstName} ${staff.lastName}`,
      );

      if (staff.isCoach) {
        await this.checkAndCreateReminder(
          ReminderType.COACH_LICENSE,
          staff.coachLicenseExpiry,
          staff.uuid,
          'Staff',
          `${staff.firstName} ${staff.lastName} - Licenza Allenatore ${staff.coachLevel || ''}`,
          staff.email,
          `${staff.firstName} ${staff.lastName}`,
        );
      }
    }
  }

  private async checkVehicleReminders() {
    const vehicles = await this.vehicleService.find({}, null);

    for (const vehicle of vehicles) {
      const vehicleDescription = `${vehicle.name} - ${vehicle.licensePlate}`;

      await this.checkAndCreateReminder(
        ReminderType.VEHICLE_TAX,
        vehicle.taxExpiry,
        vehicle.uuid,
        'Vehicle',
        `${vehicleDescription} - Bollo`,
        null,
        vehicleDescription,
      );

      await this.checkAndCreateReminder(
        ReminderType.VEHICLE_INSPECTION,
        vehicle.inspectionExpiry,
        vehicle.uuid,
        'Vehicle',
        `${vehicleDescription} - Tagliando/Revisione`,
        null,
        vehicleDescription,
      );

      await this.checkAndCreateReminder(
        ReminderType.VEHICLE_INSURANCE,
        vehicle.insuranceExpiry,
        vehicle.uuid,
        'Vehicle',
        `${vehicleDescription} - Assicurazione`,
        null,
        vehicleDescription,
      );
    }
  }

  private async getAdminEmail(): Promise<string | null> {
    const adminEmailSetting = await this.settingsService.findByKey('adminEmail');
    return adminEmailSetting?.value || process.env.ADMIN_EMAIL || null;
  }

  private isVehicleReminder(type: ReminderType): boolean {
    return [
      ReminderType.VEHICLE_TAX,
      ReminderType.VEHICLE_INSPECTION,
      ReminderType.VEHICLE_INSURANCE,
    ].includes(type);
  }

  private async checkAndCreateReminder(
    type: ReminderType,
    expiryDate: Date | null,
    entityUuid: string,
    entityType: string,
    description: string,
    recipientEmail: string | null,
    recipientName: string,
  ) {
    if (!expiryDate) return;

    const daysBeforeExpiry = this.getDaysBeforeExpiry(type);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const expiryDateObj = new Date(expiryDate);
    expiryDateObj.setHours(0, 0, 0, 0);

    const scheduledSendDate = new Date(expiryDateObj);
    scheduledSendDate.setDate(scheduledSendDate.getDate() - daysBeforeExpiry);

    // Se la data di invio programmata è nel passato o oggi, e la scadenza non è ancora passata
    if (scheduledSendDate <= today && expiryDateObj >= today) {
      // Verifica se esiste già un reminder per questa combinazione
      const existingReminder = await this.repo.findOne({
        where: {
          type,
          subjectEntityUuid: entityUuid,
          expiryDate: expiryDateObj,
          status: In([ReminderStatus.SCHEDULED, ReminderStatus.SENT]),
        },
      });

      if (!existingReminder) {
        const adminEmail = await this.getAdminEmail();
        let email = recipientEmail;
        let ccEmail: string | null = null;

        if (this.isVehicleReminder(type)) {
          // Per i veicoli: invia all'admin
          email = adminEmail;
        } else {
          // Per lo staff: invia alla persona, con CC all'admin
          if (!email) {
            // Se lo staff non ha email, invia solo all'admin
            email = adminEmail;
          }
        }

        if (!email) {
          this.logger.warn(`[ReminderService] No email for reminder ${description}`, { type });
          return;
        }

        const reminder = new Reminder();
        reminder.type = type;
        reminder.status = ReminderStatus.SCHEDULED;
        reminder.expiryDate = expiryDateObj;
        reminder.scheduledSendDate = scheduledSendDate;
        reminder.recipientEmail = email;
        reminder.ccEmail = ccEmail;
        reminder.recipientName = recipientName;
        reminder.subjectEntityUuid = entityUuid;
        reminder.subjectEntityType = entityType;
        reminder.subjectDescription = description;

        await this.repo.save(reminder);
        this.logger.info(`[ReminderService] Created reminder for ${description}`, { type, expiryDate });
      }
    }
  }

  private async sendScheduledReminders() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const remindersToSend = await this.repo.find({
      where: {
        status: ReminderStatus.SCHEDULED,
        scheduledSendDate: LessThanOrEqual(today),
      },
    });

    for (const reminder of remindersToSend) {
      await this.sendReminder(reminder);
    }
  }

  async sendReminder(reminder: Reminder): Promise<Reminder> {
    try {
      if (!reminder.recipientEmail) {
        throw new Error('Nessun indirizzo email destinatario');
      }

      await this.emailService.sendReminderEmail(
        reminder.recipientEmail,
        reminder.recipientName,
        reminder.type,
        reminder.subjectDescription,
        reminder.expiryDate,
        reminder.ccEmail || undefined,
      );

      reminder.status = ReminderStatus.SENT;
      reminder.sentAt = new Date();
      reminder.errorMessage = null;

      this.logger.info(`[ReminderService] Reminder sent successfully`, {
        uuid: reminder.uuid,
        type: reminder.type,
        recipient: reminder.recipientEmail,
        cc: reminder.ccEmail,
      });
    } catch (error) {
      reminder.status = ReminderStatus.FAILED;
      reminder.errorMessage = error.message;
      reminder.retryCount += 1;

      this.logger.error(`[ReminderService] Failed to send reminder`, {
        uuid: reminder.uuid,
        error: error.message,
      });
    }

    return this.repo.save(reminder);
  }

  async resendReminder(uuid: string): Promise<Reminder> {
    const reminder = await this.findByUuid(uuid);
    if (!reminder) {
      throw new Error('Reminder non trovato');
    }

    reminder.status = ReminderStatus.SCHEDULED;
    await this.repo.save(reminder);

    return this.sendReminder(reminder);
  }

  async getScheduledReminders(): Promise<Reminder[]> {
    return this.repo.find({
      where: { status: ReminderStatus.SCHEDULED },
      order: { scheduledSendDate: 'ASC' },
    });
  }

  async getSentReminders(): Promise<Reminder[]> {
    return this.repo.find({
      where: { status: ReminderStatus.SENT },
      order: { sentAt: 'DESC' },
    });
  }

  async getFailedReminders(): Promise<Reminder[]> {
    return this.repo.find({
      where: { status: ReminderStatus.FAILED },
      order: { createdAt: 'DESC' },
    });
  }

  /** Contatori per i tab della pagina Reminder (la lista è paginata lato server). */
  async getCounts(): Promise<Record<string, number>> {
    const rows = await this.repo
      .createQueryBuilder('r')
      .select('r.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .groupBy('r.status')
      .getRawMany();
    const counts: Record<string, number> = { all: 0 };
    for (const status of Object.values(ReminderStatus)) counts[status] = 0;
    for (const row of rows) {
      counts[row.status] = Number(row.count);
      counts.all += Number(row.count);
    }
    return counts;
  }

  async getAllReminders(filters?: string): Promise<[Reminder[], number]> {
    return this.findAndCountWithFilterList(filters, null);
  }

  getDefaultOrder() {
    return { createdAt: 'DESC' as const };
  }

  /**
   * Crea o aggiorna un reminder quando viene impostata/modificata una scadenza.
   * Se il reminder esiste ed è già stato inviato, ne crea uno nuovo.
   * Se il reminder esiste ed è ancora programmato, lo aggiorna.
   */
  async createOrUpdateReminderForExpiry(
    type: ReminderType,
    expiryDate: Date | null,
    entityUuid: string,
    entityType: string,
    description: string,
    recipientEmail: string | null,
    recipientName: string,
    ccEmail?: string | null,
  ): Promise<Reminder | null> {
    // Se la data di scadenza viene rimossa, cancella i reminder programmati
    if (!expiryDate) {
      await this.repo.update(
        {
          type,
          subjectEntityUuid: entityUuid,
          status: ReminderStatus.SCHEDULED,
        },
        { status: ReminderStatus.CANCELLED },
      );
      return null;
    }

    const daysBeforeExpiry = this.getDaysBeforeExpiry(type);
    const expiryDateObj = new Date(expiryDate);
    expiryDateObj.setHours(0, 0, 0, 0);

    const scheduledSendDate = new Date(expiryDateObj);
    scheduledSendDate.setDate(scheduledSendDate.getDate() - daysBeforeExpiry);

    // Cerca reminder esistente programmato per questa entità e tipo
    const existingScheduledReminder = await this.repo.findOne({
      where: {
        type,
        subjectEntityUuid: entityUuid,
        status: ReminderStatus.SCHEDULED,
      },
    });

    // Determina l'email del destinatario
    const adminEmail = await this.getAdminEmail();
    let email = recipientEmail;
    let cc = ccEmail || null;

    // Per i veicoli: se c'è email staff assegnato, invia a lui con CC all'admin
    // Altrimenti invia solo all'admin
    if (this.isVehicleReminder(type)) {
      if (recipientEmail) {
        email = recipientEmail;
        cc = adminEmail;
      } else {
        email = adminEmail;
        cc = null;
      }
    } else if (!email) {
      email = adminEmail;
    }

    if (!email) {
      this.logger.warn(`[ReminderService] No email for reminder ${description}`, { type });
      return null;
    }

    if (existingScheduledReminder) {
      // Aggiorna il reminder esistente con la nuova data
      existingScheduledReminder.expiryDate = expiryDateObj;
      existingScheduledReminder.scheduledSendDate = scheduledSendDate;
      existingScheduledReminder.recipientEmail = email;
      existingScheduledReminder.ccEmail = cc;
      existingScheduledReminder.recipientName = recipientName;
      existingScheduledReminder.subjectDescription = description;

      await this.repo.save(existingScheduledReminder);
      this.logger.info(`[ReminderService] Updated reminder for ${description}`, { type, expiryDate });
      return existingScheduledReminder;
    }

    // Verifica se esiste un reminder già inviato per la STESSA data di scadenza
    const existingSentReminder = await this.repo.findOne({
      where: {
        type,
        subjectEntityUuid: entityUuid,
        expiryDate: expiryDateObj,
        status: ReminderStatus.SENT,
      },
    });

    // Se esiste già un reminder inviato per questa esatta scadenza, non crearne un altro
    if (existingSentReminder) {
      this.logger.info(`[ReminderService] Reminder already sent for ${description}`, { type, expiryDate });
      return null;
    }

    // Crea nuovo reminder
    const reminder = new Reminder();
    reminder.type = type;
    reminder.status = ReminderStatus.SCHEDULED;
    reminder.expiryDate = expiryDateObj;
    reminder.scheduledSendDate = scheduledSendDate;
    reminder.recipientEmail = email;
    reminder.ccEmail = cc;
    reminder.recipientName = recipientName;
    reminder.subjectEntityUuid = entityUuid;
    reminder.subjectEntityType = entityType;
    reminder.subjectDescription = description;

    await this.repo.save(reminder);
    this.logger.info(`[ReminderService] Created reminder for ${description}`, { type, expiryDate });
    return reminder;
  }

  /**
   * Aggiorna tutti i reminder per un veicolo
   */
  async updateVehicleReminders(vehicle: {
    uuid: string;
    name: string;
    licensePlate: string;
    taxExpiry?: Date | null;
    inspectionExpiry?: Date | null;
    insuranceExpiry?: Date | null;
    assignedStaffUuid?: string | null;
  }): Promise<void> {
    const vehicleDescription = `${vehicle.name} - ${vehicle.licensePlate}`;

    // Carica lo staff assegnato per ottenere l'email
    let staffEmail: string | null = null;
    let staffName: string | null = null;
    if (vehicle.assignedStaffUuid) {
      const staff = await this.staffService.findByUuid(vehicle.assignedStaffUuid);
      if (staff?.email) {
        staffEmail = staff.email;
        staffName = `${staff.firstName} ${staff.lastName}`;
      }
    }

    const recipientName = staffName || vehicleDescription;

    await this.createOrUpdateReminderForExpiry(
      ReminderType.VEHICLE_TAX,
      vehicle.taxExpiry || null,
      vehicle.uuid,
      'Vehicle',
      `${vehicleDescription} - Bollo`,
      staffEmail,
      recipientName,
    );

    await this.createOrUpdateReminderForExpiry(
      ReminderType.VEHICLE_INSPECTION,
      vehicle.inspectionExpiry || null,
      vehicle.uuid,
      'Vehicle',
      `${vehicleDescription} - Tagliando/Revisione`,
      staffEmail,
      recipientName,
    );

    await this.createOrUpdateReminderForExpiry(
      ReminderType.VEHICLE_INSURANCE,
      vehicle.insuranceExpiry || null,
      vehicle.uuid,
      'Vehicle',
      `${vehicleDescription} - Assicurazione`,
      staffEmail,
      recipientName,
    );
  }

  /**
   * Aggiorna tutti i reminder per uno staff
   */
  async updateStaffReminders(staff: {
    uuid: string;
    firstName: string;
    lastName: string;
    email?: string | null;
    medicalExamExpiry?: Date | null;
    drivingLicenseExpiry?: Date | null;
    drivingLicense?: string | null;
    skiInstructorLicenseExpiry?: Date | null;
    skiInstructorLicense?: string | null;
    isCoach?: boolean;
    coachLicenseExpiry?: Date | null;
    coachLevel?: string | null;
  }): Promise<void> {
    const staffName = `${staff.firstName} ${staff.lastName}`;

    await this.createOrUpdateReminderForExpiry(
      ReminderType.MEDICAL_CERTIFICATE,
      staff.medicalExamExpiry || null,
      staff.uuid,
      'Staff',
      staffName,
      staff.email || null,
      staffName,
    );

    await this.createOrUpdateReminderForExpiry(
      ReminderType.DRIVING_LICENSE,
      staff.drivingLicenseExpiry || null,
      staff.uuid,
      'Staff',
      `${staffName} - Patente ${staff.drivingLicense || ''}`.trim(),
      staff.email || null,
      staffName,
    );

    await this.createOrUpdateReminderForExpiry(
      ReminderType.SKI_INSTRUCTOR_LICENSE,
      staff.skiInstructorLicenseExpiry || null,
      staff.uuid,
      'Staff',
      `${staffName} - Licenza Maestro ${staff.skiInstructorLicense || ''}`.trim(),
      staff.email || null,
      staffName,
    );

    if (staff.isCoach) {
      await this.createOrUpdateReminderForExpiry(
        ReminderType.COACH_LICENSE,
        staff.coachLicenseExpiry || null,
        staff.uuid,
        'Staff',
        `${staffName} - Licenza Allenatore ${staff.coachLevel || ''}`.trim(),
        staff.email || null,
        staffName,
      );
    } else {
      // Se non è più coach, cancella eventuali reminder coach programmati
      await this.repo.update(
        {
          type: ReminderType.COACH_LICENSE,
          subjectEntityUuid: staff.uuid,
          status: ReminderStatus.SCHEDULED,
        },
        { status: ReminderStatus.CANCELLED },
      );
    }
  }

  /**
   * Aggiorna tutti i reminder per un tesserato (member)
   */
  async updateMemberReminders(member: {
    uuid: string;
    firstName: string;
    lastName: string;
    email?: string | null;
    medicalExamExpiry?: Date | null;
  }): Promise<void> {
    const memberName = `${member.firstName} ${member.lastName}`;

    await this.createOrUpdateReminderForExpiry(
      ReminderType.MEMBER_MEDICAL_CERTIFICATE,
      member.medicalExamExpiry || null,
      member.uuid,
      'Member',
      `${memberName} - Visita Medica`,
      member.email || null,
      memberName,
    );
  }
}
