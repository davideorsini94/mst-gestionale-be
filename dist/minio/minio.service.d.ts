import { MinioService as NestMinioService } from 'nestjs-minio-client';
import { Readable } from 'stream';
export declare class MinioService {
    private readonly minioClient;
    private readonly bucketName;
    constructor(minioClient: NestMinioService);
    sanitizePath(path: string): string;
    sanitizeFilename(filename: string): string;
    ensureBucket(): Promise<void>;
    uploadFile(objectName: string, buffer: Buffer, contentType?: string): Promise<string>;
    getFile(objectName: string): Promise<Readable>;
    deleteFile(objectName: string): Promise<void>;
    getPresignedUrl(objectName: string, expirySeconds?: number): Promise<string>;
    listFiles(prefix?: string): Promise<string[]>;
    copyFile(sourcePath: string, destPath: string): Promise<string>;
    moveFile(sourcePath: string, destPath: string): Promise<string>;
    fileExists(objectName: string): Promise<boolean>;
}
