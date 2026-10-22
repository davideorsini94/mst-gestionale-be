import { IsString, IsOptional, IsEnum, IsNumber, IsBoolean, Max, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { roundMoney } from '../money';
import { IsCalendarDate } from '../../../common/validators/calendar-date';
import { BaseSaveDto } from '../../../common/base-crud/base-save.dto';
import { TransactionType, PaymentMethod } from '../entities/transaction.entity';

/** Validazione sull'importo già arrotondato ai centesimi (lo stesso che verrà salvato): 0,005 vale 0,01. */
const RoundedMoney = () => Transform(({ value }) => (typeof value === 'number' ? roundMoney(value) : value));

export class CreateTransactionDto extends BaseSaveDto {
  @ApiProperty({ enum: TransactionType })
  @IsEnum(TransactionType)
  type: TransactionType;

  @ApiProperty()
  @RoundedMoney()
  @IsNumber({}, { message: "L'importo deve essere un numero" })
  @Min(0.01, { message: "L'importo deve essere di almeno 0,01 €" })
  @Max(99999999.99, { message: 'Importo troppo grande' })
  amount: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @RoundedMoney()
  @IsNumber({}, { message: "L'importo originale deve essere un numero" })
  @Min(0, { message: "L'importo originale non può essere negativo" })
  @Max(99999999.99, { message: 'Importo originale troppo grande' })
  originalAmount?: number;

  @ApiProperty({ description: 'AAAA-MM-GG' })
  @IsCalendarDate({ message: 'Data non valida: usa il formato AAAA-MM-GG con una data esistente' })
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
