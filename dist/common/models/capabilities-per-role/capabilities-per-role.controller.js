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
exports.CapabilitiesPerRoleController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const jwt_auth_guard_1 = require("../../auth/guards/jwt.auth.guard");
const capability_enum_1 = require("./capability.enum");
const capabilities_per_role_service_1 = require("./capabilities-per-role.service");
let CapabilitiesPerRoleController = class CapabilitiesPerRoleController {
    constructor(service) {
        this.service = service;
    }
    async getAllCapabilities() {
        return this.service.getAllCapabilities();
    }
    async getByRole(roleCode) {
        return this.service.findByRole(roleCode);
    }
    async setRoleCapabilities(roleCode, body) {
        return this.service.setRoleCapabilities(roleCode, body.capabilities);
    }
    async addCapability(roleCode, capability) {
        return this.service.addCapabilityToRole(roleCode, capability);
    }
    async removeCapability(roleCode, capability) {
        return this.service.removeCapabilityFromRole(roleCode, capability);
    }
};
exports.CapabilitiesPerRoleController = CapabilitiesPerRoleController;
__decorate([
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({ summary: 'Lista tutte le capabilities disponibili' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], CapabilitiesPerRoleController.prototype, "getAllCapabilities", null);
__decorate([
    (0, common_1.Get)('roles/:roleCode'),
    (0, swagger_1.ApiOperation)({ summary: 'Ottieni capabilities per ruolo' }),
    __param(0, (0, common_1.Param)('roleCode')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], CapabilitiesPerRoleController.prototype, "getByRole", null);
__decorate([
    (0, common_1.Post)('roles/:roleCode'),
    (0, swagger_1.ApiOperation)({ summary: 'Imposta capabilities per ruolo' }),
    __param(0, (0, common_1.Param)('roleCode')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], CapabilitiesPerRoleController.prototype, "setRoleCapabilities", null);
__decorate([
    (0, common_1.Post)('roles/:roleCode/:capability'),
    (0, swagger_1.ApiOperation)({ summary: 'Aggiungi capability a ruolo' }),
    __param(0, (0, common_1.Param)('roleCode')),
    __param(1, (0, common_1.Param)('capability')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], CapabilitiesPerRoleController.prototype, "addCapability", null);
__decorate([
    (0, common_1.Delete)('roles/:roleCode/:capability'),
    (0, swagger_1.ApiOperation)({ summary: 'Rimuovi capability da ruolo' }),
    __param(0, (0, common_1.Param)('roleCode')),
    __param(1, (0, common_1.Param)('capability')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], CapabilitiesPerRoleController.prototype, "removeCapability", null);
exports.CapabilitiesPerRoleController = CapabilitiesPerRoleController = __decorate([
    (0, swagger_1.ApiTags)('Capabilities'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.Controller)('capabilities'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __metadata("design:paramtypes", [capabilities_per_role_service_1.CapabilitiesPerRoleService])
], CapabilitiesPerRoleController);
//# sourceMappingURL=capabilities-per-role.controller.js.map