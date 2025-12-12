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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.FileController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const file_service_1 = require("./file.service");
let FileController = class FileController {
    constructor(fileService) {
        this.fileService = fileService;
    }
    async getFile(uuid, res) {
        const { stream, mimeType, originalName } = await this.fileService.getFileStream(uuid);
        res.header('Content-Type', mimeType);
        res.header('Content-Disposition', `inline; filename="${encodeURIComponent(originalName)}"`);
        res.header('Cache-Control', 'private, max-age=3600');
        return new common_1.StreamableFile(stream);
    }
    async downloadFile(uuid, res) {
        const { stream, mimeType, originalName } = await this.fileService.getFileStream(uuid);
        res.header('Content-Type', mimeType);
        res.header('Content-Disposition', `attachment; filename="${encodeURIComponent(originalName)}"`);
        return new common_1.StreamableFile(stream);
    }
    async deleteFile(uuid) {
        await this.fileService.deleteFile(uuid);
        return { success: true };
    }
};
exports.FileController = FileController;
__decorate([
    (0, common_1.Get)(':uuid'),
    (0, swagger_1.ApiOperation)({ summary: 'Download file by UUID' }),
    __param(0, (0, common_1.Param)('uuid')),
    __param(1, (0, common_1.Res)({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], FileController.prototype, "getFile", null);
__decorate([
    (0, common_1.Get)(':uuid/download'),
    (0, swagger_1.ApiOperation)({ summary: 'Download file as attachment' }),
    __param(0, (0, common_1.Param)('uuid')),
    __param(1, (0, common_1.Res)({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], FileController.prototype, "downloadFile", null);
__decorate([
    (0, common_1.Delete)(':uuid'),
    (0, swagger_1.ApiOperation)({ summary: 'Delete file' }),
    __param(0, (0, common_1.Param)('uuid')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], FileController.prototype, "deleteFile", null);
exports.FileController = FileController = __decorate([
    (0, swagger_1.ApiTags)('Files'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.Controller)('files'),
    __metadata("design:paramtypes", [file_service_1.FileService])
], FileController);
//# sourceMappingURL=file.controller.js.map