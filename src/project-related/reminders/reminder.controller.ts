import {
  Controller,
  Get,
  Post,
  Param,
  Query,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ReminderService } from './reminder.service';
import { RequireCapabilities } from '../../common/auth/decorators/capabilities.decorator';
import { Capability } from '../../common/models/capabilities-per-role/capability.enum';

@ApiTags('Reminders')
@ApiBearerAuth()
@Controller('reminders')
export class ReminderController {
  constructor(private readonly reminderService: ReminderService) {}

  @Get()
  @ApiOperation({ summary: 'Lista tutti i reminder' })
  @RequireCapabilities(Capability.CAN_MANAGE_SETTINGS)
  async findAll(@Query('filters') filters?: string) {
    return this.reminderService.getAllReminders(filters);
  }

  @Get('scheduled')
  @ApiOperation({ summary: 'Lista reminder programmati' })
  @RequireCapabilities(Capability.CAN_MANAGE_SETTINGS)
  async getScheduled() {
    return this.reminderService.getScheduledReminders();
  }

  @Get('sent')
  @ApiOperation({ summary: 'Lista reminder inviati' })
  @RequireCapabilities(Capability.CAN_MANAGE_SETTINGS)
  async getSent() {
    return this.reminderService.getSentReminders();
  }

  @Get('failed')
  @ApiOperation({ summary: 'Lista reminder falliti' })
  @RequireCapabilities(Capability.CAN_MANAGE_SETTINGS)
  async getFailed() {
    return this.reminderService.getFailedReminders();
  }

  @Get(':uuid')
  @ApiOperation({ summary: 'Dettaglio reminder' })
  @RequireCapabilities(Capability.CAN_MANAGE_SETTINGS)
  async findOne(@Param('uuid') uuid: string) {
    return this.reminderService.findByUuid(uuid);
  }

  @Post(':uuid/resend')
  @ApiOperation({ summary: 'Reinvia un reminder manualmente' })
  @RequireCapabilities(Capability.CAN_MANAGE_SETTINGS)
  async resend(@Param('uuid') uuid: string) {
    return this.reminderService.resendReminder(uuid);
  }

  @Post('check-now')
  @ApiOperation({ summary: 'Esegui controllo reminder manualmente' })
  @RequireCapabilities(Capability.CAN_MANAGE_SETTINGS)
  async checkNow() {
    await this.reminderService.checkAndScheduleReminders();
    return { message: 'Controllo reminder completato' };
  }
}
