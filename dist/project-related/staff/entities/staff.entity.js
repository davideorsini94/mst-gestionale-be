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
exports.StaffDocument = exports.StaffDocumentType = exports.Staff = exports.CoachLevel = exports.Gender = exports.StaffStatus = exports.StaffRole = void 0;
const typeorm_1 = require("typeorm");
const ict_base_entity_1 = require("../../../common/base-crud/ict-base.entity");
var StaffRole;
(function (StaffRole) {
    StaffRole["INSTRUCTOR"] = "INSTRUCTOR";
    StaffRole["DRIVER"] = "DRIVER";
    StaffRole["ADMIN"] = "ADMIN";
    StaffRole["VOLUNTEER"] = "VOLUNTEER";
    StaffRole["OTHER"] = "OTHER";
})(StaffRole || (exports.StaffRole = StaffRole = {}));
var StaffStatus;
(function (StaffStatus) {
    StaffStatus["ACTIVE"] = "ACTIVE";
    StaffStatus["INACTIVE"] = "INACTIVE";
    StaffStatus["ON_LEAVE"] = "ON_LEAVE";
})(StaffStatus || (exports.StaffStatus = StaffStatus = {}));
var Gender;
(function (Gender) {
    Gender["MALE"] = "M";
    Gender["FEMALE"] = "F";
})(Gender || (exports.Gender = Gender = {}));
var CoachLevel;
(function (CoachLevel) {
    CoachLevel["LEVEL_1"] = "I";
    CoachLevel["LEVEL_2"] = "II";
    CoachLevel["LEVEL_3"] = "III";
    CoachLevel["LEVEL_4"] = "IV";
    CoachLevel["NATIONAL"] = "NAZIONALE";
})(CoachLevel || (exports.CoachLevel = CoachLevel = {}));
let Staff = class Staff extends ict_base_entity_1.IctBaseEntity {
};
exports.Staff = Staff;
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", String)
], Staff.prototype, "firstName", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", String)
], Staff.prototype, "lastName", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'enum', enum: Gender, nullable: true }),
    __metadata("design:type", String)
], Staff.prototype, "gender", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", String)
], Staff.prototype, "fiscalCode", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", String)
], Staff.prototype, "email", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", String)
], Staff.prototype, "phone", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", String)
], Staff.prototype, "address", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", String)
], Staff.prototype, "city", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", String)
], Staff.prototype, "postalCode", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'date', nullable: true }),
    __metadata("design:type", Date)
], Staff.prototype, "birthDate", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", String)
], Staff.prototype, "birthPlace", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'enum', enum: StaffRole, default: StaffRole.OTHER }),
    __metadata("design:type", String)
], Staff.prototype, "staffRole", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'enum', enum: StaffStatus, default: StaffStatus.ACTIVE }),
    __metadata("design:type", String)
], Staff.prototype, "status", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'date', nullable: true }),
    __metadata("design:type", Date)
], Staff.prototype, "hireDate", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'date', nullable: true }),
    __metadata("design:type", Date)
], Staff.prototype, "endDate", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", String)
], Staff.prototype, "emergencyContact", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", String)
], Staff.prototype, "emergencyPhone", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'text', nullable: true }),
    __metadata("design:type", String)
], Staff.prototype, "notes", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", String)
], Staff.prototype, "profileImageUuid", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", String)
], Staff.prototype, "linkedUserUuid", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", String)
], Staff.prototype, "drivingLicense", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'date', nullable: true }),
    __metadata("design:type", Date)
], Staff.prototype, "drivingLicenseExpiry", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", String)
], Staff.prototype, "skiInstructorLicense", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'date', nullable: true }),
    __metadata("design:type", Date)
], Staff.prototype, "skiInstructorLicenseExpiry", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", String)
], Staff.prototype, "firstAidCertificate", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'date', nullable: true }),
    __metadata("design:type", Date)
], Staff.prototype, "firstAidCertificateExpiry", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: false }),
    __metadata("design:type", Boolean)
], Staff.prototype, "isCoach", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'enum', enum: CoachLevel, nullable: true }),
    __metadata("design:type", String)
], Staff.prototype, "coachLevel", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'date', nullable: true }),
    __metadata("design:type", Date)
], Staff.prototype, "coachLicenseExpiry", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'date', nullable: true }),
    __metadata("design:type", Date)
], Staff.prototype, "medicalExamExpiry", void 0);
__decorate([
    (0, typeorm_1.OneToMany)(() => StaffDocument, (doc) => doc.staff),
    __metadata("design:type", Array)
], Staff.prototype, "documents", void 0);
exports.Staff = Staff = __decorate([
    (0, typeorm_1.Entity)('staff')
], Staff);
var StaffDocumentType;
(function (StaffDocumentType) {
    StaffDocumentType["MEDICAL_EXAM"] = "MEDICAL_EXAM";
    StaffDocumentType["COACH_LICENSE"] = "COACH_LICENSE";
    StaffDocumentType["DRIVING_LICENSE"] = "DRIVING_LICENSE";
    StaffDocumentType["FIRST_AID"] = "FIRST_AID";
    StaffDocumentType["OTHER"] = "OTHER";
})(StaffDocumentType || (exports.StaffDocumentType = StaffDocumentType = {}));
let StaffDocument = class StaffDocument extends ict_base_entity_1.IctBaseEntity {
};
exports.StaffDocument = StaffDocument;
__decorate([
    (0, typeorm_1.Column)({ type: 'enum', enum: StaffDocumentType, default: StaffDocumentType.OTHER }),
    __metadata("design:type", String)
], StaffDocument.prototype, "documentType", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'text', nullable: true }),
    __metadata("design:type", String)
], StaffDocument.prototype, "description", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", String)
], StaffDocument.prototype, "fileUuid", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => Staff, (staff) => staff.documents, { onDelete: 'CASCADE' }),
    (0, typeorm_1.JoinColumn)({ name: 'staffUuid' }),
    __metadata("design:type", Staff)
], StaffDocument.prototype, "staff", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", String)
], StaffDocument.prototype, "staffUuid", void 0);
exports.StaffDocument = StaffDocument = __decorate([
    (0, typeorm_1.Entity)('staff_documents')
], StaffDocument);
//# sourceMappingURL=staff.entity.js.map