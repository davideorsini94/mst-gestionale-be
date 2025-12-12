import { UserService } from './user.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
export declare class UserController {
    private readonly userService;
    constructor(userService: UserService);
    findAll(filters?: string): Promise<[import("./entities/user.entity").User[], number]>;
    findOne(uuid: string): Promise<import("./entities/user.entity").User>;
    create(createUserDto: CreateUserDto): Promise<import("./entities/user.entity").User>;
    update(uuid: string, updateUserDto: UpdateUserDto): Promise<import("./entities/user.entity").User>;
    remove(uuid: string): Promise<import("./entities/user.entity").User>;
}
