import { VehicleService } from './vehicle.service';
import { Vehicle } from './entities/vehicle.entity';
export declare class VehicleController {
    private readonly vehicleService;
    constructor(vehicleService: VehicleService);
    findAll(filters?: string): Promise<[Vehicle[], number]>;
    getExpiringDocuments(daysAhead?: number): Promise<{
        insurance: Vehicle[];
        inspection: Vehicle[];
        tax: Vehicle[];
    }>;
    findOne(uuid: string): Promise<Vehicle>;
    create(vehicle: Partial<Vehicle>): Promise<Vehicle>;
    update(uuid: string, vehicle: Partial<Vehicle>): Promise<Vehicle>;
    remove(uuid: string): Promise<Vehicle>;
}
