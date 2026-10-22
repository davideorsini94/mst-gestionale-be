import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Res,
  Req,
  BadRequestException,
  Query,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiConsumes } from '@nestjs/swagger';
import { FastifyReply, FastifyRequest } from 'fastify';
import { SettingsService } from './settings.service';
import { BackupService } from './backup.service';
import { RequireCapabilities } from '../../common/auth/decorators/capabilities.decorator';
import { Capability } from '../../common/models/capabilities-per-role/capability.enum';
import * as fs from 'fs';
import { randomBytes } from 'crypto';
import { Public } from '../../common/auth/decorators/public.decorator';
import { DiskUploadedFile, releaseUploadedFile } from '../../common/files/disk-upload';

@ApiTags('Settings')
@ApiBearerAuth()
@Controller('settings')
export class SettingsController {
  constructor(
    private readonly settingsService: SettingsService,
    private readonly backupService: BackupService,
  ) {}

  private readonly downloadTickets = new Map<string, { filename: string; expiresAt: number }>();

  @Get()
  @ApiOperation({ summary: 'Lista impostazioni (la password SMTP non viene mai restituita)' })
  @RequireCapabilities(Capability.CAN_VIEW_SETTINGS)
  async findAll() {
    return this.settingsService.findAllPublic();
  }

  @Get(':key')
  @ApiOperation({ summary: 'Dettaglio impostazione' })
  @RequireCapabilities(Capability.CAN_VIEW_SETTINGS)
  async findOne(@Param('key') key: string) {
    return this.settingsService.findByKeyPublic(key);
  }

  @Post()
  @ApiOperation({ summary: 'Crea/Aggiorna impostazione (smtpConfig: password vuota = invariata)' })
  @RequireCapabilities(Capability.CAN_MANAGE_SETTINGS)
  async upsert(@Body() body: { key: string; value: any; description?: string }) {
    // senza chiave il servizio falliva su key.startsWith (errore 500)
    const key = typeof body?.key === 'string' ? body.key.trim() : '';
    if (!key) {
      throw new BadRequestException('Chiave dell\'impostazione mancante');
    }
    return this.settingsService.upsert(key, body.value, body.description);
  }

  @Delete(':key')
  @ApiOperation({ summary: 'Elimina impostazione' })
  @RequireCapabilities(Capability.CAN_MANAGE_SETTINGS)
  async remove(@Param('key') key: string) {
    return this.settingsService.delete(key);
  }

  @Post('backup/database')
  @ApiOperation({ summary: 'Crea backup del database PostgreSQL' })
  @RequireCapabilities(Capability.CAN_MANAGE_BACKUP)
  async backupDatabase() {
    return this.backupService.createDatabaseBackup();
  }

  @Post('backup/minio')
  @ApiOperation({ summary: 'Crea backup di MinIO' })
  @RequireCapabilities(Capability.CAN_MANAGE_BACKUP)
  async backupMinio() {
    return this.backupService.createMinioBackup();
  }

  @Post('backup/full')
  @ApiOperation({ summary: 'Crea backup completo (database + MinIO)' })
  @RequireCapabilities(Capability.CAN_MANAGE_BACKUP)
  async backupFull() {
    return this.backupService.createFullBackup();
  }

  @Get('backup/list')
  @ApiOperation({ summary: 'Lista dei backup disponibili' })
  @RequireCapabilities(Capability.CAN_MANAGE_BACKUP)
  async listBackups() {
    return this.backupService.listBackups();
  }

  /**
   * Il download apre una nuova scheda (un backup può pesare GB: niente blob in memoria) e il browser non invia
   * l'header Authorization: invece del JWT in query (finirebbe nei log di nginx, valido 8 ore) si chiede un
   * biglietto monouso valido 60 secondi per quel solo file.
   */
  @Post('backup/download-ticket/:filename')
  @ApiOperation({ summary: 'Biglietto monouso per scaricare un backup' })
  @RequireCapabilities(Capability.CAN_MANAGE_BACKUP)
  async createDownloadTicket(@Param('filename') filename: string) {
    await this.backupService.downloadBackup(filename); // nome valido e file esistente
    const now = Date.now();
    for (const [key, t] of this.downloadTickets) if (t.expiresAt < now) this.downloadTickets.delete(key);
    const ticket = randomBytes(32).toString('hex');
    this.downloadTickets.set(ticket, { filename, expiresAt: now + 60_000 });
    return { ticket };
  }

  @Get('backup/download/:filename')
  @Public()
  @ApiOperation({ summary: 'Scarica un file di backup (con il biglietto di download-ticket)' })
  async downloadBackup(
    @Param('filename') filename: string,
    @Query('ticket') ticket: string,
    @Res() reply: FastifyReply,
  ) {
    const entry = typeof ticket === 'string' ? this.downloadTickets.get(ticket) : undefined;
    if (entry) this.downloadTickets.delete(ticket);
    if (!entry || entry.expiresAt < Date.now() || entry.filename !== filename) {
      throw new UnauthorizedException('Link di download scaduto: riprova dalla pagina Impostazioni');
    }
    const { path, size } = await this.backupService.downloadBackup(filename);
    const stream = fs.createReadStream(path);
    
    reply.header('Content-Type', 'application/octet-stream');
    reply.header('Content-Disposition', `attachment; filename="${filename}"`);
    reply.header('Content-Length', size.toString());
    
    return reply.send(stream);
  }

  @Delete('backup/:filename')
  @ApiOperation({ summary: 'Elimina un file di backup' })
  @RequireCapabilities(Capability.CAN_MANAGE_BACKUP)
  async deleteBackup(@Param('filename') filename: string) {
    await this.backupService.deleteBackup(filename);
    return { message: 'Backup eliminato con successo' };
  }

  @Post('restore/database')
  @ApiOperation({ summary: 'Ripristina database da backup' })
  @ApiConsumes('multipart/form-data')
  @RequireCapabilities(Capability.CAN_MANAGE_BACKUP)
  async restoreDatabase(@Req() request: FastifyRequest) {
    const tempPath = this.uploadedBackupPath(request);
    try {
      const { safetyBackup } = await this.backupService.restoreDatabaseBackup(tempPath);
      return { message: 'Database ripristinato con successo', safetyBackup };
    } finally {
      await releaseUploadedFile(request, tempPath);
    }
  }

  @Post('restore/minio')
  @ApiOperation({ summary: 'Ripristina MinIO da backup' })
  @ApiConsumes('multipart/form-data')
  @RequireCapabilities(Capability.CAN_MANAGE_BACKUP)
  async restoreMinio(@Req() request: FastifyRequest) {
    const tempPath = this.uploadedBackupPath(request);
    try {
      const { restored } = await this.backupService.restoreMinioBackup(tempPath);
      return { message: `File ripristinati con successo (${restored})` };
    } finally {
      await releaseUploadedFile(request, tempPath);
    }
  }

  /** Il backup caricato è già su disco (scritto in streaming, vedi common/files/disk-upload): mai in memoria. */
  private uploadedBackupPath(request: FastifyRequest): string {
    const file = (request.body as { file?: DiskUploadedFile } | undefined)?.file;
    if (!file?.tempFilePath) {
      throw new BadRequestException('Nessun file caricato');
    }
    return file.tempFilePath;
  }
}
