# Imagem base oficial do Node (LTS)
FROM node:20-alpine

# Diretório de trabalho dentro do container
WORKDIR /app

# Copia apenas package* primeiro para aproveitar cache
COPY package*.json ./
COPY tsconfig*.json ./

# Instala todas as dependências (incluindo devDependencies para build)
RUN npm install

# Copia o código fonte TypeScript
COPY game/ ./game/
COPY src/ ./src/
COPY game-server.ts ./
COPY public/ ./public/

# Compila o código TypeScript
RUN npm run build

# Remove devDependencies após build (opcional, para imagem menor)
RUN npm prune --production

# Variável de ambiente da porta (o servidor usa process.env.PORT)
ENV PORT=3000

# Expõe a porta (o mapeamento real é feito no docker run)
EXPOSE 3000

# Comando de inicialização
CMD ["node", "dist/game-server.js"]
