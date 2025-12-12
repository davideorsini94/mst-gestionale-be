import { CapabilityPerRole } from './entities/capability-per-role.entity';
import { Capability } from './capability.enum';
import { Role } from '../roles/entities/role.entity';
export declare class CapabilitiesPerRoleService {
    private repo;
    private roleRepo;
    findAll(): Promise<CapabilityPerRole[]>;
    findByRole(roleCode: string): Promise<CapabilityPerRole[]>;
    getAllCapabilities(): Promise<string[]>;
    setRoleCapabilities(roleCode: string, capabilities: Capability[]): Promise<Role>;
    addCapabilityToRole(roleCode: string, capability: Capability): Promise<CapabilityPerRole>;
    removeCapabilityFromRole(roleCode: string, capability: Capability): Promise<void>;
}
