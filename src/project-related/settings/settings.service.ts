import { BadRequestException, Injectable } from '@nestjs/common';
import { dataSource } from '../../datasources/data-source';
import { Settings } from './entities/settings.entity';
import { decryptString, encryptString, isEncryptedValue } from '../../common/crypto/field-crypto';

const SMTP_KEY = 'smtpConfig';
const SMTP_PASS_AAD = 'settings.smtpConfig.pass';
/** Chiavi interne (controllo chiavi, stato migrazioni): mai esposte né modificabili dalle API. */
const INTERNAL_PREFIX = '__';

@Injectable()
export class SettingsService {
  private repo = dataSource.getRepository(Settings);

  /** Impostazioni per le API: niente chiavi interne, password SMTP mai restituita (solo `hasPassword`). */
  async findAllPublic(): Promise<Settings[]> {
    // filtro in JS: in SQL LIKE il carattere "_" è un jolly
    const all = await this.repo.find();
    return all.filter((s) => !s.key.startsWith(INTERNAL_PREFIX)).map((s) => this.toPublic(s));
  }

  async findByKeyPublic(key: string): Promise<Settings | null> {
    if (key.startsWith(INTERNAL_PREFIX)) return null;
    const setting = await this.findByKey(key);
    return setting ? this.toPublic(setting) : null;
  }

  /** Uso interno: valore così com'è nel DB (la password SMTP resta cifrata, vedi getSmtpConfig). */
  async findByKey(key: string): Promise<Settings | null> {
    return this.repo.findOne({ where: { key } });
  }

  /** Configurazione SMTP con la password decifrata, solo per l'invio delle email. */
  async getSmtpConfig(): Promise<any | null> {
    const setting = await this.findByKey(SMTP_KEY);
    const value = setting?.value;
    if (!value || typeof value !== 'object') return null;
    return { ...value, pass: value.pass ? decryptString(String(value.pass), SMTP_PASS_AAD) : value.pass };
  }

  async upsert(key: string, value: any, description?: string): Promise<Settings> {
    if (key.startsWith(INTERNAL_PREFIX)) {
      throw new BadRequestException('Impostazione riservata');
    }
    let settings = await this.findByKey(key);

    if (key === SMTP_KEY && value && typeof value === 'object') {
      value = this.prepareSmtpValue(value, settings?.value);
    }

    if (settings) {
      settings.value = value;
      if (description) settings.description = description;
    } else {
      settings = this.repo.create({ key, value, description });
    }

    return this.toPublic(await this.repo.save(settings));
  }

  async delete(key: string): Promise<void> {
    if (key.startsWith(INTERNAL_PREFIX)) {
      throw new BadRequestException('Impostazione riservata');
    }
    await this.repo.delete({ key });
  }

  /** Cifra la nuova password; se il client non la invia (campo vuoto) si mantiene quella salvata. */
  private prepareSmtpValue(value: any, previous: any): any {
    const { hasPassword, ...rest } = value;
    const next = { ...rest };
    if (next.pass) {
      next.pass = isEncryptedValue(next.pass) ? previous?.pass : encryptString(String(next.pass), SMTP_PASS_AAD);
    } else {
      next.pass = previous?.pass ?? '';
    }
    return next;
  }

  private toPublic(setting: Settings): Settings {
    if (setting.key !== SMTP_KEY || !setting.value || typeof setting.value !== 'object') return setting;
    const { pass, ...rest } = setting.value;
    return { ...setting, value: { ...rest, pass: '', hasPassword: !!pass } };
  }
}
