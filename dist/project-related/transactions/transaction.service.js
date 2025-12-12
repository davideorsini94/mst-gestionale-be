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
exports.TransactionService = void 0;
const common_1 = require("@nestjs/common");
const base_service_1 = require("../../common/base-crud/base.service");
const transaction_entity_1 = require("./entities/transaction.entity");
const category_service_1 = require("../categories/category.service");
const category_entity_1 = require("../categories/entities/category.entity");
const receipt_service_1 = require("./receipt.service");
let TransactionService = class TransactionService extends base_service_1.BaseService {
    constructor(categoryService, receiptService) {
        super(transaction_entity_1.Transaction);
        this.categoryService = categoryService;
        this.receiptService = receiptService;
    }
    getDefaultOrder() {
        return { date: 'DESC' };
    }
    getDefaultRelations() {
        return { category: true };
    }
    async createTransaction(dto) {
        if (dto.categoryName && !dto.categoryUuid) {
            const category = await this.categoryService.findOrCreateByName(dto.categoryName, category_entity_1.CategoryType.BOTH);
            dto.categoryUuid = category.uuid;
        }
        const { categoryName, ...transactionData } = dto;
        let transaction = await this.create(transactionData);
        if (transaction.type === transaction_entity_1.TransactionType.INCOME) {
            try {
                const receiptData = await this.receiptService.createAndUploadReceipt(transaction);
                transaction.receiptMinioPath = receiptData.minioPath;
                transaction.receiptNumber = receiptData.receiptNumber;
                transaction.receiptYear = receiptData.receiptYear;
                transaction = await this.repo.save(transaction);
                console.log(`[TransactionService] Receipt created for transaction ${transaction.uuid}: ${receiptData.minioPath}`);
            }
            catch (error) {
                console.error(`[TransactionService] Error creating receipt for transaction ${transaction.uuid}:`, error);
            }
        }
        return transaction;
    }
    async updateTransaction(uuid, dto) {
        if (dto.categoryName && !dto.categoryUuid) {
            const category = await this.categoryService.findOrCreateByName(dto.categoryName, category_entity_1.CategoryType.BOTH);
            dto.categoryUuid = category.uuid;
        }
        const { categoryName, ...transactionData } = dto;
        let transaction = await this.update(uuid, transactionData);
        if (transaction.type === transaction_entity_1.TransactionType.INCOME) {
            try {
                const receiptData = await this.receiptService.updateReceipt(transaction);
                transaction.receiptMinioPath = receiptData.minioPath;
                transaction.receiptNumber = receiptData.receiptNumber;
                transaction.receiptYear = receiptData.receiptYear;
                transaction = await this.repo.save(transaction);
                console.log(`[TransactionService] Receipt updated for transaction ${transaction.uuid}: ${receiptData.minioPath}`);
            }
            catch (error) {
                console.error(`[TransactionService] Error updating receipt for transaction ${transaction.uuid}:`, error);
            }
        }
        else if (transaction.receiptMinioPath) {
            await this.receiptService.deleteReceipt(transaction.receiptMinioPath);
            transaction.receiptMinioPath = null;
            transaction.receiptNumber = null;
            transaction.receiptYear = null;
            transaction = await this.repo.save(transaction);
        }
        return transaction;
    }
    async deleteTransaction(uuid) {
        const transaction = await this.findByUuid(uuid);
        if (transaction && transaction.receiptMinioPath) {
            await this.receiptService.deleteReceipt(transaction.receiptMinioPath);
        }
        await this.delete(uuid);
    }
    async getReceiptStream(uuid) {
        const transaction = await this.findByUuid(uuid);
        if (!transaction || !transaction.receiptMinioPath) {
            throw new Error('Receipt not found');
        }
        return this.receiptService.getReceiptStream(transaction.receiptMinioPath);
    }
    async getStatistics(startDate, endDate, categoryUuid) {
        const queryBuilder = this.getQueryBuilder('t');
        if (startDate && endDate) {
            queryBuilder.andWhere('t.date BETWEEN :startDate AND :endDate', { startDate, endDate });
        }
        else if (startDate) {
            queryBuilder.andWhere('t.date >= :startDate', { startDate });
        }
        else if (endDate) {
            queryBuilder.andWhere('t.date <= :endDate', { endDate });
        }
        if (categoryUuid) {
            queryBuilder.andWhere('t.categoryUuid = :categoryUuid', { categoryUuid });
        }
        queryBuilder.leftJoinAndSelect('t.category', 'category');
        const transactions = await queryBuilder.getMany();
        let totalIncome = 0;
        let totalExpense = 0;
        const categoryMap = new Map();
        const monthMap = new Map();
        for (const t of transactions) {
            const amount = Number(t.amount);
            if (t.type === transaction_entity_1.TransactionType.INCOME) {
                totalIncome += amount;
            }
            else {
                totalExpense += amount;
            }
            const catKey = t.category?.uuid || 'uncategorized';
            const catName = t.category?.name || 'Senza categoria';
            if (!categoryMap.has(catKey)) {
                categoryMap.set(catKey, { categoryName: catName, total: 0, type: t.type });
            }
            const catEntry = categoryMap.get(catKey);
            catEntry.total += amount;
            const monthKey = new Date(t.date).toISOString().slice(0, 7);
            if (!monthMap.has(monthKey)) {
                monthMap.set(monthKey, { income: 0, expense: 0 });
            }
            const monthEntry = monthMap.get(monthKey);
            if (t.type === transaction_entity_1.TransactionType.INCOME) {
                monthEntry.income += amount;
            }
            else {
                monthEntry.expense += amount;
            }
        }
        return {
            totalIncome,
            totalExpense,
            balance: totalIncome - totalExpense,
            byCategory: Array.from(categoryMap.values()),
            byMonth: Array.from(monthMap.entries())
                .map(([month, data]) => ({ month, ...data }))
                .sort((a, b) => a.month.localeCompare(b.month)),
        };
    }
};
exports.TransactionService = TransactionService;
exports.TransactionService = TransactionService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [category_service_1.CategoryService,
        receipt_service_1.ReceiptService])
], TransactionService);
//# sourceMappingURL=transaction.service.js.map