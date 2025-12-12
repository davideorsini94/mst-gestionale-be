import { Entity, Column } from 'typeorm';
import { IctBaseEntity } from '../../base-crud/ict-base.entity';

export enum FileType {
  IMAGE = 'IMAGE',
  DOCUMENT = 'DOCUMENT',
  OTHER = 'OTHER',
}

@Entity('files')
export class File extends IctBaseEntity {
  @Column()
  originalName: string;

  @Column()
  minioPath: string;

  @Column({ nullable: true })
  mimeType: string;

  @Column({ type: 'bigint', nullable: true })
  size: number;

  @Column({ type: 'enum', enum: FileType, default: FileType.OTHER })
  fileType: FileType;

  @Column({ nullable: true })
  description: string;
}
