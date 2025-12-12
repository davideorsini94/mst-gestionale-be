import { StreamableFile } from '@nestjs/common';
import { MemberService } from './member.service';
import { CreateMemberDto } from './dto/create-member.dto';
import { UpdateMemberDto } from './dto/update-member.dto';
import { FastifyRequest, FastifyReply } from 'fastify';
import { FileService } from '../../common/files/file.service';
export declare class MemberController {
    private readonly memberService;
    private readonly fileService;
    constructor(memberService: MemberService, fileService: FileService);
    findAll(filters?: string): Promise<[import("./entities/member.entity").Member[], number]>;
    findCompetitors(): Promise<import("./entities/member.entity").Member[]>;
    findOne(uuid: string): Promise<import("./entities/member.entity").Member & {
        profileImage?: any;
        documents: Array<any>;
    }>;
    getProfileImage(uuid: string, res: FastifyReply): Promise<StreamableFile | {
        error: string;
    }>;
    create(createMemberDto: CreateMemberDto): Promise<import("./entities/member.entity").Member>;
    update(uuid: string, updateMemberDto: UpdateMemberDto): Promise<import("./entities/member.entity").Member>;
    remove(uuid: string): Promise<import("./entities/member.entity").Member>;
    generateHotelBookingList(body: {
        memberUuids: string[];
    }): Promise<import("./member.service").HotelBookingList>;
    uploadProfileImage(uuid: string, req: FastifyRequest): Promise<import("./entities/member.entity").Member>;
    deleteProfileImage(uuid: string): Promise<import("./entities/member.entity").Member>;
    uploadDocument(uuid: string, req: FastifyRequest): Promise<import("./entities/member.entity").MemberDocument>;
    getDocuments(uuid: string): Promise<import("./entities/member.entity").MemberDocument[]>;
    downloadDocument(documentUuid: string, res: FastifyReply): Promise<{
        message: string;
    }>;
    deleteDocument(documentUuid: string): Promise<{
        success: boolean;
    }>;
}
