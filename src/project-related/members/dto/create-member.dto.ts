import { IsString, IsOptional, IsEmail, IsEnum, IsDateString, IsBoolean } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { BaseSaveDto } from '../../../common/base-crud/base-save.dto';
import { Gender, MemberType, MemberStatus } from '../entities/member.entity';

export class CreateMemberDto extends BaseSaveDto {
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
  @IsDateString()
  birthDate?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  birthPlace?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  birthProvince?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  nationality?: string;

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
  province?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  postalCode?: string;

  @ApiProperty({ enum: MemberType, required: false })
  @IsOptional()
  @IsEnum(MemberType)
  memberType?: MemberType;

  @ApiProperty({ enum: MemberStatus, required: false })
  @IsOptional()
  @IsEnum(MemberStatus)
  status?: MemberStatus;

  @ApiProperty({ required: false, description: 'Se il tesserato è agonista' })
  @IsOptional()
  @IsBoolean()
  isCompetitor?: boolean;

  @ApiProperty({ required: false, description: 'Codice FISI' })
  @IsOptional()
  @IsString()
  fisiCode?: string;

  @ApiProperty({ required: false, description: 'Codice FIS' })
  @IsOptional()
  @IsString()
  fisCode?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsDateString()
  medicalExamExpiry?: string;

  @ApiProperty({ required: false, description: 'Visita medica agonistica' })
  @IsOptional()
  @IsBoolean()
  medicalExamCompetitive?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  profileImageUrl?: string;

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
  @IsDateString()
  membershipDate?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsDateString()
  membershipExpiry?: string;

  @ApiProperty({ required: false, description: 'UUID dello staff collegato (se il tesserato è anche membro operativo)' })
  @IsOptional()
  @IsString()
  staffUuid?: string;
}
