import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { In } from 'typeorm';
import { dataSource } from '../../datasources/data-source';
import { AmountReviewStatus, Transaction, TransactionType } from './entities/transaction.entity';
import { ReceiptService } from './receipt.service';
import { foldText } from '../../common/base-crud/encrypted-query';
import { roundToCents } from './import/amount-parser';
import { V14_INSTALLED_SETTING } from '../../migrations/1760900001000-EncryptSensitiveData';

/**
 * Lotti di import: movimenti creati a meno di 2 minuti l'uno dall'altro. Un lotto con almeno 10 righe è un import
 * Excel; i lotti più piccoli sono probabilmente inserimenti manuali (non toccati dal bug).
 * - key_amount: importo con cui la riga era stata salvata dal vecchio import (anche se nel frattempo corretta),
 *   così le copie di una riga corretta restano riconosciute come copie.
 * - before_v14: solo i movimenti creati prima dell'installazione della v1.4 possono essere stati rovinati.
 * - batch_key: identificativo stabile del lotto (data/ora di inizio), non cambia quando si rimuovono righe.
 */
const BATCHES_CTE = `
  installed AS (
    SELECT COALESCE(
      (SELECT (value #>> '{}')::timestamp FROM settings WHERE key = '${V14_INSTALLED_SETTING}'),
      'infinity'::timestamp
    ) AS at
  ),
  ordered AS (
    SELECT t.uuid, t."createdAt",
      CASE WHEN t."createdAt" - lag(t."createdAt") OVER (ORDER BY t."createdAt", t.uuid) > interval '2 minutes'
           THEN 1 ELSE 0 END AS new_batch
    FROM transactions t
  ),
  numbered AS (
    SELECT uuid, "createdAt", SUM(new_batch) OVER (ORDER BY "createdAt", uuid) AS batch FROM ordered
  ),
  batches AS (
    SELECT batch, COUNT(*) AS size, MIN("createdAt") AS started FROM numbered GROUP BY batch
  ),
  tx AS (
    SELECT t.*, n.batch, b.size AS batch_size, b.started AS batch_started,
           to_char(b.started, 'YYYY-MM-DD"T"HH24:MI:SS.US') AS batch_key,
           COALESCE(t."amountBeforeReview", t.amount) AS key_amount,
           t."createdAt" < (SELECT at FROM installed) AS before_v14
    FROM transactions t JOIN numbered n ON n.uuid = t.uuid JOIN batches b ON b.batch = n.batch
  )`;

/** Un movimento modificato più di 10 secondi dopo la creazione si conserva al posto di una copia intatta. */
const EDITED = `("updatedAt" - "createdAt") > interval '10 seconds'`;

export interface DuplicateGroup {
  date: string;
  type: TransactionType;
  amount: number;
  subject: string | null;
  total: number;
  keep: number;
  remove: number;
  removeUuids: string[];
  keptUuid: string;
}

export type ReviewConfidence = 'certain' | 'high' | 'check' | 'manual';

export interface ReviewFilters {
  min?: number;
  max?: number;
  year?: number;
  type?: TransactionType;
  status?: 'PENDING' | 'CORRECTED' | 'CONFIRMED';
  confidence?: ReviewConfidence;
  batch?: string;
  subject?: string;
  page?: number;
  pageSize?: number;
}

@Injectable()
export class TransactionMaintenanceService {
  private readonly logger = new Logger(TransactionMaintenanceService.name);

  constructor(private readonly receiptService: ReceiptService) {}

  // ───────────────────────── Pulizia duplicati da import ─────────────────────────

