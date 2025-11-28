FROM node:20-bullseye

WORKDIR /app

RUN apt-get update && apt-get install -y \
    python3 make g++ bash \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./

RUN npm install

COPY . .

RUN npm run build && npm run db:migrate && npm run create-admin

STOPSIGNAL SIGTERM

EXPOSE 3000

CMD ["sh", "-c", "npm run start"]
