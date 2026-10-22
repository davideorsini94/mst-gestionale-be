import { BadRequestException } from '@nestjs/common';
import { EntitySubscriberInterface, EventSubscriber, InsertEvent, UpdateEvent } from 'typeorm';
import { getEncryptedFields, toDateOnlyString } from './encrypted-column';
import { blindIndex } from './field-crypto';

/**
 * Mantiene allineati i blind index (es. emailHash) con i campi cifrati e normalizza le date cifrate.
 * Un hash viene ricalcolato solo se il campo in chiaro è presente nell'entità salvata (!== undefined):
 * i salvataggi parziali (DTO senza quel campo) non devono azzerarlo.
 * Le date cifrate vengono riscritte nell'entità come 'YYYY-MM-DD' prima del salvataggio: la risposta di create/update
 * restituisce lo stesso formato della lettura, e una data impossibile (es. 2023-02-30) diventa un 400 invece di
 * un errore generico della cifratura.
 * (@EventSubscriber è obbligatorio: senza, TypeORM non registra la classe passata in `subscribers`.)
 */
@EventSubscriber()
export class BlindIndexSubscriber implements EntitySubscriberInterface {
  beforeInsert(event: InsertEvent<any>): void {
    this.apply(event.entity);
  }

  beforeUpdate(event: UpdateEvent<any>): void {
    this.apply(event.entity);
  }

  private apply(entity: any): void {
    if (!entity || typeof entity !== 'object' || !entity.constructor) return;
    for (const field of getEncryptedFields(entity.constructor)) {
      if (field.kind === 'date' && entity[field.property] !== undefined) {
        entity[field.property] = this.normalizeDate(entity[field.property], field.property);
      }
      if (!field.hash) continue;
      const value = entity[field.property];
      if (value === undefined) continue;
      entity[field.hash.property] = blindIndex(value, field.hash.kind);
    }
  }

  private normalizeDate(value: unknown, property: string): string | null {
    try {
      return toDateOnlyString(value);
    } catch {
      throw new BadRequestException(`Data non valida nel campo "${property}" (formato atteso AAAA-MM-GG)`);
    }
  }
}
