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
exports.StaffController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const staff_service_1 = require("./staff.service");
const create_staff_dto_1 = require("./dto/create-staff.dto");
const update_staff_dto_1 = require("./dto/update-staff.dto");
const staff_entity_1 = require("./entities/staff.entity");
const file_service_1 = require("../../common/files/file.service");
const capabilities_decorator_1 = require("../../common/auth/decorators/capabilities.decorator");
const capability_enum_1 = require("../../common/models/capabilities-per-role/capability.enum");
let StaffController = class StaffController {
    constructor(staffService, fileService) {
        this.staffService = staffService;
        this.fileService = fileService;
    }
    async findAll(filters) {
        return this.staffService.findAndCountWithFilterList(filters, null);
    }
    async getMyProfile(req) {
        const user = req.user;
        let staffMember = await this.staffService.findByLinkedUserUuid(user.uuid);
        if (!staffMember && user.email) {
            staffMember = await this.staffService.findByEmail(user.email);
        }
        if (!staffMember) {
            return { found: false, message: 'Profilo staff non collegato a questo utente' };
        }
        return this.staffService.findByUuidWithDocuments(staffMember.uuid);
    }
    async findOne(uuid) {
        return this.staffService.findByUuidWithDocuments(uuid);
    }
    async getProfileImage(uuid, res) {
        const staff = await this.staffService.findByUuidWithDocuments(uuid);
        if (!staff.profileImageUuid) {
            res.status(404);
            return { error: 'Profile image not found' };
        }
        const { stream, mimeType } = await this.fileService.getFileStream(staff.profileImageUuid);
        res.header('Content-Type', mimeType);
        res.header('Cache-Control', 'private, max-age=3600');
        return new common_1.StreamableFile(stream);
    }
    async create(createStaffDto) {
        return this.staffService.create(createStaffDto);
    }
    async updateMyProfile(req, updateStaffDto) {
        const user = req.user;
        let staffMember = await this.staffService.findByLinkedUserUuid(user.uuid);
        if (!staffMember && user.email) {
            staffMember = await this.staffService.findByEmail(user.email);
        }
        if (!staffMember) {
            throw new Error('Profilo staff non trovato per questo utente');
        }
        return this.staffService.update(staffMember.uuid, updateStaffDto);
    }
    async update(uuid, updateStaffDto) {
        return this.staffService.update(uuid, updateStaffDto);
    }
    async remove(uuid) {
        return this.staffService.delete(uuid);
    }
    async uploadProfileImage(uuid, req) {
        const body = req.body;
        const file = body.file;
        if (!file) {
            throw new Error('File non trovato');
        }
        const buffer = await file.toBuffer();
        return this.staffService.uploadProfileImage(uuid, {
            filename: file.filename,
            buffer,
            mimetype: file.mimetype,
        });
    }
    async deleteProfileImage(uuid) {
        return this.staffService.deleteProfileImage(uuid);
    }
    async uploadDocument(uuid, req) {
        const body = req.body;
        const file = body.file;
        if (!file) {
            throw new Error('File non trovato');
        }
        const buffer = await file.toBuffer();
        const documentType = body.documentType?.value || staff_entity_1.StaffDocumentType.OTHER;
        const description = body.description?.value;
        return this.staffService.uploadDocument(uuid, { filename: file.filename, buffer, mimetype: file.mimetype }, documentType, description);
    }
    async getDocuments(uuid) {
        return this.staffService.getDocuments(uuid);
    }
    async downloadDocument(documentUuid, res) {
        res.status(301);
        res.header('Location', `/api/files/${documentUuid}/download`);
        return { message: 'Use /files/:uuid/download endpoint' };
    }
    async deleteDocument(documentUuid) {
        await this.staffService.deleteDocument(documentUuid);
        return { success: true };
    }
};
exports.StaffController = StaffController;
__decorate([
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({ summary: 'Lista staff' }),
    (0, capabilities_decorator_1.RequireCapabilities)(capability_enum_1.Capability.CAN_VIEW_STAFF),
    __param(0, (0, common_1.Query)('filters')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], StaffController.prototype, "findAll", null);
__decorate([
    (0, common_1.Get)('me'),
    (0, swagger_1.ApiOperation)({ summary: 'Ottieni il proprio profilo staff' }),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], StaffController.prototype, "getMyProfile", null);
__decorate([
    (0, common_1.Get)(':uuid'),
    (0, swagger_1.ApiOperation)({ summary: 'Dettaglio membro staff con documenti' }),
    (0, capabilities_decorator_1.RequireCapabilities)(capability_enum_1.Capability.CAN_VIEW_STAFF),
    __param(0, (0, common_1.Param)('uuid')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], StaffController.prototype, "findOne", null);
__decorate([
    (0, common_1.Get)(':uuid/profile-image'),
    (0, swagger_1.ApiOperation)({ summary: 'Ottieni immagine profilo' }),
    __param(0, (0, common_1.Param)('uuid')),
    __param(1, (0, common_1.Res)({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], StaffController.prototype, "getProfileImage", null);
__decorate([
    (0, common_1.Post)(),
    (0, swagger_1.ApiOperation)({ summary: 'Crea membro staff' }),
    (0, capabilities_decorator_1.RequireCapabilities)(capability_enum_1.Capability.CAN_MANAGE_STAFF),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [create_staff_dto_1.CreateStaffDto]),
    __metadata("design:returntype", Promise)
], StaffController.prototype, "create", null);
__decorate([
    (0, common_1.Put)('me'),
    (0, swagger_1.ApiOperation)({ summary: 'Aggiorna il proprio profilo staff' }),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, update_staff_dto_1.UpdateStaffDto]),
    __metadata("design:returntype", Promise)
], StaffController.prototype, "updateMyProfile", null);
__decorate([
    (0, common_1.Put)(':uuid'),
    (0, swagger_1.ApiOperation)({ summary: 'Aggiorna membro staff' }),
    (0, capabilities_decorator_1.RequireCapabilities)(capability_enum_1.Capability.CAN_MANAGE_STAFF),
    __param(0, (0, common_1.Param)('uuid')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, update_staff_dto_1.UpdateStaffDto]),
    __metadata("design:returntype", Promise)
], StaffController.prototype, "update", null);
__decorate([
    (0, common_1.Delete)(':uuid'),
    (0, swagger_1.ApiOperation)({ summary: 'Elimina membro staff' }),
    (0, capabilities_decorator_1.RequireCapabilities)(capability_enum_1.Capability.CAN_MANAGE_STAFF),
    __param(0, (0, common_1.Param)('uuid')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], StaffController.prototype, "remove", null);
__decorate([
    (0, common_1.Post)(':uuid/profile-image'),
    (0, swagger_1.ApiOperation)({ summary: 'Upload foto profilo' }),
    (0, swagger_1.ApiConsumes)('multipart/form-data'),
    (0, swagger_1.ApiBody)({
        schema: {
            type: 'object',
            properties: {
                file: { type: 'string', format: 'binary' },
            },
        },
    }),
    __param(0, (0, common_1.Param)('uuid')),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], StaffController.prototype, "uploadProfileImage", null);
__decorate([
    (0, common_1.Delete)(':uuid/profile-image'),
    (0, swagger_1.ApiOperation)({ summary: 'Elimina foto profilo staff' }),
    __param(0, (0, common_1.Param)('uuid')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], StaffController.prototype, "deleteProfileImage", null);
__decorate([
    (0, common_1.Post)(':uuid/documents'),
    (0, swagger_1.ApiOperation)({ summary: 'Upload documento staff' }),
    (0, swagger_1.ApiConsumes)('multipart/form-data'),
    (0, swagger_1.ApiBody)({
        schema: {
            type: 'object',
            properties: {
                file: { type: 'string', format: 'binary' },
                documentType: { type: 'string', enum: Object.values(staff_entity_1.StaffDocumentType) },
                description: { type: 'string' },
            },
        },
    }),
    __param(0, (0, common_1.Param)('uuid')),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], StaffController.prototype, "uploadDocument", null);
__decorate([
    (0, common_1.Get)(':uuid/documents'),
    (0, swagger_1.ApiOperation)({ summary: 'Lista documenti staff' }),
    __param(0, (0, common_1.Param)('uuid')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], StaffController.prototype, "getDocuments", null);
__decorate([
    (0, common_1.Get)('documents/:documentUuid/download'),
    (0, swagger_1.ApiOperation)({ summary: 'Download documento (usa /files/:fileUuid/download)' }),
    __param(0, (0, common_1.Param)('documentUuid')),
    __param(1, (0, common_1.Res)({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], StaffController.prototype, "downloadDocument", null);
__decorate([
    (0, common_1.Delete)('documents/:documentUuid'),
    (0, swagger_1.ApiOperation)({ summary: 'Elimina documento' }),
    __param(0, (0, common_1.Param)('documentUuid')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], StaffController.prototype, "deleteDocument", null);
exports.StaffController = StaffController = __decorate([
    (0, swagger_1.ApiTags)('Staff'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.Controller)('staff'),
    __metadata("design:paramtypes", [staff_service_1.StaffService,
        file_service_1.FileService])
], StaffController);
//# sourceMappingURL=staff.controller.js.map