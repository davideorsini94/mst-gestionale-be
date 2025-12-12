import { RoleService } from './role.service';
import { Role } from './entities/role.entity';
export declare class RoleController {
    private readonly roleService;
    constructor(roleService: RoleService);
    findAll(): Promise<Role[]>;
    findOne(code: string): Promise<Role>;
    create(role: Partial<Role>): Promise<Role>;
    update(code: string, role: Partial<Role>): Promise<Role>;
    remove(code: string): Promise<void>;
}
