import 'dotenv/config';
import { HttpAdapterHost, NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import fastifyMultipart from '@fastify/multipart';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { ValidationPipe } from '@nestjs/common';
import { dataSource } from './datasources/data-source';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { seedRoles } from './seeds/seed-roles';

export const BODY_LIMIT_IN_MB = 100;

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ bodyLimit: BODY_LIMIT_IN_MB * 1_000_000 }),
  );

  await dataSource.initialize();
  
  // Seed dei ruoli di default
  await seedRoles();

  const config = new DocumentBuilder()
    .setTitle('MST Gestionale')
    .setDescription('API per il gestionale SSD a RL - Sci Club')
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document);

  await app.register(fastifyMultipart, { attachFieldsToBody: true });
  app.useGlobalPipes(new ValidationPipe());
  app.setGlobalPrefix('api');
  app.enableCors({
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
  });
  app.useLogger(app.get(WINSTON_MODULE_NEST_PROVIDER));
  
  const port = process.env.APP_PORT || 3000;
  await app.listen(port, '0.0.0.0');
  console.log(`Application is running on: http://localhost:${port}`);
}

bootstrap();
