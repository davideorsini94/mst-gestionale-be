import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from 'crypto';

/**
 * Cifratura applicativa dei dati sensibili.
 *
 * - Campi testuali: AES-256-GCM, IV casuale da 12 byte, AAD = "tabella.colonna" (un valore cifrato non può essere
 *   spostato su un'altra colonna/tabella senza che la decifratura fallisca).
 *   Formato: `enc:v1:` + base64(iv ‖ tag ‖ ciphertext).
 * - File (MinIO): magic `MSTENC01` ‖ iv ‖ tag ‖ ciphertext, AAD = "file".
 * - Blind index: HMAC-SHA256 con chiave separata, per le ricerche esatte su campi cifrati.
 *
 * Le chiavi arrivano da env (DATA_ENCRYPTION_KEY, DATA_HASH_KEY: 32 byte in base64). Senza chiavi l'app non parte.
 */

export const ENCRYPTED_PREFIX = 'enc:v1:';
export const FILE_MAGIC = Buffer.from('MSTENC01', 'ascii');
const IV_LENGTH = 12;
const TAG_LENGTH = 16;
const KEY_CHECK_CONSTANT = 'mst-gestionale-key-check-v1';

let encryptionKey: Buffer | null = null;
let hashKey: Buffer | null = null;

function decodeKey(name: string): Buffer {
  const raw = process.env[name];
  if (!raw) {
    throw new Error(`${name} non impostata: impossibile cifrare/decifrare i dati sensibili`);
  }
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) {
    throw new Error(`${name} deve essere di 32 byte codificati in base64 (generala con: openssl rand -base64 32)`);
  }
  return key;
}

function getEncryptionKey(): Buffer {
  if (!encryptionKey) encryptionKey = decodeKey('DATA_ENCRYPTION_KEY');
  return encryptionKey;
}

function getHashKey(): Buffer {
  if (!hashKey) hashKey = decodeKey('DATA_HASH_KEY');
  return hashKey;
}

/** Verifica subito la presenza e il formato delle chiavi (chiamata in bootstrap). */
export function assertKeysConfigured(): void {
  getEncryptionKey();
  getHashKey();
  if (getEncryptionKey().equals(getHashKey())) {
    throw new Error('DATA_ENCRYPTION_KEY e DATA_HASH_KEY devono essere diverse');
  }
}

/** Solo per i test. */
export function resetKeysForTests(): void {
  encryptionKey = null;
  hashKey = null;
}

export function isEncryptedValue(value: unknown): boolean {
  return typeof value === 'string' && value.startsWith(ENCRYPTED_PREFIX);
}

export function encryptString(plain: string, aad: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv('aes-256-gcm', getEncryptionKey(), iv);
  cipher.setAAD(Buffer.from(aad, 'utf8'));
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ENCRYPTED_PREFIX + Buffer.concat([iv, tag, ct]).toString('base64');
}

/**
 * Decifra un valore. I valori senza prefisso (dati legacy non ancora migrati) vengono restituiti invariati.
 * Se il prefisso c'è ma la decifratura fallisce (chiave sbagliata, dato manomesso) viene lanciato un errore:
 * mai restituire un segnaposto, perché verrebbe poi salvato al posto del dato vero.
 */
export function decryptString(value: string, aad: string): string {
  if (!isEncryptedValue(value)) return value;
  const data = Buffer.from(value.slice(ENCRYPTED_PREFIX.length), 'base64');
  if (data.length < IV_LENGTH + TAG_LENGTH) {
    throw new Error(`Valore cifrato non valido (${aad})`);
  }
  const iv = data.subarray(0, IV_LENGTH);
  const tag = data.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const ct = data.subarray(IV_LENGTH + TAG_LENGTH);
  const decipher = createDecipheriv('aes-256-gcm', getEncryptionKey(), iv);
  decipher.setAAD(Buffer.from(aad, 'utf8'));
  decipher.setAuthTag(tag);
  try {
    return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
  } catch {
    throw new Error(`Decifratura fallita per ${aad}: chiave errata o dato corrotto`);
  }
}

export function isEncryptedFile(buffer: Buffer): boolean {
  return buffer.length >= FILE_MAGIC.length + IV_LENGTH + TAG_LENGTH &&
    buffer.subarray(0, FILE_MAGIC.length).equals(FILE_MAGIC);
}

/** Cifra un file. Se è già cifrato lo restituisce così com'è (restore di backup, copie). */
export function encryptFile(buffer: Buffer): Buffer {
  if (isEncryptedFile(buffer)) return buffer;
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv('aes-256-gcm', getEncryptionKey(), iv);
  cipher.setAAD(Buffer.from('file', 'utf8'));
  const ct = Buffer.concat([cipher.update(buffer), cipher.final()]);
  return Buffer.concat([FILE_MAGIC, iv, cipher.getAuthTag(), ct]);
}

/** Decifra un file; un file senza magic (legacy) viene restituito invariato. */
export function decryptFile(buffer: Buffer): Buffer {
  if (!isEncryptedFile(buffer)) return buffer;
  const offset = FILE_MAGIC.length;
  const iv = buffer.subarray(offset, offset + IV_LENGTH);
  const tag = buffer.subarray(offset + IV_LENGTH, offset + IV_LENGTH + TAG_LENGTH);
  const ct = buffer.subarray(offset + IV_LENGTH + TAG_LENGTH);
  const decipher = createDecipheriv('aes-256-gcm', getEncryptionKey(), iv);
  decipher.setAAD(Buffer.from('file', 'utf8'));
  decipher.setAuthTag(tag);
  try {
    return Buffer.concat([decipher.update(ct), decipher.final()]);
  } catch {
    throw new Error('Decifratura file fallita: chiave errata o file corrotto');
  }
}

/** Normalizzazione minima (confronto esatto, come prima della cifratura). */
export function normalizeExact(value: string): string {
  return value.normalize('NFC').trim();
}

/** Normalizzazione per email e codici: case-insensitive. */
export function normalizeCaseInsensitive(value: string): string {
  return value.normalize('NFC').trim().toLowerCase();
}

export function blindIndex(value: string | null | undefined, kind: 'exact' | 'ci' = 'ci'): string | null {
  if (value === null || value === undefined) return null;
  const normalized = kind === 'exact' ? normalizeExact(value) : normalizeCaseInsensitive(value);
  if (normalized === '') return null;
  return createHmac('sha256', getHashKey()).update(normalized, 'utf8').digest('hex');
}

/** Valore di controllo salvato nel DB per riconoscere all'avvio una chiave diversa da quella usata per cifrare. */
export function computeKeyCheck(): string {
  const enc = createHmac('sha256', getEncryptionKey()).update(KEY_CHECK_CONSTANT).digest('hex');
  const hash = createHmac('sha256', getHashKey()).update(KEY_CHECK_CONSTANT).digest('hex');
  return `${enc}:${hash}`;
}

export function keyCheckMatches(stored: string): boolean {
  const expected = Buffer.from(computeKeyCheck());
  const actual = Buffer.from(stored ?? '');
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
