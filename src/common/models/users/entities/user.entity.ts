import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { IctBaseEntity } from '../../../base-crud/ict-base.entity';
import { Role } from '../../roles/entities/role.entity';

@Entity('users')
export class User extends IctBaseEntity {
  @Column({ unique: true })
  username: string;

  @Column()
  password: string;

  @Column({ nullable: true })
  firstName: string;

  @Column({ nullable: true })
  lastName: string;

  @Column({ nullable: true })
  email: string;

  @Column({ nullable: true })
  phone: string;

  @Column({ default: true })
  isActive: boolean;

  @ManyToOne(() => Role, { eager: true })
  @JoinColumn({ name: 'roleCode', referencedColumnName: 'code' })
  role: Role;

  @Column({ nullable: true })
  roleCode: string;
}
