import { Entity, Column, ManyToOne, JoinColumn, PrimaryGeneratedColumn } from 'typeorm';
import { Role } from '../../roles/entities/role.entity';
import { Capability } from '../capability.enum';

@Entity('capabilities_per_role')
export class CapabilityPerRole {
  @PrimaryGeneratedColumn('uuid')
  uuid: string;

  @Column({ type: 'varchar' })
  capability: Capability;

  @ManyToOne(() => Role, (role) => role.capabilities, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'roleCode', referencedColumnName: 'code' })
  role: Role;

  @Column()
  roleCode: string;
}
