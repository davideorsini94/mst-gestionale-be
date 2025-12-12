import { StreamableFile } from '@nestjs/common';
import { FastifyReply } from 'fastify';
import { FileService } from './file.service';
export declare class FileController {
    private readonly fileService;
    constructor(fileService: FileService);
    getFile(uuid: string, res: FastifyReply): Promise<StreamableFile>;
    downloadFile(uuid: string, res: FastifyReply): Promise<StreamableFile>;
    deleteFile(uuid: string): Promise<{
        success: boolean;
    }>;
}
