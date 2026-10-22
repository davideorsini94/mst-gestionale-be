import { Injectable, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { UserService } from '../models/users/user.service';
import { User } from '../models/users/entities/user.entity';

@Injectable()
export class AuthService {
  constructor(
    private userService: UserService,
    private jwtService: JwtService,
  ) { }

  async validateUser(username: string, password: string): Promise<User | null> {
    const user = await this.userService.findByUsernameWithPassword(username);
    // un utente disattivato non entra (stesso errore delle credenziali sbagliate: nessuna informazione in più)
    if (user?.password && user.isActive !== false && (await bcrypt.compare(password, user.password))) {
      delete user.password;
      return user;
    }
    return null;
  }

  async login(user: User) {
    const payload = {
      username: user.username,
      sub: user.uuid,
      role: user.role?.code,
    };

    return {
      access_token: this.jwtService.sign(payload),
      expiresIn: process.env.TOKEN_DURATION || '8h',
      user: {
        uuid: user.uuid,
        username: user.username,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: user.role,
        preferences: user.preferences ?? {},
      },
    };
  }

  async changePassword(
    userUuid: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<{ success: boolean; message: string }> {
    const user = await this.userService.findByUuidWithPassword(userUuid);
    if (!user?.password) {
      throw new BadRequestException('Utente non trovato');
    }

    const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.password);
    if (!isCurrentPasswordValid) {
      throw new BadRequestException('Password attuale non corretta');
    }

    if (newPassword.length < 6) {
      throw new BadRequestException('La nuova password deve essere di almeno 6 caratteri');
    }

    await this.userService.update(userUuid, { password: newPassword });

    return { success: true, message: 'Password aggiornata con successo' };
  }

  async adminChangePassword(
    adminUuid: string,
    adminPassword: string,
    targetUserUuid: string,
    newPassword: string,
  ): Promise<{ success: boolean; message: string }> {
    const admin = await this.userService.findByUuidWithPassword(adminUuid);
    if (!admin?.password) {
      throw new BadRequestException('Utente admin non trovato');
    }

    const isAdminPasswordValid = await bcrypt.compare(adminPassword, admin.password);
    if (!isAdminPasswordValid) {
      throw new BadRequestException('Password admin non corretta');
    }

    const targetUser = await this.userService.findByUuid(targetUserUuid);
    if (!targetUser) {
      throw new BadRequestException('Utente target non trovato');
    }

    if (newPassword.length < 6) {
      throw new BadRequestException('La nuova password deve essere di almeno 6 caratteri');
    }

    await this.userService.update(targetUserUuid, { password: newPassword });

    return { success: true, message: 'Password aggiornata con successo' };
  }
}
