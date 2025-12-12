import { Capability } from './capability.enum';
import { CapabilitiesPerRoleService } from './capabilities-per-role.service';
export declare class CapabilitiesPerRoleController {
    private readonly service;
    constructor(service: CapabilitiesPerRoleService);
    getAllCapabilities(): Promise<string[]>;
    getByRole(roleCode: string): Promise<import("./entities/capability-per-role.entity").CapabilityPerRole[]>;
    setRoleCapabilities(roleCode: string, body: {
        capabilities: Capability[];
    }): Promise<import("../roles/entities/role.entity").Role>;
    addCapability(roleCode: string, capability: Capability): Promise<import("./entities/capability-per-role.entity").CapabilityPerRole>;
    removeCapability(roleCode: string, capability: Capability): Promise<void>;
}
