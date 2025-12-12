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
exports.VehicleService = void 0;
const common_1 = require("@nestjs/common");
const base_service_1 = require("../../common/base-crud/base.service");
const vehicle_entity_1 = require("./entities/vehicle.entity");
let VehicleService = class VehicleService extends base_service_1.BaseService {
    constructor() {
        super(vehicle_entity_1.Vehicle);
    }
    getDefaultOrder() {
        return { name: 'ASC' };
    }
    async getExpiringDocuments(daysAhead = 30) {
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const futureDate = new Date(today.getTime() + daysAhead * 24 * 60 * 60 * 1000);
        console.log(`[getExpiringDocuments] daysAhead: ${daysAhead}, today: ${today.toISOString()}, futureDate: ${futureDate.toISOString()}`);
        const allVehicles = await this.find({}, null);
        const isInRange = (date, vehicleName, field) => {
            if (!date)
                return false;
            const d = new Date(date);
            const dateOnly = new Date(d.getFullYear(), d.getMonth(), d.getDate());
            const inRange = dateOnly.getTime() >= today.getTime() && dateOnly.getTime() <= futureDate.getTime();
            console.log(`[isInRange] ${vehicleName} - ${field}: ${date} -> dateOnly: ${dateOnly.toISOString()}, inRange: ${inRange}`);
            return inRange;
        };
        const insurance = allVehicles.filter((v) => isInRange(v.insuranceExpiry, v.name, 'insurance'));
        const inspection = allVehicles.filter((v) => isInRange(v.inspectionExpiry, v.name, 'inspection'));
        const tax = allVehicles.filter((v) => isInRange(v.taxExpiry, v.name, 'tax'));
        return { insurance, inspection, tax };
    }
    async getVehiclesByStaff(staffUuid) {
        return this.repo.find({
            where: { assignedStaffUuid: staffUuid },
            relations: ['assignedStaff'],
        });
    }
    async getExpiringDocumentsForStaff(staffUuid, daysAhead = 30) {
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const futureDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + daysAhead);
        const vehicles = await this.getVehiclesByStaff(staffUuid);
        const isInRange = (date) => {
            if (!date)
                return false;
            const d = new Date(date);
            const dateOnly = new Date(d.getFullYear(), d.getMonth(), d.getDate());
            return dateOnly >= today && dateOnly <= futureDate;
        };
        const insurance = vehicles.filter((v) => isInRange(v.insuranceExpiry));
        const inspection = vehicles.filter((v) => isInRange(v.inspectionExpiry));
        const tax = vehicles.filter((v) => isInRange(v.taxExpiry));
        return { insurance, inspection, tax };
    }
};
exports.VehicleService = VehicleService;
exports.VehicleService = VehicleService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [])
], VehicleService);
//# sourceMappingURL=vehicle.service.js.map