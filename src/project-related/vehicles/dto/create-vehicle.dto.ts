import {
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { BaseSaveDto } from '../../../common/base-crud/base-save.dto';
import { IsCalendarDate } from '../../../common/validators/calendar-date';
import { VehicleStatus, VehicleType } from '../entities/vehicle.entity';

/** Veicolo: prima il body era un Partial<Vehicle> senza nessuna validazione (date e numeri arrivavano al DB). */
export class CreateVehicleDto extends BaseSaveDto {
  @ApiProperty()
  @IsString({ message: 'Il nome è obbligatorio' })
  @Matches(/\S/, { message: 'Il nome è obbligatorio' })
  name: string;

  @ApiProperty({ enum: VehicleType, required: false })
  @IsOptional()
  @IsEnum(VehicleType, { message: 'Tipo di veicolo non valido' })
  type?: VehicleType;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  brand?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  model?: string;

  @ApiProperty({ description: 'Salvata in maiuscolo e senza spazi' })
  @IsString({ message: 'La targa è obbligatoria' })
  @Matches(/\S/, { message: 'La targa è obbligatoria' })
  licensePlate: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsInt({ message: 'I posti devono essere un numero intero' })
  @Min(1, { message: 'Il veicolo deve avere almeno 1 posto' })
  @Max(100, { message: 'Numero di posti non valido' })
  seats?: number | null;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsInt({ message: "L'anno deve essere un numero intero" })
  @Min(1900, { message: 'Anno non valido' })
  @Max(2199, { message: 'Anno non valido' })
  year?: number | null;

  @ApiProperty({ enum: VehicleStatus, required: false })
  @IsOptional()
  @IsEnum(VehicleStatus, { message: 'Stato del veicolo non valido' })
  status?: VehicleStatus;

  @ApiProperty({ required: false, description: 'AAAA-MM-GG' })
  @IsOptional()
  @IsCalendarDate()
  insuranceExpiry?: string | null;

  @ApiProperty({ required: false, description: 'AAAA-MM-GG' })
  @IsOptional()
  @IsCalendarDate()
  inspectionExpiry?: string | null;

  @ApiProperty({ required: false, description: 'AAAA-MM-GG' })
  @IsOptional()
  @IsCalendarDate()
  taxExpiry?: string | null;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsInt({ message: 'I km devono essere un numero intero' })
  @Min(0, { message: 'I km non possono essere negativi' })
  currentKm?: number | null;

  @ApiProperty({ required: false, description: 'AAAA-MM-GG' })
  @IsOptional()
  @IsCalendarDate()
  lastMaintenanceDate?: string | null;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsInt({ message: 'I km del prossimo tagliando devono essere un numero intero' })
  @Min(0, { message: 'I km non possono essere negativi' })
  nextMaintenanceKm?: number | null;

  // la colonna decimal torna al client come stringa ("6.50") e il form la rimanda così: si valida il numero
  @ApiProperty({ required: false })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'Il consumo deve essere un numero' })
  @Min(0, { message: 'Il consumo non può essere negativo' })
  @Max(99999999, { message: 'Consumo non valido' })
  fuelConsumption?: number | null;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  fuelType?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  imageUrl?: string;

  // null (o "") esplicito toglie l'assegnazione; un campo assente lascia quella attuale
  @ApiProperty({ required: false, nullable: true })
  @ValidateIf((o) => o.assignedStaffUuid !== null && o.assignedStaffUuid !== undefined && o.assignedStaffUuid !== '')
  @IsUUID('all', { message: 'Staff assegnato non valido' })
  assignedStaffUuid?: string | null;
}
