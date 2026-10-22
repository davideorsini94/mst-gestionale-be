import { BadRequestException } from '@nestjs/common';
import { FindOperator } from 'typeorm';
import { getEncryptedFields } from '../crypto/encrypted-column';
import { BaseFilterList } from './base.filter';

/**
 * Supporto a filtri e ordinamenti su campi cifrati.
 * Il DB contiene testo cifrato (casuale): le condizioni su questi campi vengono valutate in memoria dopo la
 * decifratura, il resto resta in SQL.
 */

const MEMORY_FILTER_OPERATORS = ['equal', 'notEqual', 'like'] as const;
const SQL_ONLY_OPERATORS = ['moreThan', 'lessThan', 'moreThanOrEqual', 'lessThanOrEqual', 'between'] as const;

export function encryptedPropertySet(target: Function): Set<string> {
  return new Set(getEncryptedFields(target).map((f) => f.property));
}

/** Testo normalizzato per i confronti "like": senza accenti e maiuscole. */
export function foldText(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

export interface MemoryPlan {
  /** Filtri da applicare in SQL (senza i campi cifrati). */
  dbFilterList: BaseFilterList<any>;
  /** Condizioni AND da valutare in memoria. */
  andConditions: { property: string; op: 'equal' | 'notEqual' | 'like'; value: any }[];
  /** OR "like" valutato in memoria (tutte le chiavi, cifrate o no). */
  orLike: { property: string; value: string }[];
  /** Ordinamento completo da applicare in memoria. */
  order: { property: string; direction: 'ASC' | 'DESC' }[];
  /** Colonne da leggere nella prima fase. */
  columns: string[];
}

function normalizeDirection(value: any): 'ASC' | 'DESC' {
  const v = typeof value === 'object' && value !== null ? value.direction : value;
  return String(v ?? 'ASC').toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
}

/**
 * Restituisce il piano di esecuzione in memoria se la lista filtri tocca campi cifrati, altrimenti null.
 * Lancia 400 per operatori non supportabili su campi cifrati (confronti di intervallo, filtri su relazioni
 * con campi cifrati).
 */
export function planEncryptedQuery(
  target: Function,
  filterList: BaseFilterList<any>,
  defaultOrder: Record<string, any> | null,
  relationTargets: (relation: string) => Function | null,
): MemoryPlan | null {
  const encrypted = encryptedPropertySet(target);
  const andFilters: any = filterList.andFilters ?? {};
  const orFilters: any = filterList.orFilters ?? {};

  // Operatori non valutabili su testo cifrato
  for (const op of SQL_ONLY_OPERATORS) {
    for (const key of Object.keys(andFilters[op] ?? {})) {
      if (encrypted.has(key)) {
        throw new BadRequestException(`Filtro "${op}" non disponibile sul campo cifrato "${key}"`);
      }
    }
  }
  // Filtri annidati su relazioni che toccano campi cifrati dell'entità collegata
  for (const op of [...MEMORY_FILTER_OPERATORS, ...SQL_ONLY_OPERATORS]) {
    for (const [key, value] of Object.entries(andFilters[op] ?? {})) {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        const relTarget = relationTargets(key);
        const relEncrypted = relTarget ? encryptedPropertySet(relTarget) : new Set<string>();
        for (const sub of Object.keys(value as object)) {
          if (relEncrypted.has(sub)) {
            throw new BadRequestException(`Filtro sul campo cifrato "${key}.${sub}" non disponibile`);
          }
        }
      }
    }
  }

  const andConditions: MemoryPlan['andConditions'] = [];
  for (const op of MEMORY_FILTER_OPERATORS) {
    for (const [key, value] of Object.entries(andFilters[op] ?? {})) {
      if (encrypted.has(key) && value !== undefined && value !== null && value !== '') {
        andConditions.push({ property: key, op, value });
      }
    }
  }

  const orLikeEntries = Object.entries(orFilters.like ?? {}).filter(
    ([, v]) => v !== undefined && v !== null && v !== '',
  ) as [string, string][];
  const orTouchesEncrypted = orLikeEntries.some(([k]) => encrypted.has(k));
  const otherOrOps = Object.keys(orFilters).filter((k) => k !== 'like' && Object.keys(orFilters[k] ?? {}).length);
  if (orTouchesEncrypted && otherOrOps.length) {
    throw new BadRequestException('Combinazione di filtri OR non disponibile sui campi cifrati');
  }

  const requestedOrder = filterList.orderBy && Object.keys(filterList.orderBy).length
    ? filterList.orderBy
    : defaultOrder ?? {};
  const order = Object.entries(requestedOrder).map(([property, dir]) => ({
    property,
    direction: normalizeDirection(dir),
  }));
  const orderTouchesEncrypted = order.some((o) => encrypted.has(o.property));

  if (!andConditions.length && !orTouchesEncrypted && !orderTouchesEncrypted) {
    return null;
  }

  // Filtri che restano in SQL: si tolgono quelli sui campi cifrati e, se l'OR va in memoria, tutto l'OR
  const dbAnd: any = {};
  for (const [op, conditions] of Object.entries(andFilters)) {
    const kept: any = {};
    for (const [key, value] of Object.entries(conditions ?? {})) {
      if ((MEMORY_FILTER_OPERATORS as readonly string[]).includes(op) && encrypted.has(key)) continue;
      kept[key] = value;
    }
    if (Object.keys(kept).length) dbAnd[op] = kept;
  }
  const dbFilterList: BaseFilterList<any> = {
    ...filterList,
    andFilters: dbAnd,
    orFilters: orTouchesEncrypted ? undefined : filterList.orFilters,
    orderBy: undefined,
    page: undefined,
    pageSize: undefined,
  };

  const columns = new Set<string>(['uuid']);
  andConditions.forEach((c) => columns.add(c.property));
  if (orTouchesEncrypted) orLikeEntries.forEach(([k]) => columns.add(k));
  order.forEach((o) => columns.add(o.property));

  return {
    dbFilterList,
    andConditions,
    orLike: orTouchesEncrypted ? orLikeEntries.map(([property, value]) => ({ property, value })) : [],
    order,
    columns: Array.from(columns),
  };
}

