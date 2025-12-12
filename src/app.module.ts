import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { WinstonModule } from 'nest-winston';
import * as winston from 'winston';

import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './common/auth/auth.module';
import { UserModule } from './common/models/users/user.module';
import { RoleModule } from './common/models/roles/role.module';
import { CapabilitiesPerRoleModule } from './common/models/capabilities-per-role/capabilities-per-role.module';
import { JwtAuthGuard } from './common/auth/guards/jwt.auth.guard';
import { CapabilityGuard } from './common/auth/guards/capability.guard';
import { SocketServerModule } from './socket-server/socket-server.module';
import { MinioModule } from './minio/minio.module';
import { FileModule } from './common/files/file.module';
import { StaffModule } from './project-related/staff/staff.module';
import { TransactionModule } from './project-related/transactions/transaction.module';
import { VehicleModule } from './project-related/vehicles/vehicle.module';
import { CategoryModule } from './project-related/categories/category.module';
import { SettingsModule } from './project-related/settings/settings.module';
import { MemberModule } from './project-related/members/member.module';
import { DashboardModule } from './project-related/dashboard/dashboard.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    WinstonModule.forRoot({
      transports: [
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.timestamp(),
            winston.format.colorize(),
            winston.format.simple(),
          ),
        }),
      ],
    }),
    AuthModule,
    UserModule,
    RoleModule,
    CapabilitiesPerRoleModule,
    SocketServerModule,
    MinioModule,
    FileModule,
    StaffModule,
    TransactionModule,
    VehicleModule,
    CategoryModule,
    SettingsModule,
    MemberModule,
    DashboardModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: CapabilityGuard,
    },
  ],
})
export class AppModule {}
