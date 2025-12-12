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
exports.DashboardController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const vehicle_service_1 = require("../vehicles/vehicle.service");
const staff_service_1 = require("../staff/staff.service");
const member_service_1 = require("../members/member.service");
const transaction_service_1 = require("../transactions/transaction.service");
const capabilities_decorator_1 = require("../../common/auth/decorators/capabilities.decorator");
const capability_enum_1 = require("../../common/models/capabilities-per-role/capability.enum");
let DashboardController = class DashboardController {
    constructor(vehicleService, staffService, memberService, transactionService) {
        this.vehicleService = vehicleService;
        this.staffService = staffService;
        this.memberService = memberService;
        this.transactionService = transactionService;
    }
    async getDashboardData(req, daysAhead) {
        const user = req.user;
        const roleCode = user.role?.code;
        const days = daysAhead || 30;
        if (roleCode === 'admin') {
            return this.getAdminDashboard(days);
        }
        if (roleCode === 'staff') {
            const staffMember = await this.findStaffByUser(user);
            if (staffMember) {
                return this.getStaffDashboard(staffMember.uuid, days);
            }
            return this.getStaffDashboardGeneric(user, days);
        }
        return this.getBasicDashboard();
    }
    async getAdminDashboard(daysAhead) {
        const [vehicleExpiries, staffList, memberList] = await Promise.all([
            this.vehicleService.getExpiringDocuments(daysAhead),
            this.staffService.find({}, null),
            this.memberService.find({}, null),
        ]);
        return {
            type: 'admin',
            stats: {
                totalStaff: staffList.length,
                totalMembers: memberList.length,
            },
            vehicleExpiries,
        };
    }
    async getStaffDashboard(staffUuid, daysAhead) {
        const [staffMember, assignedVehicles, vehicleExpiries] = await Promise.all([
            this.staffService.findByUuid(staffUuid),
            this.vehicleService.getVehiclesByStaff(staffUuid),
            this.vehicleService.getExpiringDocumentsForStaff(staffUuid, daysAhead),
        ]);
        const personalExpiries = [];
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const futureDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + daysAhead);
        const checkExpiry = (date, field, label) => {
            if (date) {
                const d = new Date(date);
                const dateOnly = new Date(d.getFullYear(), d.getMonth(), d.getDate());
                if (dateOnly >= today && dateOnly <= futureDate) {
                    personalExpiries.push({ field, label, date: d });
                }
            }
        };
        checkExpiry(staffMember.drivingLicenseExpiry, 'drivingLicenseExpiry', 'Patente');
        checkExpiry(staffMember.skiInstructorLicenseExpiry, 'skiInstructorLicenseExpiry', 'Patentino Maestro Sci');
        checkExpiry(staffMember.firstAidCertificateExpiry, 'firstAidCertificateExpiry', 'Primo Soccorso');
        checkExpiry(staffMember.coachLicenseExpiry, 'coachLicenseExpiry', 'Licenza Allenatore');
        checkExpiry(staffMember.medicalExamExpiry, 'medicalExamExpiry', 'Visita Medica');
        return {
            type: 'staff',
            staff: {
                uuid: staffMember.uuid,
                firstName: staffMember.firstName,
                lastName: staffMember.lastName,
            },
            personalExpiries,
            assignedVehicles,
            vehicleExpiries,
        };
    }
    async getStaffDashboardGeneric(user, daysAhead) {
        return {
            type: 'staff',
            staff: {
                uuid: user.uuid,
                firstName: user.firstName || user.username,
                lastName: user.lastName || '',
            },
            personalExpiries: [],
            assignedVehicles: [],
            vehicleExpiries: {
                insurance: [],
                inspection: [],
                tax: [],
            },
            message: 'Per visualizzare le tue scadenze personali, chiedi all\'amministratore di collegare il tuo account a un profilo staff.',
        };
    }
    async getBasicDashboard() {
        return {
            type: 'user',
            message: 'Dashboard utente base',
        };
    }
    async findStaffByUser(user) {
        const staffByUuid = await this.staffService.findByLinkedUserUuid(user.uuid);
        if (staffByUuid) {
            console.log(`[findStaffByUser] Found staff by linkedUserUuid: ${staffByUuid.uuid}`);
            return staffByUuid;
        }
        if (user.email) {
            const staffByEmail = await this.staffService.findByEmail(user.email);
            if (staffByEmail) {
                console.log(`[findStaffByUser] Found staff by email: ${staffByEmail.uuid}`);
                return staffByEmail;
            }
        }
        console.log(`[findStaffByUser] No staff found for user ${user.uuid}`);
        return null;
    }
};
exports.DashboardController = DashboardController;
__decorate([
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({ summary: 'Dati dashboard in base al ruolo utente' }),
    (0, swagger_1.ApiQuery)({ name: 'daysAhead', required: false, type: Number }),
    (0, capabilities_decorator_1.RequireCapabilities)(capability_enum_1.Capability.CAN_VIEW_DASHBOARD),
    __param(0, (0, common_1.Request)()),
    __param(1, (0, common_1.Query)('daysAhead')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Number]),
    __metadata("design:returntype", Promise)
], DashboardController.prototype, "getDashboardData", null);
exports.DashboardController = DashboardController = __decorate([
    (0, swagger_1.ApiTags)('Dashboard'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.Controller)('dashboard'),
    __metadata("design:paramtypes", [vehicle_service_1.VehicleService,
        staff_service_1.StaffService,
        member_service_1.MemberService,
        transaction_service_1.TransactionService])
], DashboardController);
//# sourceMappingURL=dashboard.controller.js.map