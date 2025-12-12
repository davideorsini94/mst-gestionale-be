import { BaseService } from '../../common/base-crud/base.service';
import { Vehicle } from './entities/vehicle.entity';
import { BaseSaveDto } from '../../common/base-crud/base-save.dto';
import { FindOptionsOrder } from 'typeorm';
export declare class VehicleService extends BaseService<Vehicle, BaseSaveDto, BaseSaveDto> {
    constructor();
    protected getDefaultOrder(): FindOptionsOrder<Vehicle>;
    getExpiringDocuments(daysAhead?: number): Promise<{
        insurance: Vehicle[];
        inspection: Vehicle[];
        tax: Vehicle[];
    }>;
    getVehiclesByStaff(staffUuid: string): Promise<Vehicle[]>;
    getExpiringDocumentsForStaff(staffUuid: string, daysAhead?: number): Promise<{
        insurance: Vehicle[];
        inspection: Vehicle[];
        tax: Vehicle[];
    }>;
}
