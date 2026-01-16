import { Module, forwardRef } from '@nestjs/common';
import { MemberService } from './member.service';
import { MemberController } from './member.controller';
import { FileModule } from '../../common/files/file.module';
import { ReminderModule } from '../reminders/reminder.module';

@Module({
  imports: [FileModule, forwardRef(() => ReminderModule)],
  controllers: [MemberController],
  providers: [MemberService],
  exports: [MemberService],
})
export class MemberModule { }
