import { AuthService } from './auth.service';
export declare class AuthController {
    private authService;
    constructor(authService: AuthService);
    login(req: any): Promise<{
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
    me(req: any): Promise<any>;
}
