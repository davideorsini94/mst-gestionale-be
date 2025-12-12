import { Module } from '@nestjs/common';
import { CapabilitiesPerRoleService } from './capabilities-per-role.service';
import { CapabilitiesPerRoleController } from './capabilities-per-role.controller';

@Module({
  controllers: [CapabilitiesPerRoleController],
  providers: [CapabilitiesPerRoleService],
  exports: [CapabilitiesPerRoleService],
})
export class CapabilitiesPerRoleModule {}
