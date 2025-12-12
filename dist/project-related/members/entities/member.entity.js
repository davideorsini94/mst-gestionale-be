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
exports.MemberDocument = exports.MemberDocumentType = exports.Member = exports.MemberStatus = exports.MemberType = exports.Gender = void 0;
const typeorm_1 = require("typeorm");
const ict_base_entity_1 = require("../../../common/base-crud/ict-base.entity");
const staff_entity_1 = require("../../staff/entities/staff.entity");
var Gender;
(function (Gender) {
    Gender["MALE"] = "M";
    Gender["FEMALE"] = "F";
})(Gender || (exports.Gender = Gender = {}));
var MemberType;
(function (MemberType) {
    MemberType["ATHLETE"] = "ATHLETE";
    MemberType["PARENT"] = "PARENT";
    MemberType["MEMBER"] = "MEMBER";
})(MemberType || (exports.MemberType = MemberType = {}));
var MemberStatus;
(function (MemberStatus) {
    MemberStatus["ACTIVE"] = "ACTIVE";
    MemberStatus["INACTIVE"] = "INACTIVE";
    MemberStatus["SUSPENDED"] = "SUSPENDED";
})(MemberStatus || (exports.MemberStatus = MemberStatus = {}));
let Member = class Member extends ict_base_entity_1.IctBaseEntity {
};
exports.Member = Member;
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", String)
], Member.prototype, "firstName", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", String)
], Member.prototype, "lastName", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'enum', enum: Gender, nullable: true }),
    __metadata("design:type", String)
], Member.prototype, "gender", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", String)
], Member.prototype, "fiscalCode", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'date', nullable: true }),
    __metadata("design:type", Date)
], Member.prototype, "birthDate", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", String)
], Member.prototype, "birthPlace", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", String)
], Member.prototype, "birthProvince", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", String)
], Member.prototype, "nationality", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", String)
], Member.prototype, "email", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", String)
], Member.prototype, "phone", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", String)
], Member.prototype, "address", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", String)
], Member.prototype, "city", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", String)
], Member.prototype, "province", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", String)
], Member.prototype, "postalCode", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'enum', enum: MemberType, default: MemberType.MEMBER }),
    __metadata("design:type", String)
], Member.prototype, "memberType", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'enum', enum: MemberStatus, default: MemberStatus.ACTIVE }),
    __metadata("design:type", String)
], Member.prototype, "status", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: false }),
    __metadata("design:type", Boolean)
], Member.prototype, "isCompetitor", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", String)
], Member.prototype, "fisiCode", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", String)
], Member.prototype, "fisCode", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'date', nullable: true }),
    __metadata("design:type", Date)
], Member.prototype, "medicalExamExpiry", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: false }),
    __metadata("design:type", Boolean)
], Member.prototype, "medicalExamCompetitive", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", String)
], Member.prototype, "profileImageUuid", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", String)
], Member.prototype, "emergencyContact", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", String)
], Member.prototype, "emergencyPhone", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'text', nullable: true }),
    __metadata("design:type", String)
], Member.prototype, "notes", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'date', nullable: true }),
    __metadata("design:type", Date)
], Member.prototype, "membershipDate", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'date', nullable: true }),
    __metadata("design:type", Date)
], Member.prototype, "membershipExpiry", void 0);
__decorate([
    (0, typeorm_1.OneToOne)(() => staff_entity_1.Staff, { nullable: true }),
    (0, typeorm_1.JoinColumn)({ name: 'staffUuid' }),
    __metadata("design:type", staff_entity_1.Staff)
], Member.prototype, "staff", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", String)
], Member.prototype, "staffUuid", void 0);
__decorate([
    (0, typeorm_1.OneToMany)(() => MemberDocument, (doc) => doc.member),
    __metadata("design:type", Array)
], Member.prototype, "documents", void 0);
exports.Member = Member = __decorate([
    (0, typeorm_1.Entity)('members')
], Member);
var MemberDocumentType;
(function (MemberDocumentType) {
    MemberDocumentType["MEDICAL_EXAM"] = "MEDICAL_EXAM";
    MemberDocumentType["IDENTITY_DOCUMENT"] = "IDENTITY_DOCUMENT";
    MemberDocumentType["FISI_CARD"] = "FISI_CARD";
    MemberDocumentType["FIS_CARD"] = "FIS_CARD";
    MemberDocumentType["PHOTO"] = "PHOTO";
    MemberDocumentType["OTHER"] = "OTHER";
})(MemberDocumentType || (exports.MemberDocumentType = MemberDocumentType = {}));
let MemberDocument = class MemberDocument extends ict_base_entity_1.IctBaseEntity {
};
exports.MemberDocument = MemberDocument;
__decorate([
    (0, typeorm_1.Column)({ type: 'enum', enum: MemberDocumentType, default: MemberDocumentType.OTHER }),
    __metadata("design:type", String)
], MemberDocument.prototype, "documentType", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'text', nullable: true }),
    __metadata("design:type", String)
], MemberDocument.prototype, "description", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'date', nullable: true }),
    __metadata("design:type", Date)
], MemberDocument.prototype, "expiryDate", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", String)
], MemberDocument.prototype, "fileUuid", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => Member, (member) => member.documents, { onDelete: 'CASCADE' }),
    (0, typeorm_1.JoinColumn)({ name: 'memberUuid' }),
    __metadata("design:type", Member)
], MemberDocument.prototype, "member", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", String)
], MemberDocument.prototype, "memberUuid", void 0);
exports.MemberDocument = MemberDocument = __decorate([
    (0, typeorm_1.Entity)('member_documents')
], MemberDocument);
//# sourceMappingURL=member.entity.js.map