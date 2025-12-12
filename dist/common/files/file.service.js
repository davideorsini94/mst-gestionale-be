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
exports.FileService = void 0;
const common_1 = require("@nestjs/common");
const file_entity_1 = require("./entities/file.entity");
const minio_service_1 = require("../../minio/minio.service");
const data_source_1 = require("../../datasources/data-source");
let FileService = class FileService {
    constructor(minioService) {
        this.minioService = minioService;
        this.fileRepository = data_source_1.dataSource.getRepository(file_entity_1.File);
    }
    async uploadFile(file, folder, description) {
        console.log(`[FileService] uploadFile called - filename: ${file.filename}, folder: ${folder}, bufferSize: ${file.buffer?.length}`);
        if (!file.buffer || file.buffer.length === 0) {
            throw new Error('File buffer is empty or undefined');
        }
        const sanitizedFilename = this.minioService.sanitizeFilename(file.filename);
        const minioPath = `${folder}/${Date.now()}-${sanitizedFilename}`;
        console.log(`[FileService] Uploading to MinIO path: ${minioPath}`);
        const savedPath = await this.minioService.uploadFile(minioPath, file.buffer, file.mimetype);
        console.log(`[FileService] MinIO upload complete, savedPath: ${savedPath}`);
        const fileType = this.getFileType(file.mimetype);
        const fileEntity = this.fileRepository.create({
            originalName: file.filename,
            minioPath: savedPath,
            mimeType: file.mimetype,
            size: file.buffer.length,
            fileType,
            description,
        });
        const saved = await this.fileRepository.save(fileEntity);
        console.log(`[FileService] File entity saved to DB with uuid: ${saved.uuid}`);
        return saved;
    }
    async getFileStream(fileUuid) {
        const file = await this.fileRepository.findOne({ where: { uuid: fileUuid } });
        if (!file) {
            throw new common_1.NotFoundException(`File with uuid ${fileUuid} not found`);
        }
        const stream = await this.minioService.getFile(file.minioPath);
        return {
            stream,
            mimeType: file.mimeType || 'application/octet-stream',
            originalName: file.originalName,
        };
    }
    async findByUuid(uuid) {
        return this.fileRepository.findOne({ where: { uuid } });
    }
    async deleteFileFromMinio(minioPath) {
        try {
            await this.minioService.deleteFile(minioPath);
            console.log(`[FileService] File deleted from MinIO: ${minioPath}`);
        }
        catch (error) {
            console.error(`[FileService] Error deleting file from MinIO: ${minioPath}`, error);
            throw error;
        }
    }
    async deleteFileRecord(fileUuid) {
        const file = await this.fileRepository.findOne({ where: { uuid: fileUuid } });
        if (file) {
            await this.fileRepository.remove(file);
            console.log(`[FileService] File record deleted from DB: ${fileUuid}`);
        }
    }
    async deleteFile(fileUuid) {
        const file = await this.fileRepository.findOne({ where: { uuid: fileUuid } });
        if (!file) {
            throw new common_1.NotFoundException(`File with uuid ${fileUuid} not found`);
        }
        await this.minioService.deleteFile(file.minioPath);
        await this.fileRepository.remove(file);
    }
    getFileType(mimeType) {
        if (mimeType.startsWith('image/')) {
            return file_entity_1.FileType.IMAGE;
        }
        if (mimeType === 'application/pdf' ||
            mimeType === 'application/msword' ||
            mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
            mimeType === 'application/vnd.ms-excel' ||
            mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') {
            return file_entity_1.FileType.DOCUMENT;
        }
        return file_entity_1.FileType.OTHER;
    }
};
exports.FileService = FileService;
exports.FileService = FileService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [minio_service_1.MinioService])
], FileService);
//# sourceMappingURL=file.service.js.map