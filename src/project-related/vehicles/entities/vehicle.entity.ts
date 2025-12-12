import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { IctBaseEntity } from '../../../common/base-crud/ict-base.entity';
import { Staff } from '../../staff/entities/staff.entity';

export enum VehicleType {
  MINIBUS = 'MINIBUS',
  BUS = 'BUS',
  VAN = 'VAN',
  CAR = 'CAR',
  OTHER = 'OTHER',
}

export enum VehicleStatus {
  AVAILABLE = 'AVAILABLE',
  IN_USE = 'IN_USE',
  MAINTENANCE = 'MAINTENANCE',
  OUT_OF_SERVICE = 'OUT_OF_SERVICE',
}

@Entity('vehicles')
export class Vehicle extends IctBaseEntity {
  @Column()
  name: string;

  @Column({ type: 'enum', enum: VehicleType, default: VehicleType.MINIBUS })
  type: VehicleType;

  @Column({ nullable: true })
  brand: string;

  @Column({ nullable: true })
  model: string;

  @Column({ unique: true })
  licensePlate: string;

  @Column({ type: 'int', nullable: true })
  seats: number;

  @Column({ type: 'int', nullable: true })
  year: number;

  @Column({ type: 'enum', enum: VehicleStatus, default: VehicleStatus.AVAILABLE })
  status: VehicleStatus;

  @Column({ type: 'date', nullable: true })
  insuranceExpiry: Date;

  @Column({ type: 'date', nullable: true })
  inspectionExpiry: Date;

  @Column({ type: 'date', nullable: true })
  taxExpiry: Date;

  @Column({ type: 'int', nullable: true })
  currentKm: number;

  @Column({ type: 'date', nullable: true })
  lastMaintenanceDate: Date;

  @Column({ type: 'int', nullable: true })
  nextMaintenanceKm: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  fuelConsumption: number;

  @Column({ nullable: true })
  fuelType: string;

  @Column({ type: 'text', nullable: true })
  notes: string;

  @Column({ nullable: true })
  imageUrl: string;

  // Staff assegnato al veicolo
  @ManyToOne(() => Staff, { nullable: true })
  @JoinColumn({ name: 'assignedStaffUuid' })
  assignedStaff: Staff;

  @Column({ nullable: true })
  assignedStaffUuid: string;
}
