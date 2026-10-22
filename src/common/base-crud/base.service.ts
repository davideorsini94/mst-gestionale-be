import { BadRequestException } from '@nestjs/common';
import { FindManyOptions } from 'typeorm/find-options/FindManyOptions';
import {
  Between,
  DataSource,
  FindOneOptions,
  FindOperator,
  FindOptionsOrder,
  FindOptionsRelations,
  FindOptionsWhere,
  ILike,
  In,
  IsNull,
  LessThan,
  LessThanOrEqual,
  MoreThan,
  MoreThanOrEqual,
  Not,
  Repository,
  SelectQueryBuilder,
} from 'typeorm';
import { IctBaseEntity } from './ict-base.entity';
import { BaseSaveDto } from './base-save.dto';
import {
  BaseFilterList,
  extractPagination,
  PaginationFilter,
  RecursiveBooleanPartial,
  RecursivePartial,
} from './base.filter';
import { dataSource } from '../../datasources/data-source';
import { getEncryptedFields } from '../crypto/encrypted-column';
import {
  applyMemoryFilters,
  assertNoEncryptedWhere,
  planEncryptedQuery,
  sortRows,
  splitOrder,
} from './encrypted-query';

export class CustomRequestContext {
  user?: any;
  queryRunner?: any;
  headers?: Record<string, any>;
  otherData?: any;
}

export abstract class BaseService<
  T extends IctBaseEntity,
  C extends BaseSaveDto,
  U extends BaseSaveDto = C,
