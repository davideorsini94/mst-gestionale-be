import { FindOptionsOrder, FindOptionsRelations } from 'typeorm';
export type RecursivePartial<T> = {
    [P in keyof T]?: T[P] extends object ? RecursivePartial<T[P]> : T[P];
};
export type RecursiveBooleanPartial<T> = {
    [P in keyof T]?: T[P] extends object ? RecursiveBooleanPartial<T[P]> : boolean;
};
export declare class BaseAndFilters<T> {
    equal?: RecursivePartial<T>;
    notEqual?: RecursivePartial<T>;
    like?: RecursivePartial<T>;
    moreThan?: RecursivePartial<T>;
    lessThan?: RecursivePartial<T>;
    isNull?: RecursiveBooleanPartial<T>;
}
export declare class BaseOrFilters<T> {
    equal?: RecursivePartial<T>;
    notEqual?: RecursivePartial<T>;
    like?: RecursivePartial<T>;
    moreThan?: RecursivePartial<T>;
    lessThan?: RecursivePartial<T>;
    isNull?: RecursiveBooleanPartial<T>;
}
export declare class PaginationFilter {
    page?: number;
    pageSize?: number;
}
export declare class BaseFilterList<T> extends PaginationFilter {
    andFilters?: BaseAndFilters<T>;
    orFilters?: BaseOrFilters<T>;
    orderBy?: FindOptionsOrder<T>;
    relations?: FindOptionsRelations<T>;
}
export declare function extractPagination(pagination: PaginationFilter): {
    page: number;
    pageSize: number;
};
