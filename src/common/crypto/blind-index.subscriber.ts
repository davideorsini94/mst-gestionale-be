import { EntitySubscriberInterface, EventSubscriber, InsertEvent, UpdateEvent } from 'typeorm';
import { getEncryptedFields } from './encrypted-column';
import { blindIndex } from './field-crypto';

/**
 * Mantiene allineati i blind index (es. emailHash) con i campi cifrati.
 * Un hash viene ricalcolato solo se il campo in chiaro è presente nell'entità salvata (!== undefined):
 * i salvataggi parziali (DTO senza quel campo) non devono azzerarlo.
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
      if (!field.hash) continue;
      const value = entity[field.property];
      if (value === undefined) continue;
      entity[field.hash.property] = blindIndex(value, field.hash.kind);
    }
  }
}
