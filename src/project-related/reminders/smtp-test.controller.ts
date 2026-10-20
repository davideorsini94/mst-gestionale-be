import { BadRequestException, Body, Controller, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequireCapabilities } from '../../common/auth/decorators/capabilities.decorator';
import { Capability } from '../../common/models/capabilities-per-role/capability.enum';
import { EmailService, SmtpConfig } from './email.service';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Invio di prova dalla pagina Impostazioni (sta qui perché usa EmailService del modulo reminder). */
@ApiTags('Settings')
@ApiBearerAuth()
@Controller('settings/smtp')
export class SmtpTestController {
  constructor(private readonly emailService: EmailService) {}

  @Post('test')
  @ApiOperation({ summary: 'Invia un\'email di prova (configurazione del form, password salvata se non indicata)' })
  @RequireCapabilities(Capability.CAN_MANAGE_SETTINGS)
  async sendTest(@Body() body: { to: string; config?: Partial<SmtpConfig> }) {
    const to = String(body?.to ?? '').trim();
    if (!EMAIL_RE.test(to)) {
      throw new BadRequestException('Indirizzo email non valido');
    }
    try {
      const result = await this.emailService.sendTestEmail(to, body?.config);
      return { success: true, message: `Email di prova inviata a ${to}`, ...result };
    } catch (error) {
      throw new BadRequestException(`Invio non riuscito: ${error?.message ?? 'errore sconosciuto'}`);
    }
  }
}
