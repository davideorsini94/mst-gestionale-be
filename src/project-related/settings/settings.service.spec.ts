import { BadRequestException } from '@nestjs/common';
import { SettingsService } from './settings.service';

/** Solo la preparazione del valore SMTP (nessun accesso al DB: il costruttore non viene eseguito). */
const prepare = (value: any, previous: any) =>
  (Object.create(SettingsService.prototype) as any).prepareSmtpValue(value, previous);

describe('SettingsService: password SMTP salvata', () => {
  const saved = { host: 'smtp.club.it', port: 587, user: 'segreteria', pass: 'enc:v1:salvata' };

  it('campo vuoto o valore cifrato con stesso server e utente → resta la password salvata', () => {
    expect(prepare({ ...saved, pass: '' }, saved).pass).toBe('enc:v1:salvata');
    expect(prepare({ ...saved, pass: 'enc:v1:altro' }, saved).pass).toBe('enc:v1:salvata');
  });

  it('valore cifrato verso un altro server o utente → rifiutato (non si invia la password altrove)', () => {
    expect(() => prepare({ ...saved, host: 'evil.example', pass: 'enc:v1:x' }, saved)).toThrow(BadRequestException);
    expect(() => prepare({ ...saved, user: 'altro', pass: '' }, saved)).toThrow(BadRequestException);
  });
});
