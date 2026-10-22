import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Res,
  Req,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiConsumes } from '@nestjs/swagger';
import { FastifyReply, FastifyRequest } from 'fastify';
import { SettingsService } from './settings.service';
import { BackupService } from './backup.service';
import { RequireCapabilities } from '../../common/auth/decorators/capabilities.decorator';
import { Capability } from '../../common/models/capabilities-per-role/capability.enum';
import * as fs from 'fs';

@ApiTags('Settings')
@ApiBearerAuth()
@Controller('settings')
export class SettingsController {
  constructor(
    private readonly settingsService: SettingsService,
    private readonly backupService: BackupService,
  ) {}

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
    return this.settingsService.upsert(body.key, body.value, body.description);
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

  @Get('backup/download/:filename')
  @ApiOperation({ summary: 'Scarica un file di backup' })
  @RequireCapabilities(Capability.CAN_MANAGE_BACKUP)
  async downloadBackup(@Param('filename') filename: string, @Res() reply: FastifyReply) {
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
    const body = request.body as any;
    const file = body.file;
    
    if (!file) {
      throw new Error('Nessun file caricato');
    }
    
    const tempPath = `/tmp/restore-db-${Date.now()}.sql`;
    const buffer = await file.toBuffer();
    fs.writeFileSync(tempPath, buffer);
    
    try {
      const { safetyBackup } = await this.backupService.restoreDatabaseBackup(tempPath);
      fs.unlinkSync(tempPath);
      return { message: 'Database ripristinato con successo', safetyBackup };
    } catch (error) {
      if (fs.existsSync(tempPath)) {
        fs.unlinkSync(tempPath);
      }
      throw error;
    }
  }

  @Post('restore/minio')
  @ApiOperation({ summary: 'Ripristina MinIO da backup' })
  @ApiConsumes('multipart/form-data')
  @RequireCapabilities(Capability.CAN_MANAGE_BACKUP)
  async restoreMinio(@Req() request: FastifyRequest) {
    const body = request.body as any;
    const file = body.file;
    
    if (!file) {
      throw new Error('Nessun file caricato');
    }
    
    const tempPath = `/tmp/restore-minio-${Date.now()}.tar`;
    const buffer = await file.toBuffer();
    fs.writeFileSync(tempPath, buffer);
    
    try {
      await this.backupService.restoreMinioBackup(tempPath);
      fs.unlinkSync(tempPath);
      return { message: 'MinIO ripristinato con successo' };
    } catch (error) {
      if (fs.existsSync(tempPath)) {
        fs.unlinkSync(tempPath);
      }
      throw error;
    }
  }
}
