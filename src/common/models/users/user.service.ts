import { Injectable } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { BaseService } from '../../base-crud/base.service';
import { User } from './entities/user.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UserService extends BaseService<User, CreateUserDto, UpdateUserDto> {
  constructor() {
    super(User);
  }

  async findByUsername(username: string): Promise<User | null> {
    return this.repo.findOne({
      where: { username },
      relations: ['role', 'role.capabilities'],
    });
  }

  protected async preCreate(entity: User): Promise<User> {
    if (entity.password) {
      entity.password = await bcrypt.hash(entity.password, 10);
    }
    return entity;
  }

  protected async preUpdate(newEntity: User, oldEntity: User): Promise<User> {
    if (newEntity.password && newEntity.password !== oldEntity.password) {
      newEntity.password = await bcrypt.hash(newEntity.password, 10);
    } else {
      newEntity.password = oldEntity.password;
    }
    return newEntity;
  }

  getDefaultRelations() {
    return { role: { capabilities: true } };
  }
}
