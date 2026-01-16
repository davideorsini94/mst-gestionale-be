## Usa un'immagine di base che include Python 3.10
#FROM python:3.10-slim
FROM ubuntu:24.04

# Installa Node.js 22
RUN apt-get update && apt-get install -y curl gnupg && \
    curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && \
    apt-get install -y nodejs && \
    rm -rf /var/lib/apt/lists/*

# Install Google Chrome Stable and fonts
# Note: this installs the necessary libs to make the browser work with Puppeteer.
RUN apt-get update && apt-get install gnupg wget -y && \
  wget --quiet --output-document=- https://dl-ssl.google.com/linux/linux_signing_key.pub | gpg --dearmor > /etc/apt/trusted.gpg.d/google-archive.gpg && \
  sh -c 'echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google.list' && \
  apt-get update && \
  apt-get install google-chrome-stable -y --no-install-recommends && \
  rm -rf /var/lib/apt/lists/*
  
 RUN apt-get update && apt-get install ffmpeg libsm6 libxext6 -y
 RUN apt-get update && apt-get install -y libgcc-s1 libstdc++6 python3 gcc g++ make

# Imposta la directory di lavoro su suis-catalog all'interno del container
WORKDIR /mst-gestionale-be

# Copia i file Python e Node.js necessari nella directory di lavoro
COPY package.json /mst-gestionale-be/

# Copia il resto del codice nella directory di lavoro
COPY . /mst-gestionale-be
RUN rm -rf ./dist
#RUN rm -rf ./node_modules
#RUN sh node_install_and_build.sh
RUN npm install
RUN npm run build
RUN rm -rf ./src
RUN rm -rf ./.github

# Esegui l'applicazione all'avvio del container
CMD ["node", "./dist/main"]