> {
  protected readonly entityTarget: { new (): T };
  protected dataSource: DataSource;
  protected repo: Repository<T>;

  protected constructor(target: { new (): T }) {
    this.entityTarget = target;
    this.dataSource = dataSource;
    this.repo = dataSource.getRepository(target);
  }

  public getDataSource(): DataSource {
    return this.dataSource;
  }

  public getQueryBuilder(
    alias: string,
    context?: CustomRequestContext,
  ): SelectQueryBuilder<T> {
    if (context?.queryRunner) {
      return context.queryRunner.manager.createQueryBuilder(
        this.entityTarget,
        alias,
      );
    } else {
      return this.repo.createQueryBuilder(alias);
    }
  }

  public cloneEntity(entity: T): T {
    const cloned = new this.entityTarget();
    Object.assign(cloned, entity);
    return cloned;
  }

  public filterListToFindManyOption(
    filterList: BaseFilterList<T>,
  ): FindManyOptions<T> {
    if (!filterList) {
      return null;
    }

    const options: FindManyOptions<T> = {};

    if (filterList.pageSize) {
      const { take, skip } = this.paginationToTakeSkip({
        page: filterList.page,
        pageSize: filterList.pageSize,
      });

      options.take = take;
      options.skip = skip;
    }

    const andFilters = filterList.andFilters;
    let baseWhereCondition = {} as FindOptionsWhere<T>;
    
    if (andFilters && Object.keys(andFilters).length) {
      this.addAndFilter(andFilters.equal, baseWhereCondition, options, (value) => {
        return value as FindOperator<any>;
      });

      this.addAndFilter(
        andFilters.notEqual,
        baseWhereCondition,
        options,
        (value) => Not(value),
        true,
      );

      this.addAndFilter(andFilters.like, baseWhereCondition, options, (value) => {
        return ILike(`%${value}%`);
      });

      this.addAndFilter(andFilters.moreThan, baseWhereCondition, options, (value) => {
        return MoreThan(value);
      });

      this.addAndFilter(andFilters.lessThan, baseWhereCondition, options, (value) => {
        return LessThan(value);
      });

      this.addAndFilter(andFilters.moreThanOrEqual, baseWhereCondition, options, (value) => {
        return MoreThanOrEqual(value);
      });

      this.addAndFilter(andFilters.lessThanOrEqual, baseWhereCondition, options, (value) => {
        return LessThanOrEqual(value);
      });

      this.addAndFilter(andFilters.between, baseWhereCondition, options, (value) => {
        if (Array.isArray(value) && value.length === 2) {
          return Between(value[0], value[1]);
        }
        return value as FindOperator<any>;
      });

      this.addAndFilter(andFilters.isNull, baseWhereCondition, options, (value) => {
        if (value) {
          return IsNull();
        } else {
          return Not(IsNull());
        }
      });
    }

    // Gestione orFilters - crea condizioni OR (es. cerca in nome O cognome O email)
    const orFilters = filterList.orFilters;
    if (orFilters?.like && Object.keys(orFilters.like).length) {
      const orConditions: FindOptionsWhere<T>[] = [];
      
      for (const [key, value] of Object.entries(orFilters.like)) {
        if (value !== undefined && value !== null && value !== '') {
          const condition = { 
            ...baseWhereCondition,
            [key]: ILike(`%${value}%`) 
          } as FindOptionsWhere<T>;
          orConditions.push(condition);
        }
      }
      
      if (orConditions.length > 0) {
        options.where = orConditions;
      } else if (Object.keys(baseWhereCondition).length > 0) {
        options.where = [baseWhereCondition];
      }
    } else if (Object.keys(baseWhereCondition).length > 0) {
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

  public filterStringToFilterList(filters: string): BaseFilterList<T> {
    if (!filters) {
      return {};
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(filters);
    } catch {
      throw new BadRequestException('Parametro filters non valido (JSON atteso)');
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new BadRequestException('Parametro filters non valido');
    }
    return parsed as BaseFilterList<T>;
  }

  public filtersStringToOptions(filters: string): FindManyOptions<T> {
    let options: FindManyOptions<T> = null;

    if (filters) {
      const filterList = this.filterStringToFilterList(filters);
      options = this.filterListToFindManyOption(filterList);
    }

    return options;
  }

  public async findWithFilterList(
    filters: string,
    context: CustomRequestContext,
  ): Promise<T[]> {
    const options = this.filtersStringToOptions(filters);
    return this.find(options, context);
  }

  async findAndCountWithFilterList(
    filters: string,
    context: CustomRequestContext,
  ): Promise<[T[], number]> {
    const filterList = this.filterStringToFilterList(filters);
    const plan = planEncryptedQuery(
      this.entityTarget,
      filterList,
      this.getDefaultOrder() as Record<string, any>,
      (relation) => this.relationTarget(relation),
    );
    if (!plan) {
      const options = filters ? this.filterListToFindManyOption(filterList) : null;
      return this.findAndCount(options, context);
    }
    return this.findAndCountInMemory(filterList, plan, context);
  }

  /**
   * Filtri/ordinamenti su campi cifrati: 1) SQL con i soli filtri in chiaro, leggendo uuid e colonne coinvolte;
   * 2) decifratura, filtro, ordinamento e conteggio in memoria; 3) caricamento completo della sola pagina richiesta.
   */
  private async findAndCountInMemory(
    filterList: BaseFilterList<T>,
    plan: ReturnType<typeof planEncryptedQuery>,
    context: CustomRequestContext,
  ): Promise<[T[], number]> {
    const dbOptions = this.filterListToFindManyOption(plan.dbFilterList) ?? {};
    const manager = context?.queryRunner ? context.queryRunner.manager : this.repo.manager;
    const columnNames = new Set(this.repo.metadata.columns.map((c) => c.propertyName));

    assertNoEncryptedWhere(this.entityTarget, dbOptions.where, (r) => this.relationTarget(r));
    const candidates: T[] = await manager.find(this.entityTarget, {
      where: dbOptions.where,
      relations: dbOptions.relations,
      select: plan.columns.filter((c) => columnNames.has(c)) as any,
    });

    const filtered = sortRows(applyMemoryFilters(candidates as any[], plan), plan.order);
    const total = filtered.length;

    let pageRows = filtered;
    if (filterList.pageSize) {
      const { take, skip } = this.paginationToTakeSkip({ page: filterList.page, pageSize: filterList.pageSize });
      pageRows = filtered.slice(skip, skip + take);
    }
    if (!pageRows.length) {
      return [[], total];
    }

    const uuids = pageRows.map((r: any) => r.uuid);
    const loaded = await this.find(
      { where: { uuid: In(uuids) } as FindOptionsWhere<T>, relations: dbOptions.relations, order: undefined },
      context,
    );
    const byUuid = new Map(loaded.map((e) => [e.uuid, e]));
    return [uuids.map((u) => byUuid.get(u)).filter(Boolean), total];
  }

  /** Entità collegata a una relazione (per controllare i campi cifrati nei filtri annidati). */
  protected relationTarget(relation: string): Function | null {
    const rel = this.repo.metadata.relations.find((r) => r.propertyName === relation);
    const type = rel?.inverseEntityMetadata?.target;
    return typeof type === 'function' ? type : null;
  }

  async find(
    options: FindManyOptions<T>,
    context?: CustomRequestContext,
  ): Promise<T[]> {
    options = this.setOrderIfMissing(options);
    options = this.setRelationsIfMissing(options, context);
    const { options: dbOptions, memoryOrder } = this.prepareOptions(options);

    const rows: T[] = context?.queryRunner
      ? await context.queryRunner.manager.find(this.entityTarget, dbOptions)
      : await this.repo.find(dbOptions);
    return memoryOrder ? sortRows(rows as any[], memoryOrder) : rows;
  }

  async findAndCount(
    options: FindManyOptions<T>,
    context?: CustomRequestContext,
  ): Promise<[T[], number]> {
    options = this.setOrderIfMissing(options);
    options = this.setRelationsIfMissing(options, context);
    const { options: dbOptions, memoryOrder } = this.prepareOptions(options);

    if (!memoryOrder) {
      if (context?.queryRunner) {
        return context.queryRunner.manager.findAndCount(this.entityTarget, dbOptions);
      }
      return this.repo.findAndCount(dbOptions);
    }

    // Ordinamento su campi cifrati: si ordina in memoria e poi si pagina
    const { take, skip, ...rest } = dbOptions;
    const all: T[] = context?.queryRunner
      ? await context.queryRunner.manager.find(this.entityTarget, rest)
      : await this.repo.find(rest);
    const sorted = sortRows(all as any[], memoryOrder);
    const start = skip ?? 0;
    return [take ? sorted.slice(start, start + take) : sorted.slice(start), sorted.length];
  }

  /**
   * Controlla che nessun campo cifrato finisca in una condizione SQL e sposta in memoria gli ordinamenti
   * su campi cifrati (nel DB c'è testo casuale).
   */
  protected prepareOptions<O extends FindManyOptions<T> | FindOneOptions<T>>(options: O) {
    if (!options) return { options, memoryOrder: null };
    assertNoEncryptedWhere(this.entityTarget, options.where, (r) => this.relationTarget(r));
    const { dbOrder, memoryOrder } = splitOrder(
      this.entityTarget,
      options.order as Record<string, any>,
      (r) => this.relationTarget(r),
    );
    return { options: { ...options, order: dbOrder } as O, memoryOrder };
  }

  async count(): Promise<number> {
    return this.repo.count();
  }

  async findByUuid(
    uuid: string,
    context?: CustomRequestContext,
    otherOptions?: FindOneOptions<T>,
  ): Promise<T> {
    if (!otherOptions) {
      otherOptions = {};
    }

    if (!uuid) {
      throw new Error('UUID is required');
    }

    return this.findOne(
      {
        ...otherOptions,
        where: { uuid } as FindOptionsWhere<T>,
      },
      context,
    );
  }

  async findByUuids(uuids: string[], context?: CustomRequestContext): Promise<T[]> {
    return this.find({ where: { uuid: In(uuids) } } as FindManyOptions<T>, context);
  }

  async findOne(
    options: FindOneOptions<T>,
    context?: CustomRequestContext,
  ): Promise<T> {
    options = this.setOrderIfMissing(options);
    options = this.setRelationsIfMissing(options, context);
    const { options: dbOptions } = this.prepareOptions(options);

    if (context?.queryRunner) {
      return context.queryRunner.manager.findOne(this.entityTarget, dbOptions);
    }

    return this.repo.findOne(dbOptions);
  }

  async create(dto: C, context?: CustomRequestContext): Promise<T> {
    const entity: T = await this.createDtoToEntity(dto, context);
    return this.createFromEntity(entity, context);
  }

  async createFromEntity(entity: T, context?: CustomRequestContext): Promise<T> {
    const preCreateResult = await this.preCreate(entity, context);
    entity = preCreateResult;

    const saved: T = context?.queryRunner
      ? await context.queryRunner.manager.save(entity)
      : await this.repo.save(entity);
    return this.stripSecrets(saved);
  }

  /** Le risposte non devono mai contenere hash di password né blind index (salvati ma non da esporre). */
  protected stripSecrets(entity: T): T {
    if (!entity) return entity;
    const target = entity as any;
    delete target.password;
    for (const field of getEncryptedFields(this.entityTarget)) {
      if (field.hash) delete target[field.hash.property];
    }
    return entity;
  }

  async update(
    uuid: string,
    dto: U,
    context?: CustomRequestContext,
  ): Promise<T> {
    const oldEntity: T = await this.findByUuid(uuid, context);
    if (!oldEntity) {
      throw new Error('Entity not found');
    }

    const newEntity: T = await this.updateDtoToEntity(dto, context);
    newEntity.uuid = uuid;
    await this.updateFromEntity(newEntity, oldEntity, context);
    // Si restituisce la riga completa: con un aggiornamento parziale l'entità salvata contiene solo i campi inviati, e
    // chi la usa dopo (reminder, risposta al client) vedrebbe null al posto dei valori rimasti nel DB
    return this.stripSecrets(await this.findByUuid(uuid, context));
  }

  async updateFromEntity(
    newEntity: T,
    oldEntity: T,
    context?: CustomRequestContext,
  ): Promise<T> {
    const preUpdateResult = await this.preUpdate(newEntity, oldEntity, context);
    newEntity = preUpdateResult;

    const saved: T = context?.queryRunner
      ? await context.queryRunner.manager.save(newEntity)
      : await this.repo.save(newEntity);
    return this.stripSecrets(saved);
  }

  async createOrUpdate(dto: C | U, context?: CustomRequestContext): Promise<T> {
    let entity: T = await this.saveDtoToEntity(dto, context);
    let oldEntity: T = null;

    if (dto.uuid) {
      oldEntity = await this.findByUuid(dto.uuid, context).catch(() => null);
    }

    if (oldEntity) {
      entity.uuid = oldEntity.uuid;
      return this.updateFromEntity(entity, oldEntity, context);
    } else {
      delete entity.uuid;
      return this.createFromEntity(entity, context);
    }
  }

  async delete(uuid: string, context?: CustomRequestContext): Promise<T> {
    const entity: T = await this.findByUuid(uuid, context);
    if (!entity) {
      throw new Error('Entity not found');
    }
    return this.deleteFromEntity(entity, context);
  }

  async deleteFromEntity(entity: T, context?: CustomRequestContext): Promise<T> {
    const preDeleteResult = await this.preDelete(entity, context);
    entity = preDeleteResult;

    if (context?.queryRunner) {
      return context.queryRunner.manager.remove(entity);
    }

    return this.repo.remove(entity);
  }

  protected getDefaultOrder(): FindOptionsOrder<T> {
    return null;
  }

  protected getDefaultRelations(
    _context?: CustomRequestContext,
  ): FindOptionsRelations<T> {
    return null;
  }

  protected setOrderIfMissing(options: FindManyOptions<T>): FindManyOptions<T> {
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

  protected setRelationsIfMissing(
    options: FindManyOptions<T>,
    context?: CustomRequestContext,
  ): FindManyOptions<T> {
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

  protected addRelation(relation: string, options: FindManyOptions<T>) {
    if (!options) {
      return;
    }

    const newRelations = (options.relations ?? {}) as FindOptionsRelations<T>;
    newRelations[relation] = true;
    options.relations = newRelations;
  }

  protected addAndFilter(
    filters: RecursivePartial<T> | RecursiveBooleanPartial<T>,
    condition: FindOptionsWhere<T>,
    options: FindManyOptions<T>,
    operator: (value: string | FindOperator<any> | boolean | any[]) => FindOperator<any>,
    isNot = false,
  ) {
    for (const key of Object.keys(filters ?? [])) {
      if (Array.isArray(filters[key])) {
        const values = filters[key];

        // Se l'array ha 2 elementi, potrebbe essere un Between, lascia che l'operatore lo gestisca
        if (values.length === 2 && typeof values[0] === 'string' && typeof values[1] === 'string') {
          condition[key] = operator(values);
        } else {
          // Altrimenti è un In
          if (isNot) {
            condition[key] = Not(In(values));
          } else {
            condition[key] = In(values);
          }
        }
      } else if (typeof filters[key] === 'object') {
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
      } else {
        const value = filters[key];
        if (value == null) {
          continue;
        }

        condition[key] = operator(value);
      }
    }
  }

  protected addRelatedEntityAndFilter(
    allFilters: object,
    key: string,
    condition: FindOptionsWhere<T>,
    operator: (value: string | FindOperator<any>) => FindOperator<any>,
  ) {
    const relatedEntityFilters = allFilters[key] as object;
    const relatedEntityCondition = {};

    for (const subKey of Object.keys(relatedEntityFilters)) {
      relatedEntityCondition[subKey] = operator(relatedEntityFilters[subKey]);
    }

    condition[key] = relatedEntityCondition;
  }

  public paginationToTakeSkip(pagination: PaginationFilter): {
    take: number;
    skip: number;
  } {
    const { page, pageSize } = extractPagination(pagination);

    const take = pageSize;
    const skip = (page - 1) * pageSize;

    return { take, skip };
  }

  protected async preCreate(entity: T, _context?: CustomRequestContext): Promise<T> {
    return entity;
  }

  protected async preUpdate(
    newEntity: T,
    _oldEntity: T,
    _context?: CustomRequestContext,
  ): Promise<T> {
    return newEntity;
  }

  protected async preDelete(entity: T, _context?: CustomRequestContext): Promise<T> {
    return entity;
  }

  protected async createDtoToEntity(dto: C, context?: CustomRequestContext): Promise<T> {
    return this.saveDtoToEntity(dto, context);
  }

  protected async updateDtoToEntity(dto: U, context?: CustomRequestContext): Promise<T> {
    return this.saveDtoToEntity(dto, context);
  }

  protected async saveDtoToEntity(
    dto: C | U,
    _context?: CustomRequestContext,
  ): Promise<T> {
    const entity: T = new this.entityTarget();
    for (const key of Object.keys(dto)) {
      entity[key] = dto[key];
    }
    return entity;
  }
}
