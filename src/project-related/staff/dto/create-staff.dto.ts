import { IsString, IsOptional, IsEmail, IsEnum, IsDateString, IsBoolean } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { BaseSaveDto } from '../../../common/base-crud/base-save.dto';
import { StaffRole, StaffStatus, Gender, CoachLevel } from '../entities/staff.entity';

export class CreateStaffDto extends BaseSaveDto {
  @ApiProperty()
  @IsString()
  firstName: string;

  @ApiProperty()
  @IsString()
  lastName: string;

  @ApiProperty({ enum: Gender, required: false })
  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  fiscalCode?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  postalCode?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsDateString()
  birthDate?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  birthPlace?: string;

  @ApiProperty({ enum: StaffRole, required: false })
  @IsOptional()
  @IsEnum(StaffRole)
  staffRole?: StaffRole;

  @ApiProperty({ enum: StaffStatus, required: false })
  @IsOptional()
  @IsEnum(StaffStatus)
  status?: StaffStatus;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsDateString()
  hireDate?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  emergencyContact?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  emergencyPhone?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  drivingLicense?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsDateString()
  drivingLicenseExpiry?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  skiInstructorLicense?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsDateString()
  skiInstructorLicenseExpiry?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  firstAidCertificate?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsDateString()
  firstAidCertificateExpiry?: string;

  // Abilitazione Allenatore
  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  isCoach?: boolean;

  @ApiProperty({ enum: CoachLevel, required: false })
  @IsOptional()
  @IsEnum(CoachLevel)
  coachLevel?: CoachLevel;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsDateString()
  coachLicenseExpiry?: string;

  // Visita medica sportiva
  @ApiProperty({ required: false })
  @IsOptional()
  @IsDateString()
  medicalExamExpiry?: string;

  // Foto profilo
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  profileImageUrl?: string;
}
