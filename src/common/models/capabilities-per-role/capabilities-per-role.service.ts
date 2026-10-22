import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { dataSource } from '../../../datasources/data-source';
import { CapabilityPerRole } from './entities/capability-per-role.entity';
import { Capability, ALL_CAPABILITIES } from './capability.enum';
import { Role } from '../roles/entities/role.entity';

/** Il ruolo admin deve poter sempre gestire utenti, ruoli e permessi: altrimenti nessuno potrebbe più rimediare. */
export const ADMIN_ROLE = 'admin';
const ADMIN_REQUIRED: Capability[] = [
  Capability.CAN_MANAGE_USERS,
  Capability.CAN_MANAGE_ROLES,
  Capability.CAN_MANAGE_CAPABILITIES,
];

function assertAdminKeepsManagement(roleCode: string, remaining: Capability[]): void {
  if (roleCode !== ADMIN_ROLE) return;
  const missing = ADMIN_REQUIRED.filter((c) => !remaining.includes(c));
  if (missing.length) {
    throw new BadRequestException(`Il ruolo admin deve mantenere: ${missing.join(', ')}`);
  }
}

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
      throw new NotFoundException(`Ruolo "${roleCode}" inesistente`);
    }

    if (!Array.isArray(capabilities) || capabilities.some((cap) => typeof cap !== 'string')) {
      throw new BadRequestException('Elenco dei permessi non valido');
    }
    capabilities = Array.from(new Set(capabilities));
    // Valida che tutte le capabilities siano valide
    const invalidCapabilities = capabilities.filter(
      (cap) => !ALL_CAPABILITIES.includes(cap),
    );
    if (invalidCapabilities.length > 0) {
      throw new BadRequestException(`Capability non valide: ${invalidCapabilities.join(', ')}`);
    }
    assertAdminKeepsManagement(roleCode, capabilities);

    // sostituzione tutto o niente: un errore a metà lasciava il ruolo senza permessi
    await this.repo.manager.transaction(async (manager) => {
      await manager.delete(CapabilityPerRole, { roleCode });
      for (const capability of capabilities) {
        await manager.save(manager.create(CapabilityPerRole, { roleCode, capability }));
      }
    });

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
      throw new BadRequestException(`Permesso non valido: ${capability}`);
    }

    // Verifica che il ruolo esista
    const role = await this.roleRepo.findOne({ where: { code: roleCode } });
    if (!role) {
      throw new NotFoundException(`Ruolo "${roleCode}" inesistente`);
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
    if (roleCode === ADMIN_ROLE && ADMIN_REQUIRED.includes(capability)) {
      assertAdminKeepsManagement(roleCode, ADMIN_REQUIRED.filter((c) => c !== capability));
    }
    await this.repo.delete({ roleCode, capability });
  }
}
