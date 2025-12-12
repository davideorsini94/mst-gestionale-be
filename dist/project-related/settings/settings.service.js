"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SettingsService = void 0;
const common_1 = require("@nestjs/common");
const data_source_1 = require("../../datasources/data-source");
const settings_entity_1 = require("./entities/settings.entity");
let SettingsService = class SettingsService {
    constructor() {
        this.repo = data_source_1.dataSource.getRepository(settings_entity_1.Settings);
    }
    async findAll() {
        return this.repo.find();
    }
    async findByKey(key) {
        return this.repo.findOne({ where: { key } });
    }
    async upsert(key, value, description) {
        let settings = await this.findByKey(key);
        if (settings) {
            settings.value = value;
            if (description)
                settings.description = description;
        }
        else {
            settings = this.repo.create({ key, value, description });
        }
        return this.repo.save(settings);
    }
    async delete(key) {
        await this.repo.delete({ key });
    }
};
exports.SettingsService = SettingsService;
exports.SettingsService = SettingsService = __decorate([
    (0, common_1.Injectable)()
], SettingsService);
//# sourceMappingURL=settings.service.js.map