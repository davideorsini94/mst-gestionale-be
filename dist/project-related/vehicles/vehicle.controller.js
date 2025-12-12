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
exports.VehicleController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const vehicle_service_1 = require("./vehicle.service");
const capabilities_decorator_1 = require("../../common/auth/decorators/capabilities.decorator");
const capability_enum_1 = require("../../common/models/capabilities-per-role/capability.enum");
let VehicleController = class VehicleController {
    constructor(vehicleService) {
        this.vehicleService = vehicleService;
    }
    async findAll(filters) {
        return this.vehicleService.findAndCountWithFilterList(filters, null);
    }
    async getExpiringDocuments(daysAhead) {
        return this.vehicleService.getExpiringDocuments(daysAhead || 30);
    }
    async findOne(uuid) {
        return this.vehicleService.findByUuid(uuid);
    }
    async create(vehicle) {
        return this.vehicleService.create(vehicle);
    }
    async update(uuid, vehicle) {
        return this.vehicleService.update(uuid, vehicle);
    }
    async remove(uuid) {
        return this.vehicleService.delete(uuid);
    }
};
exports.VehicleController = VehicleController;
__decorate([
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({ summary: 'Lista veicoli' }),
    (0, capabilities_decorator_1.RequireCapabilities)(capability_enum_1.Capability.CAN_VIEW_VEHICLES),
    __param(0, (0, common_1.Query)('filters')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], VehicleController.prototype, "findAll", null);
__decorate([
    (0, common_1.Get)('expiring'),
    (0, swagger_1.ApiOperation)({ summary: 'Veicoli con documenti in scadenza' }),
    (0, swagger_1.ApiQuery)({ name: 'daysAhead', required: false, type: Number }),
    (0, capabilities_decorator_1.RequireCapabilities)(capability_enum_1.Capability.CAN_VIEW_VEHICLES),
    __param(0, (0, common_1.Query)('daysAhead')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number]),
    __metadata("design:returntype", Promise)
], VehicleController.prototype, "getExpiringDocuments", null);
__decorate([
    (0, common_1.Get)(':uuid'),
    (0, swagger_1.ApiOperation)({ summary: 'Dettaglio veicolo' }),
    (0, capabilities_decorator_1.RequireCapabilities)(capability_enum_1.Capability.CAN_VIEW_VEHICLES),
    __param(0, (0, common_1.Param)('uuid')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], VehicleController.prototype, "findOne", null);
__decorate([
    (0, common_1.Post)(),
    (0, swagger_1.ApiOperation)({ summary: 'Crea veicolo' }),
    (0, capabilities_decorator_1.RequireCapabilities)(capability_enum_1.Capability.CAN_MANAGE_VEHICLES),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], VehicleController.prototype, "create", null);
__decorate([
    (0, common_1.Put)(':uuid'),
    (0, swagger_1.ApiOperation)({ summary: 'Aggiorna veicolo' }),
    (0, capabilities_decorator_1.RequireCapabilities)(capability_enum_1.Capability.CAN_MANAGE_VEHICLES),
    __param(0, (0, common_1.Param)('uuid')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], VehicleController.prototype, "update", null);
__decorate([
    (0, common_1.Delete)(':uuid'),
    (0, swagger_1.ApiOperation)({ summary: 'Elimina veicolo' }),
    (0, capabilities_decorator_1.RequireCapabilities)(capability_enum_1.Capability.CAN_MANAGE_VEHICLES),
    __param(0, (0, common_1.Param)('uuid')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], VehicleController.prototype, "remove", null);
exports.VehicleController = VehicleController = __decorate([
    (0, swagger_1.ApiTags)('Vehicles'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.Controller)('vehicles'),
    __metadata("design:paramtypes", [vehicle_service_1.VehicleService])
], VehicleController);
//# sourceMappingURL=vehicle.controller.js.map