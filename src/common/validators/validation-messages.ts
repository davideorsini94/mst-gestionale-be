import { BadRequestException, ValidationError } from '@nestjs/common';

/**
 * Messaggi in italiano per i validatori usati senza `message` (class-validator li darebbe in inglese, es.
 * "gender must be one of the following values: M, F"). I messaggi già scritti nei DTO restano come sono.
 */
const ITALIAN: Record<string, (field: string, error: ValidationError) => string> = {
  isString: (f) => `${f}: deve essere un testo`,
  isBoolean: (f) => `${f}: deve essere sì/no (true o false)`,
  isInt: (f) => `${f}: deve essere un numero intero`,
  isNumber: (f) => `${f}: deve essere un numero`,
  isEmail: (f) => `${f}: indirizzo email non valido`,
  isUuid: (f) => `${f}: identificativo non valido`,
  isEnum: (f, e) => `${f}: valore non valido${allowed(e.constraints?.isEnum)}`,
  isIn: (f, e) => `${f}: valore non valido${allowed(e.constraints?.isIn)}`,
  min: (f, e) => `${f}: valore troppo basso${limit(e.constraints?.min)}`,
  max: (f, e) => `${f}: valore troppo alto${limit(e.constraints?.max)}`,
  matches: (f) => `${f}: formato non valido`,
  isNotEmpty: (f) => `${f}: campo obbligatorio`,
  isDefined: (f) => `${f}: campo obbligatorio`,
  isArray: (f) => `${f}: deve essere un elenco`,
  whitelistValidation: (f) => `${f}: campo non previsto`,
};

/** "must be one of the following values: M, F" → " (ammessi: M, F)" */
function allowed(message?: string): string {
  const match = message?.match(/following values: (.+)$/);
  return match ? ` (ammessi: ${match[1]})` : '';
}

/** "must not be less than 1" → " (minimo 1)" / "must not be greater than 9" → " (massimo 9)" */
function limit(message?: string): string {
  const match = message?.match(/(less|greater) than (-?[\d.]+)/);
  if (!match) return '';
  return match[1] === 'less' ? ` (minimo ${match[2]})` : ` (massimo ${match[2]})`;
}

/** I messaggi predefiniti di class-validator sono in inglese: quelli dei DTO sono già in italiano. */
const isDefaultEnglish = (message: string) =>
  /\b(must be|must not be|should not be|must match|must contain|should not exist|must be one of)\b/.test(message);

function collect(errors: ValidationError[], parent = ''): string[] {
  const messages: string[] = [];
  for (const error of errors) {
    const field = parent ? `${parent}.${error.property}` : error.property;
    for (const [constraint, message] of Object.entries(error.constraints ?? {})) {
      const italian = ITALIAN[constraint];
      messages.push(isDefaultEnglish(message) && italian ? italian(field, error) : message);
    }
    if (error.children?.length) messages.push(...collect(error.children, field));
  }
  return messages;
}

/** exceptionFactory del ValidationPipe globale: messaggi in italiano, senza doppioni. */
export function italianValidationException(errors: ValidationError[]): BadRequestException {
  return new BadRequestException(Array.from(new Set(collect(errors))));
}
