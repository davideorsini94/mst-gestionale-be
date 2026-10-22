import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { RoleService } from './role.service';
import { Role } from './entities/role.entity';
import { JwtAuthGuard } from '../../auth/guards/jwt.auth.guard';
import { RequireAnyCapability, RequireCapabilities } from '../../auth/decorators/capabilities.decorator';
import { Capability } from '../capabilities-per-role/capability.enum';
import { StripProtectedFieldsPipe } from '../../pipes/strip-protected-fields.pipe';

@ApiTags('Roles')
@ApiBearerAuth()
@Controller('roles')
@UseGuards(JwtAuthGuard)
export class RoleController {
  constructor(private readonly roleService: RoleService) {}

  @Get()
  // la pagina Utenti mostra l'elenco dei ruoli per assegnarli
  @RequireAnyCapability(Capability.CAN_VIEW_USERS, Capability.CAN_MANAGE_USERS, Capability.CAN_MANAGE_ROLES)
  @ApiOperation({ summary: 'Lista ruoli' })
  async findAll() {
    return this.roleService.findAll();
  }

  @Get(':code')
  @RequireAnyCapability(Capability.CAN_VIEW_USERS, Capability.CAN_MANAGE_USERS, Capability.CAN_MANAGE_ROLES)
  @ApiOperation({ summary: 'Dettaglio ruolo' })
  async findOne(@Param('code') code: string) {
    return this.roleService.findByCode(code);
  }

  @Post()
  @RequireCapabilities(Capability.CAN_MANAGE_ROLES)
  @ApiOperation({ summary: 'Crea ruolo' })
  async create(@Body(new StripProtectedFieldsPipe(['capabilities'])) role: Partial<Role>) {
    return this.roleService.create(role);
  }

  @Put(':code')
  @RequireCapabilities(Capability.CAN_MANAGE_ROLES)
  @ApiOperation({ summary: 'Aggiorna ruolo' })
  async update(@Param('code') code: string, @Body(new StripProtectedFieldsPipe(['capabilities', 'code'])) role: Partial<Role>) {
    return this.roleService.update(code, role);
  }

  @Delete(':code')
  @RequireCapabilities(Capability.CAN_MANAGE_ROLES)
  @ApiOperation({ summary: 'Elimina ruolo' })
  async remove(@Param('code') code: string) {
    return this.roleService.delete(code);
  }
}
