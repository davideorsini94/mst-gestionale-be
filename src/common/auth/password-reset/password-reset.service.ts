import { BadRequestException, Inject, Injectable, forwardRef } from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { dataSource } from '../../../datasources/data-source';
import { blindIndex } from '../../crypto/field-crypto';
import { User } from '../../models/users/entities/user.entity';
import { UserService } from '../../models/users/user.service';
import { EmailService } from '../../../project-related/reminders/email.service';
import { PasswordResetToken } from './password-reset-token.entity';

const TOKEN_MINUTES = 30;
/** Una sola email di recupero ogni 2 minuti per utente (evita di inondare la casella). */
const COOLDOWN_MS = 2 * 60 * 1000;
export const MIN_PASSWORD_LENGTH = 8;

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

@Injectable()
export class PasswordResetService {
  private readonly tokens = dataSource.getRepository(PasswordResetToken);
  private readonly users = dataSource.getRepository(User);

  constructor(
    private readonly userService: UserService,
    @Inject(forwardRef(() => EmailService)) private readonly emailService: EmailService,
  ) {}

  /**
   * Richiesta di recupero per nome utente o email. Non rivela mai se l'account esiste: il chiamante risponde sempre
   * allo stesso modo, e l'invio dell'email avviene in background.
   */
  async requestReset(identifier: string): Promise<void> {
    const value = (identifier ?? '').trim();
    if (!value || value.length > 200) return;

    let user = await this.users.findOne({ where: { username: value } });
    if (!user && value.includes('@')) {
      const emailHash = blindIndex(value, 'ci');
      if (emailHash) user = await this.users.findOne({ where: { emailHash } });
    }
    if (!user || user.isActive === false || !user.email) {
      console.log('[PasswordReset] Richiesta senza invio (utente inesistente, disattivato o senza email)');
      return;
    }

    // orari calcolati dal DB (now()): niente differenze di fuso tra Node e Postgres
    const [{ recent }] = await dataSource.query(
      `SELECT count(*)::int AS recent FROM password_reset_tokens
       WHERE "userUuid" = $1 AND "createdAt" > now() - ($2 || ' milliseconds')::interval`,
      [user.uuid, String(COOLDOWN_MS)],
    );
    if (recent > 0) return;

    const baseUrl = (process.env.APP_PUBLIC_URL || '').trim().replace(/\/+$/, '');
    if (!/^https?:\/\//.test(baseUrl)) {
      // il link non si costruisce dall'header Host della richiesta: un attaccante potrebbe farlo puntare a un suo sito
      console.error('[PasswordReset] APP_PUBLIC_URL non impostata: email di recupero non inviata');
      return;
    }

    const token = randomBytes(32).toString('base64url');
    // un solo link valido per utente: quello appena richiesto
    await this.tokens.delete({ userUuid: user.uuid });
    await dataSource.query(
      `INSERT INTO password_reset_tokens ("userUuid", "tokenHash", "expiresAt")
       VALUES ($1, $2, now() + ($3 || ' minutes')::interval)`,
      [user.uuid, sha256(token), String(TOKEN_MINUTES)],
    );
    // pulizia delle richieste vecchie
    await dataSource.query(`DELETE FROM password_reset_tokens WHERE "expiresAt" < now() - interval '1 day'`);

    const link = `${baseUrl}/#/reset-password?token=${token}`;
    const name = [user.firstName, user.lastName].filter(Boolean).join(' ') || user.username;
    this.emailService
      .sendPasswordResetEmail(user.email, name, user.username, link, TOKEN_MINUTES)
      .then(() => console.log('[PasswordReset] Email di recupero inviata'))
      .catch((error) => console.error(`[PasswordReset] Email di recupero non inviata: ${error.message}`));
  }

  /** Imposta la nuova password se il token è valido; il token si consuma in modo atomico (un solo uso). */
  async resetPassword(token: string, newPassword: string): Promise<void> {
    if (typeof newPassword !== 'string' || newPassword.length < MIN_PASSWORD_LENGTH) {
      throw new BadRequestException(`La nuova password deve essere di almeno ${MIN_PASSWORD_LENGTH} caratteri`);
    }
    if (newPassword.length > 200) {
      throw new BadRequestException('Password troppo lunga');
    }
    const invalid = new BadRequestException('Link non valido o scaduto: richiedine uno nuovo dalla pagina di accesso');
    if (typeof token !== 'string' || token.length < 20 || token.length > 200) throw invalid;

    const rows: { userUuid: string }[] = await dataSource.query(
      `UPDATE password_reset_tokens SET "usedAt" = now()
       WHERE "tokenHash" = $1 AND "usedAt" IS NULL AND "expiresAt" > now()
       RETURNING "userUuid"::text AS "userUuid"`,
      [sha256(token)],
    ).then((r: any) => (Array.isArray(r[0]) ? r[0] : r));
    if (!rows.length) throw invalid;

    const userUuid = rows[0].userUuid;
    const user = await this.users.findOne({ where: { uuid: userUuid } });
    if (!user || user.isActive === false) throw invalid;

    // userService.update cifra la password (bcrypt) e aggiorna passwordChangedAt: i login già aperti decadono
    await this.userService.update(userUuid, { password: newPassword } as any);
    await this.tokens.delete({ userUuid });
    console.log('[PasswordReset] Password reimpostata tramite link');
  }
}
