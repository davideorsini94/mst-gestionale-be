import { ValidationPipe } from '@nestjs/common';
import { CreateMemberDto } from './create-member.dto';
import { UpdateMemberDto } from './update-member.dto';
import { CreateStaffDto } from '../../staff/dto/create-staff.dto';
import { UpdateStaffDto } from '../../staff/dto/update-staff.dto';
import { CreateVehicleDto } from '../../vehicles/dto/create-vehicle.dto';
import { UpdateVehicleDto } from '../../vehicles/dto/update-vehicle.dto';
import { CreateTransactionDto } from '../../transactions/dto/create-transaction.dto';

// Stessa configurazione di main.ts (senza whitelist né transform)
const pipe = new ValidationPipe();
const run = (metatype: any, value: any) => pipe.transform(value, { type: 'body', metatype });

describe('validazione DTO anagrafiche, veicoli e movimenti', () => {
  it('tesserato: email vuota accettata, email sbagliata rifiutata', async () => {
    await expect(run(UpdateMemberDto, { email: '' })).resolves.toEqual({ email: '' });
    await expect(run(UpdateMemberDto, { email: null })).resolves.toEqual({ email: null });
    await expect(run(UpdateMemberDto, { email: 'non-una-email' })).rejects.toThrow();
  });

  it('tesserato: nome e cognome non vuoti', async () => {
    await expect(run(CreateMemberDto, { firstName: '  ', lastName: 'Rossi' })).rejects.toThrow();
    await expect(run(CreateMemberDto, { firstName: 'Mario', lastName: 'Rossi' })).resolves.toBeDefined();
  });

  it('tesserato: date inesistenti o con anno negativo rifiutate', async () => {
    await expect(run(UpdateMemberDto, { birthDate: '2026-02-30' })).rejects.toThrow();
    await expect(run(UpdateMemberDto, { medicalExamExpiry: '-2026-01-01' })).rejects.toThrow();
    await expect(run(UpdateMemberDto, { birthDate: '2010-05-31', medicalExamExpiry: null })).resolves.toBeDefined();
  });

  it('staff: coachLevel e linkedUserUuid azzerabili con null', async () => {
    await expect(run(UpdateStaffDto, { coachLevel: null, linkedUserUuid: null })).resolves.toEqual({
      coachLevel: null,
      linkedUserUuid: null,
    });
    await expect(run(UpdateStaffDto, { linkedUserUuid: 'abc' })).rejects.toThrow();
    await expect(run(CreateStaffDto, { firstName: 'A', lastName: 'B', drivingLicenseExpiry: '2026-04-31' })).rejects.toThrow();
  });

  it('veicolo: nome e targa obbligatori, posti interi >= 1, date valide', async () => {
    await expect(run(CreateVehicleDto, { name: 'Pulmino' })).rejects.toThrow();
    await expect(run(CreateVehicleDto, { name: 'Pulmino', licensePlate: 'ab 123 cd', seats: 0 })).rejects.toThrow();
    await expect(run(CreateVehicleDto, { name: 'Pulmino', licensePlate: 'ab 123 cd', seats: 8.5 })).rejects.toThrow();
    await expect(run(UpdateVehicleDto, { taxExpiry: '2026-02-30' })).rejects.toThrow();
    await expect(
      run(UpdateVehicleDto, { assignedStaffUuid: null, fuelConsumption: '6.50', seats: 9, taxExpiry: '2026-12-31' }),
    ).resolves.toBeDefined();
  });

  it('movimento: 0,005 € vale 0,01 € (arrotondato prima della validazione)', async () => {
    await expect(run(CreateTransactionDto, { type: 'INCOME', amount: 0.005, date: '2026-01-10' })).resolves.toBeDefined();
    await expect(run(CreateTransactionDto, { type: 'INCOME', amount: 0.004, date: '2026-01-10' })).rejects.toThrow();
    await expect(run(CreateTransactionDto, { type: 'INCOME', amount: 10, date: '2026-02-30' })).rejects.toThrow();
  });
});
