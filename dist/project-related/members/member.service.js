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
exports.MemberService = void 0;
const common_1 = require("@nestjs/common");
const base_service_1 = require("../../common/base-crud/base.service");
const member_entity_1 = require("./entities/member.entity");
const data_source_1 = require("../../datasources/data-source");
const file_service_1 = require("../../common/files/file.service");
let MemberService = class MemberService extends base_service_1.BaseService {
    constructor(fileService) {
        super(member_entity_1.Member);
        this.fileService = fileService;
        this.documentRepository = data_source_1.dataSource.getRepository(member_entity_1.MemberDocument);
    }
    getDefaultOrder() {
        return { lastName: 'ASC', firstName: 'ASC' };
    }
    async findByUuidWithDocuments(uuid) {
        const member = await this.repo.findOne({
            where: { uuid },
            relations: ['documents', 'staff'],
        });
        if (!member) {
            throw new common_1.NotFoundException(`Member with uuid ${uuid} not found`);
        }
        let profileImage = null;
        if (member.profileImageUuid) {
            profileImage = await this.fileService.findByUuid(member.profileImageUuid);
        }
        const documentsWithFiles = await Promise.all(member.documents.map(async (doc) => {
            const file = doc.fileUuid ? await this.fileService.findByUuid(doc.fileUuid) : null;
            return { ...doc, file };
        }));
        return { ...member, profileImage, documents: documentsWithFiles };
    }
    async findCompetitors() {
        return this.repo.find({
            where: { isCompetitor: true, memberType: member_entity_1.MemberType.ATHLETE },
            order: { lastName: 'ASC', firstName: 'ASC' },
        });
    }
    async generateHotelBookingList(memberUuids) {
        const members = await this.repo.find({
            where: memberUuids.map(uuid => ({ uuid })),
        });
        const males = [];
        const females = [];
        for (const member of members) {
            const entry = {
                firstName: member.firstName,
                lastName: member.lastName,
                birthDate: member.birthDate,
                birthPlace: member.birthPlace,
                gender: member.gender,
            };
            if (member.gender === member_entity_1.Gender.MALE) {
                males.push(entry);
            }
            else if (member.gender === member_entity_1.Gender.FEMALE) {
                females.push(entry);
            }
        }
        const sortFn = (a, b) => {
            const lastNameCompare = a.lastName.localeCompare(b.lastName);
            if (lastNameCompare !== 0)
                return lastNameCompare;
            return a.firstName.localeCompare(b.firstName);
        };
        males.sort(sortFn);
        females.sort(sortFn);
        return {
            males,
            females,
            generatedAt: new Date(),
            totalCount: males.length + females.length,
        };
    }
    async uploadDocument(memberUuid, file, documentType, description, expiryDate) {
        const member = await this.findByUuid(memberUuid);
        if (!member) {
            throw new common_1.NotFoundException(`Member with uuid ${memberUuid} not found`);
        }
        const docTypeFolder = documentType.toLowerCase().replace(/_/g, '-');
        const folder = `members/${memberUuid}/documents/${docTypeFolder}`;
        const fileEntity = await this.fileService.uploadFile(file, folder, description);
        const document = this.documentRepository.create({
            documentType,
            description,
            expiryDate,
            fileUuid: fileEntity.uuid,
            memberUuid,
        });
        return this.documentRepository.save(document);
    }
    async getDocuments(memberUuid) {
        const documents = await this.documentRepository.find({
            where: { memberUuid },
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
    async deleteProfileImage(memberUuid) {
        const member = await this.findByUuid(memberUuid);
        if (!member) {
            throw new common_1.NotFoundException(`Member with uuid ${memberUuid} not found`);
        }
        if (!member.profileImageUuid) {
            throw new common_1.NotFoundException('Nessuna foto profilo da eliminare');
        }
        const file = await this.fileService.findByUuid(member.profileImageUuid);
        if (file?.minioPath) {
            await this.fileService.deleteFileFromMinio(file.minioPath);
        }
        const fileUuid = member.profileImageUuid;
        member.profileImageUuid = null;
        const savedMember = await this.repo.save(member);
        await this.fileService.deleteFileRecord(fileUuid);
        return savedMember;
    }
    async uploadProfileImage(memberUuid, file) {
        console.log(`[MemberService] uploadProfileImage called for member: ${memberUuid}`);
        console.log(`[MemberService] File info - filename: ${file.filename}, mimetype: ${file.mimetype}, bufferSize: ${file.buffer?.length}`);
        const member = await this.findByUuid(memberUuid);
        if (!member) {
            throw new common_1.NotFoundException(`Member with uuid ${memberUuid} not found`);
        }
        const oldProfileImageUuid = member.profileImageUuid;
        const folder = `members/${memberUuid}/profile`;
        console.log(`[MemberService] Uploading to folder: ${folder}`);
        const fileEntity = await this.fileService.uploadFile(file, folder, 'Profile image');
        console.log(`[MemberService] File entity created with uuid: ${fileEntity.uuid}`);
        member.profileImageUuid = fileEntity.uuid;
        const savedMember = await this.repo.save(member);
        console.log(`[MemberService] Member updated with profileImageUuid: ${savedMember.profileImageUuid}`);
        if (oldProfileImageUuid) {
            console.log(`[MemberService] Deleting old profile image: ${oldProfileImageUuid}`);
            const oldFile = await this.fileService.findByUuid(oldProfileImageUuid);
            if (oldFile?.minioPath) {
                try {
                    await this.fileService.deleteFileFromMinio(oldFile.minioPath);
                }
                catch (e) {
                    console.log(`[MemberService] Error deleting old image from MinIO (ignored):`, e);
                }
            }
            await this.fileService.deleteFileRecord(oldProfileImageUuid);
        }
        return savedMember;
    }
};
exports.MemberService = MemberService;
exports.MemberService = MemberService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [file_service_1.FileService])
], MemberService);
//# sourceMappingURL=member.service.js.map