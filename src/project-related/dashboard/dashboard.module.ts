import { Module } from '@nestjs/common';
import { DashboardController } from './dashboard.controller';
import { VehicleModule } from '../vehicles/vehicle.module';
import { StaffModule } from '../staff/staff.module';
import { MemberModule } from '../members/member.module';
import { TransactionModule } from '../transactions/transaction.module';

@Module({
  imports: [VehicleModule, StaffModule, MemberModule, TransactionModule],
  controllers: [DashboardController],
})
export class DashboardModule {}
