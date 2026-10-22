import { Injectable, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { UserService } from '../models/users/user.service';
import { User } from '../models/users/entities/user.entity';
import { MIN_PASSWORD_LENGTH } from './password-reset/password-reset.service';

/** Nuova password: obbligatoria e lunga almeno quanto richiesto dal recupero password. */
function assertNewPassword(newPassword: unknown): asserts newPassword is string {
  if (typeof newPassword !== 'string' || newPassword === '') {
    throw new BadRequestException('Inserisci la nuova password');
  }
  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    throw new BadRequestException(`La nuova password deve essere di almeno ${MIN_PASSWORD_LENGTH} caratteri`);
  }
}

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
    // controlli prima di bcrypt: con un campo mancante bcrypt.compare lanciava un errore (500)
    if (typeof currentPassword !== 'string' || currentPassword === '') {
      throw new BadRequestException('Inserisci la password attuale');
    }
    assertNewPassword(newPassword);

    const user = await this.userService.findByUuidWithPassword(userUuid);
    if (!user?.password) {
      throw new BadRequestException('Utente non trovato');
    }

    const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.password);
    if (!isCurrentPasswordValid) {
      throw new BadRequestException('Password attuale non corretta');
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
    if (typeof adminPassword !== 'string' || adminPassword === '') {
      throw new BadRequestException('Inserisci la tua password per confermare');
    }
    if (typeof targetUserUuid !== 'string' || !targetUserUuid) {
      throw new BadRequestException('Utente da modificare mancante');
    }
    assertNewPassword(newPassword);

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

    await this.userService.update(targetUserUuid, { password: newPassword });

    return { success: true, message: 'Password aggiornata con successo' };
  }
}
