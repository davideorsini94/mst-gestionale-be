import { Module, forwardRef } from '@nestjs/common';
import { VehicleService } from './vehicle.service';
import { VehicleController } from './vehicle.controller';
import { ReminderModule } from '../reminders/reminder.module';

@Module({
  imports: [forwardRef(() => ReminderModule)],
  controllers: [VehicleController],
  providers: [VehicleService],
  exports: [VehicleService],
})
export class VehicleModule {}
