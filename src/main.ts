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
import { handleMultipartFile } from './common/files/disk-upload';
import { DatabaseExceptionFilter } from './common/filters/database-exception.filter';
import { italianValidationException } from './common/validators/validation-messages';

export const BODY_LIMIT_IN_MB = 2000; // 2GB per backup di grandi dimensioni

function assertRequiredEnv(): void {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET non impostata');
  }
  assertKeysConfigured();
}

/**
 * Se il DB è già cifrato (riga di controllo presente) la chiave si verifica PRIMA delle migrazioni: una migrazione
 * non deve mai scrivere dati con chiavi sbagliate. DB vuoto o v1.3 (tabella/riga assente): la riga la crea la
 * migrazione di cifratura e il controllo avviene dopo.
 */
async function verifyKeysBeforeMigrations(): Promise<void> {
  const [table] = await dataSource.query(`SELECT to_regclass('public.settings') AS name`);
  if (!table?.name) return;
  const rows = await dataSource.query(`SELECT value FROM settings WHERE key = $1`, [KEY_CHECK_SETTING]);
  if (rows.length && !keyCheckMatches(rows[0].value)) {
    throw new Error('Le chiavi di cifratura non corrispondono a quelle usate per cifrare questo database');
  }
}

async function verifyDatabase(): Promise<void> {
  await verifyKeysBeforeMigrations();
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

  const isProduction = process.env.NODE_ENV === 'production';

  // Header di sicurezza su tutte le risposte dell'API (anche errori e 404): nessuna dipendenza aggiuntiva
  app
    .getHttpAdapter()
    .getInstance()
    .addHook('onRequest', (_request, reply, done) => {
      reply.header('X-Content-Type-Options', 'nosniff');
      reply.header('X-Frame-Options', 'DENY');
      reply.header('Referrer-Policy', 'no-referrer');
      done();
    });

  const config = new DocumentBuilder()
    .setTitle('MST Gestionale')
    .setDescription('API per il gestionale SSD a RL - Sci Club')
    .setVersion('1.4')
    .addBearerAuth()
    .build();

  // In produzione la documentazione dell'API (/api, /api-json) non si espone, salvo SWAGGER_ENABLED=true
  if (!isProduction || process.env.SWAGGER_ENABLED === 'true') {
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api', app, document);
  }

  // Limite solo sulle rotte che lo dichiarano (login): global:false, altrimenti varrebbe per tutta l'API
  await app.register(fastifyRateLimit, { global: false });

  await app.register(fastifyMultipart, {
    attachFieldsToBody: true,
    // i backup da ripristinare vanno su disco in streaming, gli altri upload restano in memoria
    onFile: handleMultipartFile,
    limits: {
      fileSize: BODY_LIMIT_IN_MB * 1_000_000,
      files: 1,
      fieldSize: BODY_LIMIT_IN_MB * 1_000_000,
    },
  });
  app.useGlobalPipes(new ValidationPipe({ exceptionFactory: italianValidationException }));
  app.useGlobalFilters(new DatabaseExceptionFilter(app.getHttpAdapter()));
  app.setGlobalPrefix('api');
  // In produzione la UI chiama l'API sullo stesso origine (nginx fa da proxy di /api): CORS spento, salvo origini
  // esplicite in CORS_ORIGIN (lista separata da virgole). In sviluppo (UI su un'altra porta) qualsiasi origine.
  // Niente credentials: l'autenticazione usa il token Bearer, non i cookie.
  const corsOrigins = (process.env.CORS_ORIGIN || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  if (corsOrigins.length || !isProduction) {
    app.enableCors({
      origin: corsOrigins.length ? corsOrigins : true,
      methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    });
  }
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
