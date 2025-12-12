"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MinioService = void 0;
const common_1 = require("@nestjs/common");
const nestjs_minio_client_1 = require("nestjs-minio-client");
let MinioService = class MinioService {
    constructor(minioClient) {
        this.minioClient = minioClient;
        this.bucketName = process.env.MINIO_BUCKET || 'mst-gestionale';
    }
    sanitizePath(path) {
        if (!path)
            return '';
        return path
            .replace(/\0/g, '')
            .replace(/\.\.\//g, '')
            .replace(/\.\.\\/g, '')
            .replace(/[\x00-\x1f\x7f]/g, '')
            .replace(/[<>:"|?*\\]/g, '')
            .replace(/\s+/g, '_')
            .replace(/^\/+/, '')
            .replace(/\/+/g, '/')
            .replace(/[^\w\-_.\/]/g, '_')
            .substring(0, 255);
    }
    sanitizeFilename(filename) {
        if (!filename)
            return 'unnamed';
        const sanitized = filename
            .replace(/\0/g, '')
            .replace(/[\/\\]/g, '')
            .replace(/[\x00-\x1f\x7f]/g, '')
            .replace(/[<>:"|?*]/g, '')
            .replace(/\s+/g, '_')
            .replace(/[^\w\-_.]/g, '_')
            .replace(/_+/g, '_')
            .substring(0, 200);
        return sanitized || 'unnamed';
    }
    async ensureBucket() {
        const exists = await this.minioClient.client.bucketExists(this.bucketName);
        if (!exists) {
            await this.minioClient.client.makeBucket(this.bucketName);
        }
    }
    async uploadFile(objectName, buffer, contentType) {
        console.log(`[MinIO] Uploading file: ${objectName}, size: ${buffer.length}, contentType: ${contentType}`);
        await this.ensureBucket();
        const sanitizedObjectName = this.sanitizePath(objectName);
        console.log(`[MinIO] Sanitized path: ${sanitizedObjectName}`);
        const metaData = contentType ? { 'Content-Type': contentType } : {};
        try {
            await this.minioClient.client.putObject(this.bucketName, sanitizedObjectName, buffer, buffer.length, metaData);
            console.log(`[MinIO] File uploaded successfully to bucket: ${this.bucketName}, path: ${sanitizedObjectName}`);
        }
        catch (error) {
            console.error(`[MinIO] Error uploading file:`, error);
            throw error;
        }
        return sanitizedObjectName;
    }
    async getFile(objectName) {
        return this.minioClient.client.getObject(this.bucketName, objectName);
    }
    async deleteFile(objectName) {
        await this.minioClient.client.removeObject(this.bucketName, objectName);
    }
    async getPresignedUrl(objectName, expirySeconds = 3600) {
        return this.minioClient.client.presignedGetObject(this.bucketName, objectName, expirySeconds);
    }
    async listFiles(prefix) {
        const objects = [];
        const stream = this.minioClient.client.listObjects(this.bucketName, prefix, true);
        return new Promise((resolve, reject) => {
            stream.on('data', (obj) => objects.push(obj.name));
            stream.on('error', reject);
            stream.on('end', () => resolve(objects));
        });
    }
    async copyFile(sourcePath, destPath) {
        const sanitizedDestPath = this.sanitizePath(destPath);
        const copyConditions = new (require('minio').CopyConditions)();
        await this.minioClient.client.copyObject(this.bucketName, sanitizedDestPath, `/${this.bucketName}/${sourcePath}`, copyConditions);
        return sanitizedDestPath;
    }
    async moveFile(sourcePath, destPath) {
        const newPath = await this.copyFile(sourcePath, destPath);
        await this.deleteFile(sourcePath);
        return newPath;
    }
    async fileExists(objectName) {
        try {
            await this.minioClient.client.statObject(this.bucketName, objectName);
            return true;
        }
        catch {
            return false;
        }
    }
};
exports.MinioService = MinioService;
exports.MinioService = MinioService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [nestjs_minio_client_1.MinioService])
], MinioService);
//# sourceMappingURL=minio.service.js.map