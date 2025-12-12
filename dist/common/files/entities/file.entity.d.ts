import { IctBaseEntity } from '../../base-crud/ict-base.entity';
export declare enum FileType {
    IMAGE = "IMAGE",
    DOCUMENT = "DOCUMENT",
    OTHER = "OTHER"
}
export declare class File extends IctBaseEntity {
    originalName: string;
    minioPath: string;
    mimeType: string;
    size: number;
    fileType: FileType;
    description: string;
}
