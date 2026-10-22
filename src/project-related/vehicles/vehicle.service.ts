import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { BaseService } from '../../common/base-crud/base.service';
import { Vehicle } from './entities/vehicle.entity';
import { BaseSaveDto } from '../../common/base-crud/base-save.dto';
import { FindOptionsOrder } from 'typeorm';
import { ReminderService } from '../reminders/reminder.service';

@Injectable()
export class VehicleService extends BaseService<Vehicle, BaseSaveDto, BaseSaveDto> {
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

  async create(dto: BaseSaveDto): Promise<Vehicle> {
    const vehicle = await super.create(dto);
    await this.reminderService.updateVehicleReminders(vehicle);
    return vehicle;
  }

  async update(uuid: string, dto: BaseSaveDto): Promise<Vehicle> {
    const vehicle = await super.update(uuid, dto);
    await this.reminderService.updateVehicleReminders(vehicle);
    return vehicle;
  }

  async getExpiringDocuments(daysAhead: number = 30): Promise<{
    insurance: Vehicle[];
    inspection: Vehicle[];
    tax: Vehicle[];
  }> {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const futureDate = new Date(today.getTime() + daysAhead * 24 * 60 * 60 * 1000);

    console.log(`[getExpiringDocuments] daysAhead: ${daysAhead}, today: ${today.toISOString()}, futureDate: ${futureDate.toISOString()}`);

    const allVehicles = await this.find({}, null);

    // Filtra solo scadenze tra oggi e futureDate (non già scadute, non troppo lontane)
    const isInRange = (date: Date | string | null, vehicleName: string, field: string): boolean => {
      if (!date) return false;
      const d = new Date(date);
      const dateOnly = new Date(d.getFullYear(), d.getMonth(), d.getDate());
      const inRange = dateOnly.getTime() >= today.getTime() && dateOnly.getTime() <= futureDate.getTime();
      console.log(`[isInRange] ${vehicleName} - ${field}: ${date} -> dateOnly: ${dateOnly.toISOString()}, inRange: ${inRange}`);
      return inRange;
    };

    const insurance = allVehicles.filter((v) => isInRange(v.insuranceExpiry, v.name, 'insurance'));
    const inspection = allVehicles.filter((v) => isInRange(v.inspectionExpiry, v.name, 'inspection'));
    const tax = allVehicles.filter((v) => isInRange(v.taxExpiry, v.name, 'tax'));

    return { insurance, inspection, tax };
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
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const futureDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + daysAhead);

    const vehicles = await this.getVehiclesByStaff(staffUuid);

    const isInRange = (date: Date | string | null): boolean => {
      if (!date) return false;
      const d = new Date(date);
      const dateOnly = new Date(d.getFullYear(), d.getMonth(), d.getDate());
      return dateOnly >= today && dateOnly <= futureDate;
    };

    const insurance = vehicles.filter((v) => isInRange(v.insuranceExpiry));
    const inspection = vehicles.filter((v) => isInRange(v.inspectionExpiry));
    const tax = vehicles.filter((v) => isInRange(v.taxExpiry));

    return { insurance, inspection, tax };
  }
}
