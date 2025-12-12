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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TransactionController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const transaction_service_1 = require("./transaction.service");
const create_transaction_dto_1 = require("./dto/create-transaction.dto");
const update_transaction_dto_1 = require("./dto/update-transaction.dto");
const capabilities_decorator_1 = require("../../common/auth/decorators/capabilities.decorator");
const capability_enum_1 = require("../../common/models/capabilities-per-role/capability.enum");
const receipt_migration_service_1 = require("./receipt-migration.service");
let TransactionController = class TransactionController {
    constructor(transactionService, receiptMigrationService) {
        this.transactionService = transactionService;
        this.receiptMigrationService = receiptMigrationService;
    }
    async findAll(filters) {
        return this.transactionService.findAndCountWithFilterList(filters, null);
    }
    async getStatistics(startDate, endDate, categoryUuid) {
        return this.transactionService.getStatistics(startDate, endDate, categoryUuid);
    }
    async findOne(uuid) {
        return this.transactionService.findByUuid(uuid);
    }
    async create(createTransactionDto) {
        return this.transactionService.createTransaction(createTransactionDto);
    }
    async update(uuid, updateTransactionDto) {
        return this.transactionService.updateTransaction(uuid, updateTransactionDto);
    }
    async remove(uuid) {
        return this.transactionService.deleteTransaction(uuid);
    }
    async getReceipt(uuid, reply) {
        try {
            const transaction = await this.transactionService.findByUuid(uuid);
            if (!transaction || !transaction.receiptMinioPath) {
                throw new common_1.NotFoundException('Ricevuta non trovata');
            }
            const stream = await this.transactionService.getReceiptStream(uuid);
            reply.header('Content-Type', 'application/pdf');
            reply.header('Content-Disposition', `inline; filename="ricevuta_${transaction.receiptNumber}_${transaction.receiptYear}.pdf"`);
            return reply.send(stream);
        }
        catch (error) {
            throw new common_1.NotFoundException('Ricevuta non trovata');
        }
    }
    async migrateReceipts() {
        return this.receiptMigrationService.migrateReceiptsToYearFolders();
    }
};
exports.TransactionController = TransactionController;
__decorate([
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({ summary: 'Lista transazioni' }),
    (0, capabilities_decorator_1.RequireCapabilities)(capability_enum_1.Capability.CAN_VIEW_TRANSACTIONS),
    __param(0, (0, common_1.Query)('filters')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], TransactionController.prototype, "findAll", null);
__decorate([
    (0, common_1.Get)('statistics'),
    (0, swagger_1.ApiOperation)({ summary: 'Statistiche finanziarie' }),
    (0, swagger_1.ApiQuery)({ name: 'startDate', required: false }),
    (0, swagger_1.ApiQuery)({ name: 'endDate', required: false }),
    (0, swagger_1.ApiQuery)({ name: 'categoryUuid', required: false }),
    (0, capabilities_decorator_1.RequireCapabilities)(capability_enum_1.Capability.CAN_VIEW_STATISTICS),
    __param(0, (0, common_1.Query)('startDate')),
    __param(1, (0, common_1.Query)('endDate')),
    __param(2, (0, common_1.Query)('categoryUuid')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String]),
    __metadata("design:returntype", Promise)
], TransactionController.prototype, "getStatistics", null);
__decorate([
    (0, common_1.Get)(':uuid'),
    (0, swagger_1.ApiOperation)({ summary: 'Dettaglio transazione' }),
    (0, capabilities_decorator_1.RequireCapabilities)(capability_enum_1.Capability.CAN_VIEW_TRANSACTIONS),
    __param(0, (0, common_1.Param)('uuid')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], TransactionController.prototype, "findOne", null);
__decorate([
    (0, common_1.Post)(),
    (0, swagger_1.ApiOperation)({ summary: 'Crea transazione' }),
    (0, capabilities_decorator_1.RequireCapabilities)(capability_enum_1.Capability.CAN_MANAGE_TRANSACTIONS),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [create_transaction_dto_1.CreateTransactionDto]),
    __metadata("design:returntype", Promise)
], TransactionController.prototype, "create", null);
__decorate([
    (0, common_1.Put)(':uuid'),
    (0, swagger_1.ApiOperation)({ summary: 'Aggiorna transazione' }),
    (0, capabilities_decorator_1.RequireCapabilities)(capability_enum_1.Capability.CAN_MANAGE_TRANSACTIONS),
    __param(0, (0, common_1.Param)('uuid')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, update_transaction_dto_1.UpdateTransactionDto]),
    __metadata("design:returntype", Promise)
], TransactionController.prototype, "update", null);
__decorate([
    (0, common_1.Delete)(':uuid'),
    (0, swagger_1.ApiOperation)({ summary: 'Elimina transazione' }),
    (0, capabilities_decorator_1.RequireCapabilities)(capability_enum_1.Capability.CAN_MANAGE_TRANSACTIONS),
    __param(0, (0, common_1.Param)('uuid')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], TransactionController.prototype, "remove", null);
__decorate([
    (0, common_1.Get)(':uuid/receipt'),
    (0, swagger_1.ApiOperation)({ summary: 'Scarica ricevuta PDF' }),
    (0, capabilities_decorator_1.RequireCapabilities)(capability_enum_1.Capability.CAN_MANAGE_TRANSACTIONS),
    __param(0, (0, common_1.Param)('uuid')),
    __param(1, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], TransactionController.prototype, "getReceipt", null);
__decorate([
    (0, common_1.Post)('migrate-receipts'),
    (0, swagger_1.ApiOperation)({ summary: 'Migra ricevute esistenti nella struttura cartelle per anno' }),
    (0, capabilities_decorator_1.RequireCapabilities)(capability_enum_1.Capability.CAN_MANAGE_TRANSACTIONS),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], TransactionController.prototype, "migrateReceipts", null);
exports.TransactionController = TransactionController = __decorate([
    (0, swagger_1.ApiTags)('Transactions'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.Controller)('transactions'),
    __metadata("design:paramtypes", [transaction_service_1.TransactionService,
        receipt_migration_service_1.ReceiptMigrationService])
], TransactionController);
//# sourceMappingURL=transaction.controller.js.map