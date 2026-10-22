import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { BaseService } from '../../base-crud/base.service';
import { User, UserPreferences } from './entities/user.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UserService extends BaseService<User, CreateUserDto, UpdateUserDto> {
  constructor() {
    super(User);
  }

  /** Utente con ruolo e capability, SENZA hash della password (usato a ogni richiesta dalla JWT strategy). */
  async findByUsername(username: string): Promise<User | null> {
    return this.repo.findOne({
      where: { username },
      relations: ['role', 'role.capabilities'],
    });
  }

  /** Utente del token di login (per uuid: uno username riusato non eredita i token di un utente cancellato). */
  async findByUuidWithRole(uuid: string): Promise<User | null> {
    if (!uuid || !/^[0-9a-f-]{36}$/i.test(uuid)) return null;
    return this.repo.findOne({ where: { uuid }, relations: ['role', 'role.capabilities'] });
  }

  /** Solo per la verifica delle credenziali al login. */
  async findByUsernameWithPassword(username: string): Promise<User | null> {
    return this.repo
      .createQueryBuilder('user')
      .addSelect('user.password')
      .leftJoinAndSelect('user.role', 'role')
      .leftJoinAndSelect('role.capabilities', 'capabilities')
      .where('user.username = :username', { username })
      .getOne();
  }

  /** Solo per i cambi password (verifica della password attuale). */
  async findByUuidWithPassword(uuid: string): Promise<User | null> {
    return this.repo
      .createQueryBuilder('user')
      .addSelect('user.password')
      .where('user.uuid = :uuid', { uuid })
      .getOne();
  }

  /**
   * Regole sugli amministratori, valide per ogni modifica di utenti:
   * - solo chi gestisce anche i permessi (CAN_MANAGE_CAPABILITIES, cioè un admin) può dare il ruolo admin o
   *   modificare/cancellare/reimpostare la password di un admin: CAN_MANAGE_USERS da solo non basta a diventarlo;
   * - non si può togliere di mezzo l'ultimo admin attivo (disattivato, cancellato o con un altro ruolo).
   */
  async assertAdminRules(
    actor: User,
    target: User | null,
    change: { roleCode?: string; isActive?: boolean; delete?: boolean; password?: boolean },
  ): Promise<void> {
    const actorCaps = (actor?.role?.capabilities ?? []).map((c: any) => c.capability);
    const actorIsAdmin = actorCaps.includes('CAN_MANAGE_CAPABILITIES');
    const touchesAdmin = target?.roleCode === 'admin' || change.roleCode === 'admin';
    if (touchesAdmin && !actorIsAdmin) {
      throw new ForbiddenException('Solo un amministratore può assegnare il ruolo admin o modificare un amministratore');
    }
    const removesAdmin =
      target?.roleCode === 'admin' &&
      target.isActive !== false &&
      (change.delete || change.isActive === false || (change.roleCode !== undefined && change.roleCode !== 'admin'));
    if (removesAdmin) {
      const [{ count }] = await this.repo.query(
        `SELECT count(*)::int AS count FROM users WHERE "roleCode" = 'admin' AND "isActive" = true AND uuid <> $1`,
        [target.uuid],
      );
      if (count === 0) {
        throw new BadRequestException("È l'ultimo amministratore attivo: crea o riattiva prima un altro admin");
      }
    }
  }

  async updateOwnProfile(uuid: string, dto: { firstName?: string; lastName?: string }): Promise<User> {
    const clean: Partial<User> = {};
    if (typeof dto?.firstName === 'string') clean.firstName = dto.firstName.trim();
    if (typeof dto?.lastName === 'string') clean.lastName = dto.lastName.trim();
    return this.update(uuid, clean as any);
  }

  async updatePreferences(uuid: string, preferences: UserPreferences): Promise<UserPreferences> {
    const clean: UserPreferences = {};
    if (['light', 'dark', 'system'].includes(preferences?.theme as string)) clean.theme = preferences.theme;
    if (typeof preferences?.reduceTransparency === 'boolean') clean.reduceTransparency = preferences.reduceTransparency;
    await this.repo.update({ uuid }, { preferences: clean });
    return clean;
  }

  protected async preCreate(entity: User): Promise<User> {
    if (entity.password) {
      entity.password = await bcrypt.hash(entity.password, 10);
    }
    return entity;
  }

  protected async preUpdate(newEntity: User): Promise<User> {
    // L'hash non viene mai inviato al client: una password presente nel DTO è sempre una nuova password in chiaro.
    if (newEntity.password) {
      newEntity.password = await bcrypt.hash(newEntity.password, 10);
      newEntity.passwordChangedAt = new Date();
    } else {
      delete newEntity.password;
    }
    return newEntity;
  }

  getDefaultRelations() {
    return { role: { capabilities: true } };
  }
}
