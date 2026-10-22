import { Injectable, Inject, forwardRef, BadRequestException, ConflictException } from '@nestjs/common';
import { BaseService } from '../../common/base-crud/base.service';
import { Vehicle } from './entities/vehicle.entity';
import { FindOptionsOrder, Not } from 'typeorm';
import { ReminderService } from '../reminders/reminder.service';
import { CreateVehicleDto } from './dto/create-vehicle.dto';
import { UpdateVehicleDto } from './dto/update-vehicle.dto';
import { calendarRange, toCalendarDay } from '../../common/validators/calendar-date';

/** Targa salvata in un solo formato: maiuscolo e senza spazi ("ab 123 cd" e "AB123CD" sono la stessa targa). */
export function normalizePlate(plate: string): string {
  return String(plate ?? '').replace(/\s+/g, '').toUpperCase();
}

@Injectable()
export class VehicleService extends BaseService<Vehicle, CreateVehicleDto, UpdateVehicleDto> {
  constructor(
    @Inject(forwardRef(() => ReminderService))
    private readonly reminderService: ReminderService,
  ) {
    super(Vehicle);
  }

  async delete(uuid: string): Promise<Vehicle> {
    await this.reminderService.cancelRemindersForEntity(uuid);
    return super.delete(uuid);
  }

  protected getDefaultOrder(): FindOptionsOrder<Vehicle> {
    return { name: 'ASC' };
  }

  async create(dto: CreateVehicleDto): Promise<Vehicle> {
    await this.prepareDto(dto, null);
    const vehicle = await super.create(dto);
    await this.reminderService.updateVehicleReminders(vehicle);
    return vehicle;
  }

  async update(uuid: string, dto: UpdateVehicleDto): Promise<Vehicle> {
    await this.prepareDto(dto, uuid);
    const vehicle = await super.update(uuid, dto);
    await this.reminderService.updateVehicleReminders(vehicle);
    return vehicle;
  }

  /** Normalizza targa e nome, controlla targa unica e staff assegnato esistente. */
  private async prepareDto(dto: CreateVehicleDto | UpdateVehicleDto, uuid: string | null): Promise<void> {
    const data = dto as Record<string, any>;
    // conta solo assignedStaffUuid: un oggetto assignedStaff nel body avrebbe la precedenza sul null esplicito
    delete data.assignedStaff;

    if ('name' in data) {
      if (typeof data.name !== 'string' || !data.name.trim()) throw new BadRequestException('Il nome è obbligatorio');
      data.name = data.name.trim();
    }
    if ('licensePlate' in data) {
      const plate = typeof data.licensePlate === 'string' ? normalizePlate(data.licensePlate) : '';
      if (!plate) throw new BadRequestException('La targa è obbligatoria');
      data.licensePlate = plate;
      const where = uuid ? { licensePlate: plate, uuid: Not(uuid) } : { licensePlate: plate };
      if (await this.repo.exists({ where })) {
        throw new ConflictException(`Esiste già un veicolo con targa ${plate}`);
      }
    }
    // un campo numerico svuotato può arrivare come "": per il DB è "nessun valore"
    for (const field of ['seats', 'year', 'currentKm', 'nextMaintenanceKm', 'fuelConsumption']) {
      if (data[field] === '') data[field] = null;
    }
    if ('assignedStaffUuid' in data) {
      if (data.assignedStaffUuid === '' || data.assignedStaffUuid === undefined) data.assignedStaffUuid = null;
      if (data.assignedStaffUuid) {
        const [staff] = await this.repo.query(`SELECT 1 FROM staff WHERE uuid = $1`, [data.assignedStaffUuid]);
        if (!staff) throw new BadRequestException('Lo staff assegnato non esiste');
      }
    }
  }

  async getExpiringDocuments(daysAhead: number = 30): Promise<{
    insurance: Vehicle[];
    inspection: Vehicle[];
    tax: Vehicle[];
  }> {
    const allVehicles = await this.find({}, null);
    return this.splitExpiring(allVehicles, daysAhead);
  }

  async getVehiclesByStaff(staffUuid: string): Promise<Vehicle[]> {
    return this.repo.find({
      where: { assignedStaffUuid: staffUuid },
      relations: ['assignedStaff'],
    });
  }

  async getExpiringDocumentsForStaff(staffUuid: string, daysAhead: number = 30): Promise<{
    insurance: Vehicle[];
    inspection: Vehicle[];
    tax: Vehicle[];
  }> {
    const vehicles = await this.getVehiclesByStaff(staffUuid);
    return this.splitExpiring(vehicles, daysAhead);
  }

  /**
   * Veicoli con assicurazione/revisione/bollo in scadenza tra oggi e oggi + daysAhead (estremi inclusi).
   * Date di calendario: con `giorni * 24h` il passaggio all'ora legale faceva perdere l'ultimo giorno.
   */
  private splitExpiring(vehicles: Vehicle[], daysAhead: number) {
    const days = Number(daysAhead);
    const { today, until } = calendarRange(Number.isFinite(days) && days > 0 ? Math.floor(days) : 30);

    const isInRange = (date: Date | string | null): boolean => {
      const day = toCalendarDay(date);
      return !!day && day >= today && day <= until;
    };

    return {
      insurance: vehicles.filter((v) => isInRange(v.insuranceExpiry)),
      inspection: vehicles.filter((v) => isInRange(v.inspectionExpiry)),
      tax: vehicles.filter((v) => isInRange(v.taxExpiry)),
    };
  }
}
