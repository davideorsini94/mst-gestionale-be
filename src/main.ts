import { config } from 'dotenv';
import { existsSync } from 'fs';

// In produzione le variabili arrivano solo dall'ambiente del container: nessun file .env viene letto (un .env_local
// finito per errore nell'immagine non deve poter fornire chiavi o segreti). In sviluppo: ENV_FILE, poi .env_local,
// poi .env.
if (process.env.NODE_ENV !== 'production') {
  const envFile = process.env.ENV_FILE || (existsSync('.env_local') ? '.env_local' : '.env');
  config({ path: envFile });
}
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import fastifyMultipart from '@fastify/multipart';
import fastifyRateLimit from '@fastify/rate-limit';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { ValidationPipe } from '@nestjs/common';
import { dataSource } from './datasources/data-source';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { seedRoles } from './seeds/seed-roles';
import { assertKeysConfigured, keyCheckMatches } from './common/crypto/field-crypto';
import { KEY_CHECK_SETTING } from './migrations/1760900001000-EncryptSensitiveData';
import { StorageEncryptionMigration } from './minio/storage-encryption.migration';

export const BODY_LIMIT_IN_MB = 2000; // 2GB per backup di grandi dimensioni

function assertRequiredEnv(): void {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET non impostata');
  }
  assertKeysConfigured();
}

async function verifyDatabase(): Promise<void> {
  const executed = await dataSource.runMigrations({ transaction: 'each' });
  for (const migration of executed) {
    console.log(`[Bootstrap] Migrazione eseguita: ${migration.name}`);
  }

  const rows = await dataSource.query(`SELECT value FROM settings WHERE key = $1`, [KEY_CHECK_SETTING]);
  if (!rows.length || !keyCheckMatches(rows[0].value)) {
    throw new Error('Le chiavi di cifratura non corrispondono a quelle usate per cifrare questo database');
  }

  // Lo schema deve coincidere con le entità: se no qualcosa è cambiato senza migrazione.
  const pending = await dataSource.driver.createSchemaBuilder().log();
  if (pending.upQueries.length) {
    console.error('[Bootstrap] Schema del DB non allineato alle entità. Query che synchronize eseguirebbe:');
    for (const q of pending.upQueries) console.error(`  ${q.query}`);
    if (process.env.ALLOW_SCHEMA_DRIFT !== 'true') {
      throw new Error('Schema del DB non allineato alle entità (vedi log). Nessuna modifica è stata applicata.');
    }
  }
}

async function bootstrap() {
  assertRequiredEnv();

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    // trustProxy: 1 = un solo proxy fidato (nginx): l'IP del client è l'ultimo aggiunto a X-Forwarded-For.
    // Con `true` varrebbe il primo, che il client può falsificare per aggirare il limite sul login.
    new FastifyAdapter({ bodyLimit: BODY_LIMIT_IN_MB * 1_000_000, trustProxy: 1 }),
  );

  await dataSource.initialize();
  await verifyDatabase();

  // Seed dei ruoli di default
  await seedRoles();

  // Cifratura e rinomina dei file su MinIO: prima di accettare richieste, così non ci sono scritture concorrenti
  await app.get(StorageEncryptionMigration).run();

  const config = new DocumentBuilder()
    .setTitle('MST Gestionale')
    .setDescription('API per il gestionale SSD a RL - Sci Club')
    .setVersion('1.4')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document);

  // Limite solo sulle rotte che lo dichiarano (login): global:false, altrimenti varrebbe per tutta l'API
  await app.register(fastifyRateLimit, { global: false });

  await app.register(fastifyMultipart, {
    attachFieldsToBody: true,
    limits: {
      fileSize: BODY_LIMIT_IN_MB * 1_000_000,
      files: 1,
      fieldSize: BODY_LIMIT_IN_MB * 1_000_000,
    },
  });
  app.useGlobalPipes(new ValidationPipe());
  app.setGlobalPrefix('api');
  app.enableCors({
    origin: '*',
    credentials: true,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
  });
  app.useLogger(app.get(WINSTON_MODULE_NEST_PROVIDER));

  const port = process.env.APP_PORT || 3000;
  const host = process.env.APP_HOST || '0.0.0.0';
  await app.listen(port, host);
  console.log(`Application is running on: http://${host}:${port}`);
}

bootstrap().catch((error) => {
  console.error('[Bootstrap] Avvio interrotto:', error?.message ?? error);
  process.exit(1);
});
