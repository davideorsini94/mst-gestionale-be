import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  NotFoundException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { VehicleService } from './vehicle.service';
import { CreateVehicleDto } from './dto/create-vehicle.dto';
import { UpdateVehicleDto } from './dto/update-vehicle.dto';
import { RequireCapabilities } from '../../common/auth/decorators/capabilities.decorator';
import { Capability } from '../../common/models/capabilities-per-role/capability.enum';
import { StripProtectedFieldsPipe } from '../../common/pipes/strip-protected-fields.pipe';

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
  async getExpiringDocuments(@Query('daysAhead') daysAhead?: string) {
    // il parametro di query è una stringa: sommato a una data di calendario verrebbe concatenato
    const parsed = Number(daysAhead);
    return this.vehicleService.getExpiringDocuments(Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 3650) : 30);
  }

  @Get(':uuid')
  @ApiOperation({ summary: 'Dettaglio veicolo' })
  @RequireCapabilities(Capability.CAN_VIEW_VEHICLES)
  async findOne(@Param('uuid') uuid: string) {
    const vehicle = await this.vehicleService.findByUuid(uuid);
    if (!vehicle) throw new NotFoundException('Veicolo non trovato');
    return vehicle;
  }

  @Post()
  @ApiOperation({ summary: 'Crea veicolo' })
  @RequireCapabilities(Capability.CAN_MANAGE_VEHICLES)
  async create(@Body(new StripProtectedFieldsPipe()) vehicle: CreateVehicleDto) {
    return this.vehicleService.create(vehicle);
  }

  @Put(':uuid')
  @ApiOperation({ summary: 'Aggiorna veicolo' })
  @RequireCapabilities(Capability.CAN_MANAGE_VEHICLES)
  async update(@Param('uuid') uuid: string, @Body(new StripProtectedFieldsPipe()) vehicle: UpdateVehicleDto) {
    return this.vehicleService.update(uuid, vehicle);
  }

  @Delete(':uuid')
  @ApiOperation({ summary: 'Elimina veicolo' })
  @RequireCapabilities(Capability.CAN_MANAGE_VEHICLES)
  async remove(@Param('uuid') uuid: string) {
    return this.vehicleService.delete(uuid);
  }
}
