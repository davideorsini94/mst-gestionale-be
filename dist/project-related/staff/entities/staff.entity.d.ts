import { IctBaseEntity } from '../../../common/base-crud/ict-base.entity';
export declare enum StaffRole {
    INSTRUCTOR = "INSTRUCTOR",
    DRIVER = "DRIVER",
    ADMIN = "ADMIN",
    VOLUNTEER = "VOLUNTEER",
    OTHER = "OTHER"
}
export declare enum StaffStatus {
    ACTIVE = "ACTIVE",
    INACTIVE = "INACTIVE",
    ON_LEAVE = "ON_LEAVE"
}
export declare enum Gender {
    MALE = "M",
    FEMALE = "F"
}
export declare enum CoachLevel {
    LEVEL_1 = "I",
    LEVEL_2 = "II",
    LEVEL_3 = "III",
    LEVEL_4 = "IV",
    NATIONAL = "NAZIONALE"
}
export declare class Staff extends IctBaseEntity {
    firstName: string;
    lastName: string;
    gender: Gender;
    fiscalCode: string;
    email: string;
    phone: string;
    address: string;
    city: string;
    postalCode: string;
    birthDate: Date;
    birthPlace: string;
    staffRole: StaffRole;
    status: StaffStatus;
    hireDate: Date;
    endDate: Date;
    emergencyContact: string;
    emergencyPhone: string;
    notes: string;
    profileImageUuid: string;
    linkedUserUuid: string;
    drivingLicense: string;
    drivingLicenseExpiry: Date;
    skiInstructorLicense: string;
    skiInstructorLicenseExpiry: Date;
    firstAidCertificate: string;
    firstAidCertificateExpiry: Date;
    isCoach: boolean;
    coachLevel: CoachLevel;
    coachLicenseExpiry: Date;
    medicalExamExpiry: Date;
    documents: StaffDocument[];
}
export declare enum StaffDocumentType {
    MEDICAL_EXAM = "MEDICAL_EXAM",
    COACH_LICENSE = "COACH_LICENSE",
    DRIVING_LICENSE = "DRIVING_LICENSE",
    FIRST_AID = "FIRST_AID",
    OTHER = "OTHER"
}
export declare class StaffDocument extends IctBaseEntity {
    documentType: StaffDocumentType;
    description: string;
    fileUuid: string;
    staff: Staff;
    staffUuid: string;
}
