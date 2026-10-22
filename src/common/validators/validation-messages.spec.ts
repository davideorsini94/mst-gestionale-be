import { ValidationPipe } from '@nestjs/common';
import { IsBoolean, IsEnum, IsOptional, IsString, Min } from 'class-validator';
import { italianValidationException } from './validation-messages';

enum Gender {
  M = 'M',
  F = 'F',
}

class Dto {
  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsBoolean()
  isCompetitor?: boolean;

  @IsOptional()
  @Min(1, { message: 'Almeno un posto' })
  seats?: number;
}

async function messages(body: unknown): Promise<string[]> {
  const pipe = new ValidationPipe({ exceptionFactory: italianValidationException });
  try {
    await pipe.transform(body, { type: 'body', metatype: Dto });
    return [];
  } catch (error: any) {
    return error.getResponse().message;
  }
}

describe('messaggi di validazione in italiano', () => {
  it('traduce i messaggi predefiniti di class-validator', async () => {
    expect(await messages({ gender: 'X', phone: 3, isCompetitor: 'si' })).toEqual([
      'gender: valore non valido (ammessi: M, F)',
      'phone: deve essere un testo',
      'isCompetitor: deve essere sì/no (true o false)',
    ]);
  });

  it('lascia i messaggi già scritti nei DTO', async () => {
    expect(await messages({ seats: 0 })).toEqual(['Almeno un posto']);
  });
});
