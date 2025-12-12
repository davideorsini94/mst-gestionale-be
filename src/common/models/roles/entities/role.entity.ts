import { Entity, Column, PrimaryColumn, OneToMany } from 'typeorm';
import { CapabilityPerRole } from '../../capabilities-per-role/entities/capability-per-role.entity';

@Entity('roles')
export class Role {
  @PrimaryColumn()
  code: string;

  @Column({ nullable: true })
  description: string;

  @OneToMany(() => CapabilityPerRole, (cap) => cap.role, { eager: true })
  capabilities: CapabilityPerRole[];
}
