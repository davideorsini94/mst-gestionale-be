import { registerDecorator, ValidationOptions } from 'class-validator';

/** Anni accettati: fuori da questo intervallo è quasi certamente un errore di battitura (o un anno negativo). */
export const MIN_YEAR = 1900;
export const MAX_YEAR = 2199;

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/;

/**
 * true se il valore è una data di calendario esistente 'AAAA-MM-GG' (eventuale orario ISO ignorato).
 * IsDateString accettava "2026-02-30" (salvata poi come 2 marzo) e anni negativi.
 */
export function isCalendarDate(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const match = value.trim().match(DATE_RE);
  if (!match) return false;
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  if (y < MIN_YEAR || y > MAX_YEAR) return false;
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

/** Data di calendario valida (AAAA-MM-GG); null/undefined vanno gestiti con @IsOptional. */
export function IsCalendarDate(options?: ValidationOptions): PropertyDecorator {
  return (object: object, propertyName: string | symbol) => {
    registerDecorator({
      name: 'isCalendarDate',
      target: object.constructor,
      propertyName: String(propertyName),
      options: {
        message: ({ property }) => `${property}: data non valida (usa AAAA-MM-GG, anno tra ${MIN_YEAR} e ${MAX_YEAR})`,
        ...options,
      },
      validator: { validate: (value: unknown) => isCalendarDate(value) },
    });
  };
}

/** Giorno di calendario locale (ore 00:00) di una data 'AAAA-MM-GG' o di un Date, senza slittamenti di fuso. */
export function toCalendarDay(value: Date | string | null | undefined): Date | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'string') {
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
    // 'AAAA-MM-GG' letto da new Date() è mezzanotte UTC: in un fuso negativo diventerebbe il giorno prima
    if (match) return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  }
  const d = new Date(value);
  if (isNaN(d.getTime())) return null;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Oggi e oggi + `days` giorni di calendario (setDate: con l'ora legale un giorno non dura sempre 24 ore). */
export function calendarRange(days: number, now = new Date()): { today: Date; until: Date } {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const until = new Date(today);
  until.setDate(until.getDate() + days);
  return { today, until };
}
