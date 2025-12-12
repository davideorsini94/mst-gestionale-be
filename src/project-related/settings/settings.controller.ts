import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { SettingsService } from './settings.service';

@ApiTags('Settings')
@ApiBearerAuth()
@Controller('settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get()
  @ApiOperation({ summary: 'Lista impostazioni' })
  async findAll() {
    return this.settingsService.findAll();
  }

  @Get(':key')
  @ApiOperation({ summary: 'Dettaglio impostazione' })
  async findOne(@Param('key') key: string) {
    return this.settingsService.findByKey(key);
  }

  @Post()
  @ApiOperation({ summary: 'Crea/Aggiorna impostazione' })
  async upsert(@Body() body: { key: string; value: any; description?: string }) {
    return this.settingsService.upsert(body.key, body.value, body.description);
  }

  @Delete(':key')
  @ApiOperation({ summary: 'Elimina impostazione' })
  async remove(@Param('key') key: string) {
    return this.settingsService.delete(key);
  }
}
