"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CategoryService = void 0;
const common_1 = require("@nestjs/common");
const base_service_1 = require("../../common/base-crud/base.service");
const category_entity_1 = require("./entities/category.entity");
const typeorm_1 = require("typeorm");
let CategoryService = class CategoryService extends base_service_1.BaseService {
    constructor() {
        super(category_entity_1.Category);
    }
    getDefaultOrder() {
        return { sortOrder: 'ASC', name: 'ASC' };
    }
    async searchCategories(search, type, page = 1, pageSize = 10) {
        const qb = this.repo.createQueryBuilder('category')
            .where('category.isActive = :isActive', { isActive: true });
        if (search) {
            qb.andWhere('LOWER(category.name) LIKE LOWER(:search)', { search: `%${search}%` });
        }
        if (type && type !== category_entity_1.CategoryType.BOTH) {
            qb.andWhere('(category.type = :type OR category.type = :both)', {
                type,
                both: category_entity_1.CategoryType.BOTH
            });
        }
        qb.orderBy('category.sortOrder', 'ASC')
            .addOrderBy('category.name', 'ASC')
            .skip((page - 1) * pageSize)
            .take(pageSize);
        return qb.getManyAndCount();
    }
    async findOrCreateByName(name, type = category_entity_1.CategoryType.BOTH) {
        let category = await this.repo.findOne({
            where: { name: (0, typeorm_1.ILike)(name.trim()) },
        });
        if (!category) {
            category = this.repo.create({
                name: name.trim(),
                type,
                isActive: true,
            });
            category = await this.repo.save(category);
        }
        return category;
    }
};
exports.CategoryService = CategoryService;
exports.CategoryService = CategoryService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [])
], CategoryService);
//# sourceMappingURL=category.service.js.map