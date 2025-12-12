"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppModule = void 0;
const common_1 = require("@nestjs/common");
const core_1 = require("@nestjs/core");
const schedule_1 = require("@nestjs/schedule");
const nest_winston_1 = require("nest-winston");
const winston = require("winston");
const app_controller_1 = require("./app.controller");
const app_service_1 = require("./app.service");
const auth_module_1 = require("./common/auth/auth.module");
const user_module_1 = require("./common/models/users/user.module");
const role_module_1 = require("./common/models/roles/role.module");
const capabilities_per_role_module_1 = require("./common/models/capabilities-per-role/capabilities-per-role.module");
const jwt_auth_guard_1 = require("./common/auth/guards/jwt.auth.guard");
const capability_guard_1 = require("./common/auth/guards/capability.guard");
const socket_server_module_1 = require("./socket-server/socket-server.module");
const minio_module_1 = require("./minio/minio.module");
const file_module_1 = require("./common/files/file.module");
const staff_module_1 = require("./project-related/staff/staff.module");
const transaction_module_1 = require("./project-related/transactions/transaction.module");
const vehicle_module_1 = require("./project-related/vehicles/vehicle.module");
const category_module_1 = require("./project-related/categories/category.module");
const settings_module_1 = require("./project-related/settings/settings.module");
const member_module_1 = require("./project-related/members/member.module");
const dashboard_module_1 = require("./project-related/dashboard/dashboard.module");
let AppModule = class AppModule {
};
exports.AppModule = AppModule;
exports.AppModule = AppModule = __decorate([
    (0, common_1.Module)({
        imports: [
            schedule_1.ScheduleModule.forRoot(),
            nest_winston_1.WinstonModule.forRoot({
                transports: [
                    new winston.transports.Console({
                        format: winston.format.combine(winston.format.timestamp(), winston.format.colorize(), winston.format.simple()),
                    }),
                ],
            }),
            auth_module_1.AuthModule,
            user_module_1.UserModule,
            role_module_1.RoleModule,
            capabilities_per_role_module_1.CapabilitiesPerRoleModule,
            socket_server_module_1.SocketServerModule,
            minio_module_1.MinioModule,
            file_module_1.FileModule,
            staff_module_1.StaffModule,
            transaction_module_1.TransactionModule,
            vehicle_module_1.VehicleModule,
            category_module_1.CategoryModule,
            settings_module_1.SettingsModule,
            member_module_1.MemberModule,
            dashboard_module_1.DashboardModule,
        ],
        controllers: [app_controller_1.AppController],
        providers: [
            app_service_1.AppService,
            {
                provide: core_1.APP_GUARD,
                useClass: jwt_auth_guard_1.JwtAuthGuard,
            },
            {
                provide: core_1.APP_GUARD,
                useClass: capability_guard_1.CapabilityGuard,
            },
        ],
    })
], AppModule);
//# sourceMappingURL=app.module.js.map