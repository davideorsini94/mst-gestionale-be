import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'crypto';
import { createWriteStream, promises as fsp } from 'fs';
import { tmpdir } from 'os';
import * as path from 'path';
import { pipeline } from 'stream/promises';
import type { FastifyRequest } from 'fastify';
import type { MultipartFile } from '@fastify/multipart';

/**
 * Upload scritti su disco in streaming invece che in memoria: i backup da ripristinare possono pesare GB e con
 * `attachFieldsToBody` @fastify/multipart li caricherebbe interi in RAM (toBuffer).
 * Il file temporaneo (permessi 0600) viene cancellato dal plugin a fine risposta (`request.tmpUploads`).
 */
const DISK_UPLOAD_ROUTES = /^\/api\/settings\/restore\/(database|minio)\/?(\?|$)/;

/** Upload tenuti in memoria (documenti, foto, import): poco sopra il limite dei file su MinIO (50 MB). */
const MEMORY_UPLOAD_LIMIT = 60 * 1024 * 1024;

/** Campo `file` del body per le rotte su disco: percorso del file temporaneo già scritto. */
export interface DiskUploadedFile {
  filename?: string;
  tempFilePath?: string;
}

let jwt: JwtService | null = null;

/**
 * Pre-filtro: si scrive su disco solo con un token valido (firma e scadenza), così un anonimo non riempie il disco.
 * Il controllo completo (utente attivo, permessi) resta alle guardie della rotta, che rispondono 401/403.
 */
function hasValidToken(request: FastifyRequest): boolean {
  const header = request.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token || !process.env.JWT_SECRET) return false;
  try {
    jwt ??= new JwtService({ secret: process.env.JWT_SECRET });
    jwt.verify(token);
    return true;
  } catch {
    return false;
  }
}

async function drain(part: MultipartFile): Promise<void> {
  part.file.resume();
  await new Promise<void>((resolve) => {
    part.file.once('end', resolve);
    part.file.once('error', () => resolve());
  });
}

/** `onFile` di @fastify/multipart: su disco per le rotte di ripristino, in memoria (come prima) per le altre. */
export async function handleMultipartFile(this: FastifyRequest, part: MultipartFile): Promise<void> {
  if (!DISK_UPLOAD_ROUTES.test(this.url)) {
    // in memoria solo con un token valido e fino a MEMORY_UPLOAD_LIMIT: prima un anonimo poteva inviare 2 GB,
    // tenuti interi in RAM prima del 401
    if (!hasValidToken(this)) {
      await drain(part);
      return;
    }
    let received = 0;
    part.file.on('data', (chunk: Buffer) => {
      received += chunk.length;
      if (received > MEMORY_UPLOAD_LIMIT) {
        part.file.destroy(Object.assign(new Error('File troppo grande'), { statusCode: 413 }));
      }
    });
    await part.toBuffer();
    return;
  }
  if (!hasValidToken(this)) {
    await drain(part);
    return;
  }

  const tempFilePath = path.join(tmpdir(), `mst-upload-${randomUUID()}`);
  const req = this as FastifyRequest & { tmpUploads: string[] | null };
  req.tmpUploads ??= [];
  req.tmpUploads.push(tempFilePath);
  try {
    await pipeline(part.file, createWriteStream(tempFilePath, { flags: 'wx', mode: 0o600 }));
    if (part.file.truncated) {
      throw Object.assign(new Error('File troppo grande'), { statusCode: 413 });
    }
  } catch (error) {
    await fsp.rm(tempFilePath, { force: true });
    req.tmpUploads = req.tmpUploads.filter((p) => p !== tempFilePath);
    throw error;
  }
  (part as unknown as DiskUploadedFile).tempFilePath = tempFilePath;
}

/** Cancella subito il file temporaneo (senza aspettare la fine della risposta) e lo toglie dalla pulizia del plugin. */
export async function releaseUploadedFile(request: FastifyRequest, tempFilePath: string): Promise<void> {
  await fsp.rm(tempFilePath, { force: true });
  const req = request as FastifyRequest & { tmpUploads: string[] | null };
  if (req.tmpUploads) req.tmpUploads = req.tmpUploads.filter((p) => p !== tempFilePath);
}