  /**
   * Duplicati creati dai re-import della v1.3 (l'importo non arrotondato non trovava mai la riga già salvata).
   * Per ogni chiave (data, tipo, importo, soggetto) si tiene la molteplicità del primo lotto in cui compare:
   * righe identiche nello stesso file sono movimenti distinti, quelle ripetute nei lotti successivi sono copie.
   */
  private async computeDuplicates(): Promise<DuplicateGroup[]> {
    const rows: any[] = await dataSource.query(`
      WITH ${BATCHES_CTE},
      keyed AS (
        SELECT uuid, date, type, key_amount AS amount, "subjectHash", batch, "createdAt", ${EDITED} AS edited,
               COUNT(*) OVER (PARTITION BY date, type, key_amount, "subjectHash") AS total
        FROM tx
        -- solo righe di import (lotti grandi) precedenti alla v1.4: gli inserimenti manuali non si toccano mai
        WHERE batch_size >= 10 AND before_v14
      ),
      dup AS (SELECT * FROM keyed WHERE total > 1),
      per_batch AS (
        SELECT date, type, amount, "subjectHash", batch, COUNT(*) AS cnt
        FROM dup GROUP BY 1, 2, 3, 4, 5
      ),
      first_batch AS (
        SELECT DISTINCT ON (date, type, amount, "subjectHash") date, type, amount, "subjectHash", cnt AS keep
        FROM per_batch ORDER BY date, type, amount, "subjectHash", batch
      ),
      ranked AS (
        SELECT d.*, f.keep,
               ROW_NUMBER() OVER (
                 PARTITION BY d.date, d.type, d.amount, d."subjectHash"
                 ORDER BY d.edited DESC, d."createdAt" ASC, d.uuid
               ) AS rn
        FROM dup d JOIN first_batch f
          ON f.date = d.date AND f.type = d.type AND f.amount = d.amount
         AND f."subjectHash" IS NOT DISTINCT FROM d."subjectHash"
      )
      SELECT to_char(date, 'YYYY-MM-DD') AS date, type, amount::float8 AS amount, "subjectHash",
             MAX(total) AS total, MAX(keep) AS keep,
             array_agg(uuid::text ORDER BY rn) FILTER (WHERE rn > keep) AS remove_uuids,
             (array_agg(uuid::text ORDER BY rn))[1] AS kept_uuid
      FROM ranked
      GROUP BY date, type, amount, "subjectHash"
      HAVING COUNT(*) FILTER (WHERE rn > keep) > 0
      ORDER BY date DESC, amount DESC`);

    // Il soggetto è cifrato: lo si legge decifrato dalla riga tenuta
    const kept = rows.length
      ? await dataSource.getRepository(Transaction).find({
          where: { uuid: In(rows.map((r) => r.kept_uuid)) },
          select: ['uuid', 'subject'],
        })
      : [];
    const subjects = new Map(kept.map((t) => [t.uuid, t.subject ?? null]));

    return rows.map((r) => ({
      date: r.date,
      type: r.type,
      amount: Number(r.amount),
      subject: subjects.get(r.kept_uuid) ?? null,
      total: Number(r.total),
      keep: Number(r.keep),
      remove: r.remove_uuids.length,
      removeUuids: r.remove_uuids,
      keptUuid: r.kept_uuid,
    }));
  }

  async previewDuplicates(page = 1, pageSize = 20) {
    const groups = await this.computeDuplicates();
    const removeUuids = groups.flatMap((g) => g.removeUuids);
    const withReceipt = removeUuids.length
      ? Number(
          (await dataSource.query(
            `SELECT COUNT(*) AS c FROM transactions WHERE uuid = ANY($1::uuid[]) AND "receiptMinioPath" IS NOT NULL`,
            [removeUuids],
          ))[0].c,
        )
      : 0;
    const years = Array.from(new Set(groups.filter((g) => g.type === TransactionType.INCOME).map((g) => Number(g.date.slice(0, 4))))).sort();
    const archived = Number((await dataSource.query(`SELECT COUNT(*) AS c FROM transactions_removed_duplicates`))[0].c);
    const start = (Math.max(page, 1) - 1) * pageSize;

    return {
      summary: {
        groups: groups.length,
        toRemove: removeUuids.length,
        withReceipt,
        incomeYears: years,
        archived,
      },
      groups: groups.slice(start, start + pageSize).map(({ removeUuids: _r, keptUuid: _k, ...g }) => g),
      total: groups.length,
    };
  }

