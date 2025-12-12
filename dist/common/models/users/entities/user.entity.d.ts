import { IctBaseEntity } from '../../../base-crud/ict-base.entity';
import { Role } from '../../roles/entities/role.entity';
export declare class User extends IctBaseEntity {
    username: string;
    password: string;
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    isActive: boolean;
    role: Role;
    roleCode: string;
}
