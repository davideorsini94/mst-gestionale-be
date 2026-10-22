import { Injectable, PipeTransform } from '@nestjs/common';

/** Campi che nessun client può impostare: identificativo, date tecniche e blind index (*Hash). */
const ALWAYS_PROTECTED = ['uuid', 'createdAt', 'updatedAt'];

/**
 * Toglie dal corpo della richiesta i campi gestiti solo dal server.
 * Senza, un client poteva: sovrascrivere un record esistente passando il suo uuid in una POST, far puntare un movimento
 * al PDF di un altro (receiptMinioPath) e cancellarlo, falsare i blind index, collegarsi al profilo staff di altri.
 * I servizi interni (import, manutenzione) continuano a impostare questi campi: il filtro vale solo per l'HTTP.
 */
@Injectable()
export class StripProtectedFieldsPipe implements PipeTransform {
  private readonly protectedFields: Set<string>;

  constructor(extraFields: string[] = []) {
    this.protectedFields = new Set([...ALWAYS_PROTECTED, ...extraFields]);
  }

  transform(value: unknown) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
    for (const key of Object.keys(value)) {
      if (this.protectedFields.has(key) || key.endsWith('Hash')) {
        delete (value as Record<string, unknown>)[key];
      }
    }
    return value;
  }
}

/** Ricevute e revisione importi: solo il server li gestisce. */
export const TRANSACTION_SERVER_FIELDS = [
  'receiptMinioPath',
  'receiptNumber',
  'receiptYear',
  'amountReview',
  'amountBeforeReview',
  'originalAmountBeforeReview',
  'amountReviewedAt',
];

/** Foto e documenti si cambiano solo dagli endpoint di upload. */
export const PROFILE_IMAGE_FIELDS = ['profileImageUuid', 'documents', 'profileImage'];
