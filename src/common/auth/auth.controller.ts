import { Controller, Post, Get, UseGuards, Request } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiOperation, ApiBody, ApiBearerAuth } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { Public } from './decorators/public.decorator';

class LoginDto {
  username: string;
  password: string;
}

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

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
}
