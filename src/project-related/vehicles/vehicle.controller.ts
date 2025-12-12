import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { VehicleService } from './vehicle.service';
import { Vehicle } from './entities/vehicle.entity';
import { RequireCapabilities } from '../../common/auth/decorators/capabilities.decorator';
import { Capability } from '../../common/models/capabilities-per-role/capability.enum';

@ApiTags('Vehicles')
@ApiBearerAuth()
@Controller('vehicles')
export class VehicleController {
  constructor(private readonly vehicleService: VehicleService) {}

  @Get()
  @ApiOperation({ summary: 'Lista veicoli' })
  @RequireCapabilities(Capability.CAN_VIEW_VEHICLES)
  async findAll(@Query('filters') filters?: string) {
    return this.vehicleService.findAndCountWithFilterList(filters, null);
  }

  @Get('expiring')
  @ApiOperation({ summary: 'Veicoli con documenti in scadenza' })
  @ApiQuery({ name: 'daysAhead', required: false, type: Number })
  @RequireCapabilities(Capability.CAN_VIEW_VEHICLES)
  async getExpiringDocuments(@Query('daysAhead') daysAhead?: number) {
    return this.vehicleService.getExpiringDocuments(daysAhead || 30);
  }

  @Get(':uuid')
  @ApiOperation({ summary: 'Dettaglio veicolo' })
  @RequireCapabilities(Capability.CAN_VIEW_VEHICLES)
  async findOne(@Param('uuid') uuid: string) {
    return this.vehicleService.findByUuid(uuid);
  }

  @Post()
  @ApiOperation({ summary: 'Crea veicolo' })
  @RequireCapabilities(Capability.CAN_MANAGE_VEHICLES)
  async create(@Body() vehicle: Partial<Vehicle>) {
    return this.vehicleService.create(vehicle as any);
  }

  @Put(':uuid')
  @ApiOperation({ summary: 'Aggiorna veicolo' })
  @RequireCapabilities(Capability.CAN_MANAGE_VEHICLES)
  async update(@Param('uuid') uuid: string, @Body() vehicle: Partial<Vehicle>) {
    return this.vehicleService.update(uuid, vehicle as any);
  }

  @Delete(':uuid')
  @ApiOperation({ summary: 'Elimina veicolo' })
  @RequireCapabilities(Capability.CAN_MANAGE_VEHICLES)
  async remove(@Param('uuid') uuid: string) {
    return this.vehicleService.delete(uuid);
  }
}
