import { Injectable } from '@nestjs/common';
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
    } else {
      delete newEntity.password;
    }
    return newEntity;
  }

  getDefaultRelations() {
    return { role: { capabilities: true } };
  }
}
