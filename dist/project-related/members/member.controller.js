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
exports.MemberController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const member_service_1 = require("./member.service");
const create_member_dto_1 = require("./dto/create-member.dto");
const update_member_dto_1 = require("./dto/update-member.dto");
const member_entity_1 = require("./entities/member.entity");
const file_service_1 = require("../../common/files/file.service");
const capabilities_decorator_1 = require("../../common/auth/decorators/capabilities.decorator");
const capability_enum_1 = require("../../common/models/capabilities-per-role/capability.enum");
let MemberController = class MemberController {
    constructor(memberService, fileService) {
        this.memberService = memberService;
        this.fileService = fileService;
    }
    async findAll(filters) {
        return this.memberService.findAndCountWithFilterList(filters, null);
    }
    async findCompetitors() {
        return this.memberService.findCompetitors();
    }
    async findOne(uuid) {
        return this.memberService.findByUuidWithDocuments(uuid);
    }
    async getProfileImage(uuid, res) {
        const member = await this.memberService.findByUuidWithDocuments(uuid);
        if (!member.profileImageUuid) {
            res.status(404);
            return { error: 'Profile image not found' };
        }
        const { stream, mimeType, originalName } = await this.fileService.getFileStream(member.profileImageUuid);
        res.header('Content-Type', mimeType);
        res.header('Cache-Control', 'private, max-age=3600');
        return new common_1.StreamableFile(stream);
    }
    async create(createMemberDto) {
        return this.memberService.create(createMemberDto);
    }
    async update(uuid, updateMemberDto) {
        return this.memberService.update(uuid, updateMemberDto);
    }
    async remove(uuid) {
        return this.memberService.delete(uuid);
    }
    async generateHotelBookingList(body) {
        return this.memberService.generateHotelBookingList(body.memberUuids);
    }
    async uploadProfileImage(uuid, req) {
        const body = req.body;
        const file = body.file;
        if (!file) {
            throw new Error('File non trovato');
        }
        const buffer = await file.toBuffer();
        return this.memberService.uploadProfileImage(uuid, {
            filename: file.filename,
            buffer,
            mimetype: file.mimetype,
        });
    }
    async deleteProfileImage(uuid) {
        return this.memberService.deleteProfileImage(uuid);
    }
    async uploadDocument(uuid, req) {
        const body = req.body;
        const file = body.file;
        if (!file) {
            throw new Error('File non trovato');
        }
        const buffer = await file.toBuffer();
        const documentType = body.documentType?.value || member_entity_1.MemberDocumentType.OTHER;
        const description = body.description?.value;
        const expiryDate = body.expiryDate?.value ? new Date(body.expiryDate.value) : undefined;
        return this.memberService.uploadDocument(uuid, { filename: file.filename, buffer, mimetype: file.mimetype }, documentType, description, expiryDate);
    }
    async getDocuments(uuid) {
        return this.memberService.getDocuments(uuid);
    }
    async downloadDocument(documentUuid, res) {
        const documents = await this.memberService.getDocuments('');
        res.status(301);
        res.header('Location', `/api/files/${documentUuid}/download`);
        return { message: 'Use /files/:uuid/download endpoint' };
    }
    async deleteDocument(documentUuid) {
        await this.memberService.deleteDocument(documentUuid);
        return { success: true };
    }
};
exports.MemberController = MemberController;
__decorate([
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({ summary: 'Lista tesserati' }),
    (0, capabilities_decorator_1.RequireCapabilities)(capability_enum_1.Capability.CAN_VIEW_MEMBERS),
    __param(0, (0, common_1.Query)('filters')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], MemberController.prototype, "findAll", null);
__decorate([
    (0, common_1.Get)('competitors'),
    (0, swagger_1.ApiOperation)({ summary: 'Lista atleti agonisti' }),
    (0, capabilities_decorator_1.RequireCapabilities)(capability_enum_1.Capability.CAN_VIEW_MEMBERS),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], MemberController.prototype, "findCompetitors", null);
__decorate([
    (0, common_1.Get)(':uuid'),
    (0, swagger_1.ApiOperation)({ summary: 'Dettaglio tesserato con documenti' }),
    (0, capabilities_decorator_1.RequireCapabilities)(capability_enum_1.Capability.CAN_VIEW_MEMBERS),
    __param(0, (0, common_1.Param)('uuid')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], MemberController.prototype, "findOne", null);
__decorate([
    (0, common_1.Get)(':uuid/profile-image'),
    (0, swagger_1.ApiOperation)({ summary: 'Ottieni immagine profilo' }),
    __param(0, (0, common_1.Param)('uuid')),
    __param(1, (0, common_1.Res)({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], MemberController.prototype, "getProfileImage", null);
__decorate([
    (0, common_1.Post)(),
    (0, swagger_1.ApiOperation)({ summary: 'Crea tesserato' }),
    (0, capabilities_decorator_1.RequireCapabilities)(capability_enum_1.Capability.CAN_MANAGE_MEMBERS),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [create_member_dto_1.CreateMemberDto]),
    __metadata("design:returntype", Promise)
], MemberController.prototype, "create", null);
__decorate([
    (0, common_1.Put)(':uuid'),
    (0, swagger_1.ApiOperation)({ summary: 'Aggiorna tesserato' }),
    (0, capabilities_decorator_1.RequireCapabilities)(capability_enum_1.Capability.CAN_MANAGE_MEMBERS),
    __param(0, (0, common_1.Param)('uuid')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, update_member_dto_1.UpdateMemberDto]),
    __metadata("design:returntype", Promise)
], MemberController.prototype, "update", null);
__decorate([
    (0, common_1.Delete)(':uuid'),
    (0, swagger_1.ApiOperation)({ summary: 'Elimina tesserato' }),
    (0, capabilities_decorator_1.RequireCapabilities)(capability_enum_1.Capability.CAN_MANAGE_MEMBERS),
    __param(0, (0, common_1.Param)('uuid')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], MemberController.prototype, "remove", null);
__decorate([
    (0, common_1.Post)('hotel-booking-list'),
    (0, swagger_1.ApiOperation)({ summary: 'Genera lista prenotazione alberghiera per atleti selezionati' }),
    (0, swagger_1.ApiBody)({
        schema: {
            type: 'object',
            properties: {
                memberUuids: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Lista UUID degli atleti da includere',
                },
            },
        },
    }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], MemberController.prototype, "generateHotelBookingList", null);
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
], MemberController.prototype, "uploadProfileImage", null);
__decorate([
    (0, common_1.Delete)(':uuid/profile-image'),
    (0, swagger_1.ApiOperation)({ summary: 'Elimina foto profilo tesserato' }),
    __param(0, (0, common_1.Param)('uuid')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], MemberController.prototype, "deleteProfileImage", null);
__decorate([
    (0, common_1.Post)(':uuid/documents'),
    (0, swagger_1.ApiOperation)({ summary: 'Upload documento tesserato' }),
    (0, swagger_1.ApiConsumes)('multipart/form-data'),
    (0, swagger_1.ApiBody)({
        schema: {
            type: 'object',
            properties: {
                file: { type: 'string', format: 'binary' },
                documentType: { type: 'string', enum: Object.values(member_entity_1.MemberDocumentType) },
                description: { type: 'string' },
                expiryDate: { type: 'string', format: 'date' },
            },
        },
    }),
    __param(0, (0, common_1.Param)('uuid')),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], MemberController.prototype, "uploadDocument", null);
__decorate([
    (0, common_1.Get)(':uuid/documents'),
    (0, swagger_1.ApiOperation)({ summary: 'Lista documenti tesserato' }),
    __param(0, (0, common_1.Param)('uuid')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], MemberController.prototype, "getDocuments", null);
__decorate([
    (0, common_1.Get)('documents/:documentUuid/download'),
    (0, swagger_1.ApiOperation)({ summary: 'Download documento (usa /files/:fileUuid/download)' }),
    __param(0, (0, common_1.Param)('documentUuid')),
    __param(1, (0, common_1.Res)({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], MemberController.prototype, "downloadDocument", null);
__decorate([
    (0, common_1.Delete)('documents/:documentUuid'),
    (0, swagger_1.ApiOperation)({ summary: 'Elimina documento' }),
    __param(0, (0, common_1.Param)('documentUuid')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], MemberController.prototype, "deleteDocument", null);
exports.MemberController = MemberController = __decorate([
    (0, swagger_1.ApiTags)('Members (Tesserati)'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.Controller)('members'),
    __metadata("design:paramtypes", [member_service_1.MemberService,
        file_service_1.FileService])
], MemberController);
//# sourceMappingURL=member.controller.js.map