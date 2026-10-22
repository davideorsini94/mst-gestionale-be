import { IsString, IsOptional, IsEnum, IsNumber, IsDateString, IsBoolean, Matches, Max, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { BaseSaveDto } from '../../../common/base-crud/base-save.dto';
import { TransactionType, PaymentMethod } from '../entities/transaction.entity';

export class CreateTransactionDto extends BaseSaveDto {
  @ApiProperty({ enum: TransactionType })
  @IsEnum(TransactionType)
  type: TransactionType;

  @ApiProperty()
  @IsNumber({}, { message: "L'importo deve essere un numero" })
  @Min(0.01, { message: "L'importo deve essere di almeno 0,01 €" })
  @Max(99999999.99, { message: 'Importo troppo grande' })
  amount: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber({}, { message: "L'importo originale deve essere un numero" })
  @Min(0, { message: "L'importo originale non può essere negativo" })
  @Max(99999999.99, { message: 'Importo originale troppo grande' })
  originalAmount?: number;

  @ApiProperty({ description: 'AAAA-MM-GG' })
  @IsDateString()
  @Matches(/^\d{4}-\d{2}-\d{2}/, { message: 'La data deve essere nel formato AAAA-MM-GG' })
  date: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  subject?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  categoryUuid?: string;

  @ApiProperty({ required: false, description: 'Nome categoria (crea automaticamente se non esiste)' })
  @IsOptional()
  @IsString()
  categoryName?: string;

  @ApiProperty({ enum: PaymentMethod, required: false })
  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  reference?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  invoiceNumber?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  counterpart?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  notes2?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  budgetItem?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  isRecurring?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  recurringPeriod?: string;
}
