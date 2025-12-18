import { Module, forwardRef } from '@nestjs/common';
import { ReminderService } from './reminder.service';
import { ReminderController } from './reminder.controller';
import { EmailService } from './email.service';
import { StaffModule } from '../staff/staff.module';
import { VehicleModule } from '../vehicles/vehicle.module';
import { SettingsModule } from '../settings/settings.module';

@Module({
  imports: [
    forwardRef(() => StaffModule),
    forwardRef(() => VehicleModule),
    SettingsModule,
  ],
  controllers: [ReminderController],
  providers: [ReminderService, EmailService],
  exports: [ReminderService, EmailService],
})
export class ReminderModule {}
