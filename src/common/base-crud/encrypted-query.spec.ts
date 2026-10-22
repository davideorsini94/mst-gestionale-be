import { BadRequestException } from '@nestjs/common';
import { Entity, IsNull, Not } from 'typeorm';
import { EncryptedColumn } from '../crypto/encrypted-column';
import { assertNoEncryptedWhere } from './encrypted-query';

@Entity('test_people')
class Person {
  @EncryptedColumn({ nullable: true })
  email: string;
}

const noRelations = () => null;

describe('assertNoEncryptedWhere', () => {
  it('consente IS NULL e IS NOT NULL sui campi cifrati', () => {
    expect(() => assertNoEncryptedWhere(Person, { email: IsNull() }, noRelations)).not.toThrow();
    expect(() => assertNoEncryptedWhere(Person, { email: Not(IsNull()) }, noRelations)).not.toThrow();
    expect(() => assertNoEncryptedWhere(Person, [{ email: Not(IsNull()) }], noRelations)).not.toThrow();
  });

  it('rifiuta i confronti sul valore cifrato', () => {
    expect(() => assertNoEncryptedWhere(Person, { email: 'a@b.it' }, noRelations)).toThrow(BadRequestException);
    expect(() => assertNoEncryptedWhere(Person, { email: Not('a@b.it') }, noRelations)).toThrow(BadRequestException);
  });
});
