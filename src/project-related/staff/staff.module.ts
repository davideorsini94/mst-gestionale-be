import { Module, forwardRef } from '@nestjs/common';
import { StaffService } from './staff.service';
import { StaffController } from './staff.controller';
import { FileModule } from '../../common/files/file.module';
import { ReminderModule } from '../reminders/reminder.module';

@Module({
  imports: [FileModule, forwardRef(() => ReminderModule)],
  controllers: [StaffController],
  providers: [StaffService],
  exports: [StaffService],
})
export class StaffModule {}
