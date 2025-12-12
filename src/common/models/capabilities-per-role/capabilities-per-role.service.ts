import { Injectable, NotFoundException } from '@nestjs/common';
import { dataSource } from '../../../datasources/data-source';
import { CapabilityPerRole } from './entities/capability-per-role.entity';
import { Capability, ALL_CAPABILITIES } from './capability.enum';
import { Role } from '../roles/entities/role.entity';

@Injectable()
export class CapabilitiesPerRoleService {
  private repo = dataSource.getRepository(CapabilityPerRole);
  private roleRepo = dataSource.getRepository(Role);

  async findAll(): Promise<CapabilityPerRole[]> {
    return this.repo.find({ relations: ['role'] });
  }

  async findByRole(roleCode: string): Promise<CapabilityPerRole[]> {
    return this.repo.find({
      where: { roleCode },
      relations: ['role'],
    });
  }

  async getAllCapabilities(): Promise<string[]> {
    return ALL_CAPABILITIES as string[];
  }

  async setRoleCapabilities(
    roleCode: string,
    capabilities: Capability[],
  ): Promise<Role> {
    const role = await this.roleRepo.findOne({
      where: { code: roleCode },
      relations: ['capabilities'],
    });

    if (!role) {
      throw new NotFoundException(`Role ${roleCode} not found`);
    }

    // Valida che tutte le capabilities siano valide
    const invalidCapabilities = capabilities.filter(
      (cap) => !ALL_CAPABILITIES.includes(cap),
    );
    if (invalidCapabilities.length > 0) {
      throw new Error(`Invalid capabilities: ${invalidCapabilities.join(', ')}`);
    }

    // Elimina le capabilities esistenti per questo ruolo
    await this.repo.delete({ roleCode });

    // Crea le nuove capabilities
    for (const capability of capabilities) {
      const entity = this.repo.create({
        roleCode,
        capability,
      });
      await this.repo.save(entity);
    }

    // Ritorna il ruolo aggiornato
    return this.roleRepo.findOne({
      where: { code: roleCode },
      relations: ['capabilities'],
    });
  }

  async addCapabilityToRole(
    roleCode: string,
    capability: Capability,
  ): Promise<CapabilityPerRole> {
    // Verifica che la capability sia valida
    if (!ALL_CAPABILITIES.includes(capability)) {
      throw new Error(`Invalid capability: ${capability}`);
    }

    // Verifica che il ruolo esista
    const role = await this.roleRepo.findOne({ where: { code: roleCode } });
    if (!role) {
      throw new NotFoundException(`Role ${roleCode} not found`);
    }

    // Verifica che la capability non sia già assegnata
    const existing = await this.repo.findOne({
      where: { roleCode, capability },
    });
    if (existing) {
      return existing;
    }

    const entity = this.repo.create({
      roleCode,
      capability,
    });
    return this.repo.save(entity);
  }

  async removeCapabilityFromRole(
    roleCode: string,
    capability: Capability,
  ): Promise<void> {
    await this.repo.delete({ roleCode, capability });
  }
}
