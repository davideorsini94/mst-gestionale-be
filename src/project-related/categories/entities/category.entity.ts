import { Entity, Column } from 'typeorm';
import { IctBaseEntity } from '../../../common/base-crud/ict-base.entity';

export enum CategoryType {
  INCOME = 'INCOME',
  EXPENSE = 'EXPENSE',
  BOTH = 'BOTH',
}

@Entity('categories')
export class Category extends IctBaseEntity {
  @Column()
  name: string;

  @Column({ nullable: true })
  description: string;

  @Column({ type: 'enum', enum: CategoryType, default: CategoryType.BOTH })
  type: CategoryType;

  @Column({ nullable: true })
  color: string;

  @Column({ nullable: true })
  icon: string;

  @Column({ default: true })
  isActive: boolean;

  @Column({ default: 0 })
  sortOrder: number;
}
