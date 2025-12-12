import { Injectable } from '@nestjs/common';
import { dataSource } from '../../../datasources/data-source';
import { Role } from './entities/role.entity';
import { Capability } from '../capabilities-per-role/capability.enum';

@Injectable()
export class RoleService {
  private repo = dataSource.getRepository(Role);

  async findAll(): Promise<Role[]> {
    return this.repo.find({ relations: ['capabilities'], order: { code: 'ASC' } });
  }

  async findByCode(code: string): Promise<Role | null> {
    return this.repo.findOne({
      where: { code },
      relations: ['capabilities'],
    });
  }

  async create(role: Partial<Role>): Promise<Role> {
    const entity = this.repo.create(role);
    return this.repo.save(entity);
  }

  async update(code: string, role: Partial<Role>): Promise<Role> {
    await this.repo.update({ code }, role);
    return this.findByCode(code);
  }

  async delete(code: string): Promise<void> {
    await this.repo.delete({ code });
  }

  async hasCapability(roleCode: string, capability: Capability): Promise<boolean> {
    return this.hasCapabilities(roleCode, [capability]);
  }

  async hasCapabilities(roleCode: string, capabilities: Capability[]): Promise<boolean> {
    const role = await this.findByCode(roleCode);
    if (!role || !role.capabilities) {
      return false;
    }

    const roleCapabilities = new Set(role.capabilities.map((c) => c.capability));
    return capabilities.every((cap) => roleCapabilities.has(cap));
  }
}
