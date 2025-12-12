import { IctBaseEntity } from '../../../common/base-crud/ict-base.entity';
import { Staff } from '../../staff/entities/staff.entity';
export declare enum VehicleType {
    MINIBUS = "MINIBUS",
    BUS = "BUS",
    VAN = "VAN",
    CAR = "CAR",
    OTHER = "OTHER"
}
export declare enum VehicleStatus {
    AVAILABLE = "AVAILABLE",
    IN_USE = "IN_USE",
    MAINTENANCE = "MAINTENANCE",
    OUT_OF_SERVICE = "OUT_OF_SERVICE"
}
export declare class Vehicle extends IctBaseEntity {
    name: string;
    type: VehicleType;
    brand: string;
    model: string;
    licensePlate: string;
    seats: number;
    year: number;
    status: VehicleStatus;
    insuranceExpiry: Date;
    inspectionExpiry: Date;
    taxExpiry: Date;
    currentKm: number;
    lastMaintenanceDate: Date;
    nextMaintenanceKm: number;
    fuelConsumption: number;
    fuelType: string;
    notes: string;
    imageUrl: string;
    assignedStaff: Staff;
    assignedStaffUuid: string;
}
