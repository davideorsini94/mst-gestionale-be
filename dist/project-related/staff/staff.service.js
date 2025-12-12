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
exports.StaffService = void 0;
const common_1 = require("@nestjs/common");
const base_service_1 = require("../../common/base-crud/base.service");
const staff_entity_1 = require("./entities/staff.entity");
const data_source_1 = require("../../datasources/data-source");
const file_service_1 = require("../../common/files/file.service");
let StaffService = class StaffService extends base_service_1.BaseService {
    constructor(fileService) {
        super(staff_entity_1.Staff);
        this.fileService = fileService;
        this.documentRepository = data_source_1.dataSource.getRepository(staff_entity_1.StaffDocument);
    }
    getDefaultOrder() {
        return { lastName: 'ASC', firstName: 'ASC' };
    }
    async findByEmail(email) {
        if (!email)
            return null;
        return this.repo.findOne({ where: { email } });
    }
    async findByLinkedUserUuid(userUuid) {
        if (!userUuid)
            return null;
        return this.repo.findOne({ where: { linkedUserUuid: userUuid } });
    }
    async findByUuidWithDocuments(uuid) {
        const staff = await this.repo.findOne({
            where: { uuid },
            relations: ['documents'],
        });
        if (!staff) {
            throw new common_1.NotFoundException(`Staff with uuid ${uuid} not found`);
        }
        let profileImage = null;
        if (staff.profileImageUuid) {
            profileImage = await this.fileService.findByUuid(staff.profileImageUuid);
        }
        const documentsWithFiles = await Promise.all(staff.documents.map(async (doc) => {
            const file = doc.fileUuid ? await this.fileService.findByUuid(doc.fileUuid) : null;
            return { ...doc, file };
        }));
        return { ...staff, profileImage, documents: documentsWithFiles };
    }
    async uploadDocument(staffUuid, file, documentType, description) {
        const staff = await this.findByUuid(staffUuid);
        if (!staff) {
            throw new common_1.NotFoundException(`Staff with uuid ${staffUuid} not found`);
        }
        const docTypeFolder = documentType.toLowerCase().replace(/_/g, '-');
        const folder = `staff/${staffUuid}/documents/${docTypeFolder}`;
        const fileEntity = await this.fileService.uploadFile(file, folder, description);
        const document = this.documentRepository.create({
            documentType,
            description,
            fileUuid: fileEntity.uuid,
            staffUuid,
        });
        return this.documentRepository.save(document);
    }
    async getDocuments(staffUuid) {
        const documents = await this.documentRepository.find({
            where: { staffUuid },
            order: { createdAt: 'DESC' },
        });
        return Promise.all(documents.map(async (doc) => {
            const file = doc.fileUuid ? await this.fileService.findByUuid(doc.fileUuid) : null;
            return { ...doc, file };
        }));
    }
    async deleteDocument(documentUuid) {
        const document = await this.documentRepository.findOne({
            where: { uuid: documentUuid },
        });
        if (!document) {
            throw new common_1.NotFoundException(`Document with uuid ${documentUuid} not found`);
        }
        const fileUuid = document.fileUuid;
        const file = fileUuid ? await this.fileService.findByUuid(fileUuid) : null;
        if (file?.minioPath) {
            await this.fileService.deleteFileFromMinio(file.minioPath);
        }
        await this.documentRepository.remove(document);
        if (fileUuid) {
            await this.fileService.deleteFileRecord(fileUuid);
        }
    }
    async deleteProfileImage(staffUuid) {
        const staff = await this.findByUuid(staffUuid);
        if (!staff) {
            throw new common_1.NotFoundException(`Staff with uuid ${staffUuid} not found`);
        }
        if (!staff.profileImageUuid) {
            throw new common_1.NotFoundException('Nessuna foto profilo da eliminare');
        }
        const file = await this.fileService.findByUuid(staff.profileImageUuid);
        if (file?.minioPath) {
            await this.fileService.deleteFileFromMinio(file.minioPath);
        }
        const fileUuid = staff.profileImageUuid;
        staff.profileImageUuid = null;
        const savedStaff = await this.repo.save(staff);
        await this.fileService.deleteFileRecord(fileUuid);
        return savedStaff;
    }
    async uploadProfileImage(staffUuid, file) {
        const staff = await this.findByUuid(staffUuid);
        if (!staff) {
            throw new common_1.NotFoundException(`Staff with uuid ${staffUuid} not found`);
        }
        const oldProfileImageUuid = staff.profileImageUuid;
        const folder = `staff/${staffUuid}/profile`;
        const fileEntity = await this.fileService.uploadFile(file, folder, 'Profile image');
        staff.profileImageUuid = fileEntity.uuid;
        const savedStaff = await this.repo.save(staff);
        if (oldProfileImageUuid) {
            const oldFile = await this.fileService.findByUuid(oldProfileImageUuid);
            if (oldFile?.minioPath) {
                try {
                    await this.fileService.deleteFileFromMinio(oldFile.minioPath);
                }
                catch (e) {
                    console.log(`[StaffService] Error deleting old image from MinIO (ignored):`, e);
                }
            }
            await this.fileService.deleteFileRecord(oldProfileImageUuid);
        }
        return savedStaff;
    }
};
exports.StaffService = StaffService;
exports.StaffService = StaffService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [file_service_1.FileService])
], StaffService);
//# sourceMappingURL=staff.service.js.map