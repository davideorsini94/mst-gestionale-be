import { DataSource } from 'typeorm';
import { BlindIndexSubscriber } from '../common/crypto/blind-index.subscriber';
import { Baseline1700000000000 } from '../migrations/1700000000000-Baseline';
import { SchemaV141760900000000 } from '../migrations/1760900000000-SchemaV14';
import { EncryptSensitiveData1760900001000 } from '../migrations/1760900001000-EncryptSensitiveData';
import { CategorizeFromNotes1760900002000 } from '../migrations/1760900002000-CategorizeFromNotes';

if (process.env.DB_SYNCHRONIZE === 'true') {
  // synchronize con colonne che cambiano tipo fa DROP+ADD della colonna (perdita dati): dalla v1.4 lo schema
  // evolve solo tramite migrazioni esplicite (src/migrations).
  console.warn('[DataSource] DB_SYNCHRONIZE=true ignorato: lo schema è gestito dalle migrazioni');
}

export const dataSource: DataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT ? parseInt(process.env.DB_PORT) : 5432,
  ssl: false,
  username: process.env.DB_USERNAME || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_DATABASE || 'mst_gestionale',
  entities: [__dirname + `/../**/*.entity.{ts,js}`],
  // Elenco esplicito (un glob includerebbe anche i .d.ts generati in dist)
  migrations: [
    Baseline1700000000000,
    SchemaV141760900000000,
    EncryptSensitiveData1760900001000,
    CategorizeFromNotes1760900002000,
  ],
  migrationsTableName: 'migrations',
  migrationsTransactionMode: 'each',
  subscribers: [BlindIndexSubscriber],
  synchronize: false,
  logging: process.env.DB_LOGGING === 'true',
});
