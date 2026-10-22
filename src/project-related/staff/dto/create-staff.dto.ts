import { IsString, IsOptional, IsEmail, Matches, ValidateIf, IsEnum, IsBoolean, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { BaseSaveDto } from '../../../common/base-crud/base-save.dto';
import { IsCalendarDate } from '../../../common/validators/calendar-date';
import { hasEmailValue } from '../../../common/validators/person-fields';
import { StaffRole, StaffStatus, Gender, CoachLevel } from '../entities/staff.entity';

export class CreateStaffDto extends BaseSaveDto {
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
  postalCode?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsCalendarDate()
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
  @IsCalendarDate()
  hireDate?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsCalendarDate()
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
  @IsCalendarDate()
  drivingLicenseExpiry?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  skiInstructorLicense?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsCalendarDate()
  skiInstructorLicenseExpiry?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  firstAidCertificate?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsCalendarDate()
  firstAidCertificateExpiry?: string;

  // Abilitazione Allenatore
  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  isCoach?: boolean;

  // null (o "") esplicito = nessun livello: il servizio lo salva come NULL
  @ApiProperty({ enum: CoachLevel, required: false, nullable: true })
  @ValidateIf((o) => o.coachLevel !== null && o.coachLevel !== undefined && o.coachLevel !== '')
  @IsEnum(CoachLevel, { message: 'Livello allenatore non valido' })
  coachLevel?: CoachLevel | null;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsCalendarDate()
  coachLicenseExpiry?: string;

  // Visita medica sportiva
  @ApiProperty({ required: false })
  @IsOptional()
  @IsCalendarDate()
  medicalExamExpiry?: string;

  // Utente collegato (login): null (o "") esplicito scollega il profilo
  @ApiProperty({ required: false, nullable: true })
  @ValidateIf((o) => o.linkedUserUuid !== null && o.linkedUserUuid !== undefined && o.linkedUserUuid !== '')
  @IsUUID('all', { message: 'Utente collegato non valido' })
  linkedUserUuid?: string | null;

  // Foto profilo
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  profileImageUrl?: string;
}
