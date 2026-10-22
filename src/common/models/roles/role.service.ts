import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
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
    const code = typeof role?.code === 'string' ? role.code.trim() : '';
    if (!code) {
      throw new BadRequestException('Il codice del ruolo è obbligatorio');
    }
    // save() con una chiave primaria esistente aggiorna invece di creare: un ruolo esistente veniva sovrascritto
    if (await this.repo.exists({ where: { code } })) {
      throw new ConflictException(`Esiste già un ruolo con codice "${code}"`);
    }
    const entity = this.repo.create({ ...role, code });
    return this.repo.save(entity);
  }

  /** Del ruolo si modifica solo la descrizione (il codice è la chiave, i permessi hanno il loro endpoint). */
  async update(code: string, role: Partial<Role>): Promise<Role> {
    if (!(await this.repo.exists({ where: { code } }))) {
      throw new NotFoundException(`Ruolo "${code}" inesistente`);
    }
    const description = role?.description;
    if (description !== undefined && description !== null && typeof description !== 'string') {
      throw new BadRequestException('Descrizione non valida');
    }
    if (description !== undefined) {
      await this.repo.update({ code }, { description: description === null ? null : description.trim() });
    }
    return this.findByCode(code);
  }

  async delete(code: string): Promise<void> {
    if (code === 'admin') {
      throw new BadRequestException('Il ruolo admin non si può eliminare');
    }
    const [{ count }] = await dataSource.query(`SELECT count(*)::int AS count FROM users WHERE "roleCode" = $1`, [code]);
    if (count > 0) {
      throw new BadRequestException(`Il ruolo è assegnato a ${count} utenti: assegna loro un altro ruolo prima di eliminarlo`);
    }
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
