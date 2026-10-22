import { Column, ColumnOptions, FindOperator, getMetadataArgsStorage, ValueTransformer } from 'typeorm';
import { decryptString, encryptString } from './field-crypto';

export type HashKind = 'exact' | 'ci';

export interface EncryptedFieldInfo {
  property: string;
  /** Nome della colonna nel DB (uguale alla property: il progetto non rinomina le colonne). */
  column: string;
  kind: 'string' | 'date';
  /** Property dell'eventuale blind index (es. emailHash) e tipo di normalizzazione. */
  hash?: { property: string; kind: HashKind };
}

const registry = new Map<Function, EncryptedFieldInfo[]>();

/** Campi cifrati dichiarati da un'entità (e dalle sue superclassi). */
export function getEncryptedFields(target: Function): EncryptedFieldInfo[] {
  const result: EncryptedFieldInfo[] = [];
  let current: any = target;
  while (current && current !== Object) {
    result.push(...(registry.get(current) ?? []));
    current = Object.getPrototypeOf(current);
  }
  return result;
}

export function isEncryptedField(target: Function, property: string): boolean {
  return getEncryptedFields(target).some((f) => f.property === property);
}

export function getAllEncryptedEntities(): Function[] {
  return Array.from(registry.keys());
}

function resolveTableName(target: Function): string {
  const table = getMetadataArgsStorage().tables.find((t) => t.target === target);
  if (!table?.name) {
    throw new Error(`Entità ${target.name} senza nome tabella esplicito: necessario per la cifratura`);
  }
  return table.name;
}

/** AAD usata per un campo: "tabella.colonna". */
export function aadFor(target: Function, column: string): string {
  return `${resolveTableName(target)}.${column}`;
}

/** Anni accettati: il formato 'YYYY-MM-DD' ne prevede 4 cifre (niente anni negativi o a 5 cifre). */
const MIN_YEAR = 1;
const MAX_YEAR = 9999;

/** 'YYYY-MM-DD' solo se la data esiste davvero (niente 30 febbraio o mese 13). */
function validDateOnly(y: number, m: number, d: number): string | null {
  if (y < MIN_YEAR || y > MAX_YEAR || m < 1 || m > 12 || d < 1) return null;
  // giorni del mese calcolati in UTC: indipendente dal fuso del server
  const daysInMonth = new Date(Date.UTC(2000, m, 0)).getUTCDate();
  const leapFix = m === 2 && !(y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0)) ? 1 : 0;
  if (d > daysInMonth - leapFix) return null;
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/**
 * Converte una data in arrivo (Date, 'YYYY-MM-DD', ISO) nella stringa 'YYYY-MM-DD' che restituiva la colonna date.
 * Una data impossibile o fuori intervallo lancia un errore invece di essere salvata così com'è.
 */
export function toDateOnlyString(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date) {
    if (isNaN(value.getTime())) throw new Error('Data non valida');
    const result = validDateOnly(value.getFullYear(), value.getMonth() + 1, value.getDate());
    if (!result) throw new Error('Data non valida');
    return result;
  }
  const str = String(value).trim();
  const match = str.match(/^(\d{4})-(\d{2})-(\d{2})(?:$|[T ])/);
  if (match) {
    const result = validDateOnly(Number(match[1]), Number(match[2]), Number(match[3]));
    if (!result) throw new Error('Data non valida');
    return result;
  }
  // altri formati riconosciuti da Date (come prima); gli anni fuori intervallo (es. "-002023-01-01") vengono rifiutati
  const parsed = new Date(str);
  if (!isNaN(parsed.getTime())) return toDateOnlyString(parsed);
  throw new Error('Data non valida (formato atteso AAAA-MM-GG)');
}

function buildTransformer(target: Function, column: string, kind: 'string' | 'date'): ValueTransformer {
  let aad: string | null = null;
  const getAad = () => (aad ??= aadFor(target, column));

  return {
    to(value: unknown) {
      if (value instanceof FindOperator) {
        // Un campo cifrato non può essere usato nelle condizioni SQL: il valore nel DB è un testo casuale.
        throw new Error(`Il campo cifrato ${getAad()} non può essere usato in una condizione di ricerca SQL`);
      }
      if (value === null || value === undefined) return value;
      if (kind === 'date') {
        const dateStr = toDateOnlyString(value);
        return dateStr === null ? null : encryptString(dateStr, getAad());
      }
      const str = String(value);
      if (str === '') return str;
      return encryptString(str, getAad());
    },
    from(value: unknown) {
      if (value === null || value === undefined || value === '') return value;
      return decryptString(String(value), getAad());
    },
  };
}

export interface EncryptedColumnOptions {
  nullable?: boolean;
  /** 'varchar' (default) o 'text', come la colonna originale, per non cambiare lo schema. */
  type?: 'varchar' | 'text';
  /** La property contiene una data (esposta come 'YYYY-MM-DD'). */
  date?: boolean;
  hash?: { property: string; kind: HashKind };
}

/** Colonna salvata cifrata (AES-256-GCM) e decifrata in automatico alla lettura. */
export function EncryptedColumn(options: EncryptedColumnOptions = {}): PropertyDecorator {
  return (object: object, propertyName: string | symbol) => {
    const property = String(propertyName);
    const target = object.constructor;
    const kind = options.date ? 'date' : 'string';

    const list = registry.get(target) ?? [];
    list.push({ property, column: property, kind, hash: options.hash });
    registry.set(target, list);

    const columnOptions: ColumnOptions = {
      type: options.type ?? 'varchar',
      nullable: options.nullable ?? false,
      transformer: buildTransformer(target, property, kind),
    };
    Column(columnOptions)(object, propertyName);
  };
}
