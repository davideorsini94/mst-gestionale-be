import {
  ArgumentsHost,
  BadRequestException,
  Catch,
  ConflictException,
  HttpException,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import { EntityNotFoundError, EntityPropertyNotFoundError, QueryFailedError } from 'typeorm';

/** Nomi leggibili di tabelle e colonne che compaiono nei dettagli degli errori Postgres. */
const TABLE_LABELS: Record<string, string> = {
  transactions: 'movimenti',
  categories: 'categoria',
  users: 'utenti',
  roles: 'ruolo',
  capabilities_per_role: 'permessi del ruolo',
  members: 'tesserati',
  member_documents: 'documenti del tesserato',
  staff: 'staff',
  staff_documents: 'documenti dello staff',
  vehicles: 'veicoli',
};

const COLUMN_LABELS: Record<string, string> = {
  username: 'nome utente',
  licensePlate: 'targa',
  code: 'codice',
  key: 'chiave',
  name: 'nome',
  staffUuid: 'profilo staff collegato',
};

interface PgError {
  code?: string;
  detail?: string;
  table?: string;
  column?: string;
  constraint?: string;
  message?: string;
}

/** Colonna indicata nel dettaglio Postgres: 'Key ("licensePlate")=(AB123CD) already exists.' → licensePlate */
function keyColumn(detail?: string): string | null {
  const match = detail?.match(/Key \(([^)]+)\)=/);
  return match ? match[1].replace(/"/g, '') : null;
}

/** Tabella citata nel dettaglio: '... is still referenced from table "transactions".' → transactions */
function referencedTable(detail?: string): string | null {
  const match = detail?.match(/table "([^"]+)"/);
  return match ? match[1] : null;
}

/**
 * Errore Postgres/TypeORM → risposta HTTP con un messaggio comprensibile. null = errore non riconosciuto.
 * Il testo SQL e i valori non finiscono mai nella risposta: solo nel log del server.
 */
export function mapDatabaseError(error: unknown): HttpException | null {
  if (error instanceof EntityNotFoundError) {
    return new NotFoundException('Elemento non trovato');
  }
  // filtro o ordinamento su un campo che non esiste (parametro `filters` scritto a mano)
  if (error instanceof EntityPropertyNotFoundError) {
    return new BadRequestException('Filtro o ordinamento su un campo inesistente');
  }
  // Errori di Fastify e dei suoi plugin con un codice 4xx (limite di richieste del login, tipo di contenuto non
  // supportato, upload troppo grande): prima diventavano 500 e la UI non mostrava "Troppi tentativi"
  const status = Number((error as { statusCode?: unknown })?.statusCode);
  if (!(error instanceof QueryFailedError) && Number.isInteger(status) && status >= 400 && status < 500) {
    const messages: Record<number, string> = {
      413: 'File o richiesta troppo grandi',
      415: 'Tipo di contenuto non supportato',
      429: 'Troppi tentativi: riprova tra qualche minuto',
    };
    return new HttpException(messages[status] ?? 'Richiesta non valida', status);
  }
  // Errori semplici lanciati da BaseService e dal cifrario delle date: sono errori dell'utente, non del server
  if (error instanceof Error && !(error instanceof QueryFailedError)) {
    if (error.message === 'Entity not found') return new NotFoundException('Elemento non trovato');
    if (error.message === 'UUID is required') return new BadRequestException('Identificativo mancante');
    if (/^Data non valida/.test(error.message)) return new BadRequestException('Data non valida (usa AAAA-MM-GG)');
    return null;
  }
  if (!(error instanceof QueryFailedError)) return null;

  const pg: PgError = ((error as any).driverError ?? error) as PgError;
  switch (pg.code) {
    case '22P02': // sintassi non valida per il tipo (uuid, enum, numero)
      return new BadRequestException('Valore non valido: identificativo o opzione non riconosciuti');
    case '22007': // formato data/ora non valido
    case '22008': // data/ora fuori intervallo (es. 30 febbraio)
      return new BadRequestException('Data non valida (usa AAAA-MM-GG)');
    case '22001':
      return new BadRequestException('Testo troppo lungo');
    case '22003':
      return new BadRequestException('Valore numerico fuori dall\'intervallo consentito');
    case '23502': {
      const column = pg.column ? COLUMN_LABELS[pg.column] ?? pg.column : null;
      return new BadRequestException(column ? `Campo obbligatorio mancante: ${column}` : 'Campo obbligatorio mancante');
    }
    case '23505': {
      const column = keyColumn(pg.detail);
      const label = column ? COLUMN_LABELS[column] ?? column : null;
      return new ConflictException(
        label ? `Esiste già un elemento con lo stesso valore di "${label}"` : 'Esiste già un elemento con questi dati',
      );
    }
    case '23503': {
      const table = referencedTable(pg.detail);
      const label = table ? TABLE_LABELS[table] ?? table : null;
      if (pg.detail?.includes('is still referenced')) {
        // cancellazione (o cambio di chiave) di qualcosa che altri dati usano ancora
        return new BadRequestException(
          label ? `È ancora usato da altri dati (${label}): non si può eliminare` : 'È ancora usato da altri dati: non si può eliminare',
        );
      }
      // inserimento/modifica che punta a un dato inesistente (es. ruolo o categoria sbagliati)
      return new BadRequestException(label ? `Il dato collegato non esiste (${label})` : 'Il dato collegato non esiste');
    }
    default:
      return null;
  }
}

/**
 * Filtro globale: gli errori del database diventano risposte 4xx chiare invece di 500 generici.
 * Le HttpException passano invariate; ogni altro errore resta un 500 senza dettagli (stack e SQL solo nel log).
 */
@Catch()
export class DatabaseExceptionFilter extends BaseExceptionFilter {
  private readonly logger = new Logger('DatabaseExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost) {
    if (exception instanceof HttpException) {
      return super.catch(exception, host);
    }

    const mapped = mapDatabaseError(exception);
    if (exception instanceof QueryFailedError) {
      const pg: PgError = ((exception as any).driverError ?? exception) as PgError;
      // niente parametri nel log: possono contenere dati personali (cifrati solo dopo il salvataggio)
      const log = `${pg.code ?? '?'} ${pg.message ?? exception.message}${pg.detail ? ` | ${pg.detail}` : ''}`;
      if (mapped) this.logger.warn(`Errore DB gestito: ${log}`);
      else this.logger.error(`Errore DB non gestito: ${log}`, (exception as Error).stack);
    }
    if (mapped) {
      return super.catch(mapped, host);
    }

    if (!(exception instanceof QueryFailedError)) {
      this.logger.error(
        `Errore non gestito: ${(exception as Error)?.message ?? exception}`,
        (exception as Error)?.stack,
      );
    }
    return super.catch(new InternalServerErrorException('Errore interno del server'), host);
  }
}
