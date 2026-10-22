import { Body, Controller, Post } from '@nestjs/common';
import { RouteConfig } from '@nestjs/platform-fastify';
import { ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../decorators/public.decorator';
import { PasswordResetService } from './password-reset.service';

class ForgotPasswordDto {
  identifier: string;
}

class ResetPasswordDto {
  token: string;
  newPassword: string;
}

@ApiTags('Auth')
@Controller('auth')
export class PasswordResetController {
  constructor(private readonly passwordResetService: PasswordResetService) {}

  @Public()
  @RouteConfig({ rateLimit: { max: 5, timeWindow: '15 minutes' } })
  @Post('forgot-password')
  @ApiOperation({ summary: 'Richiede il link di recupero password (risposta sempre uguale)' })
  @ApiBody({ type: ForgotPasswordDto })
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    await this.passwordResetService.requestReset(String(dto?.identifier ?? ''));
    return {
      message:
        "Se il nome utente o l'email corrispondono a un account con email, riceverai a breve un link per reimpostare la password.",
    };
  }

  @Public()
  @RouteConfig({ rateLimit: { max: 10, timeWindow: '15 minutes' } })
  @Post('reset-password')
  @ApiOperation({ summary: 'Imposta una nuova password con il link ricevuto via email' })
  @ApiBody({ type: ResetPasswordDto })
  async resetPassword(@Body() dto: ResetPasswordDto) {
    await this.passwordResetService.resetPassword(dto?.token, dto?.newPassword);
    return { message: 'Password aggiornata: ora puoi accedere con la nuova password' };
  }
}
