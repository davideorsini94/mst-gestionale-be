"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MinioModule = void 0;
const common_1 = require("@nestjs/common");
const nestjs_minio_client_1 = require("nestjs-minio-client");
const minio_service_1 = require("./minio.service");
const sanitizeEndpoint = (endpoint) => {
    return endpoint.replace(/^https?:\/\//, '');
};
const minioOptions = {
    endPoint: sanitizeEndpoint(process.env.MINIO_HOST || 'localhost'),
    port: parseInt(process.env.MINIO_PORT || '9000'),
    useSSL: process.env.MINIO_USE_SSL === 'true',
    accessKey: process.env.MINIO_ACCESS_KEY || 'minioadmin',
    secretKey: process.env.MINIO_SECRET_KEY || 'minioadmin',
};
let MinioModule = class MinioModule {
};
exports.MinioModule = MinioModule;
exports.MinioModule = MinioModule = __decorate([
    (0, common_1.Module)({
        imports: [nestjs_minio_client_1.MinioModule.register(minioOptions)],
        providers: [minio_service_1.MinioService],
        exports: [minio_service_1.MinioService],
    })
], MinioModule);
//# sourceMappingURL=minio.module.js.map