  /** Sposta i duplicati nell'archivio (ripristinabili). Le ricevute non vengono rinumerate. */
  async removeDuplicates(expectedCount: number) {
    const groups = await this.computeDuplicates();
    const toRemove = groups.flatMap((g) => g.removeUuids.map((uuid) => ({ uuid, keptUuid: g.keptUuid })));
    if (toRemove.length !== expectedCount) {
      throw new BadRequestException(
        `I duplicati sono cambiati (attesi ${expectedCount}, trovati ${toRemove.length}): ricarica l'anteprima`,
      );
    }
    if (!toRemove.length) return { removed: 0, receiptsRegenerated: 0, years: [] };

    const uuids = toRemove.map((r) => r.uuid);
    const removedRows: { receiptMinioPath: string | null; receiptYear: number | null; type: string; year: number }[] = [];

    await dataSource.transaction(async (manager) => {
      const info = await manager.query(
        `SELECT uuid::text AS uuid, "receiptMinioPath", "receiptYear", type, EXTRACT(YEAR FROM date)::int AS year
         FROM transactions WHERE uuid = ANY($1::uuid[]) FOR UPDATE`,
        [uuids],
      );
      if (info.length !== uuids.length) {
        throw new BadRequestException('Alcuni movimenti non esistono più: ricarica l\'anteprima');
      }
      removedRows.push(...info);
      await manager.query(
        `WITH ${BATCHES_CTE}
         INSERT INTO transactions_removed_duplicates (uuid, "keptUuid", "importBatch", data)
         SELECT t.uuid, k.kept::uuid, to_char(tx.batch_started, 'YYYY-MM-DD HH24:MI'), to_jsonb(t)
         FROM transactions t
         JOIN unnest($1::text[], $2::text[]) AS k(removed, kept) ON k.removed::uuid = t.uuid
         JOIN tx ON tx.uuid = t.uuid`,
        [uuids, toRemove.map((r) => r.keptUuid)],
      );
      await manager.query(`DELETE FROM transactions WHERE uuid = ANY($1::uuid[])`, [uuids]);
    });

    // Numeri e PDF delle ricevute dei duplicati restano nell'archivio (ripristinabili): nessuna rinumerazione, i
    // numeri archiviati non vengono riassegnati alle nuove entrate
    const years = Array.from(new Set(removedRows.filter((r) => r.type === TransactionType.INCOME).map((r) => r.receiptYear ?? r.year))).sort();
    this.logger.log(`Duplicati archiviati: ${uuids.length} (anni con entrate: ${years.join(', ') || 'nessuno'})`);
    return { removed: uuids.length, receiptsRegenerated: 0, years, errors: [] as string[] };
  }

  /** Ripristina tutti i movimenti archiviati dalla pulizia duplicati. */
  async restoreDuplicates() {
    const restored: { uuid: string; type: string; year: number }[] = await dataSource.transaction(async (manager) => {
      const rows = await manager.query(
        `INSERT INTO transactions
         SELECT (jsonb_populate_record(NULL::transactions, d.data)).*
         FROM transactions_removed_duplicates d
         WHERE NOT EXISTS (SELECT 1 FROM transactions t WHERE t.uuid = d.uuid)
         RETURNING uuid::text AS uuid, type, EXTRACT(YEAR FROM date)::int AS year`,
      );
      await manager.query(`DELETE FROM transactions_removed_duplicates`);
      return rows;
    });
    // I movimenti tornano con i loro numeri e PDF originali. Eccezioni (dati archiviati da versioni precedenti):
    // numero già usato da un altro movimento → nuovo numero; PDF mancante → rigenerato con lo stesso numero.
    let renumbered = 0;
    let regenerated = 0;
    for (const row of restored.filter((r) => r.type === TransactionType.INCOME)) {
      const t = await dataSource.getRepository(Transaction).findOne({ where: { uuid: row.uuid } });
      if (!t) continue;
      const conflict = await this.receiptService.hasNumberConflict(t);
      if (!conflict && t.receiptNumber && (await this.receiptService.pdfExists(t.receiptMinioPath))) continue;
      if (conflict) {
        t.receiptNumber = null;
        t.receiptYear = null;
        renumbered++;
      } else {
        regenerated++;
      }
      try {
        const receipt = await this.receiptService.updateReceipt(t);
        await dataSource.getRepository(Transaction).update(
          { uuid: t.uuid },
          { receiptMinioPath: receipt.minioPath, receiptNumber: receipt.receiptNumber, receiptYear: receipt.receiptYear },
        );
      } catch (error) {
        this.logger.error(`Ricevuta del movimento ripristinato ${t.uuid} non rigenerata: ${error.message}`);
      }
    }
    const years = Array.from(new Set(restored.filter((r) => r.type === TransactionType.INCOME).map((r) => r.year))).sort();
    this.logger.log(`Ripristinati ${restored.length} movimenti (nuovo numero: ${renumbered}, PDF rigenerati: ${regenerated})`);
    return { restored: restored.length, years, renumbered, regenerated };
  }

  // ───────────────────────── Revisione importi sospetti ─────────────────────────

