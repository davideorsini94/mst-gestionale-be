# MST Gestionale — Backend

API REST del gestionale di una SSD a RL (sci club): anagrafiche tesserati e staff,
prima nota con ricevute PDF, parco veicoli, scadenzario con promemoria via email,
backup di database e storage. NestJS su Fastify, PostgreSQL, MinIO per i file.

> Il frontend che consuma queste API sta nel repo `mst-gestionale-ui`. Il backend da solo
> non serve alcuna interfaccia: espone solo `/api` e la pagina Swagger.

## Cosa fa

**Anagrafiche**
- Tesserati (`members`): dati anagrafici, codice fiscale, codici FISI e FIS, tipo
  (atleta / genitore / socio), stato, flag agonista, scadenza visita medica
  (agonistica o non), data e scadenza tesseramento, foto profilo e documenti allegati.
- Staff (`staff`): ruolo operativo (istruttore, autista, amministrativo, volontario),
  qualifiche con relative scadenze (patente, licenza maestro di sci, primo soccorso,
  licenza allenatore con livello I–IV / Nazionale, visita medica), collegamento
  opzionale a un utente del sistema (`linkedUserUuid`) e documenti allegati.
- Un tesserato può essere collegato a un record staff (`staffUuid`).

**Amministrazione e contabilità**
- Movimenti (`transactions`): entrate/uscite con importo, data, categoria, metodo di
  pagamento, soggetto, numero fattura, voce di bilancio, note.
- Ricevuta PDF generata con `pdfkit` per ogni entrata, numerata per anno
  (`receiptNumber`/`receiptYear`) e archiviata su MinIO. Alla cancellazione di
  un'entrata le ricevute dell'anno vengono rigenerate per non lasciare buchi nella
  numerazione; esiste anche un endpoint per rigenerarle a mano.
- Import massivo di movimenti da file Excel o CSV, con riconoscimento flessibile dei
  nomi di colonna (`data`/`date`/`data operazione`, `importo`/`amount`/`dare`/`avere`,
  ecc.) e creazione automatica delle categorie mancanti.
- Statistiche su intervallo di date e categoria: totale entrate, totale uscite, saldo,
  aggregati per categoria e per mese.

**Veicoli**
- Parco mezzi (`vehicles`): targa, tipo, posti, km, consumo, stato, staff assegnato e
  le tre scadenze bollo / revisione / assicurazione, con endpoint dedicato alle
  scadenze in arrivo.

**Scadenzario e promemoria**
- Job giornaliero (cron, 8:00) che scansiona staff e veicoli, crea i promemoria per le
  scadenze imminenti e invia quelli in coda.
