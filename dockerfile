# Imagem base oficial do Node (LTS)
FROM node:20-alpine

# Diretório de trabalho dentro do container
WORKDIR /app

# Copia apenas package* primeiro para aproveitar cache
COPY package*.json ./

# Instala todas as dependências (incluindo devDependencies para build)
RUN npm install

# Copia o código TypeScript e arquivos de configuração
COPY tsconfig*.json ./
COPY game-server.ts ./
COPY game ./game
COPY public ./public

# Compila o TypeScript
RUN npm run build

# Remove devDependencies após o build para reduzir tamanho da imagem
RUN npm prune --production

# Variável de ambiente da porta (o servidor usa process.env.PORT)
ENV PORT=3000

# Expõe a porta (o mapeamento real é feito no docker run)
EXPOSE 3000

# Comando de inicialização
CMD ["node", "dist/game-server.js"]