  /**
   * Il vecchio parser salvava round2(migliaia + resto/1000) per ogni importo ≥ 1.000 mostrato con il separatore
   * delle migliaia: il valore salvato è sempre tra 1,00 e 999,99. La proposta è ×1000 (unità e centesimi persi).
   * Confidenza: "certain" = la stessa riga era stata re-importata più volte (prova del bug); "high" = import
   * successivo al primo; "check" = primo import (mescola importi piccoli veri e rovinati); "manual" = lotti piccoli,
   * probabilmente inseriti a mano (non toccati dal bug).
   */
  /** Tutti i movimenti che corrispondono ai filtri della revisione (senza paginazione). */
  private async findCandidates(filters: ReviewFilters): Promise<{
    candidates: { uuid: string; confidence: ReviewConfidence; batch_key: string; batch_started: Date }[];
    counts: Record<ReviewConfidence, number>;
  }> {
    const min = filters.min ?? 1;
    // Il bug produce round2(migliaia + resto/1000): con importi reali fino a ~20.000 € il valore salvato è < 21 €
    // (il duplicato più alto trovato nei dati è 20,65). Il limite resta modificabile dal filtro.
    const max = filters.max ?? 20.99;
    const status = filters.status ?? 'PENDING';
    const params: any[] = [];
    const where: string[] = [];
    if (status === 'PENDING') {
      // l'intervallo vale solo per i sospetti: i corretti hanno già l'importo ×1000
      params.push(min, max);
      where.push('tx.amount >= $1', 'tx.amount <= $2');
    }

    if (filters.year) {
      params.push(filters.year);
      where.push(`EXTRACT(YEAR FROM tx.date) = $${params.length}`);
    }
    if (filters.type) {
      params.push(filters.type);
      where.push(`tx.type = $${params.length}`);
    }
    if (status === 'PENDING') {
      // i movimenti creati dalla v1.4 in poi non sono stati toccati dal bug
      where.push(`tx."amountReview" IS NULL`, 'tx.before_v14');
    } else {
      params.push(status);
      where.push(`tx."amountReview" = $${params.length}`);
    }
    if (filters.batch) {
      params.push(filters.batch);
      where.push(`tx.batch_key = $${params.length}`);
    }

    const rows: any[] = await dataSource.query(
      `WITH ${BATCHES_CTE},
       first_import AS (SELECT MIN(batch) AS b FROM batches WHERE size >= 10),
       -- MATERIALIZED: senza, Postgres ricalcola l'aggregazione per ogni riga del join (secondi invece di ms)
       repeated AS MATERIALIZED (
         SELECT date, type::text AS type, key_amount AS amount, COALESCE("subjectHash", '') AS sh FROM tx
         WHERE batch_size >= 10 AND before_v14
         GROUP BY 1, 2, 3, 4 HAVING COUNT(DISTINCT batch) > 1
       ),
       -- chiavi delle copie già rimosse dalla pulizia: le righe tenute con la stessa chiave restano "certe"
       archived AS MATERIALIZED (
         SELECT DISTINCT (data ->> 'date')::date AS date, data ->> 'type' AS type,
                COALESCE((data ->> 'amountBeforeReview')::numeric, (data ->> 'amount')::numeric) AS amount,
                COALESCE(data ->> 'subjectHash', '') AS sh
         FROM transactions_removed_duplicates
       ),
       scored AS (
         SELECT tx.uuid::text AS uuid, tx.date, tx.amount, tx.batch, tx.batch_key, tx.batch_started, tx."amountReview",
           CASE
             WHEN tx.batch_size < 10 THEN 'manual'
             WHEN a.date IS NOT NULL OR r.date IS NOT NULL THEN 'certain'
             WHEN tx.batch > fi.b THEN 'high'
             ELSE 'check'
           END AS confidence
         FROM tx
         CROSS JOIN first_import fi
         LEFT JOIN archived a ON a.date = tx.date AND a.type = tx.type::text AND a.amount = tx.key_amount
                             AND a.sh = COALESCE(tx."subjectHash", '')
         LEFT JOIN repeated r ON r.date = tx.date AND r.type = tx.type::text AND r.amount = tx.key_amount
                             AND r.sh = COALESCE(tx."subjectHash", '')
         WHERE ${where.join(' AND ')}
       )
       SELECT * FROM scored ORDER BY
         CASE confidence WHEN 'certain' THEN 0 WHEN 'high' THEN 1 WHEN 'check' THEN 2 ELSE 3 END,
         date DESC, amount DESC`,
      params,
    );

    let candidates = filters.confidence ? rows.filter((r) => r.confidence === filters.confidence) : rows.filter((r) => r.confidence !== 'manual');
    const counts = { certain: 0, high: 0, check: 0, manual: 0 } as Record<ReviewConfidence, number>;
    rows.forEach((r) => counts[r.confidence as ReviewConfidence]++);

    // Ricerca per soggetto: il campo è cifrato, si filtra dopo la decifratura
    if (filters.subject) {
      const needle = foldText(filters.subject);
      const subjects = await dataSource.getRepository(Transaction).find({
        where: { uuid: In(candidates.map((c) => c.uuid)) },
        select: ['uuid', 'subject'],
      });
      const matching = new Set(subjects.filter((s) => foldText(s.subject).includes(needle)).map((s) => s.uuid));
      candidates = candidates.filter((c) => matching.has(c.uuid));
    }

    return { candidates, counts };
  }

