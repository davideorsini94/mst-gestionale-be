"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RoleService = void 0;
const common_1 = require("@nestjs/common");
const data_source_1 = require("../../../datasources/data-source");
const role_entity_1 = require("./entities/role.entity");
let RoleService = class RoleService {
    constructor() {
        this.repo = data_source_1.dataSource.getRepository(role_entity_1.Role);
    }
    async findAll() {
        return this.repo.find({ relations: ['capabilities'], order: { code: 'ASC' } });
    }
    async findByCode(code) {
        return this.repo.findOne({
            where: { code },
            relations: ['capabilities'],
        });
    }
    async create(role) {
        const entity = this.repo.create(role);
        return this.repo.save(entity);
    }
    async update(code, role) {
        await this.repo.update({ code }, role);
        return this.findByCode(code);
    }
    async delete(code) {
        await this.repo.delete({ code });
    }
    async hasCapability(roleCode, capability) {
        return this.hasCapabilities(roleCode, [capability]);
    }
    async hasCapabilities(roleCode, capabilities) {
        const role = await this.findByCode(roleCode);
        if (!role || !role.capabilities) {
            return false;
        }
        const roleCapabilities = new Set(role.capabilities.map((c) => c.capability));
        return capabilities.every((cap) => roleCapabilities.has(cap));
    }
};
exports.RoleService = RoleService;
exports.RoleService = RoleService = __decorate([
    (0, common_1.Injectable)()
], RoleService);
//# sourceMappingURL=role.service.js.map