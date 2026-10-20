import { Module, forwardRef } from '@nestjs/common';
import { ReminderService } from './reminder.service';
import { ReminderController } from './reminder.controller';
import { EmailService } from './email.service';
import { SmtpTestController } from './smtp-test.controller';
import { StaffModule } from '../staff/staff.module';
import { VehicleModule } from '../vehicles/vehicle.module';
import { SettingsModule } from '../settings/settings.module';

@Module({
  imports: [
    forwardRef(() => StaffModule),
    forwardRef(() => VehicleModule),
    SettingsModule,
  ],
  controllers: [ReminderController, SmtpTestController],
  providers: [ReminderService, EmailService],
  exports: [ReminderService, EmailService],
})
export class ReminderModule {}
