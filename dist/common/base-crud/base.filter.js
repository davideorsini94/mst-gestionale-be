"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BaseFilterList = exports.PaginationFilter = exports.BaseOrFilters = exports.BaseAndFilters = void 0;
exports.extractPagination = extractPagination;
class BaseAndFilters {
}
exports.BaseAndFilters = BaseAndFilters;
class BaseOrFilters {
}
exports.BaseOrFilters = BaseOrFilters;
class PaginationFilter {
}
exports.PaginationFilter = PaginationFilter;
class BaseFilterList extends PaginationFilter {
}
exports.BaseFilterList = BaseFilterList;
function extractPagination(pagination) {
    return {
        page: pagination?.page ?? 1,
        pageSize: pagination?.pageSize ?? 10,
    };
}
//# sourceMappingURL=base.filter.js.map