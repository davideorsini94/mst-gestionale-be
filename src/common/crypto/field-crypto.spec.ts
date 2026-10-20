import { randomBytes } from 'crypto';
import {
  assertKeysConfigured,
  blindIndex,
  computeKeyCheck,
  decryptFile,
  decryptString,
  encryptFile,
  encryptString,
  isEncryptedFile,
  keyCheckMatches,
  resetKeysForTests,
} from './field-crypto';

const setKeys = () => {
  process.env.DATA_ENCRYPTION_KEY = randomBytes(32).toString('base64');
  process.env.DATA_HASH_KEY = randomBytes(32).toString('base64');
  resetKeysForTests();
};

describe('field-crypto', () => {
  beforeEach(setKeys);

  it('cifra e decifra con AAD', () => {
    const enc = encryptString('Mario Rossi', 'members.lastName');
    expect(enc.startsWith('enc:v1:')).toBe(true);
    expect(enc).not.toContain('Mario');
    expect(decryptString(enc, 'members.lastName')).toBe('Mario Rossi');
  });

  it('IV casuale: due cifrature dello stesso testo sono diverse', () => {
    expect(encryptString('x', 'a.b')).not.toBe(encryptString('x', 'a.b'));
  });

  it('un valore spostato su un altro campo non si decifra', () => {
    const enc = encryptString('RSSMRA80A01F205X', 'members.fiscalCode');
    expect(() => decryptString(enc, 'staff.fiscalCode')).toThrow();
  });

  it('chiave sbagliata → errore esplicito, mai un segnaposto', () => {
    const enc = encryptString('segreto', 't.c');
    setKeys();
    expect(() => decryptString(enc, 't.c')).toThrow(/Decifratura fallita/);
  });

  it('i valori legacy senza prefisso passano invariati', () => {
    expect(decryptString('testo in chiaro', 't.c')).toBe('testo in chiaro');
  });

  it('il testo utente che inizia con il prefisso viene comunque cifrato', () => {
    const tricky = 'enc:v1:non-sono-cifrato';
    const enc = encryptString(tricky, 't.c');
    expect(decryptString(enc, 't.c')).toBe(tricky);
  });

  it('file: cifra, non ricifra, decifra; i file legacy passano invariati', () => {
    const pdf = Buffer.from('%PDF-1.4 contenuto');
    const enc = encryptFile(pdf);
    expect(isEncryptedFile(enc)).toBe(true);
    expect(encryptFile(enc)).toBe(enc);
    expect(decryptFile(enc).equals(pdf)).toBe(true);
    expect(decryptFile(pdf).equals(pdf)).toBe(true);
  });

  it('blind index: deterministico, case-insensitive solo dove richiesto', () => {
    expect(blindIndex('Mario@Example.com', 'ci')).toBe(blindIndex(' mario@example.com ', 'ci'));
    expect(blindIndex('Mario Rossi', 'exact')).not.toBe(blindIndex('mario rossi', 'exact'));
    expect(blindIndex('Mario Rossi', 'exact')).toBe(blindIndex(' Mario Rossi ', 'exact'));
    expect(blindIndex(null)).toBeNull();
    expect(blindIndex('  ')).toBeNull();
  });

  it('key check riconosce chiavi diverse', () => {
    const check = computeKeyCheck();
    expect(keyCheckMatches(check)).toBe(true);
    setKeys();
    expect(keyCheckMatches(check)).toBe(false);
  });

  it('chiavi mancanti o non valide bloccano l\'avvio', () => {
    delete process.env.DATA_ENCRYPTION_KEY;
    resetKeysForTests();
    expect(() => assertKeysConfigured()).toThrow(/DATA_ENCRYPTION_KEY/);
    process.env.DATA_ENCRYPTION_KEY = 'corta';
    resetKeysForTests();
    expect(() => assertKeysConfigured()).toThrow(/32 byte/);
  });
});
