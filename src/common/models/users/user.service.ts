import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { BaseService } from '../../base-crud/base.service';
import { User, UserPreferences } from './entities/user.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { Not } from 'typeorm';

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
    // Senza CAN_MANAGE_CAPABILITIES non si assegnano ruoli con permessi che non si hanno, né si gestiscono utenti
    // con un ruolo più potente del proprio: altrimenti CAN_MANAGE_USERS darebbe un ruolo personalizzato con
    // CAN_MANAGE_CAPABILITIES (anche a sé stessi) e da lì il ruolo admin.
    if (!actorIsAdmin) {
      for (const roleCode of [change.roleCode, target?.roleCode]) {
        if (!roleCode) continue;
        const rows: { capability: string }[] = await this.repo.query(
          `SELECT capability FROM capabilities_per_role WHERE "roleCode" = $1`,
          [roleCode],
        );
        if (rows.some((r) => !actorCaps.includes(r.capability))) {
          throw new ForbiddenException(
            `Il ruolo "${roleCode}" ha permessi che tu non hai: solo un amministratore può assegnarlo o gestirne gli utenti`,
          );
        }
      }
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

  /** Cancella l'utente scollegandolo dallo staff (prima restava un riferimento orfano e la scheda staff non si salvava). */
  async delete(uuid: string): Promise<User> {
    const user = await this.findByUuid(uuid);
    if (!user) throw new NotFoundException('Utente non trovato');
    await this.repo.manager.transaction(async (manager) => {
      await manager.query(`UPDATE staff SET "linkedUserUuid" = NULL WHERE "linkedUserUuid" = $1`, [user.uuid]);
      await manager.query(`DELETE FROM password_reset_tokens WHERE "userUuid" = $1`, [user.uuid]);
      await manager.query(`DELETE FROM users WHERE uuid = $1`, [user.uuid]);
    });
    return user;
  }

  async create(dto: CreateUserDto): Promise<User> {
    await this.prepareDto(dto, null);
    return super.create(dto);
  }

  async update(uuid: string, dto: UpdateUserDto): Promise<User> {
    await this.prepareDto(dto, uuid);
    return super.update(uuid, dto);
  }

  /**
   * Controlli con messaggi chiari prima del salvataggio (prima: errore 500 dal vincolo unique o dalla chiave esterna
   * sul ruolo). Username senza spazi ai lati, email "" → null.
   */
  private async prepareDto(dto: CreateUserDto | UpdateUserDto, uuid: string | null): Promise<void> {
    const data = dto as Record<string, any>;
    if ('username' in data) {
      const username = typeof data.username === 'string' ? data.username.trim() : '';
      if (!username) throw new BadRequestException('Il nome utente è obbligatorio');
      data.username = username;
      const where = uuid ? { username, uuid: Not(uuid) } : { username };
      if (await this.repo.exists({ where })) {
        throw new ConflictException(`Il nome utente "${username}" è già usato da un altro utente`);
      }
    }
    if ('roleCode' in data && data.roleCode !== undefined) {
      if (typeof data.roleCode !== 'string' || !data.roleCode.trim()) {
        throw new BadRequestException('Ruolo mancante');
      }
      const [role] = await this.repo.query(`SELECT 1 FROM roles WHERE code = $1`, [data.roleCode]);
      if (!role) throw new BadRequestException(`Il ruolo "${data.roleCode}" non esiste`);
    }
    if ('email' in data) {
      const email = data.email === null || data.email === undefined ? '' : String(data.email).trim();
      data.email = email === '' ? null : email;
    }
  }

  /** Un utente non può cancellare sé stesso (resterebbe connesso con un token di un utente inesistente). */
  assertNotSelf(actor: User, targetUuid: string): void {
    // gli uuid si confrontano senza maiuscole/minuscole, come fa Postgres
    if (actor?.uuid && actor.uuid.toLowerCase() === String(targetUuid ?? '').toLowerCase()) {
      throw new BadRequestException('Non puoi eliminare il tuo stesso utente');
    }
  }

  async updateOwnProfile(uuid: string, dto: { firstName?: string; lastName?: string }): Promise<User> {
    const clean: Partial<User> = {};
    if (typeof dto?.firstName === 'string') clean.firstName = dto.firstName.trim();
    if (typeof dto?.lastName === 'string') clean.lastName = dto.lastName.trim();
    return this.update(uuid, clean as any);
  }

  /** Unisce le preferenze inviate a quelle salvate: inviare solo il tema non deve cancellare le altre. */
  async updatePreferences(uuid: string, preferences: UserPreferences): Promise<UserPreferences> {
    const clean: UserPreferences = {};
    if (['light', 'dark', 'system'].includes(preferences?.theme as string)) clean.theme = preferences.theme;
    if (typeof preferences?.reduceTransparency === 'boolean') clean.reduceTransparency = preferences.reduceTransparency;
    const current = await this.repo
      .createQueryBuilder('user')
      .select(['user.uuid', 'user.preferences'])
      .where('user.uuid = :uuid', { uuid })
      .getOne();
    const merged: UserPreferences = { ...(current?.preferences ?? {}), ...clean };
    await this.repo.update({ uuid }, { preferences: merged });
    return merged;
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
