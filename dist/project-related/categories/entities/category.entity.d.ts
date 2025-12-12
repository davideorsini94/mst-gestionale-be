import { IctBaseEntity } from '../../../common/base-crud/ict-base.entity';
export declare enum CategoryType {
    INCOME = "INCOME",
    EXPENSE = "EXPENSE",
    BOTH = "BOTH"
}
export declare class Category extends IctBaseEntity {
    name: string;
    description: string;
    type: CategoryType;
    color: string;
    icon: string;
    isActive: boolean;
    sortOrder: number;
}
