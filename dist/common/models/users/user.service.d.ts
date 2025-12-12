import { BaseService } from '../../base-crud/base.service';
import { User } from './entities/user.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
export declare class UserService extends BaseService<User, CreateUserDto, UpdateUserDto> {
    constructor();
    findByUsername(username: string): Promise<User | null>;
    protected preCreate(entity: User): Promise<User>;
    protected preUpdate(newEntity: User, oldEntity: User): Promise<User>;
    getDefaultRelations(): {
        role: {
            capabilities: boolean;
        };
    };
}
