import { IsString, IsOptional, IsEmail, Matches, ValidateIf, IsEnum, IsBoolean } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { BaseSaveDto } from '../../../common/base-crud/base-save.dto';
import { IsCalendarDate } from '../../../common/validators/calendar-date';
import { hasEmailValue } from '../../../common/validators/person-fields';
import { Gender, MemberType, MemberStatus } from '../entities/member.entity';

export class CreateMemberDto extends BaseSaveDto {
  @ApiProperty()
  @IsString({ message: 'Il nome è obbligatorio' })
  @Matches(/\S/, { message: 'Il nome è obbligatorio' })
  firstName: string;

  @ApiProperty()
  @IsString({ message: 'Il cognome è obbligatorio' })
  @Matches(/\S/, { message: 'Il cognome è obbligatorio' })
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
  @IsCalendarDate()
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

  // "" o null tolgono l'email (salvata come null): si valida solo un indirizzo effettivamente inserito
  @ApiProperty({ required: false, nullable: true })
  @ValidateIf(hasEmailValue)
  @IsEmail({}, { message: 'Indirizzo email non valido' })
  email?: string | null;

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
  @IsCalendarDate()
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
  @IsCalendarDate()
  membershipDate?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsCalendarDate()
  membershipExpiry?: string;

  @ApiProperty({ required: false, description: 'UUID dello staff collegato (se il tesserato è anche membro operativo)' })
  @IsOptional()
  @IsString()
  staffUuid?: string;
}
