import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt.auth.guard';
import { Capability } from './capability.enum';
import { CapabilitiesPerRoleService } from './capabilities-per-role.service';

@ApiTags('Capabilities')
@ApiBearerAuth()
@Controller('capabilities')
@UseGuards(JwtAuthGuard)
export class CapabilitiesPerRoleController {
  constructor(private readonly service: CapabilitiesPerRoleService) {}

  @Get()
  @ApiOperation({ summary: 'Lista tutte le capabilities disponibili' })
  async getAllCapabilities() {
    return this.service.getAllCapabilities();
  }

  @Get('roles/:roleCode')
  @ApiOperation({ summary: 'Ottieni capabilities per ruolo' })
  async getByRole(@Param('roleCode') roleCode: string) {
    return this.service.findByRole(roleCode);
  }

  @Post('roles/:roleCode')
  @ApiOperation({ summary: 'Imposta capabilities per ruolo' })
  async setRoleCapabilities(
    @Param('roleCode') roleCode: string,
    @Body() body: { capabilities: Capability[] },
  ) {
    return this.service.setRoleCapabilities(roleCode, body.capabilities);
  }

  @Post('roles/:roleCode/:capability')
  @ApiOperation({ summary: 'Aggiungi capability a ruolo' })
  async addCapability(
    @Param('roleCode') roleCode: string,
    @Param('capability') capability: Capability,
  ) {
    return this.service.addCapabilityToRole(roleCode, capability);
  }

  @Delete('roles/:roleCode/:capability')
  @ApiOperation({ summary: 'Rimuovi capability da ruolo' })
  async removeCapability(
    @Param('roleCode') roleCode: string,
    @Param('capability') capability: Capability,
  ) {
    return this.service.removeCapabilityFromRole(roleCode, capability);
  }
}
