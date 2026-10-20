import { categoryFromNote, OTHER_CATEGORY } from './note-categories';

describe('categoryFromNote', () => {
  it.each([
    ['Hotel Senales 3', 'Hotel e alloggi'],
    ['Residence Gennaio', 'Hotel e alloggi'],
    ['Rata Into The Race 24/25', 'Into The Race'],
    ['Caparra into the race 20/21', 'Into The Race'],
    ['Acconto Race 25/26', 'Into The Race'],
    ['Saldo Into The Ski 23/24', 'Into The Ski'],
    ['Acconto Into The Snow 25/26', 'Into The Snow'],
    ['Iscrizione Gara', 'Iscrizioni gare'],
    ['Iscrizioi Gara', 'Iscrizioni gare'],
    ['Njr GS Chiesa 23/24', 'Iscrizioni gare'],
    ['Iscrizione Liste Fis', 'Tesseramenti FISI'],
    ['Ricarica Conto Fisi', 'Tesseramenti FISI'],
    ['Allenamento Saas Fee 2', 'Allenamenti'],
    ['Alenamento Lecco', 'Allenamenti'],
    ['Amneville 2', 'Allenamenti'],
    ['Skipass Stagionale 22/23', 'Skipass'],
    ['Skipass VI Modulo Estivo', 'Skipass'],
    ['Cauzioni skipass Solda', 'Skipass'],
    ['1 Week end (no skipass e hotel)', 'Corsi e moduli'],
    ['Quota III°modulo estivo', 'Corsi e moduli'],
    ['Gasolio', 'Carburante'],
    ['Ad Blu', 'Carburante'],
    ['Canone Telepass Marzo', 'Pedaggi, parcheggi e Telepass'],
    ['Manutenzione Pulmino', 'Pulmino'],
    ['Stipendio + Rimborso Km', 'Stipendi e diarie'],
    ['Diaria DT', 'Stipendi e diarie'],
    ['Diaria Giudice', 'Organizzazione gare'],
    ['Commissioni di Bonifico', 'Banca e commissioni'],
    ['Canone c/c Gennaio', 'Banca e commissioni'],
    ['Versamento su c/c', 'Versamenti e giroconti'],
    ['Prelievo Pagamento Appartamento', 'Versamenti e giroconti'],
    ['F24', 'Tasse e imposte'],
    ['Cena', 'Pasti'],
    ['Divisa EP', 'Divise e merchandising'],
    ['Polo Sci Club', 'Divise e merchandising'],
    ['Assicurazione Sci Club', 'Consulenze, medici e assicurazioni'],
    ['Noleggio Sci Super G', 'Materiale e noleggi'],
    ['Smart Member 25/26', 'Quote associative'],
    ['Comunicazione', 'Comunicazione e web'],
    ['Rimborso Km', 'Rimborsi'],
    ['Sponsorizzazione', 'Sponsor e contributi'],
    ['Laser game 2 Alpes', 'Attività complementari'],
  ])('%s → %s', (note, expected) => {
    expect(categoryFromNote(note)).toBe(expected);
  });

  it('maiuscole, accenti e spazi non contano', () => {
    expect(categoryFromNote('  NOLEGGIO   SCI VELOCITÀ ')).toBe('Materiale e noleggi');
  });

  it('note non riconosciute → Altro; note vuote → nessuna categoria', () => {
    expect(categoryFromNote('Tana D\'Orso')).toBe(OTHER_CATEGORY);
    expect(categoryFromNote('')).toBeNull();
    expect(categoryFromNote('   ')).toBeNull();
    expect(categoryFromNote(null)).toBeNull();
  });
});
