import { BaseService } from '../../common/base-crud/base.service';
import { Category, CategoryType } from './entities/category.entity';
import { BaseSaveDto } from '../../common/base-crud/base-save.dto';
import { FindOptionsOrder } from 'typeorm';
export declare class CategoryService extends BaseService<Category, BaseSaveDto, BaseSaveDto> {
    constructor();
    protected getDefaultOrder(): FindOptionsOrder<Category>;
    searchCategories(search: string, type?: CategoryType, page?: number, pageSize?: number): Promise<[Category[], number]>;
    findOrCreateByName(name: string, type?: CategoryType): Promise<Category>;
}
