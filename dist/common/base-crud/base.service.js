"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BaseService = exports.CustomRequestContext = void 0;
const typeorm_1 = require("typeorm");
const base_filter_1 = require("./base.filter");
const data_source_1 = require("../../datasources/data-source");
class CustomRequestContext {
}
exports.CustomRequestContext = CustomRequestContext;
class BaseService {
    constructor(target) {
        this.entityTarget = target;
        this.dataSource = data_source_1.dataSource;
        this.repo = data_source_1.dataSource.getRepository(target);
    }
    getDataSource() {
        return this.dataSource;
    }
    getQueryBuilder(alias, context) {
        if (context?.queryRunner) {
            return context.queryRunner.manager.createQueryBuilder(this.entityTarget, alias);
        }
        else {
            return this.repo.createQueryBuilder(alias);
        }
    }
    cloneEntity(entity) {
        const cloned = new this.entityTarget();
        Object.assign(cloned, entity);
        return cloned;
    }
    filterListToFindManyOption(filterList) {
        if (!filterList) {
            return null;
        }
        const options = {};
        if (filterList.pageSize) {
            const { take, skip } = this.paginationToTakeSkip({
                page: filterList.page,
                pageSize: filterList.pageSize,
            });
            options.take = take;
            options.skip = skip;
        }
        const andFilters = filterList.andFilters;
        let baseWhereCondition = {};
        if (andFilters && Object.keys(andFilters).length) {
            this.addAndFilter(andFilters.equal, baseWhereCondition, options, (value) => {
                return value;
            });
            this.addAndFilter(andFilters.notEqual, baseWhereCondition, options, (value) => (0, typeorm_1.Not)(value), true);
            this.addAndFilter(andFilters.like, baseWhereCondition, options, (value) => {
                return (0, typeorm_1.ILike)(`%${value}%`);
            });
            this.addAndFilter(andFilters.moreThan, baseWhereCondition, options, (value) => {
                return (0, typeorm_1.MoreThan)(value);
            });
            this.addAndFilter(andFilters.lessThan, baseWhereCondition, options, (value) => {
                return (0, typeorm_1.LessThan)(value);
            });
            this.addAndFilter(andFilters.isNull, baseWhereCondition, options, (value) => {
                if (value) {
                    return (0, typeorm_1.IsNull)();
                }
                else {
                    return (0, typeorm_1.Not)((0, typeorm_1.IsNull)());
                }
            });
        }
        const orFilters = filterList.orFilters;
        if (orFilters?.like && Object.keys(orFilters.like).length) {
            const orConditions = [];
            for (const [key, value] of Object.entries(orFilters.like)) {
                if (value !== undefined && value !== null && value !== '') {
                    const condition = {
                        ...baseWhereCondition,
                        [key]: (0, typeorm_1.ILike)(`%${value}%`)
                    };
                    orConditions.push(condition);
                }
            }
            if (orConditions.length > 0) {
                options.where = orConditions;
            }
            else if (Object.keys(baseWhereCondition).length > 0) {
                options.where = [baseWhereCondition];
            }
        }
        else if (Object.keys(baseWhereCondition).length > 0) {
            options.where = [baseWhereCondition];
        }
        const order = filterList.orderBy;
        if (order) {
            options.order = order;
        }
        if (filterList.relations) {
            if (!options.relations) {
                options.relations = {};
            }
            for (const k of Object.keys(filterList.relations)) {
                options.relations[k] = filterList.relations[k];
            }
        }
        return options;
    }
    filterStringToFilterList(filters) {
        if (!filters) {
            return {};
        }
        return JSON.parse(filters);
    }
    filtersStringToOptions(filters) {
        let options = null;
        if (filters) {
            const filterList = this.filterStringToFilterList(filters);
            options = this.filterListToFindManyOption(filterList);
        }
        return options;
    }
    async findWithFilterList(filters, context) {
        const options = this.filtersStringToOptions(filters);
        return this.find(options, context);
    }
    async findAndCountWithFilterList(filters, context) {
        const options = this.filtersStringToOptions(filters);
        return this.findAndCount(options, context);
    }
    async find(options, context) {
        options = this.setOrderIfMissing(options);
        options = this.setRelationsIfMissing(options, context);
        if (context?.queryRunner) {
            return context.queryRunner.manager.find(this.entityTarget, options);
        }
        return this.repo.find(options);
    }
    async findAndCount(options, context) {
        options = this.setOrderIfMissing(options);
        options = this.setRelationsIfMissing(options, context);
        if (context?.queryRunner) {
            return context.queryRunner.manager.findAndCount(this.entityTarget, options);
        }
        return this.repo.findAndCount(options);
    }
    async findByUuid(uuid, context, otherOptions) {
        if (!otherOptions) {
            otherOptions = {};
        }
        if (!uuid) {
            throw new Error('UUID is required');
        }
        return this.findOne({
            ...otherOptions,
            where: { uuid },
        }, context);
    }
    async findByUuids(uuids, context) {
        return this.find({ where: { uuid: (0, typeorm_1.In)(uuids) } }, context);
    }
    async findOne(options, context) {
        options = this.setOrderIfMissing(options);
        options = this.setRelationsIfMissing(options, context);
        if (context?.queryRunner) {
            return context.queryRunner.manager.findOne(this.entityTarget, options);
        }
        return this.repo.findOne(options);
    }
    async create(dto, context) {
        const entity = await this.createDtoToEntity(dto, context);
        return this.createFromEntity(entity, context);
    }
    async createFromEntity(entity, context) {
        const preCreateResult = await this.preCreate(entity, context);
        entity = preCreateResult;
        if (context?.queryRunner) {
            return context.queryRunner.manager.save(entity);
        }
        return this.repo.save(entity);
    }
    async update(uuid, dto, context) {
        const oldEntity = await this.findByUuid(uuid, context);
        if (!oldEntity) {
            throw new Error('Entity not found');
        }
        const newEntity = await this.updateDtoToEntity(dto, context);
        newEntity.uuid = uuid;
        return this.updateFromEntity(newEntity, oldEntity, context);
    }
    async updateFromEntity(newEntity, oldEntity, context) {
        const preUpdateResult = await this.preUpdate(newEntity, oldEntity, context);
        newEntity = preUpdateResult;
        if (context?.queryRunner) {
            return context.queryRunner.manager.save(newEntity);
        }
        return this.repo.save(newEntity);
    }
    async createOrUpdate(dto, context) {
        let entity = await this.saveDtoToEntity(dto, context);
        let oldEntity = null;
        if (dto.uuid) {
            oldEntity = await this.findByUuid(dto.uuid, context).catch(() => null);
        }
        if (oldEntity) {
            entity.uuid = oldEntity.uuid;
            return this.updateFromEntity(entity, oldEntity, context);
        }
        else {
            delete entity.uuid;
            return this.createFromEntity(entity, context);
        }
    }
    async delete(uuid, context) {
        const entity = await this.findByUuid(uuid, context);
        if (!entity) {
            throw new Error('Entity not found');
        }
        return this.deleteFromEntity(entity, context);
    }
    async deleteFromEntity(entity, context) {
        const preDeleteResult = await this.preDelete(entity, context);
        entity = preDeleteResult;
        if (context?.queryRunner) {
            return context.queryRunner.manager.remove(entity);
        }
        return this.repo.remove(entity);
    }
    getDefaultOrder() {
        return null;
    }
    getDefaultRelations(_context) {
        return null;
    }
    setOrderIfMissing(options) {
        const defaultOrder = this.getDefaultOrder();
        if (!defaultOrder) {
            return options;
        }
        if (!options) {
            options = {};
        }
        return {
            ...options,
            order: options.order ?? defaultOrder,
        };
    }
    setRelationsIfMissing(options, context) {
        const defaultRelations = this.getDefaultRelations(context);
        if (!defaultRelations) {
            return options;
        }
        if (!options) {
            options = {};
        }
        return {
            ...options,
            relations: options.relations ?? defaultRelations,
        };
    }
    addRelation(relation, options) {
        if (!options) {
            return;
        }
        const newRelations = (options.relations ?? {});
        newRelations[relation] = true;
        options.relations = newRelations;
    }
    addAndFilter(filters, condition, options, operator, isNot = false) {
        for (const key of Object.keys(filters ?? [])) {
            if (Array.isArray(filters[key])) {
                const values = filters[key];
                if (isNot) {
                    condition[key] = (0, typeorm_1.Not)((0, typeorm_1.In)(values));
                }
                else {
                    condition[key] = (0, typeorm_1.In)(values);
                }
            }
            else if (typeof filters[key] === 'object') {
                let hasNonEmptyFilter = false;
                for (const subkey of Object.keys(filters[key])) {
                    if (filters[key][subkey]) {
                        hasNonEmptyFilter = true;
                    }
                }
                if (!hasNonEmptyFilter) {
                    continue;
                }
                this.addRelation(key, options);
                this.addRelatedEntityAndFilter(filters, key, condition, operator);
            }
            else {
                const value = filters[key];
                if (value == null) {
                    continue;
                }
                condition[key] = operator(value);
            }
        }
    }
    addRelatedEntityAndFilter(allFilters, key, condition, operator) {
        const relatedEntityFilters = allFilters[key];
        const relatedEntityCondition = {};
        for (const subKey of Object.keys(relatedEntityFilters)) {
            relatedEntityCondition[subKey] = operator(relatedEntityFilters[subKey]);
        }
        condition[key] = relatedEntityCondition;
    }
    paginationToTakeSkip(pagination) {
        const { page, pageSize } = (0, base_filter_1.extractPagination)(pagination);
        const take = pageSize;
        const skip = (page - 1) * pageSize;
        return { take, skip };
    }
    async preCreate(entity, _context) {
        return entity;
    }
    async preUpdate(newEntity, _oldEntity, _context) {
        return newEntity;
    }
    async preDelete(entity, _context) {
        return entity;
    }
    async createDtoToEntity(dto, context) {
        return this.saveDtoToEntity(dto, context);
    }
    async updateDtoToEntity(dto, context) {
        return this.saveDtoToEntity(dto, context);
    }
    async saveDtoToEntity(dto, _context) {
        const entity = new this.entityTarget();
        for (const key of Object.keys(dto)) {
            entity[key] = dto[key];
        }
        return entity;
    }
}
exports.BaseService = BaseService;
//# sourceMappingURL=base.service.js.map