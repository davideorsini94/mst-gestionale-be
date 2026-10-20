import { Injectable, Inject } from '@nestjs/common';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import * as nodemailer from 'nodemailer';
import { ReminderType } from './entities/reminder.entity';
import { SettingsService } from '../settings/settings.service';

export interface SmtpConfig {
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string;
}

const reminderTypeLabels: Record<ReminderType, string> = {
  [ReminderType.VEHICLE_TAX]: 'Scadenza Bollo Veicolo',
  [ReminderType.VEHICLE_INSPECTION]: 'Scadenza Tagliando/Revisione',
  [ReminderType.VEHICLE_INSURANCE]: 'Scadenza Assicurazione Veicolo',
  [ReminderType.MEDICAL_CERTIFICATE]: 'Scadenza Certificato Medico',
  [ReminderType.DRIVING_LICENSE]: 'Scadenza Patente',
  [ReminderType.SKI_INSTRUCTOR_LICENSE]: 'Scadenza Licenza Maestro di Sci',
  [ReminderType.COACH_LICENSE]: 'Scadenza Licenza Allenatore',
  [ReminderType.MEMBER_MEDICAL_CERTIFICATE]: 'Scadenza Visita Medica Tesserato',
};

@Injectable()
export class EmailService {
  constructor(
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
    private readonly settingsService: SettingsService,
  ) { }

  private async getSmtpConfig(): Promise<SmtpConfig | null> {
    // Password SMTP salvata cifrata: getSmtpConfig la restituisce in chiaro solo per l'invio
    return (await this.settingsService.getSmtpConfig()) as SmtpConfig | null;
  }

  private async createTransporter(): Promise<nodemailer.Transporter | null> {
    const config = await this.getSmtpConfig();

    if (config && config.host && config.user && config.pass) {
      return nodemailer.createTransport({
        host: config.host,
        port: config.port || 587,
        secure: config.port === 465,
        auth: { user: config.user, pass: config.pass },
      });
    }

    this.logger.warn('[EmailService] SMTP not configured - emails will be logged only');
    return null;
  }

  async sendReminderEmail(
    recipientEmail: string,
    recipientName: string,
    reminderType: ReminderType,
    subjectDescription: string,
    expiryDate: Date,
    ccEmail?: string,
  ): Promise<void> {
    const typeLabel = reminderTypeLabels[reminderType] || reminderType;
    const formattedDate = new Date(expiryDate).toLocaleDateString('it-IT', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });

    const subject = `[PROMEMORIA] ${typeLabel} - ${subjectDescription}`;
    const html = this.generateEmailHtml(recipientName, typeLabel, subjectDescription, formattedDate);

    const transporter = await this.createTransporter();
    const config = await this.getSmtpConfig();

    if (transporter && config) {
      const mailOptions: nodemailer.SendMailOptions = {
        from: config.from || config.user,
        to: recipientEmail,
        subject,
        html,
      };

      // Aggiungi CC se specificato e diverso dal destinatario principale
      if (ccEmail && ccEmail !== recipientEmail) {
        mailOptions.cc = ccEmail;
      }

      await transporter.sendMail(mailOptions);
      this.logger.info(`[EmailService] Email sent to ${recipientEmail}${ccEmail ? ` (CC: ${ccEmail})` : ''}`, { subject });
    } else {
      // Log email invece di inviarla (per sviluppo/test)
      this.logger.info(`[EmailService] Email would be sent (SMTP not configured)`, {
        to: recipientEmail,
        cc: ccEmail,
        subject,
        body: html,
      });
    }
  }

  private generateEmailHtml(
    recipientName: string,
    typeLabel: string,
    subjectDescription: string,
    formattedDate: string,
  ): string {
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background-color: #1890ff; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
    .content { background-color: #f9f9f9; padding: 20px; border: 1px solid #ddd; border-top: none; border-radius: 0 0 8px 8px; }
    .highlight { background-color: #fff3cd; border: 1px solid #ffc107; padding: 15px; border-radius: 4px; margin: 15px 0; }
    .date { font-size: 24px; font-weight: bold; color: #d32f2f; }
    .footer { text-align: center; margin-top: 20px; font-size: 12px; color: #666; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>⏰ Promemoria Scadenza</h1>
    </div>
    <div class="content">
      <p>Gentile <strong>${recipientName}</strong>,</p>
      
      <p>Ti ricordiamo che è in scadenza:</p>
      
      <div class="highlight">
        <p><strong>Tipo:</strong> ${typeLabel}</p>
        <p><strong>Descrizione:</strong> ${subjectDescription}</p>
        <p><strong>Data scadenza:</strong> <span class="date">${formattedDate}</span></p>
      </div>
      
      <p>Ti invitiamo a provvedere al rinnovo per tempo.</p>
      
      <p>Cordiali saluti,<br>Il Sistema Gestionale</p>
    </div>
    <div class="footer">
      <p>Questa email è stata generata automaticamente dal sistema gestionale.</p>
    </div>
  </div>
</body>
</html>
    `.trim();
  }
}
