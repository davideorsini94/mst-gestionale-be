import { Module } from '@nestjs/common';
import { SettingsService } from './settings.service';
import { SettingsController } from './settings.controller';
import { BackupService } from './backup.service';
import { MinioModule } from 'src/minio/minio.module';

@Module({
  imports: [MinioModule],
  controllers: [SettingsController],
  providers: [SettingsService, BackupService],
  exports: [SettingsService, BackupService],
})
export class SettingsModule {}
