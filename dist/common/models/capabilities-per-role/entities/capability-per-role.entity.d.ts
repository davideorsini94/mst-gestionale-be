import { Role } from '../../roles/entities/role.entity';
import { Capability } from '../capability.enum';
export declare class CapabilityPerRole {
    uuid: string;
    capability: Capability;
    role: Role;
    roleCode: string;
}
