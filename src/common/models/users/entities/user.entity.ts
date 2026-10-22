import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { IctBaseEntity } from '../../../base-crud/ict-base.entity';
import { Role } from '../../roles/entities/role.entity';
import { EncryptedColumn } from '../../../crypto/encrypted-column';

export interface UserPreferences {
  theme?: 'light' | 'dark' | 'system';
  reduceTransparency?: boolean;
}

@Entity('users')
export class User extends IctBaseEntity {
  @Column({ unique: true })
  username: string;

  // Hash bcrypt: mai restituito dalle API (select: false), caricato solo dove serve con addSelect
  @Column({ select: false })
  password: string;

  @EncryptedColumn({ nullable: true })
  firstName: string;

  @EncryptedColumn({ nullable: true })
  lastName: string;

  @EncryptedColumn({ nullable: true, hash: { property: 'emailHash', kind: 'ci' } })
  email: string;

  @Column({ nullable: true, select: false })
  emailHash: string;

  @EncryptedColumn({ nullable: true })
  phone: string;

  @Column({ type: 'jsonb', nullable: true })
  preferences: UserPreferences;

  @Column({ default: true })
  isActive: boolean;

  /** Ultimo cambio/reset della password: i token di login emessi prima non valgono più. */
  @Column({ type: 'timestamp', nullable: true })
  passwordChangedAt: Date | null;

  @ManyToOne(() => Role, { eager: true })
  @JoinColumn({ name: 'roleCode', referencedColumnName: 'code' })
  role: Role;

  @Column({ nullable: true })
  roleCode: string;
}
