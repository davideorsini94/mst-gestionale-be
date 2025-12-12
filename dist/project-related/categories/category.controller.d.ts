import { CategoryService } from './category.service';
import { Category, CategoryType } from './entities/category.entity';
export declare class CategoryController {
    private readonly categoryService;
    constructor(categoryService: CategoryService);
    findAll(filters?: string): Promise<[Category[], number]>;
    search(q?: string, type?: CategoryType, page?: string, pageSize?: string): Promise<{
        data: Category[];
        total: number;
        page: number;
        pageSize: number;
        totalPages: number;
    }>;
    findOne(uuid: string): Promise<Category>;
    create(category: Partial<Category>): Promise<Category>;
    update(uuid: string, category: Partial<Category>): Promise<Category>;
    remove(uuid: string): Promise<Category>;
}
