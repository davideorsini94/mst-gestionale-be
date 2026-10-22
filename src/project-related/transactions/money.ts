/**
 * Arrotonda un importo ai centesimi (metà per eccesso: 0,005 → 0,01).
 * Con Math.round(x * 100) / 100 1,005 diventava 1,00 (1,005 * 100 = 100,49999…): si sposta la virgola nel testo.
 */
export function roundMoney(value: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return value;
  const sign = value < 0 ? -1 : 1;
  const rounded = Number(`${Math.round(Number(`${Math.abs(value)}e2`))}e-2`);
  return sign * rounded;
}

const EURO_FORMAT = new Intl.NumberFormat('it-IT', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  // 'always': in italiano 1234 resterebbe senza punto delle migliaia (raggruppamento solo da 5 cifre)
  useGrouping: 'always' as any,
});

/** Importo in formato italiano per i documenti: "€ 1.234,56". */
export function formatEuro(value: number | string): string {
  return `€ ${EURO_FORMAT.format(Number(value))}`;
}
