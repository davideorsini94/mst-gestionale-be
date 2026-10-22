import { Body, Controller, Get, Post, Query, BadRequestException } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequireCapabilities } from '../../common/auth/decorators/capabilities.decorator';
import { Capability } from '../../common/models/capabilities-per-role/capability.enum';
import { ReviewConfidence, ReviewFilters, TransactionMaintenanceService } from './transaction-maintenance.service';
import { TransactionType } from './entities/transaction.entity';

const toNumber = (v?: string) => (v === undefined || v === '' ? undefined : Number(v));

interface AllResultsBody {
  filters: Record<string, string | number | undefined>;
  expectedTotal: number;
}

/** Filtri della vista "Revisione importi" inviati con le azioni su tutti i risultati. */
function parseAllResults(body: AllResultsBody): { filters: ReviewFilters; expectedTotal: number } {
  if (!body?.filters || typeof body.expectedTotal !== 'number') {
    throw new BadRequestException('Filtri e totale atteso obbligatori');
  }
  const f = body.filters;
  const str = (v: unknown) => (v === undefined || v === null || v === '' ? undefined : String(v));
  return {
    expectedTotal: body.expectedTotal,
    filters: {
      min: toNumber(str(f.min)),
      max: toNumber(str(f.max)),
      year: toNumber(str(f.year)),
      type: str(f.type) as TransactionType | undefined,
      status: str(f.status) as ReviewFilters['status'],
      confidence: str(f.confidence) as ReviewConfidence | undefined,
      batch: str(f.batch),
      subject: str(f.subject),
    },
  };
}

function assertUuidList(value: unknown): string[] {
  if (!Array.isArray(value) || !value.every((v) => typeof v === 'string')) {
    throw new BadRequestException('Elenco movimenti non valido');
  }
  return value;
}

@ApiTags('Transactions - manutenzione dati')
@ApiBearerAuth()
@Controller('transactions/maintenance')
@RequireCapabilities(Capability.CAN_MANAGE_TRANSACTIONS)
export class TransactionMaintenanceController {
  constructor(private readonly service: TransactionMaintenanceService) {}

  @Get('duplicates')
  @ApiOperation({ summary: 'Anteprima dei duplicati creati dai vecchi import' })
  async previewDuplicates(@Query('page') page?: string, @Query('pageSize') pageSize?: string) {
    return this.service.previewDuplicates(toNumber(page) ?? 1, Math.min(toNumber(pageSize) ?? 20, 100));
  }

  @Post('duplicates/remove')
  @ApiOperation({ summary: 'Sposta i duplicati in archivio (ripristinabili), senza rinumerare le ricevute' })
  async removeDuplicates(@Body() body: { expectedCount: number }) {
    if (typeof body?.expectedCount !== 'number') {
      throw new BadRequestException('expectedCount obbligatorio (dall\'anteprima)');
    }
    return this.service.removeDuplicates(body.expectedCount);
  }

  @Post('duplicates/restore')
  @ApiOperation({ summary: 'Ripristina i duplicati archiviati' })
  async restoreDuplicates() {
    return this.service.restoreDuplicates();
  }

  @Get('amount-review')
  @ApiOperation({ summary: 'Movimenti con importo sospetto (rovinato dal vecchio import)' })
  async listSuspicious(
    @Query('min') min?: string,
    @Query('max') max?: string,
    @Query('year') year?: string,
    @Query('type') type?: TransactionType,
    @Query('status') status?: 'PENDING' | 'CORRECTED' | 'CONFIRMED',
    @Query('confidence') confidence?: ReviewConfidence,
    @Query('batch') batch?: string,
    @Query('subject') subject?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.service.listSuspicious({
      min: toNumber(min),
      max: toNumber(max),
      year: toNumber(year),
      type: type || undefined,
      status: status || undefined,
      confidence: confidence || undefined,
      batch: batch || undefined,
      subject: subject || undefined,
      page: toNumber(page),
      pageSize: toNumber(pageSize),
    });
  }

  @Post('amount-review/apply-all')
  @ApiOperation({ summary: 'Corregge ×1000 TUTTI i movimenti che corrispondono ai filtri' })
  async applyAll(@Body() body: AllResultsBody & { overrides?: Record<string, number> }) {
    const { filters, expectedTotal } = parseAllResults(body);
    const overrides: Record<string, number> = {};
    for (const [uuid, value] of Object.entries(body?.overrides ?? {})) {
      if (typeof value === 'number' && value > 0) overrides[uuid] = value;
    }
    return this.service.applyAll(filters, expectedTotal, overrides);
  }

  @Post('amount-review/confirm-all')
  @ApiOperation({ summary: 'Conferma come corretti TUTTI i movimenti che corrispondono ai filtri' })
  async confirmAll(@Body() body: AllResultsBody) {
    const { filters, expectedTotal } = parseAllResults(body);
    return this.service.confirmAll(filters, expectedTotal);
  }

  @Post('amount-review/undo-all')
  @ApiOperation({ summary: 'Annulla la revisione di TUTTI i movimenti che corrispondono ai filtri' })
  async undoAll(@Body() body: AllResultsBody) {
    const { filters, expectedTotal } = parseAllResults(body);
    return this.service.undoAll(filters, expectedTotal);
  }

  @Post('amount-review/apply')
  @ApiOperation({ summary: 'Applica le correzioni degli importi (con valori scelti dall\'utente)' })
  async apply(@Body() body: { items: { uuid: string; amount: number; originalAmount?: number | null }[] }) {
    if (!Array.isArray(body?.items) || body.items.length > 200) {
      throw new BadRequestException('Da 1 a 200 movimenti per volta');
    }
    // gli importi devono arrivare come numeri (una stringa "12" veniva convertita in silenzio)
    for (const item of body.items) {
      const original = item?.originalAmount;
      if (typeof item?.amount !== 'number' || (original !== undefined && original !== null && typeof original !== 'number')) {
        throw new BadRequestException('Importi non validi: attesi numeri');
      }
    }
    return this.service.applyCorrections(body.items);
  }

  @Post('amount-review/confirm')
  @ApiOperation({ summary: 'Conferma che gli importi sono corretti' })
  async confirm(@Body() body: { uuids: string[] }) {
    return this.service.confirmAmounts(assertUuidList(body?.uuids));
  }

  @Post('amount-review/undo')
  @ApiOperation({ summary: 'Annulla la revisione (ripristina gli importi precedenti)' })
  async undo(@Body() body: { uuids: string[] }) {
    return this.service.undoReview(assertUuidList(body?.uuids));
  }
}