function matchesCondition(rowValue: any, op: 'equal' | 'notEqual' | 'like', value: any): boolean {
  if (op === 'like') {
    return foldText(rowValue).includes(foldText(value));
  }
  const values = Array.isArray(value) ? value.map(String) : [String(value)];
  const has = rowValue !== null && rowValue !== undefined && values.includes(String(rowValue));
  return op === 'equal' ? has : !has;
}

export function applyMemoryFilters<T extends Record<string, any>>(rows: T[], plan: MemoryPlan): T[] {
  return rows.filter((row) => {
    for (const c of plan.andConditions) {
      if (!matchesCondition(row[c.property], c.op, c.value)) return false;
    }
    if (plan.orLike.length) {
      return plan.orLike.some((c) => foldText(row[c.property]).includes(foldText(c.value)));
    }
    return true;
  });
}

const collator = new Intl.Collator('it', { sensitivity: 'base', numeric: true });

function compareValues(a: any, b: any): number {
  if (a instanceof Date || b instanceof Date) {
    return new Date(a).getTime() - new Date(b).getTime();
  }
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  const na = Number(a);
  const nb = Number(b);
  if (typeof a !== 'boolean' && a !== '' && b !== '' && !isNaN(na) && !isNaN(nb) && /^-?\d/.test(String(a)) && /^-?\d/.test(String(b))) {
    return na - nb;
  }
  return collator.compare(String(a), String(b));
}

/** Ordinamento come Postgres: ASC con i null in fondo, DESC con i null in cima. */
export function sortRows<T extends Record<string, any>>(rows: T[], order: MemoryPlan['order']): T[] {
  return [...rows].sort((x, y) => {
    for (const { property, direction } of order) {
      const a = x[property];
      const b = y[property];
      const aNull = a === null || a === undefined;
      const bNull = b === null || b === undefined;
      let cmp: number;
      if (aNull && bNull) cmp = 0;
      else if (aNull) cmp = 1;
      else if (bNull) cmp = -1;
      else cmp = compareValues(a, b);
      if (cmp !== 0) return direction === 'ASC' ? cmp : -cmp;
    }
    return 0;
  });
}

/** IsNull() o Not(IsNull()): condizioni che non leggono il valore cifrato. */
function isNullCheck(value: unknown): boolean {
  if (!(value instanceof FindOperator)) return false;
  if (value.type === 'isNull') return true;
  return value.type === 'not' && value.child instanceof FindOperator && value.child.type === 'isNull';
}

/** Lancia un errore se un campo cifrato compare in una condizione `where` destinata al DB. */
export function assertNoEncryptedWhere(target: Function, where: any, relationTargets: (r: string) => Function | null) {
  if (!where) return;
  const encrypted = encryptedPropertySet(target);
  const conditions = Array.isArray(where) ? where : [where];
  for (const condition of conditions) {
    for (const [key, value] of Object.entries(condition ?? {})) {
      if (encrypted.has(key) && value !== undefined) {
        // IS NULL / IS NOT NULL funziona anche sul testo cifrato. Per Not(IsNull()) l'operatore interno è in `child`:
        // `value` restituirebbe il valore dell'IsNull (undefined) e il filtro verrebbe rifiutato.
        if (isNullCheck(value)) continue;
        throw new BadRequestException(`Il campo cifrato "${key}" non può essere usato in una condizione SQL`);
      }
      if (value && typeof value === 'object' && !(value instanceof FindOperator) && !Array.isArray(value) && !(value instanceof Date)) {
        const rel = relationTargets(key);
        if (rel) assertNoEncryptedWhere(rel, value, () => null);
      }
    }
  }
}

/** Separa un ordinamento in parte SQL e parte in memoria (se tocca campi cifrati, tutto va in memoria). */
export function splitOrder(
  target: Function,
  order: Record<string, any> | null | undefined,
  relationTargets: (r: string) => Function | null = () => null,
) {
  if (!order || !Object.keys(order).length) return { dbOrder: order, memoryOrder: null as MemoryPlan['order'] | null };
  const encrypted = encryptedPropertySet(target);
  const entries = Object.entries(order);
  // ordinamento su un campo cifrato di un'entità collegata: non valutabile (in SQL ordinerebbe testo casuale)
  for (const [key, value] of entries) {
    if (value && typeof value === 'object' && !('direction' in value)) {
      const rel = relationTargets(key);
      const relEncrypted = rel ? encryptedPropertySet(rel) : new Set<string>();
      for (const sub of Object.keys(value)) {
        if (relEncrypted.has(sub)) {
          throw new BadRequestException(`Ordinamento sul campo cifrato "${key}.${sub}" non disponibile`);
        }
      }
    }
  }
  if (!entries.some(([k]) => encrypted.has(k))) return { dbOrder: order, memoryOrder: null };
  return {
    dbOrder: undefined,
    memoryOrder: entries.map(([property, dir]) => ({ property, direction: normalizeDirection(dir) })),
  };
}
