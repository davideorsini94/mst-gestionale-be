import { FindManyOptions } from 'typeorm/find-options/FindManyOptions';
import { DataSource, FindOneOptions, FindOperator, FindOptionsOrder, FindOptionsRelations, FindOptionsWhere, Repository, SelectQueryBuilder } from 'typeorm';
import { IctBaseEntity } from './ict-base.entity';
import { BaseSaveDto } from './base-save.dto';
import { BaseFilterList, PaginationFilter, RecursiveBooleanPartial, RecursivePartial } from './base.filter';
export declare class CustomRequestContext {
    user?: any;
    queryRunner?: any;
    headers?: Record<string, any>;
    otherData?: any;
}
export declare abstract class BaseService<T extends IctBaseEntity, C extends BaseSaveDto, U extends BaseSaveDto = C> {
    protected readonly entityTarget: {
        new (): T;
    };
    protected dataSource: DataSource;
    protected repo: Repository<T>;
    protected constructor(target: {
        new (): T;
    });
    getDataSource(): DataSource;
    getQueryBuilder(alias: string, context?: CustomRequestContext): SelectQueryBuilder<T>;
    cloneEntity(entity: T): T;
    filterListToFindManyOption(filterList: BaseFilterList<T>): FindManyOptions<T>;
    filterStringToFilterList(filters: string): BaseFilterList<T>;
    filtersStringToOptions(filters: string): FindManyOptions<T>;
    findWithFilterList(filters: string, context: CustomRequestContext): Promise<T[]>;
    findAndCountWithFilterList(filters: string, context: CustomRequestContext): Promise<[T[], number]>;
    find(options: FindManyOptions<T>, context?: CustomRequestContext): Promise<T[]>;
    findAndCount(options: FindManyOptions<T>, context?: CustomRequestContext): Promise<[T[], number]>;
    findByUuid(uuid: string, context?: CustomRequestContext, otherOptions?: FindOneOptions<T>): Promise<T>;
    findByUuids(uuids: string[], context?: CustomRequestContext): Promise<T[]>;
    findOne(options: FindOneOptions<T>, context?: CustomRequestContext): Promise<T>;
    create(dto: C, context?: CustomRequestContext): Promise<T>;
    createFromEntity(entity: T, context?: CustomRequestContext): Promise<T>;
    update(uuid: string, dto: U, context?: CustomRequestContext): Promise<T>;
    updateFromEntity(newEntity: T, oldEntity: T, context?: CustomRequestContext): Promise<T>;
    createOrUpdate(dto: C | U, context?: CustomRequestContext): Promise<T>;
    delete(uuid: string, context?: CustomRequestContext): Promise<T>;
    deleteFromEntity(entity: T, context?: CustomRequestContext): Promise<T>;
    protected getDefaultOrder(): FindOptionsOrder<T>;
    protected getDefaultRelations(_context?: CustomRequestContext): FindOptionsRelations<T>;
    protected setOrderIfMissing(options: FindManyOptions<T>): FindManyOptions<T>;
    protected setRelationsIfMissing(options: FindManyOptions<T>, context?: CustomRequestContext): FindManyOptions<T>;
    protected addRelation(relation: string, options: FindManyOptions<T>): void;
    protected addAndFilter(filters: RecursivePartial<T> | RecursiveBooleanPartial<T>, condition: FindOptionsWhere<T>, options: FindManyOptions<T>, operator: (value: string | FindOperator<any> | boolean) => FindOperator<any>, isNot?: boolean): void;
    protected addRelatedEntityAndFilter(allFilters: object, key: string, condition: FindOptionsWhere<T>, operator: (value: string | FindOperator<any>) => FindOperator<any>): void;
    paginationToTakeSkip(pagination: PaginationFilter): {
        take: number;
        skip: number;
    };
    protected preCreate(entity: T, _context?: CustomRequestContext): Promise<T>;
    protected preUpdate(newEntity: T, _oldEntity: T, _context?: CustomRequestContext): Promise<T>;
    protected preDelete(entity: T, _context?: CustomRequestContext): Promise<T>;
    protected createDtoToEntity(dto: C, context?: CustomRequestContext): Promise<T>;
    protected updateDtoToEntity(dto: U, context?: CustomRequestContext): Promise<T>;
    protected saveDtoToEntity(dto: C | U, _context?: CustomRequestContext): Promise<T>;
}
