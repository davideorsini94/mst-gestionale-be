import { BaseService } from '../../common/base-crud/base.service';
import { Staff, StaffDocument, StaffDocumentType } from './entities/staff.entity';
import { CreateStaffDto } from './dto/create-staff.dto';
import { UpdateStaffDto } from './dto/update-staff.dto';
import { FindOptionsOrder } from 'typeorm';
import { FileService } from '../../common/files/file.service';
export declare class StaffService extends BaseService<Staff, CreateStaffDto, UpdateStaffDto> {
    private readonly fileService;
    private documentRepository;
    constructor(fileService: FileService);
    protected getDefaultOrder(): FindOptionsOrder<Staff>;
    findByEmail(email: string): Promise<Staff | null>;
    findByLinkedUserUuid(userUuid: string): Promise<Staff | null>;
    findByUuidWithDocuments(uuid: string): Promise<Staff & {
        profileImage?: any;
        documents: Array<any>;
    }>;
    uploadDocument(staffUuid: string, file: {
        filename: string;
        buffer: Buffer;
        mimetype: string;
    }, documentType: StaffDocumentType, description?: string): Promise<StaffDocument>;
    getDocuments(staffUuid: string): Promise<StaffDocument[]>;
    deleteDocument(documentUuid: string): Promise<void>;
    deleteProfileImage(staffUuid: string): Promise<Staff>;
    uploadProfileImage(staffUuid: string, file: {
        filename: string;
        buffer: Buffer;
        mimetype: string;
    }): Promise<Staff>;
}
