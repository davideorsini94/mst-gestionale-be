import { IctBaseEntity } from '../../../common/base-crud/ict-base.entity';
import { Staff } from '../../staff/entities/staff.entity';
export declare enum Gender {
    MALE = "M",
    FEMALE = "F"
}
export declare enum MemberType {
    ATHLETE = "ATHLETE",
    PARENT = "PARENT",
    MEMBER = "MEMBER"
}
export declare enum MemberStatus {
    ACTIVE = "ACTIVE",
    INACTIVE = "INACTIVE",
    SUSPENDED = "SUSPENDED"
}
export declare class Member extends IctBaseEntity {
    firstName: string;
    lastName: string;
    gender: Gender;
    fiscalCode: string;
    birthDate: Date;
    birthPlace: string;
    birthProvince: string;
    nationality: string;
    email: string;
    phone: string;
    address: string;
    city: string;
    province: string;
    postalCode: string;
    memberType: MemberType;
    status: MemberStatus;
    isCompetitor: boolean;
    fisiCode: string;
    fisCode: string;
    medicalExamExpiry: Date;
    medicalExamCompetitive: boolean;
    profileImageUuid: string;
    emergencyContact: string;
    emergencyPhone: string;
    notes: string;
    membershipDate: Date;
    membershipExpiry: Date;
    staff: Staff;
    staffUuid: string;
    documents: MemberDocument[];
}
export declare enum MemberDocumentType {
    MEDICAL_EXAM = "MEDICAL_EXAM",
    IDENTITY_DOCUMENT = "IDENTITY_DOCUMENT",
    FISI_CARD = "FISI_CARD",
    FIS_CARD = "FIS_CARD",
    PHOTO = "PHOTO",
    OTHER = "OTHER"
}
export declare class MemberDocument extends IctBaseEntity {
    documentType: MemberDocumentType;
    description: string;
    expiryDate: Date;
    fileUuid: string;
    member: Member;
    memberUuid: string;
}
