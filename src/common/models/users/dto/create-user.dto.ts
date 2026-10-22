import { IsString, IsOptional, IsEmail, IsBoolean, Matches, ValidateIf } from 'class-validator';
import { hasEmailValue } from '../../../validators/person-fields';
import { ApiProperty } from '@nestjs/swagger';
import { BaseSaveDto } from '../../../base-crud/base-save.dto';

export class CreateUserDto extends BaseSaveDto {
  @ApiProperty()
  @IsString({ message: 'Il nome utente è obbligatorio' })
  @Matches(/\S/, { message: 'Il nome utente è obbligatorio' })
  username: string;

  @ApiProperty()
  @IsString()
  password: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  firstName?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  lastName?: string;

  // "" o null tolgono l'email
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
  @IsBoolean()
  isActive?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  roleCode?: string;
}
