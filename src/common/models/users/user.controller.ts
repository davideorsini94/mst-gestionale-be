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
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { UserService } from './user.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { RequireCapabilities } from '../../auth/decorators/capabilities.decorator';
import { Capability } from '../capabilities-per-role/capability.enum';

@ApiTags('Users')
@ApiBearerAuth()
@Controller('users')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get()
  @ApiOperation({ summary: 'Lista utenti' })
  @RequireCapabilities(Capability.CAN_VIEW_USERS)
  async findAll(@Query('filters') filters?: string) {
    return this.userService.findAndCountWithFilterList(filters, null);
  }

  @Get(':uuid')
  @ApiOperation({ summary: 'Dettaglio utente' })
  @RequireCapabilities(Capability.CAN_VIEW_USERS)
  async findOne(@Param('uuid') uuid: string) {
    return this.userService.findByUuid(uuid);
  }

  @Post()
  @ApiOperation({ summary: 'Crea utente' })
  @RequireCapabilities(Capability.CAN_MANAGE_USERS)
  async create(@Body() createUserDto: CreateUserDto) {
    return this.userService.create(createUserDto);
  }

  @Put(':uuid')
  @ApiOperation({ summary: 'Aggiorna utente' })
  @RequireCapabilities(Capability.CAN_MANAGE_USERS)
  async update(@Param('uuid') uuid: string, @Body() updateUserDto: UpdateUserDto) {
    return this.userService.update(uuid, updateUserDto);
  }

  @Delete(':uuid')
  @ApiOperation({ summary: 'Elimina utente' })
  @RequireCapabilities(Capability.CAN_MANAGE_USERS)
  async remove(@Param('uuid') uuid: string) {
    return this.userService.delete(uuid);
  }
}
