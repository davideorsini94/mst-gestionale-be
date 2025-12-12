import { VehicleService } from '../vehicles/vehicle.service';
import { StaffService } from '../staff/staff.service';
import { MemberService } from '../members/member.service';
import { TransactionService } from '../transactions/transaction.service';
export declare class DashboardController {
    private readonly vehicleService;
    private readonly staffService;
    private readonly memberService;
    private readonly transactionService;
    constructor(vehicleService: VehicleService, staffService: StaffService, memberService: MemberService, transactionService: TransactionService);
    getDashboardData(req: any, daysAhead?: number): Promise<{
        type: string;
        stats: {
            totalStaff: number;
            totalMembers: number;
        };
        vehicleExpiries: {
            insurance: import("../vehicles/entities/vehicle.entity").Vehicle[];
            inspection: import("../vehicles/entities/vehicle.entity").Vehicle[];
            tax: import("../vehicles/entities/vehicle.entity").Vehicle[];
        };
    } | {
        type: string;
        staff: {
            uuid: string;
            firstName: string;
            lastName: string;
        };
        personalExpiries: {
            field: string;
            label: string;
            date: Date;
        }[];
        assignedVehicles: import("../vehicles/entities/vehicle.entity").Vehicle[];
        vehicleExpiries: {
            insurance: import("../vehicles/entities/vehicle.entity").Vehicle[];
            inspection: import("../vehicles/entities/vehicle.entity").Vehicle[];
            tax: import("../vehicles/entities/vehicle.entity").Vehicle[];
        };
    } | {
        type: string;
        message: string;
    }>;
    private getAdminDashboard;
    private getStaffDashboard;
    private getStaffDashboardGeneric;
    private getBasicDashboard;
    private findStaffByUser;
}
