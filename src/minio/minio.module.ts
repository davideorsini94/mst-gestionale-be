import { Module } from '@nestjs/common';
import { MinioModule as NestMinioModule } from 'nestjs-minio-client';
import { MinioService } from './minio.service';
import { StorageEncryptionMigration } from './storage-encryption.migration';

// Rimuovi http:// o https:// dall'endpoint se presente
const sanitizeEndpoint = (endpoint: string): string => {
  return endpoint.replace(/^https?:\/\//, '');
};

const minioOptions = {
  endPoint: sanitizeEndpoint(process.env.MINIO_HOST || 'localhost'),
  port: parseInt(process.env.MINIO_PORT || '9000'),
  useSSL: process.env.MINIO_USE_SSL === 'true',
  accessKey: process.env.MINIO_ACCESS_KEY || 'minioadmin',
  secretKey: process.env.MINIO_SECRET_KEY || 'minioadmin',
};

@Module({
  imports: [NestMinioModule.register(minioOptions)],
  providers: [MinioService, StorageEncryptionMigration],
  exports: [MinioService, StorageEncryptionMigration],
})
export class MinioModule {}
