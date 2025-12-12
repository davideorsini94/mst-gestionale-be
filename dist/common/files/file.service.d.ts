import { File } from './entities/file.entity';
import { MinioService } from '../../minio/minio.service';
export declare class FileService {
    private readonly minioService;
    private readonly fileRepository;
    constructor(minioService: MinioService);
    uploadFile(file: {
        filename: string;
        buffer: Buffer;
        mimetype: string;
    }, folder: string, description?: string): Promise<File>;
    getFileStream(fileUuid: string): Promise<{
        stream: any;
        mimeType: string;
        originalName: string;
    }>;
    findByUuid(uuid: string): Promise<File | null>;
    deleteFileFromMinio(minioPath: string): Promise<void>;
    deleteFileRecord(fileUuid: string): Promise<void>;
    deleteFile(fileUuid: string): Promise<void>;
    private getFileType;
}
