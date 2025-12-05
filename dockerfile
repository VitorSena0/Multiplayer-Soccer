# Imagem base oficial do Node (LTS)
FROM node:20-alpine

# Diretório de trabalho dentro do container
WORKDIR /app

# Copia apenas package* primeiro para aproveitar cache
COPY package*.json ./

# Instala dependências em modo produção
RUN npm install --only=production

# Copia o restante do código
COPY . .

# Variável de ambiente da porta (o servidor usa process.env.PORT)
ENV PORT=3000

# Expõe a porta (o mapeamento real é feito no docker run)
EXPOSE 3000

# Comando de inicialização
CMD ["node", "game-server.js"]