- I promemoria di staff e tesserati vanno alla persona (con fallback sull'email admin);
  quelli dei veicoli vanno allo staff assegnato con l'admin in CC, o al solo admin.
- Tipi gestiti: bollo, revisione, assicurazione, certificato medico staff, patente,
  licenza maestro, licenza allenatore, visita medica tesserato.
- Stato per ogni promemoria (`SCHEDULED` / `SENT` / `FAILED` / `CANCELLED`), con
  reinvio manuale e un endpoint che forza subito il controllo.
- SMTP configurato a runtime dalla tabella `settings` (chiave `smtpConfig`); se manca,
  le email non vengono inviate ma solo scritte a log.

**Autenticazione e permessi**
- Login username/password (`passport-local`), password in bcrypt, risposta con JWT.
- Il JWT viene letto dall'header `Authorization: Bearer` oppure dal query param
  `?token=` (serve per aprire PDF e download direttamente dal browser).
- `JwtAuthGuard` e `CapabilityGuard` sono guard globali: ogni rotta è protetta salvo
  quelle marcate `@Public()` (solo `login` e `health`).
- Autorizzazioni a capability (`CAN_VIEW_MEMBERS`, `CAN_MANAGE_TRANSACTIONS`,
  `CAN_MANAGE_BACKUP`, …) assegnate ai ruoli, non agli utenti.
- All'avvio un seed crea/aggiorna tre ruoli: `admin` (tutte le capability), `staff`
  (operativo) e `user` (sola lettura).

**File, backup, altro**
- Upload su MinIO con sanitizzazione di nomi e path; i documenti sono referenziati per
  UUID senza vincolo di FK.
- Backup di database (`pg_dump`), di MinIO (tar del bucket) o completo, con elenco,
  download, cancellazione e ripristino da file caricato.
- Endpoint `GET /api/health` pubblico.
- Lista camere per prenotazione hotel: dato un elenco di tesserati restituisce due
  gruppi ordinati (maschi e femmine) con nome, data e luogo di nascita.

## Architettura

```
 mst-gestionale-ui (nginx)          mst-gestionale-be (Nest/Fastify)
 ┌──────────────────────┐  /api/    ┌────────────────────────────┐
 │  React SPA           │──────────▶│  global prefix /api        │
 │  proxy_pass          │           │  JwtAuthGuard              │
 └──────────────────────┘           │  CapabilityGuard           │
                                    └──────┬───────────┬─────────┘
                                           │           │
                                   TypeORM │           │ minio client
                                           ▼           ▼
                                    ┌────────────┐  ┌─────────┐
                                    │ PostgreSQL │  │  MinIO  │
                                    └────────────┘  └─────────┘
                                           ▲
                                           │ cron 8:00 → nodemailer (SMTP)
                                    ReminderService
```

Il `DataSource` TypeORM è un singleton esportato da `src/datasources/data-source.ts`,
inizializzato a mano in `main.ts` prima del bootstrap; i servizi lo usano direttamente
invece di passare per `TypeOrmModule.forRoot`. Lo schema è gestito da `synchronize`
(vedi `DB_SYNCHRONIZE`), non ci sono migration.

## Stack

- Node.js 22 (immagine Docker) — `@nestjs/*` 11, `@nestjs/platform-fastify`
- TypeORM 0.3 + `pg` su PostgreSQL
- MinIO tramite `nestjs-minio-client`
- Auth: `@nestjs/jwt`, `passport-jwt`, `passport-local`, `bcrypt`
- `@nestjs/schedule` per il cron dei promemoria, `nodemailer` per le email
- `pdfkit` (ricevute), `xlsx` (import movimenti)
- `socket.io` + `@nestjs/websockets` (gateway presente, vedi Note)
- Log con `winston` / `nest-winston`, documentazione OpenAPI con `@nestjs/swagger`

## Avvio rapido

Servono PostgreSQL e MinIO già in funzione: nel repo non c'è un `docker-compose.yml`.
Per i backup servono anche `pg_dump` e `pg_restore` nel PATH.

```bash
npm install
cp .env .env_local        # se esiste .env_local ha la precedenza su .env
npm run start:dev         # watch mode
```

Altri comandi:

```bash
npm run build             # nest build (prebuild: rimraf dist)
npm run start             # avvio senza watch
npm run start:prod        # node ./dist/main
npm run start:debug       # watch + inspector su 9229
npm run lint              # eslint --fix su src, apps, libs, test
npm run format            # prettier
npm test                  # jest (nessun test presente, vedi Note)
```

Con Docker (il `Dockerfile` fa `npm install` e `npm run build` dentro l'immagine):

```bash
docker build -t mst-gestionale-be .
docker run --env-file .env -p 3000:3000 mst-gestionale-be
```

A regime:

- API su `http://localhost:3000/api`
- Swagger UI su `http://localhost:3000/api`
- Health check su `http://localhost:3000/api/health`

Per avviare tutto il prodotto: backend su `:3000`, poi `npm run dev` nel repo
`mst-gestionale-ui` (Vite su `:5173`), che punta di default a `http://localhost:3000/api`.

## Configurazione

`main.ts` carica `.env_local` se presente, altrimenti `.env`. Nessuna variabile è
obbligatoria in senso stretto — tutte hanno un default nel codice — ma i default sono
pensati per lo sviluppo locale e vanno sostituiti in produzione.

| Variabile | Cosa fa | Default nel codice |
|---|---|---|
| `DB_HOST` | host PostgreSQL | `localhost` |
| `DB_PORT` | porta PostgreSQL | `5432` |
| `DB_USERNAME` | utente DB | `postgres` |
| `DB_PASSWORD` | password DB → `<la-tua-password-db>` | `postgres` |
| `DB_DATABASE` | nome del database | `mst_gestionale` |
| `DB_SYNCHRONIZE` | `true` allinea lo schema alle entity all'avvio | disattivo |
| `DB_LOGGING` | `true` per il log delle query | disattivo |
| `MINIO_HOST` | endpoint MinIO (lo schema `http(s)://` viene rimosso) | `localhost` |
| `MINIO_PORT` | porta MinIO | `9000` |
| `MINIO_USE_SSL` | `true` per HTTPS verso MinIO | disattivo |
| `MINIO_ACCESS_KEY` | access key → `<la-tua-access-key>` | `minioadmin` |
| `MINIO_SECRET_KEY` | secret key → `<la-tua-secret-key>` | `minioadmin` |
| `MINIO_BUCKET` | bucket usato per file, ricevute e backup | `mst-gestionale` |
| `JWT_SECRET` | segreto di firma dei token → `<il-tuo-jwt-secret>` | `your-secret-key` |
| `TOKEN_DURATION` | durata del token (es. `8h`) | `8h` |
| `APP_PORT` | porta di ascolto | `3000` |
| `APP_HOST` | interfaccia di ascolto | `0.0.0.0` |
| `REMINDER_ENABLED` | il cron dei promemoria gira solo se vale esattamente `true` | disattivo |
| `REMINDER_CRON` | espressione cron alternativa (letta ma non applicata, vedi Note) | — |
| `REMINDER_DAYS_VEHICLE_TAX` | giorni di anticipo per il bollo | `30` |
| `REMINDER_DAYS_VEHICLE_INSPECTION` | giorni di anticipo per la revisione | `30` |
| `REMINDER_DAYS_VEHICLE_INSURANCE` | giorni di anticipo per l'assicurazione | `30` |
| `REMINDER_DAYS_MEDICAL_CERTIFICATE` | giorni di anticipo per il certificato medico staff | `30` |
| `REMINDER_DAYS_DRIVING_LICENSE` | giorni di anticipo per la patente | `60` |
| `REMINDER_DAYS_SKI_INSTRUCTOR_LICENSE` | giorni di anticipo per la licenza maestro | `60` |
| `REMINDER_DAYS_COACH_LICENSE` | giorni di anticipo per la licenza allenatore | `60` |
| `REMINDER_DAYS_MEMBER_MEDICAL_CERTIFICATE` | giorni di anticipo per la visita medica tesserato | `30` |
| `ADMIN_EMAIL` | destinatario di fallback dei promemoria → `<email-amministratore>` | nessuno |

Non tutta la configurazione sta nell'ambiente: SMTP (`smtpConfig`: host, port, user,
pass, from) ed email amministratore (`adminEmail`) si impostano dall'interfaccia e
vengono salvati nella tabella `settings`. Il valore su DB ha la precedenza su
`ADMIN_EMAIL`.

## Endpoint principali

Tutte le rotte sono sotto il prefisso `/api`.

| Gruppo | Rotte |
|---|---|
| `auth` | `POST /auth/login` (pubblica), `GET /auth/me`, `POST /auth/change-password`, `POST /auth/admin-change-password` |
| `users` | CRUD completo su `/users` |
| `roles` | CRUD su `/roles`, `GET /roles/:code` |
| `capabilities` | `GET /capabilities`, `GET|POST /capabilities/roles/:roleCode`, `POST|DELETE /capabilities/roles/:roleCode/:capability` |
| `members` | CRUD, `GET /members/competitors`, foto profilo, documenti (upload/lista/download/delete), `POST /members/hotel-booking-list` |
| `staff` | CRUD, `GET /staff/me`, `PUT /staff/me`, foto profilo, documenti |
| `transactions` | CRUD, `GET /transactions/statistics`, `GET /transactions/:uuid/receipt`, `POST /transactions/import-excel`, `POST /transactions/migrate-receipts`, `POST /transactions/regenerate-receipts/:year` |
| `categories` | CRUD, `GET /categories/search` |
| `vehicles` | CRUD, `GET /vehicles/expiring` |
| `reminders` | `GET /reminders`, `/scheduled`, `/sent`, `/failed`, `POST /reminders/:uuid/resend`, `POST /reminders/check-now` |
| `settings` | CRUD su chiave/valore, backup (`/backup/database|minio|full`, `list`, `download/:filename`), restore (`/restore/database|minio`) |
| `files` | `GET /files/:uuid`, `GET /files/:uuid/download`, `DELETE /files/:uuid` |
| `dashboard` | `GET /dashboard?daysAhead=` — contenuto diverso per ruolo `admin`, `staff`, `user` |

Le liste accettano un query param `filters` con un JSON serializzato gestito da
`BaseService` (`andFilters`/`orFilters` con `equal`, `like`, `between`, `isNull`, …,
più `page`, `pageSize`, `orderBy`, `relations`) e rispondono con `[righe, totale]`.

## Struttura del progetto

```
src/
├── main.ts                      bootstrap Fastify, Swagger, CORS, prefisso /api, seed ruoli
├── app.module.ts                registrazione moduli e guard globali
├── app.controller.ts            health check pubblico
├── datasources/data-source.ts   DataSource TypeORM condiviso
├── seeds/seed-roles.ts          seed dei ruoli admin / staff / user
├── minio/                       client e helper per lo storage oggetti
├── socket-server/               gateway socket.io
├── common/
│   ├── auth/                    login, strategie passport, guard, decorator
│   ├── base-crud/               BaseService generico, filtri, entity base con uuid
│   ├── files/                   entity File e servizio di upload/download
│   └── models/                  users, roles, capabilities-per-role
└── project-related/
    ├── members/                 tesserati, documenti, lista hotel
    ├── staff/                   staff, qualifiche, documenti
    ├── transactions/            movimenti, ricevute PDF, import Excel
    ├── vehicles/                mezzi e scadenze
    ├── categories/              categorie di entrata/uscita
    ├── reminders/               scadenzario, cron, invio email
    ├── settings/                impostazioni chiave/valore, backup e restore
    └── dashboard/               aggregati per la home, per ruolo
```

## Note

- **Il file `.env` è versionato** (`.gitignore` esclude solo `.env_local`). I valori
  dentro sono di sviluppo — password e segreti generici — ma la precedenza a
  `.env_local` esiste proprio per non toccarlo: usa quello per i valori reali.
- **`DB_SYNCHRONIZE=true`** nel `.env` committato: TypeORM riallinea lo schema a ogni
  avvio. Comodo in sviluppo, rischioso in produzione, e non ci sono migration di
  ricambio.
- **Nessun seed utente.** Il seed crea solo i ruoli: il primo utente va inserito a mano
  (con password già in bcrypt) o creato via `POST /api/users` da un'istanza in cui
  esista già un account.
- **CORS aperto** (`origin: '*'`) e body limit a 2 GB per reggere i backup.
- **Il gateway socket.io è inerte**: `emitDataUpdate` ed `emitNotification` non sono
  chiamati da nessuna parte, e lato frontend il `SocketService` non è mai importato.
- **`REMINDER_CRON` non ha effetto**: `getCronExpression()` la legge, ma il decoratore
  `@Cron` usa un valore fisso (ogni giorno alle 8:00).
- **Backup dentro il container**: il `Dockerfile` non installa i client PostgreSQL, per
  cui `pg_dump`/`pg_restore` non ci sono e i backup del database falliscono con un
  errore esplicito. Lo stesso `Dockerfile` installa Google Chrome, ffmpeg, Python e
  toolchain C++ che questo progetto non usa: sono residui di un template.
- **Nessun test.** `npm test` è configurato ma non esiste alcun file `.spec.ts`.
- Il `tsconfig.json` ha `strictNullChecks` e `noImplicitAny` disattivati.
