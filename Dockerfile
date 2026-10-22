# Build: dipendenze dal package-lock (npm ci, build riproducibili), compilazione, poi solo dipendenze di produzione.
# Nessun compilatore: l'unica dipendenza nativa (bcrypt) ha i binari precompilati per linux-x64.
FROM node:22-bookworm-slim AS build
WORKDIR /mst-gestionale-be
ENV SCARF_ANALYTICS=false
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build && npm prune --omit=dev --no-audit --no-fund

# Esecuzione: Ubuntu 24.04 per pg_dump / pg_restore 16 (backup e ripristino dalle Impostazioni, stessa versione del
# server Postgres). Niente Chrome, ffmpeg, python o gcc: i PDF si generano con pdfkit.
FROM ubuntu:24.04
RUN apt-get update \
  && apt-get install -y --no-install-recommends postgresql-client-16 ca-certificates tzdata \
  && rm -rf /var/lib/apt/lists/*
# solo l'eseguibile di node (npm non serve a runtime)
COPY --from=build /usr/local/bin/node /usr/local/bin/node

WORKDIR /mst-gestionale-be
COPY --from=build /mst-gestionale-be/package.json ./
COPY --from=build /mst-gestionale-be/node_modules ./node_modules
COPY --from=build /mst-gestionale-be/dist ./dist

# In produzione nessun file .env viene letto (vedi src/main.ts): le variabili arrivano dall'ambiente del container
ENV NODE_ENV=production

# Esegui l'applicazione all'avvio del container
CMD ["node", "./dist/main"]
