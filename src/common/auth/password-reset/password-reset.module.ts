import { Module, forwardRef } from '@nestjs/common';
import { UserModule } from '../../models/users/user.module';
import { ReminderModule } from '../../../project-related/reminders/reminder.module';
import { PasswordResetController } from './password-reset.controller';
import { PasswordResetService } from './password-reset.service';

@Module({
  imports: [UserModule, forwardRef(() => ReminderModule)],
  controllers: [PasswordResetController],
  providers: [PasswordResetService],
})
export class PasswordResetModule {}
