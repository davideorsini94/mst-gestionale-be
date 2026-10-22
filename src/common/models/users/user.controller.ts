import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  Request,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { UserService } from './user.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { RequireCapabilities } from '../../auth/decorators/capabilities.decorator';
import { Capability } from '../capabilities-per-role/capability.enum';
import { StripProtectedFieldsPipe } from '../../pipes/strip-protected-fields.pipe';

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
  async create(@Request() req, @Body(new StripProtectedFieldsPipe(['role', 'preferences', 'passwordChangedAt'])) createUserDto: CreateUserDto) {
    await this.userService.assertAdminRules(req.user, null, { roleCode: (createUserDto as any).roleCode });
    return this.userService.create(createUserDto);
  }

  @Put(':uuid')
  @ApiOperation({ summary: 'Aggiorna utente' })
  @RequireCapabilities(Capability.CAN_MANAGE_USERS)
  async update(@Request() req, @Param('uuid') uuid: string, @Body(new StripProtectedFieldsPipe(['role', 'preferences', 'passwordChangedAt'])) updateUserDto: UpdateUserDto) {
    const dto = updateUserDto as any;
    await this.userService.assertAdminRules(req.user, await this.userService.findByUuid(uuid), {
      roleCode: dto.roleCode,
      isActive: dto.isActive,
      password: !!dto.password,
    });
    return this.userService.update(uuid, updateUserDto);
  }

  @Delete(':uuid')
  @ApiOperation({ summary: 'Elimina utente' })
  @RequireCapabilities(Capability.CAN_MANAGE_USERS)
  async remove(@Request() req, @Param('uuid') uuid: string) {
    await this.userService.assertAdminRules(req.user, await this.userService.findByUuid(uuid), { delete: true });
    return this.userService.delete(uuid);
  }
}
