import { FindOptionsOrder, FindOptionsRelations } from 'typeorm';

export type RecursivePartial<T> = {
  [P in keyof T]?: T[P] extends object ? RecursivePartial<T[P]> : T[P];
};

export type RecursiveBooleanPartial<T> = {
  [P in keyof T]?: T[P] extends object ? RecursiveBooleanPartial<T[P]> : boolean;
};

export class BaseAndFilters<T> {
  equal?: RecursivePartial<T>;
  notEqual?: RecursivePartial<T>;
  like?: RecursivePartial<T>;
  moreThan?: RecursivePartial<T>;
  lessThan?: RecursivePartial<T>;
  isNull?: RecursiveBooleanPartial<T>;
}

export class BaseOrFilters<T> {
  equal?: RecursivePartial<T>;
  notEqual?: RecursivePartial<T>;
  like?: RecursivePartial<T>;
  moreThan?: RecursivePartial<T>;
  lessThan?: RecursivePartial<T>;
  isNull?: RecursiveBooleanPartial<T>;
}

export class PaginationFilter {
  page?: number;
  pageSize?: number;
}

export class BaseFilterList<T> extends PaginationFilter {
  andFilters?: BaseAndFilters<T>;
  orFilters?: BaseOrFilters<T>;
  orderBy?: FindOptionsOrder<T>;
  relations?: FindOptionsRelations<T>;
}

export function extractPagination(pagination: PaginationFilter): {
  page: number;
  pageSize: number;
} {
  return {
    page: pagination?.page ?? 1,
    pageSize: pagination?.pageSize ?? 10,
  };
}
