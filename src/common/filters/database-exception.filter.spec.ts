import {
  BadRequestException,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  Module,
  NotFoundException,
} from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { QueryFailedError } from 'typeorm';
import { DatabaseExceptionFilter, mapDatabaseError } from './database-exception.filter';

function pgError(code: string, extra: Record<string, unknown> = {}): QueryFailedError {
  const driverError = Object.assign(new Error('errore pg'), { code, ...extra });
  return new QueryFailedError('SELECT segreto FROM tabella', ['parametro'], driverError);
}

describe('mapDatabaseError', () => {
  it('uuid o enum non validi → 400', () => {
    const mapped = mapDatabaseError(pgError('22P02'));
    expect(mapped).toBeInstanceOf(BadRequestException);
  });

  it('date non valide → 400', () => {
    expect(mapDatabaseError(pgError('22007'))).toBeInstanceOf(BadRequestException);
    expect(mapDatabaseError(pgError('22008'))).toBeInstanceOf(BadRequestException);
  });

  it('unique → 409 con il campo leggibile', () => {
    const mapped = mapDatabaseError(pgError('23505', { detail: 'Key ("licensePlate")=(AB123CD) already exists.' }));
    expect(mapped).toBeInstanceOf(ConflictException);
    expect(mapped.message).toContain('targa');
    expect(mapped.message).not.toContain('AB123CD');
  });

  it('chiave esterna in uso → 400 "ancora usato"', () => {
    const mapped = mapDatabaseError(
      pgError('23503', { detail: 'Key (uuid)=(x) is still referenced from table "transactions".' }),
    );
    expect(mapped).toBeInstanceOf(BadRequestException);
    expect(mapped.message).toContain('ancora usato');
    expect(mapped.message).toContain('movimenti');
  });

  it('chiave esterna verso un dato inesistente → 400', () => {
    const mapped = mapDatabaseError(
      pgError('23503', { detail: 'Key (roleCode)=(boh) is not present in table "roles".' }),
    );
    expect(mapped).toBeInstanceOf(BadRequestException);
    expect(mapped.message).toContain('ruolo');
  });

  it('la risposta non contiene mai SQL o parametri', () => {
    for (const code of ['22P02', '22007', '23505', '23503', '23502']) {
      const body = JSON.stringify(mapDatabaseError(pgError(code)).getResponse());
      expect(body).not.toContain('SELECT');
      expect(body).not.toContain('parametro');
    }
  });

  it('errori di BaseService', () => {
    expect(mapDatabaseError(new Error('Entity not found'))).toBeInstanceOf(NotFoundException);
    expect(mapDatabaseError(new Error('Data non valida: 2026-13-45'))).toBeInstanceOf(BadRequestException);
  });

  it('errori sconosciuti → null (500 generico)', () => {
    expect(mapDatabaseError(pgError('XX000'))).toBeNull();
    expect(mapDatabaseError(new Error('qualcos\'altro'))).toBeNull();
  });
});

describe('DatabaseExceptionFilter (Fastify)', () => {
  @Controller()
  class TestController {
    @Get('unique')
    unique() {
      throw pgError('23505', { detail: 'Key (username)=(mario) already exists.' });
    }
    @Get('forbidden')
    forbidden() {
      throw new ForbiddenException('Operazione non consentita');
    }
    @Get('boom')
    boom() {
      throw new Error('dettaglio interno da non mostrare');
    }
  }

  @Module({ controllers: [TestController] })
  class TestModule {}

  let app: NestFastifyApplication;
  beforeAll(async () => {
    app = await NestFactory.create<NestFastifyApplication>(TestModule, new FastifyAdapter(), { logger: false });
    app.useGlobalFilters(new DatabaseExceptionFilter(app.getHttpAdapter()));
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });
  afterAll(async () => app?.close());

  const get = (url: string) => app.inject({ method: 'GET', url });

  it('errore unique → 409 con messaggio, senza SQL', async () => {
    const res = await get('/unique');
    expect(res.statusCode).toBe(409);
    expect(res.json().message).toContain('nome utente');
    expect(res.body).not.toContain('SELECT');
  });

  it('le HttpException passano invariate', async () => {
    const res = await get('/forbidden');
    expect(res.statusCode).toBe(403);
    expect(res.json().message).toBe('Operazione non consentita');
  });

  it('errori sconosciuti → 500 senza dettagli', async () => {
    const res = await get('/boom');
    expect(res.statusCode).toBe(500);
    expect(res.body).not.toContain('dettaglio interno');
  });
});
