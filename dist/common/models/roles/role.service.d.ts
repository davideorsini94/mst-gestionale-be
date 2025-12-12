import { Role } from './entities/role.entity';
import { Capability } from '../capabilities-per-role/capability.enum';
export declare class RoleService {
    private repo;
    findAll(): Promise<Role[]>;
    findByCode(code: string): Promise<Role | null>;
    create(role: Partial<Role>): Promise<Role>;
    update(code: string, role: Partial<Role>): Promise<Role>;
    delete(code: string): Promise<void>;
    hasCapability(roleCode: string, capability: Capability): Promise<boolean>;
    hasCapabilities(roleCode: string, capabilities: Capability[]): Promise<boolean>;
}
