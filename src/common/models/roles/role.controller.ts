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

@ApiTags('Roles')
@ApiBearerAuth()
@Controller('roles')
@UseGuards(JwtAuthGuard)
export class RoleController {
  constructor(private readonly roleService: RoleService) {}

  @Get()
  @ApiOperation({ summary: 'Lista ruoli' })
  async findAll() {
    return this.roleService.findAll();
  }

  @Get(':code')
  @ApiOperation({ summary: 'Dettaglio ruolo' })
  async findOne(@Param('code') code: string) {
    return this.roleService.findByCode(code);
  }

  @Post()
  @ApiOperation({ summary: 'Crea ruolo' })
  async create(@Body() role: Partial<Role>) {
    return this.roleService.create(role);
  }

  @Put(':code')
  @ApiOperation({ summary: 'Aggiorna ruolo' })
  async update(@Param('code') code: string, @Body() role: Partial<Role>) {
    return this.roleService.update(code, role);
  }

  @Delete(':code')
  @ApiOperation({ summary: 'Elimina ruolo' })
  async remove(@Param('code') code: string) {
    return this.roleService.delete(code);
  }
}