  async listSuspicious(filters: ReviewFilters) {
    const { candidates, counts } = await this.findCandidates(filters);
    const page = Math.max(filters.page ?? 1, 1);
    const pageSize = Math.min(Math.max(filters.pageSize ?? 20, 1), 100);
    const pageRows = candidates.slice((page - 1) * pageSize, page * pageSize);
    const entities = pageRows.length
      ? await dataSource.getRepository(Transaction).find({
          where: { uuid: In(pageRows.map((r) => r.uuid)) },
          relations: { category: true },
        })
      : [];
    const byUuid = new Map(entities.map((e) => [e.uuid, e]));

    const batches = await dataSource.query(
      `WITH ${BATCHES_CTE} SELECT to_char(started, 'YYYY-MM-DD"T"HH24:MI:SS.US') AS batch, size::int AS size,
              to_char(started, 'YYYY-MM-DD HH24:MI') AS started
       FROM batches WHERE size >= 10 AND started < (SELECT at FROM installed) ORDER BY started`,
    );

    return {
      items: pageRows.map((r) => {
        const t = byUuid.get(r.uuid);
        const amount = Number(t.amount);
        const original = t.originalAmount === null || t.originalAmount === undefined ? null : Number(t.originalAmount);
        return {
          uuid: t.uuid,
          date: t.date,
          type: t.type,
          subject: t.subject,
          notes: t.notes,
          notes2: t.notes2,
          budgetItem: t.budgetItem || t.category?.name || null,
          amount,
          originalAmount: original,
          suggestedAmount: roundToCents(amount * 1000),
          // l'importo originale si propone ×1000 solo se anch'esso è nel range dei valori rovinati
          suggestedOriginalAmount: original !== null && original >= 1 && original < 1000 ? roundToCents(original * 1000) : original,
          amountBeforeReview: t.amountBeforeReview === null ? null : Number(t.amountBeforeReview),
          amountReview: t.amountReview,
          hasReceipt: !!t.receiptMinioPath,
          receiptNumber: t.receiptNumber,
          confidence: r.confidence,
          importBatch: r.batch_key,
          importBatchStarted: r.batch_started,
        };
      }),
      total: candidates.length,
      counts,
      batches,
    };
  }

  /**
   * "Tutti i risultati": l'azione vale per tutti i movimenti che corrispondono ai filtri, non solo per la pagina.
   * `expectedTotal` è il totale che l'utente ha visto: se nel frattempo è cambiato non si fa nulla.
   */
  private async uuidsForAll(filters: ReviewFilters, expectedTotal: number, allowed: ReviewFilters['status'][]) {
    const status = filters.status ?? 'PENDING';
    if (!allowed.includes(status)) {
      throw new BadRequestException('Azione non disponibile per questa vista');
    }
    const { candidates } = await this.findCandidates({ ...filters, page: undefined, pageSize: undefined });
    if (candidates.length !== expectedTotal) {
      throw new BadRequestException(
        `I risultati sono cambiati (attesi ${expectedTotal}, trovati ${candidates.length}): ricarica la pagina`,
      );
    }
    return candidates.map((c) => c.uuid);
  }

