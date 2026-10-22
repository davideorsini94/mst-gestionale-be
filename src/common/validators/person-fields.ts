import { BadRequestException, ConflictException } from '@nestjs/common';
import { Not, Repository } from 'typeorm';
import { blindIndex } from '../crypto/field-crypto';

/** Email: vuota o assente → nessuna validazione (diventa null); se presente deve essere un indirizzo valido. */
export const hasEmailValue = (o: { email?: unknown }) =>
  o.email !== null && o.email !== undefined && String(o.email).trim() !== '';

/**
 * Normalizza nome, cognome, email e codice fiscale di tesserati e staff prima del salvataggio (modifica il dto).
 * - nome e cognome: obbligatori e non vuoti (anche in modifica, se inviati: null o "" darebbero un errore del DB);
 * - email "" → null (per poterla togliere; prima @IsEmail rifiutava la stringa vuota);
 * - codice fiscale: senza spazi (anche interni: "RSS MRA..." aggirava il controllo dei doppioni) e maiuscolo, "" → null.
 */
export function normalizePersonFields(dto: Record<string, any>): void {
  if (!dto || typeof dto !== 'object' || Array.isArray(dto)) {
    throw new BadRequestException('Dati non validi: atteso un oggetto JSON');
  }
  for (const [field, label] of [
    ['firstName', 'Il nome'],
    ['lastName', 'Il cognome'],
  ] as const) {
    if (!(field in dto)) continue;
    const value = dto[field];
    if (typeof value !== 'string' || value.trim() === '') {
      throw new BadRequestException(`${label} è obbligatorio`);
    }
    dto[field] = value.trim();
  }

  if ('email' in dto) {
    const email = dto.email === null || dto.email === undefined ? '' : String(dto.email).trim();
    dto.email = email === '' ? null : email;
  }

  if ('fiscalCode' in dto) {
    const code = dto.fiscalCode === null || dto.fiscalCode === undefined ? '' : String(dto.fiscalCode).replace(/\s+/g, '').toUpperCase();
    dto.fiscalCode = code === '' ? null : code;
  }
}

/**
 * Il codice fiscale non può ripetersi nella stessa anagrafica (confronto sul blind index, il valore è cifrato).
 * L'email invece può ripetersi: fratelli registrati con l'email dei genitori.
 */
export async function assertUniqueFiscalCode(
  repo: Repository<any>,
  fiscalCode: string | null | undefined,
  excludeUuid: string | null,
  what: string,
): Promise<void> {
  const hash = blindIndex(fiscalCode ?? null, 'ci');
  if (!hash) return;
  const where: Record<string, unknown> = { fiscalCodeHash: hash };
  if (excludeUuid) where.uuid = Not(excludeUuid);
  if (await repo.exists({ where })) {
    throw new ConflictException(`Esiste già ${what} con questo codice fiscale`);
  }
}
