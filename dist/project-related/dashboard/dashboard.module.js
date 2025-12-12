"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DashboardModule = void 0;
const common_1 = require("@nestjs/common");
const dashboard_controller_1 = require("./dashboard.controller");
const vehicle_module_1 = require("../vehicles/vehicle.module");
const staff_module_1 = require("../staff/staff.module");
const member_module_1 = require("../members/member.module");
const transaction_module_1 = require("../transactions/transaction.module");
let DashboardModule = class DashboardModule {
};
exports.DashboardModule = DashboardModule;
exports.DashboardModule = DashboardModule = __decorate([
    (0, common_1.Module)({
        imports: [vehicle_module_1.VehicleModule, staff_module_1.StaffModule, member_module_1.MemberModule, transaction_module_1.TransactionModule],
        controllers: [dashboard_controller_1.DashboardController],
    })
], DashboardModule);
//# sourceMappingURL=dashboard.module.js.map