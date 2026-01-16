import { Controller, Post, Get, UseGuards, Request, Body } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiOperation, ApiBody, ApiBearerAuth } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { Public } from './decorators/public.decorator';

class LoginDto {
  username: string;
  password: string;
}

class ChangePasswordDto {
  currentPassword: string;
  newPassword: string;
}

class AdminChangePasswordDto {
  targetUserUuid: string;
  adminPassword: string;
  newPassword: string;
}

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) { }

  @Public()
  @UseGuards(AuthGuard('local'))
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
    // Rimuovi la password dalla risposta
    const { password, ...userWithoutPassword } = user;
    return {
      ...userWithoutPassword,
      capabilities: user.role?.capabilities?.map((c: any) => c.capability) || [],
    };
  }

  @Post('change-password')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Cambia password utente corrente' })
  @ApiBody({ type: ChangePasswordDto })
  async changePassword(@Request() req, @Body() dto: ChangePasswordDto) {
    return this.authService.changePassword(
      req.user.uuid,
      dto.currentPassword,
      dto.newPassword,
    );
  }

  @Post('admin-change-password')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Cambia password di un altro utente (richiede password admin)' })
  @ApiBody({ type: AdminChangePasswordDto })
  async adminChangePassword(@Request() req, @Body() dto: AdminChangePasswordDto) {
    return this.authService.adminChangePassword(
      req.user.uuid,
      dto.adminPassword,
      dto.targetUserUuid,
      dto.newPassword,
    );
  }
}
