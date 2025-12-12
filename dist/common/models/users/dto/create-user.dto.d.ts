import { BaseSaveDto } from '../../../base-crud/base-save.dto';
export declare class CreateUserDto extends BaseSaveDto {
    username: string;
    password: string;
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
    isActive?: boolean;
    roleCode?: string;
}
