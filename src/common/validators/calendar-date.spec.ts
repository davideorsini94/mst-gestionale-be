import { calendarRange, isCalendarDate, toCalendarDay } from './calendar-date';
import { normalizePersonFields } from './person-fields';

describe('isCalendarDate', () => {
  it.each(['2026-02-28', '2024-02-29', '1990-12-31', '2026-03-29T00:00:00.000Z', '2026-03-29T10:00'])(
    '%s è valida',
    (value) => expect(isCalendarDate(value)).toBe(true),
  );

  it.each(['2026-02-30', '2025-02-29', '2026-13-01', '-2026-01-01', '0000-01-01', '1800-01-01', '26-01-01', '', 'abc', null, 20260101])(
    '%p non è valida',
    (value) => expect(isCalendarDate(value as any)).toBe(false),
  );
});

describe('toCalendarDay / calendarRange', () => {
  it("'AAAA-MM-GG' è il giorno locale, senza slittamenti di fuso", () => {
    const day = toCalendarDay('2026-03-29');
    expect([day.getFullYear(), day.getMonth(), day.getDate(), day.getHours()]).toEqual([2026, 2, 29, 0]);
  });

  it("l'intervallo conta giorni di calendario anche a cavallo dell'ora legale", () => {
    // 28 marzo 2026 + 1 giorno = 29 marzo (il giorno del cambio d'ora dura 23 ore)
    const { today, until } = calendarRange(1, new Date(2026, 2, 28, 23, 30));
    expect(today.getDate()).toBe(28);
    expect(until.getDate()).toBe(29);
    expect(until.getHours()).toBe(0);
  });
});

describe('normalizePersonFields', () => {
  it('email vuota → null, codice fiscale maiuscolo, nomi senza spazi', () => {
    const dto: any = { firstName: ' Mario ', lastName: 'Rossi', email: '  ', fiscalCode: ' rssmra80a01h501u ' };
    normalizePersonFields(dto);
    expect(dto).toEqual({ firstName: 'Mario', lastName: 'Rossi', email: null, fiscalCode: 'RSSMRA80A01H501U' });
  });

  it('nome vuoto o null → errore', () => {
    expect(() => normalizePersonFields({ firstName: '  ' })).toThrow('Il nome è obbligatorio');
    expect(() => normalizePersonFields({ lastName: null })).toThrow('Il cognome è obbligatorio');
  });

  it('i campi assenti restano assenti (modifica parziale)', () => {
    const dto: any = { phone: '123' };
    normalizePersonFields(dto);
    expect(dto).toEqual({ phone: '123' });
  });
});
