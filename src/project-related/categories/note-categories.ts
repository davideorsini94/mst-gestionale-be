/**
 * Categoria dedotta dal testo delle note di un movimento.
 *
 * Nei movimenti importati la "categoria" è scritta a mano nelle note ("Hotel Senales 3", "Rata Into The Race 24/25",
 * "Canone Telepass Marzo"...): qui viene ricondotta a una macro-categoria con regole a parole chiave.
 * Le regole sono in ordine: vince la prima che corrisponde (es. "Skipass VI Modulo Estivo" → Skipass,
 * "Stipendio + Rimborso Km" → Stipendi). Quello che non viene riconosciuto va in "Altro".
 */
export const OTHER_CATEGORY = 'Altro';

interface NoteRule {
  category: string;
  pattern: RegExp;
}

export const NOTE_CATEGORY_RULES: NoteRule[] = [
  { category: 'Into The Race', pattern: /\binto ?the ?race\b|\brace \d{2}\/\d{2}\b|\bacconto race\b|\babbonament[oi] race\b/ },
  { category: 'Into The Ski', pattern: /\binto ?the ?ski\b/ },
  { category: 'Into The Snow', pattern: /\binto ?the ?snow\b/ },
  {
    category: 'Versamenti e giroconti',
    pattern: /\bversament[oi] su c\/c\b|\bprelievo\b|\btrasferimento conto\b|\bricarica (carta )?pre ?pagata\b|\bgiroconto\b/,
  },
  {
    category: 'Tesseramenti FISI',
    pattern: /\bliste fis\b|\bfisip?\b|\btesser[ae]\b|\btesseramento\b|\baffiliazione\b|^start\b/,
  },
  { category: 'Organizzazione gare', pattern: /\bgiudice\b|\bdiaria td\b|\bcrono|\bpremi[oa]?\b|\bpremiazion|\bspeaker\b|\bmedagli|\bpettoral|\bgonfiabile\b/ },
  { category: 'Stipendi e diarie', pattern: /\bstipend|\bdiar[aie]{0,2}\b|\bcompens[oi]\b/ },
  // "1 Week end (no skipass e hotel)": la parola skipass qui non indica la spesa
  { category: 'Corsi e moduli', pattern: /\bweek ?end\b/ },
  { category: 'Skipass', pattern: /\bski ?pass|\bstagional[ei]\b|\bcauzion[ei]\b/ },
  {
    category: 'Hotel e alloggi',
    pattern: /\bhotel\b|\bresidence\b|\balloggi|\bappartamento\b|\bpernottament|\bsoggiorno\b|\brifugio\b/,
  },
  {
    category: 'Iscrizioni gare',
    pattern: /\biscri[sz]i|\bgar[ae]\b|\bnjr\b|\bfis\b|\bregionali\b|\bcampionat/,
  },
  {
    category: 'Corsi e moduli',
    pattern: /\bmodul[oi]\b|\bagonistica\b|\bspeed camp\b|\bmultisport\b|\bprogetto pasqua\b|\bcorso\b|\bcampo estivo\b|\bquota\b/,
  },
  { category: 'Allenamenti', pattern: /\ball?enam|\bpista\b|\bpali\b|\btubi\b|\bsimulatore\b|\b(amneville|landgraaf|cervinia|presolana|gardena|tonale|fosson|saas ?fee|de[su]x? alpes)\b/ },
  { category: 'Quote associative', pattern: /\bmember\b|\bquota associativa\b|\bsocio\b/ },
  { category: 'Carburante', pattern: /\bgasolio\b|\bad ?blue?\b|\bcarburante\b|\bbenzina\b|\brifornimento\b/ },
  {
    category: 'Pedaggi, parcheggi e Telepass',
    pattern: /\bpedagg|\btelepass\b|\bautostrad|\bcasello\b|\bvignetta\b|\bparchegg/,
  },
  { category: 'Pulmino', pattern: /\bpulmin|\bfurgone\b|\bducato\b|\bcitroen\b|\bgomme\b|\bgps\b|\bmult[ae]\b|\bverbale\b|\bparabrezza\b|\bbatteri[ae]\b|\blavaggio\b|\brevisione\b|\bautolavaggio\b|\baspiratore\b|\bcassetta attrezzi\b/ },
  {
    category: 'Banca e commissioni',
    pattern:
      /\bcommission|\bcanone\b|\bc\/c\b|\bimposta di? ?bollo\b|\brendicont|\bcompetenze di chiusura\b|\binternet banking\b|\bcbill\b|\bbanca\b|\binteressi\b|\bspese di (pagamento|ricarica)\b|\bpos\b|\bbonific|\bpaypal\b|\bestinzione conto\b/,
  },
  { category: 'Tasse e imposte', pattern: /\bf24\b|\biva\b|\btasse\b|\bimposte\b|\bdeleg|\bmarche da bollo\b|\bvidimazione\b/ },
  { category: 'Pasti', pattern: /\bcen[ae]\b|\bpranz|\bcolazion|\bpizza\b|\bgrigliata\b|\bbuffet\b|\btorta\b|\bautogrill\b|\bspesa\b|\bristorante\b/ },
  {
    category: 'Divise e merchandising',
    pattern:
      /\bdivis[ae]\b|\bfelp[ae]\b|\bmagliett|\bscaldacollo\b|\bmantell|\bmerchandising\b|\bgadget\b|\badesivi\b|\bcut resistant\b|\bgiacc|\babbigliamento\b|\btutin|\bpantalon|\bpolo\b/,
  },
  {
    category: 'Materiale e noleggi',
    pattern: /\bmateria|\bnoleggio\b|\bmanutenzione sci\b|\bsci\b(?! club)|\bradio\b|\battrezzatura\b/,
  },
  { category: 'Trasporti', pattern: /\btrasport|\bviaggio\b|\bautobus\b|\bautonus\b/ },
  { category: 'Sponsor e contributi', pattern: /\bsponsor|\berogazione liberale\b|\bcontribu|\bdonazion/ },
  {
    category: 'Comunicazione e web',
    pattern: /\bsito\b|\bdominio\b|\bserver\b|\bcloud\b|\bgestionale\b|\bgoogle\b|\bcomu[nm]icazione\b|\badv\b|\bfotograf|\bapp\b|\bzoom\b|\bpec\b|\bfirma digitale\b|\bpubblicit|\bloghi\b|\bmarchio\b|\bgrafiche\b|\bmedia house\b|\bfinal cut\b|\bvideo ?camera\b/,
  },
  {
    category: 'Consulenze, medici e assicurazioni',
    pattern: /\bcommercialista\b|\bconsulen|\bassicura|\bpolizza\b|\bmedic|\bdottore\b|\btampon|\bperizia\b/,
  },
  {
    category: 'Attività complementari',
    pattern: /\blaser ?game\b|\brafting\b|\barrampicata\b|\bpaintball\b|\bcrossfit\b|\batletica\b|\bacrobatica\b|\balpinismo\b|\bski ?alp|\bguida\b|\bingress[oi]\b|\bfitfamm\b|\badventure park\b|\bbarca a vela\b|\bwakeboard\b|\bpalestra\b|\bpsicosport\b/,
  },
  { category: 'Rimborsi', pattern: /\brimbors|\brestituzione\b/ },
];

/** minuscolo, senza accenti e senza spazi doppi */
export function normalizeNote(note: string): string {
  return note
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Nome della categoria per le note date; null se le note sono vuote (il movimento resta senza categoria). */
export function categoryFromNote(note: string | null | undefined): string | null {
  if (!note || !note.trim()) return null;
  const normalized = normalizeNote(note);
  for (const rule of NOTE_CATEGORY_RULES) {
    if (rule.pattern.test(normalized)) return rule.category;
  }
  return OTHER_CATEGORY;
}
