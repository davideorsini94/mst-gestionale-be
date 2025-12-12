import { JwtService } from '@nestjs/jwt';
import { UserService } from '../models/users/user.service';
import { User } from '../models/users/entities/user.entity';
export declare class AuthService {
    private userService;
    private jwtService;
    constructor(userService: UserService, jwtService: JwtService);
    validateUser(username: string, password: string): Promise<User | null>;
    login(user: User): Promise<{
        access_token: string;
        expiresIn: string;
        user: {
            uuid: string;
            username: string;
            firstName: string;
            lastName: string;
            email: string;
            role: import("../models/roles/entities/role.entity").Role;
        };
    }>;
}
