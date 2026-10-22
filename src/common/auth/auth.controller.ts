import { Controller, Post, Get, Put, UseGuards, Request, Body } from '@nestjs/common';
import { RouteConfig } from '@nestjs/platform-fastify';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiOperation, ApiBody, ApiBearerAuth } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { Public } from './decorators/public.decorator';
import { UserService } from '../models/users/user.service';
import { UserPreferences } from '../models/users/entities/user.entity';
import { RequireCapabilities } from './decorators/capabilities.decorator';
import { Capability } from '../models/capabilities-per-role/capability.enum';

class LoginDto {
  username: string;
  password: string;
}

class ChangePasswordDto {
  currentPassword: string;
  newPassword: string;
}

class PreferencesDto {
  theme?: 'light' | 'dark' | 'system';
  reduceTransparency?: boolean;
}

class OwnProfileDto {
  firstName?: string;
  lastName?: string;
}

class AdminChangePasswordDto {
  targetUserUuid: string;
  adminPassword: string;
  newPassword: string;
}

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    private userService: UserService,
  ) { }

  @Public()
  @UseGuards(AuthGuard('local'))
  // Max 10 tentativi al minuto per IP (dietro nginx l'IP arriva da X-Forwarded-For: trustProxy in main.ts)
  @RouteConfig({ rateLimit: { max: 10, timeWindow: '1 minute' } })
  @Post('login')
  @ApiOperation({ summary: 'Login utente' })
  @ApiBody({ type: LoginDto })
  async login(@Request() req) {
    return this.authService.login(req.user);
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Ottieni info utente corrente' })
  async me(@Request() req) {
    const user = req.user;
    // Password e blind index non vengono mai caricati (select: false); per sicurezza si escludono comunque
    const { password, emailHash, ...userWithoutPassword } = user;
    return {
      ...userWithoutPassword,
      preferences: user.preferences ?? {},
      capabilities: user.role?.capabilities?.map((c: any) => c.capability) || [],
    };
  }

  @Put('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Aggiorna nome e cognome dell\'utente corrente (email, ruolo e stato li cambia un amministratore)' })
  @ApiBody({ type: OwnProfileDto })
  async updateOwnProfile(@Request() req, @Body() dto: OwnProfileDto) {
    // l'email resta fuori: collega l'utente al suo profilo staff, cambiarla da soli permetterebbe di prenderne un altro
    const user = await this.userService.updateOwnProfile(req.user.uuid, dto);
    const { password, emailHash, ...rest } = user as any;
    return rest;
  }

  @Put('preferences')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Salva le preferenze dell\'utente corrente (tema, trasparenza): unite a quelle già salvate' })
  @ApiBody({ type: PreferencesDto })
  async updatePreferences(@Request() req, @Body() dto: PreferencesDto): Promise<UserPreferences> {
    return this.userService.updatePreferences(req.user.uuid, dto);
  }

  @Post('change-password')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Cambia password utente corrente' })
  @ApiBody({ type: ChangePasswordDto })
  async changePassword(@Request() req, @Body() dto: ChangePasswordDto) {
    // campi mancanti → 400 dal servizio (prima: errore 500)
    return this.authService.changePassword(
      req.user.uuid,
      dto?.currentPassword,
      dto?.newPassword,
    );
  }

  @Post('admin-change-password')
  // reimpostare la password di un altro utente è gestione utenti (la password richiesta è solo una conferma)
  @RequireCapabilities(Capability.CAN_MANAGE_USERS)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Cambia password di un altro utente (richiede password admin)' })
  @ApiBody({ type: AdminChangePasswordDto })
  async adminChangePassword(@Request() req, @Body() dto: AdminChangePasswordDto) {
    await this.userService.assertAdminRules(req.user, await this.userService.findByUuid(dto?.targetUserUuid).catch(() => null), {
      password: true,
    });
    return this.authService.adminChangePassword(
      req.user.uuid,
      dto?.adminPassword,
      dto?.targetUserUuid,
      dto?.newPassword,
    );
  }
}
