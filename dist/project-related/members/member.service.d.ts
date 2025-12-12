import { BaseService } from '../../common/base-crud/base.service';
import { Member, MemberDocument, MemberDocumentType, Gender } from './entities/member.entity';
import { CreateMemberDto } from './dto/create-member.dto';
import { UpdateMemberDto } from './dto/update-member.dto';
import { FindOptionsOrder } from 'typeorm';
import { FileService } from '../../common/files/file.service';
export interface HotelBookingEntry {
    firstName: string;
    lastName: string;
    birthDate: Date;
    birthPlace: string;
    gender: Gender;
}
export interface HotelBookingList {
    males: HotelBookingEntry[];
    females: HotelBookingEntry[];
    generatedAt: Date;
    totalCount: number;
}
export declare class MemberService extends BaseService<Member, CreateMemberDto, UpdateMemberDto> {
    private readonly fileService;
    private documentRepository;
    constructor(fileService: FileService);
    protected getDefaultOrder(): FindOptionsOrder<Member>;
    findByUuidWithDocuments(uuid: string): Promise<Member & {
        profileImage?: any;
        documents: Array<any>;
    }>;
    findCompetitors(): Promise<Member[]>;
    generateHotelBookingList(memberUuids: string[]): Promise<HotelBookingList>;
    uploadDocument(memberUuid: string, file: {
        filename: string;
        buffer: Buffer;
        mimetype: string;
    }, documentType: MemberDocumentType, description?: string, expiryDate?: Date): Promise<MemberDocument>;
    getDocuments(memberUuid: string): Promise<MemberDocument[]>;
    deleteDocument(documentUuid: string): Promise<void>;
    deleteProfileImage(memberUuid: string): Promise<Member>;
    uploadProfileImage(memberUuid: string, file: {
        filename: string;
        buffer: Buffer;
        mimetype: string;
    }): Promise<Member>;
}
