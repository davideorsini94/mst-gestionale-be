"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CapabilitiesPerRoleService = void 0;
const common_1 = require("@nestjs/common");
const data_source_1 = require("../../../datasources/data-source");
const capability_per_role_entity_1 = require("./entities/capability-per-role.entity");
const capability_enum_1 = require("./capability.enum");
const role_entity_1 = require("../roles/entities/role.entity");
let CapabilitiesPerRoleService = class CapabilitiesPerRoleService {
    constructor() {
        this.repo = data_source_1.dataSource.getRepository(capability_per_role_entity_1.CapabilityPerRole);
        this.roleRepo = data_source_1.dataSource.getRepository(role_entity_1.Role);
    }
    async findAll() {
        return this.repo.find({ relations: ['role'] });
    }
    async findByRole(roleCode) {
        return this.repo.find({
            where: { roleCode },
            relations: ['role'],
        });
    }
    async getAllCapabilities() {
        return capability_enum_1.ALL_CAPABILITIES;
    }
    async setRoleCapabilities(roleCode, capabilities) {
        const role = await this.roleRepo.findOne({
            where: { code: roleCode },
            relations: ['capabilities'],
        });
        if (!role) {
            throw new common_1.NotFoundException(`Role ${roleCode} not found`);
        }
        const invalidCapabilities = capabilities.filter((cap) => !capability_enum_1.ALL_CAPABILITIES.includes(cap));
        if (invalidCapabilities.length > 0) {
            throw new Error(`Invalid capabilities: ${invalidCapabilities.join(', ')}`);
        }
        await this.repo.delete({ roleCode });
        for (const capability of capabilities) {
            const entity = this.repo.create({
                roleCode,
                capability,
            });
            await this.repo.save(entity);
        }
        return this.roleRepo.findOne({
            where: { code: roleCode },
            relations: ['capabilities'],
        });
    }
    async addCapabilityToRole(roleCode, capability) {
        if (!capability_enum_1.ALL_CAPABILITIES.includes(capability)) {
            throw new Error(`Invalid capability: ${capability}`);
        }
        const role = await this.roleRepo.findOne({ where: { code: roleCode } });
        if (!role) {
            throw new common_1.NotFoundException(`Role ${roleCode} not found`);
        }
        const existing = await this.repo.findOne({
            where: { roleCode, capability },
        });
        if (existing) {
            return existing;
        }
        const entity = this.repo.create({
            roleCode,
            capability,
        });
        return this.repo.save(entity);
    }
    async removeCapabilityFromRole(roleCode, capability) {
        await this.repo.delete({ roleCode, capability });
    }
};
exports.CapabilitiesPerRoleService = CapabilitiesPerRoleService;
exports.CapabilitiesPerRoleService = CapabilitiesPerRoleService = __decorate([
    (0, common_1.Injectable)()
], CapabilitiesPerRoleService);
//# sourceMappingURL=capabilities-per-role.service.js.map