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
exports.ReceiptService = void 0;
const common_1 = require("@nestjs/common");
const PDFDocument = require("pdfkit");
const path = require("path");
const transaction_entity_1 = require("./entities/transaction.entity");
const minio_service_1 = require("../../minio/minio.service");
const data_source_1 = require("../../datasources/data-source");
let ReceiptService = class ReceiptService {
    constructor(minioService) {
        this.minioService = minioService;
        this.transactionRepo = data_source_1.dataSource.getRepository(transaction_entity_1.Transaction);
    }
    getAssetsPath() {
        return path.join(__dirname, 'assets');
    }
    async getNextReceiptNumber(year) {
        const result = await this.transactionRepo
            .createQueryBuilder('t')
            .select('MAX(t.receiptNumber)', 'maxNumber')
            .where('t.receiptYear = :year', { year })
            .andWhere('t.type = :type', { type: transaction_entity_1.TransactionType.INCOME })
            .getRawOne();
        return (result?.maxNumber || 0) + 1;
    }
    async generateReceiptPdf(transaction) {
        return new Promise(async (resolve, reject) => {
            try {
                const doc = new PDFDocument({
                    size: 'A4',
                    margin: 50,
                });
                const chunks = [];
                doc.on('data', (chunk) => chunks.push(chunk));
                doc.on('end', () => resolve(Buffer.concat(chunks)));
                doc.on('error', reject);
                const assetsPath = this.getAssetsPath();
                const logoPath = path.join(assetsPath, 'MST2.jpg');
                const stampPath = path.join(assetsPath, 'Timbro SSD A RL.jpg');
                doc.image(logoPath, 50, 30, { width: 300 });
                doc.moveDown(6);
                const receiptNumber = transaction.receiptNumber || 1;
                const transactionDate = new Date(transaction.date);
                const formattedDate = `${transactionDate.getDate().toString().padStart(2, '0')}/${(transactionDate.getMonth() + 1).toString().padStart(2, '0')}/${transactionDate.getFullYear()}`;
                doc.fontSize(12);
                doc.text('', 350, 80);
                doc.rect(350, 80, 180, 25).stroke();
                doc.text(`Ricevuta N°: ${receiptNumber}`, 355, 88, { width: 170, align: 'right' });
                doc.rect(350, 105, 180, 25).stroke();
                doc.text(`Data: ${formattedDate}`, 355, 113, { width: 170, align: 'right' });
                doc.moveDown(4);
                const startY = 180;
                doc.text('Tipologia di pagamento:', 50, startY);
                doc.rect(200, startY - 5, 340, 25).stroke();
                const paymentMethodLabel = this.getPaymentMethodLabel(transaction.paymentMethod);
                doc.text(paymentMethodLabel.toUpperCase(), 205, startY, { width: 330 });
                doc.text('Ricevuti da:', 50, startY + 35);
                doc.rect(200, startY + 30, 340, 25).stroke();
                doc.text((transaction.subject || '').toUpperCase(), 205, startY + 35, { width: 330 });
                doc.text('Importo:', 50, startY + 70);
                doc.rect(200, startY + 65, 340, 25).stroke();
                doc.text(`€ ${Number(transaction.amount).toFixed(2)}`, 205, startY + 70, { width: 330 });
                doc.text('per:', 50, startY + 105);
                doc.rect(200, startY + 100, 340, 25).stroke();
                doc.text(transaction.notes || '', 205, startY + 105, { width: 330 });
                doc.rect(50, startY + 145, 50, 25).stroke();
                doc.text('TOTALE', 55, startY + 152);
                doc.rect(100, startY + 145, 120, 25).stroke();
                doc.text(`€ ${Number(transaction.amount).toFixed(2)}`, 105, startY + 152, { width: 110, align: 'center' });
                doc.image(stampPath, 300, startY + 170, { width: 200 });
                doc.end();
            }
            catch (error) {
                reject(error);
            }
        });
    }
    getPaymentMethodLabel(method) {
        const labels = {
            CASH: 'Contanti',
            BANK_TRANSFER: 'Bonifico Bancario',
            CREDIT_CARD: 'Carta di Credito',
            CHECK: 'Assegno',
            OTHER: 'Altro',
        };
        return labels[method] || method;
    }
    async createAndUploadReceipt(transaction) {
        const transactionDate = new Date(transaction.date);
        const year = transactionDate.getFullYear();
        const receiptNumber = await this.getNextReceiptNumber(year);
        transaction.receiptNumber = receiptNumber;
        transaction.receiptYear = year;
        const pdfBuffer = await this.generateReceiptPdf(transaction);
        const sanitizedSubject = (transaction.subject || 'unknown').replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '');
        const dateStr = `${year}${(transactionDate.getMonth() + 1).toString().padStart(2, '0')}${transactionDate.getDate().toString().padStart(2, '0')}`;
        const filename = `ricevute/${year}/${receiptNumber}-${sanitizedSubject}_${dateStr}.pdf`;
        const minioPath = await this.minioService.uploadFile(filename, pdfBuffer, 'application/pdf');
        return { minioPath, receiptNumber, receiptYear: year };
    }
    async updateReceipt(transaction) {
        if (transaction.receiptMinioPath) {
            try {
                await this.minioService.deleteFile(transaction.receiptMinioPath);
            }
            catch (error) {
                console.error('Error deleting old receipt:', error);
            }
        }
        const transactionDate = new Date(transaction.date);
        const year = transactionDate.getFullYear();
        let receiptNumber = transaction.receiptNumber;
        let receiptYear = transaction.receiptYear;
        if (receiptYear !== year) {
            receiptNumber = await this.getNextReceiptNumber(year);
            receiptYear = year;
        }
        transaction.receiptNumber = receiptNumber;
        transaction.receiptYear = receiptYear;
        const pdfBuffer = await this.generateReceiptPdf(transaction);
        const sanitizedSubject = (transaction.subject || 'unknown').replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '');
        const dateStr = `${year}${(transactionDate.getMonth() + 1).toString().padStart(2, '0')}${transactionDate.getDate().toString().padStart(2, '0')}`;
        const filename = `ricevute/${year}/${receiptNumber}-${sanitizedSubject}_${dateStr}.pdf`;
        const minioPath = await this.minioService.uploadFile(filename, pdfBuffer, 'application/pdf');
        return { minioPath, receiptNumber, receiptYear };
    }
    async deleteReceipt(minioPath) {
        if (minioPath) {
            try {
                await this.minioService.deleteFile(minioPath);
                console.log(`[ReceiptService] Receipt deleted from MinIO: ${minioPath}`);
            }
            catch (error) {
                console.error(`[ReceiptService] Error deleting receipt: ${minioPath}`, error);
            }
        }
    }
    async getReceiptStream(minioPath) {
        return this.minioService.getFile(minioPath);
    }
};
exports.ReceiptService = ReceiptService;
exports.ReceiptService = ReceiptService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [minio_service_1.MinioService])
], ReceiptService);
//# sourceMappingURL=receipt.service.js.map