  /** Corregge ×1000 tutti i risultati del filtro (i valori modificati a mano nella pagina hanno la precedenza). */
  async applyAll(filters: ReviewFilters, expectedTotal: number, overrides: Record<string, number> = {}) {
    const uuids = await this.uuidsForAll(filters, expectedTotal, ['PENDING']);
    const repo = dataSource.getRepository(Transaction);
    let corrected = 0;
    const errors: string[] = [];
    for (let i = 0; i < uuids.length; i += 200) {
      const chunk = await repo.find({ where: { uuid: In(uuids.slice(i, i + 200)) } });
      const items = chunk.map((t) => {
        const amount = Number(t.amount);
        const original = t.originalAmount === null || t.originalAmount === undefined ? null : Number(t.originalAmount);
        return {
          uuid: t.uuid,
          amount: overrides[t.uuid] ?? roundToCents(amount * 1000),
          originalAmount:
            original !== null && original >= 1 && original < 1000 ? roundToCents(original * 1000) : undefined,
        };
      });
      const res = await this.applyCorrections(items);
      corrected += res.corrected;
      errors.push(...res.errors);
    }
    this.logger.log(`Revisione importi: ${corrected} movimenti corretti con "tutti i risultati"`);
    return { corrected, errors };
  }

  async confirmAll(filters: ReviewFilters, expectedTotal: number) {
    return this.confirmAmounts(await this.uuidsForAll(filters, expectedTotal, ['PENDING']));
  }

  async undoAll(filters: ReviewFilters, expectedTotal: number) {
    return this.undoReview(await this.uuidsForAll(filters, expectedTotal, ['CORRECTED', 'CONFIRMED']));
  }

  /** Applica le correzioni scelte (valori eventualmente modificati dall'utente). */
  async applyCorrections(items: { uuid: string; amount: number; originalAmount?: number | null }[]) {
    const repo = dataSource.getRepository(Transaction);
    let corrected = 0;
    const errors: string[] = [];
    for (const item of items) {
      try {
        if (!(item.amount > 0) || item.amount >= 100_000_000) throw new Error('importo non valido');
        const t = await repo.findOne({ where: { uuid: item.uuid } });
        if (!t) throw new Error('movimento non trovato');
        if (t.amountBeforeReview === null || t.amountBeforeReview === undefined) {
          t.amountBeforeReview = t.amount;
          t.originalAmountBeforeReview = t.originalAmount ?? null;
        }
        t.amount = roundToCents(Number(item.amount));
        if (item.originalAmount !== undefined) {
          t.originalAmount = item.originalAmount === null ? null : roundToCents(Number(item.originalAmount));
        }
        t.amountReview = AmountReviewStatus.CORRECTED;
        t.amountReviewedAt = new Date();
        await this.saveAndRerenderReceipt(t);
        corrected++;
      } catch (error) {
        errors.push(`${item.uuid}: ${error.message}`);
      }
    }
    return { corrected, errors };
  }

  /** L'importo era giusto: esce dalla lista dei sospetti. */
  async confirmAmounts(uuids: string[]) {
    const result = await dataSource.query(
      `UPDATE transactions SET "amountReview" = $2, "amountReviewedAt" = now()
       WHERE uuid = ANY($1::uuid[]) AND "amountReview" IS NULL`,
      [uuids, AmountReviewStatus.CONFIRMED],
    );
    return { confirmed: result[1] ?? 0 };
  }

  /** Riporta i movimenti allo stato precedente la revisione. */
  async undoReview(uuids: string[]) {
    const repo = dataSource.getRepository(Transaction);
    let undone = 0;
    for (const uuid of uuids) {
      const t = await repo.findOne({ where: { uuid } });
      if (!t || !t.amountReview) continue;
      if (t.amountReview === AmountReviewStatus.CORRECTED && t.amountBeforeReview !== null) {
        t.amount = t.amountBeforeReview;
        t.originalAmount = t.originalAmountBeforeReview;
      }
      t.amountReview = null;
      t.amountBeforeReview = null;
      t.originalAmountBeforeReview = null;
      t.amountReviewedAt = null;
      await this.saveAndRerenderReceipt(t);
      undone++;
    }
    return { undone };
  }

  /** Salva e, per le entrate con ricevuta, rigenera il PDF con lo stesso numero (riporta l'importo). */
  private async saveAndRerenderReceipt(t: Transaction): Promise<void> {
    if (t.type === TransactionType.INCOME && t.receiptMinioPath) {
      const receipt = await this.receiptService.updateReceipt(t);
      t.receiptMinioPath = receipt.minioPath;
      t.receiptNumber = receipt.receiptNumber;
      t.receiptYear = receipt.receiptYear;
    }
    await dataSource.getRepository(Transaction).save(t);
  }
}
