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
exports.UserService = void 0;
const common_1 = require("@nestjs/common");
const bcrypt = require("bcrypt");
const base_service_1 = require("../../base-crud/base.service");
const user_entity_1 = require("./entities/user.entity");
let UserService = class UserService extends base_service_1.BaseService {
    constructor() {
        super(user_entity_1.User);
    }
    async findByUsername(username) {
        return this.repo.findOne({
            where: { username },
            relations: ['role', 'role.capabilities'],
        });
    }
    async preCreate(entity) {
        if (entity.password) {
            entity.password = await bcrypt.hash(entity.password, 10);
        }
        return entity;
    }
    async preUpdate(newEntity, oldEntity) {
        if (newEntity.password && newEntity.password !== oldEntity.password) {
            newEntity.password = await bcrypt.hash(newEntity.password, 10);
        }
        else {
            newEntity.password = oldEntity.password;
        }
        return newEntity;
    }
    getDefaultRelations() {
        return { role: { capabilities: true } };
    }
};
exports.UserService = UserService;
exports.UserService = UserService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [])
], UserService);
//# sourceMappingURL=user.service.js.map