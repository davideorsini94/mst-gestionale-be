import { StreamableFile } from '@nestjs/common';
import { StaffService } from './staff.service';
import { CreateStaffDto } from './dto/create-staff.dto';
import { UpdateStaffDto } from './dto/update-staff.dto';
import { FastifyRequest, FastifyReply } from 'fastify';
import { FileService } from '../../common/files/file.service';
export declare class StaffController {
    private readonly staffService;
    private readonly fileService;
    constructor(staffService: StaffService, fileService: FileService);
    findAll(filters?: string): Promise<[import("./entities/staff.entity").Staff[], number]>;
    getMyProfile(req: FastifyRequest): Promise<(import("./entities/staff.entity").Staff & {
        profileImage?: any;
        documents: Array<any>;
    }) | {
        found: boolean;
        message: string;
    }>;
    findOne(uuid: string): Promise<import("./entities/staff.entity").Staff & {
        profileImage?: any;
        documents: Array<any>;
    }>;
    getProfileImage(uuid: string, res: FastifyReply): Promise<StreamableFile | {
        error: string;
    }>;
    create(createStaffDto: CreateStaffDto): Promise<import("./entities/staff.entity").Staff>;
    updateMyProfile(req: FastifyRequest, updateStaffDto: UpdateStaffDto): Promise<import("./entities/staff.entity").Staff>;
    update(uuid: string, updateStaffDto: UpdateStaffDto): Promise<import("./entities/staff.entity").Staff>;
    remove(uuid: string): Promise<import("./entities/staff.entity").Staff>;
    uploadProfileImage(uuid: string, req: FastifyRequest): Promise<import("./entities/staff.entity").Staff>;
    deleteProfileImage(uuid: string): Promise<import("./entities/staff.entity").Staff>;
    uploadDocument(uuid: string, req: FastifyRequest): Promise<import("./entities/staff.entity").StaffDocument>;
    getDocuments(uuid: string): Promise<import("./entities/staff.entity").StaffDocument[]>;
    downloadDocument(documentUuid: string, res: FastifyReply): Promise<{
        message: string;
    }>;
    deleteDocument(documentUuid: string): Promise<{
        success: boolean;
    }>;
}
