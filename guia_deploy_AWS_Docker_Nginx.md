# Guia: Deploy do Multiplayer-Soccer na AWS

Este guia está dividido em **duas partes independentes**:

1. **SEM Docker**: Node.js + PM2 + Nginx direto na EC2.
2. **COM Docker**: containers para o app Node e para o Nginx.

Use este arquivo como referência rápida quando for recriar o ambiente.

---

## PARTE A — Deploy SEM Docker (Node + PM2 + Nginx na EC2)

### A.1 Instalar Node.js, PM2 e Nginx na EC2

Assumindo uma instância **Ubuntu** nova, com o repositório `Multiplayer-Soccer` já clonado ou pronto para ser clonado.

#### A.1.1 Atualizar o sistema

```bash
sudo apt update && sudo apt upgrade -y
```

#### A.1.2 Instalar Node, npm e Nginx (modo simples)

```bash
sudo apt install -y nodejs npm nginx
node -v
npm -v
```

Opcional (recomendado): instalar Node via **nvm** para ter controle de versão:

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
source ~/.bashrc
nvm install 20
node -v
npm -v
```

#### A.1.3 Instalar PM2 globalmente

```bash
npm install -g pm2
```

#### A.1.4 Subir o servidor do jogo com PM2

Dentro da pasta do projeto `Multiplayer-Soccer` na EC2:

```bash
cd ~/Multiplayer-Soccer
npm install
pm2 start game-server.js --name multiplayer-soccer
pm2 save
pm2 startup   # siga as instruções que aparecerem
```

O servidor Node ficará escutando em `PORT` (ou `3000` por padrão, conforme o código).

---

### A.2 Configurar o Nginx como proxy reverso

A ideia: o Nginx escuta na porta **80** e repassa para o Node na porta interna (ex.: `3000`).

#### A.2.1 Editar o arquivo default do Nginx

```bash
sudo nano /etc/nginx/sites-available/default
```

Substitua o conteúdo do bloco `server { ... }` por algo como:

```nginx
server {
    listen 80;
    server_name _;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Salve e saia (Ctrl+O, Enter, Ctrl+X).

#### A.2.2 Testar e reiniciar o Nginx

```bash
sudo nginx -t
sudo systemctl restart nginx
sudo systemctl status nginx
```

#### A.2.3 Liberar porta 80 no Security Group

No console da AWS (EC2 → Security Groups):

- Adicione uma **Inbound rule**:
  - Type: `HTTP`
  - Port: `80`
  - Source: `0.0.0.0/0` (para testes; depois restrinja se quiser).

Depois disso, acessar `http://IP_DA_EC2` deve encaminhar para o Node na porta 3000.

---

## PARTE B — Deploy COM Docker (app + Nginx)

Nesta parte, **não usamos PM2 dentro do container**. O Docker (ou o orquestrador) assume o papel de gerenciar o processo.

---

### B.0 Garantir que o Docker está rodando (Linux local)

Antes de rodar `docker compose`, verifique se o serviço Docker (daemon) está ativo:

```bash
sudo systemctl start docker
sudo systemctl status docker
```

O status deve mostrar `active (running)`. Depois disso, execute os comandos de build e `docker compose up` normalmente dentro da pasta do projeto.

---

### B.1 Conceito importante: enviar projeto inteiro vs enviar só o necessário

Quando você usa um comando com `.` no final, por exemplo:

```bash
scp -i /caminho/sua-chave.pem -r . ec2-user@X.X.X.X:~/Multiplayer-Soccer
```

O ponto (`.`) significa **copiar todo o diretório atual**, incluindo subpastas, `node_modules`, builds, imagens, configs etc. Ou seja: está enviando o projeto inteiro.

Isso é normal, mas **não é o que você precisa** para instalar ou rodar um container em produção.

Na prática, para rodar um container na AWS (ou em qualquer máquina com Docker), existem opções muito mais leves.

### B.1.1 Enviar apenas a imagem Docker `.tar`

Você não precisa enviar o código fonte. Basta enviar **a imagem Docker pronta** em um arquivo `.tar`.

Na máquina local (onde a imagem já existe):

```bash
docker save multiplayer-soccer:latest -o multiplayer-soccer.tar
```

Depois, envie somente o `.tar` para a instância:

```bash
scp -i /caminho/da/chave.pem multiplayer-soccer.tar ec2-user@X.X.X.X:~/
```

Na EC2:

```bash
docker load -i multiplayer-soccer.tar
docker run -d --rm --name multiplayer-soccer-container -p 3000:3000 multiplayer-soccer:latest
```

Isso é **leve e rápido**, porque você transfere apenas o arquivo da imagem, não o projeto inteiro.

### B.1.2 Enviar apenas arquivos específicos (quando fizer sentido)

Se você **não quiser** enviar uma imagem `.tar`, ainda assim não é obrigatório mandar toda a pasta do projeto. Dá para enviar só os arquivos necessários.

Exemplos com `scp`:

- Enviar apenas o `Dockerfile`:

  ```bash
  scp -i /caminho/chave.pem Dockerfile ubuntu@IP:~/meuapp/
  ```

- Enviar apenas o build (por exemplo, pasta `dist` de uma aplicação front-end):

  ```bash
  scp -i /caminho/chave.pem -r dist ubuntu@IP:~/meuapp/
  ```

- Enviar apenas o `docker-compose.yml`:

  ```bash
  scp -i /caminho/chave.pem docker-compose.yml ubuntu@IP:~/
  ```

Use essa estratégia quando só precisa de arquivos específicos para montar/rodar containers na máquina de destino.

---

### B.2 Dockerizar o app Node (sem PM2)

No Docker, normalmente você **não usa PM2 dentro do container**. O Docker já faz o papel de gerenciar o processo principal.

#### B.2.1 `Dockerfile` para o app

Na raiz do projeto (`Multiplayer-Soccer`), use um arquivo `Dockerfile` com algo assim:

```Dockerfile
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --only=production

COPY . .

ENV PORT=3000
EXPOSE 3000

CMD ["node", "game-server.js"]
```

Buildar a imagem localmente:

```bash
docker build -t multiplayer-soccer-app .

#ou
docker build -t multiplayer-soccer-app:latest -f Dockerfile . # -t: nome:tag, -f: caminho do Dockerfile

docker build -t multiplayer-soccer-nginx:latest ./nginx
```

Testar localmente:

```bash
docker run --rm -p 3000:3000 multiplayer-soccer-app
```

Acesse `http://localhost:3000`.

---

### B.3 Dockerizar o Nginx como proxy reverso

A ideia é ter **dois containers**:

- `app`: roda o Node (`game-server.js`) na porta 3000.
- `nginx`: expõe a porta 80 e faz proxy para `app:3000`.

#### B.3.1 Estrutura de arquivos

Crie uma pasta `nginx/` na raiz do projeto com:

- `nginx/default.conf`
- `nginx/Dockerfile`

##### `nginx/default.conf`

```nginx
server {
    listen 80;
    server_name _;

    location / {
        proxy_pass http://app:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Note que o `proxy_pass` usa `http://app:3000;` — `app` será o nome do serviço Node definido no `docker-compose`.

##### `nginx/Dockerfile`

```Dockerfile
FROM nginx:stable-alpine

COPY default.conf /etc/nginx/conf.d/default.conf
```

---

### B.4 Orquestrar com `docker-compose`

#### B.4.1 `docker-compose.yml` para uso LOCAL (buildando imagens)

Na raiz do projeto, crie um arquivo `docker-compose.yml` para uso **local**, onde você vai **buildar** as imagens a partir dos `Dockerfile`:

```yaml
version: "3.9"

services:
  app:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: multiplayer-soccer-app
    expose:
      - "3000"

  nginx:
    build:
      context: ./nginx
      dockerfile: Dockerfile
    container_name: multiplayer-soccer-nginx
    ports:
      - "80:80"
    depends_on:
      - app
```

Para rodar **localmente** (na sua máquina de desenvolvimento):

```bash
docker compose up --build
```

Acesse:

- `http://localhost` → Nginx → `app:3000` (seu Node).

#### B.4.2 `docker-compose.yml` para uso na EC2 (sem build, usando imagens `.tar`)

Na EC2 você já terá as imagens carregadas via `docker load`, então **não precisa buildar de novo**.

Use um `docker-compose.yml` que referencie apenas as imagens por nome/tag:

```yaml
version: "3.9"

services:
  app:
    image: multiplayer-soccer-app:latest
    container_name: multiplayer-soccer-app
    expose:
      - "3000"

  nginx:
    image: multiplayer-soccer-nginx:latest
    container_name: multiplayer-soccer-nginx
    ports:
      - "80:80"
    depends_on:
      - app
```

> Observação: os nomes das imagens (`multiplayer-soccer-app:latest` e `multiplayer-soccer-nginx:latest`) devem bater com o que aparece em `docker images` depois dos `docker load`.

### B.5 Enviar imagens e compose para a EC2

Na sua máquina local, com as imagens já criadas:

#### B.5.1 Salvar as imagens em `.tar`

```bash
docker save multiplayer-soccer-app:latest -o multiplayer-soccer-app.tar
docker save multiplayer-soccer-nginx:latest -o multiplayer-soccer-nginx.tar
```

#### B.5.2 Enviar para a EC2

```bash
scp -i /caminho/chave.pem multiplayer-soccer-app.tar ubuntu@IP_DA_EC2:~/
scp -i /caminho/chave.pem multiplayer-soccer-nginx.tar ubuntu@IP_DA_EC2:~/
scp -i /caminho/chave.pem docker-compose.yml ubuntu@IP_DA_EC2:~/
```

#### B.5.3 Carregar as imagens e subir os containers na EC2

Na EC2 (via SSH):

```bash
cd ~
docker load -i multiplayer-soccer-app.tar
docker load -i multiplayer-soccer-nginx.tar

docker-compose up -d
```

Certifique-se de que o **Security Group** da instância permite **porta 80** (HTTP) para o mundo ou para os IPs que precisam acessar.

---

## 8. Resumo rápido (checklist)

- [ ] Instalar Node, npm e PM2 na EC2 (para cenário sem Docker).
- [ ] Instalar e configurar Nginx como proxy reverso para `127.0.0.1:3000`.
- [ ] Testar acesso via `http://IP_DA_EC2`.
- [ ] Criar `Dockerfile` do app (sem PM2) e testar localmente.
- [ ] Criar imagem do Nginx com `default.conf` apontando para `app:3000`.
- [ ] Criar `docker-compose.yml` com serviços `app` e `nginx`.
- [ ] Testar tudo localmente com `docker compose up --build`.
- [ ] Exportar imagens para `.tar` e enviar para EC2 (ou usar registry, se preferir).
- [ ] Rodar `docker compose up -d` na EC2 e abrir porta 80 no Security Group.

Com isso, você tem o mesmo ambiente que montou “na mão” (PM2 + Nginx), mas também um caminho completo para rodar tudo em containers Docker na nuvem.

---

## 9. Situações comuns e como interpretar

### 9.1 Nginx rodando, mas `ERR_CONNECTION_REFUSED` em `http://localhost`

Se o Nginx estiver ativo, mas você ver no navegador:

> Não é possível acessar esse site  
> A conexão com localhost foi recusada.  
> ERR_CONNECTION_REFUSED

e sua configuração tiver algo como:

```nginx
location / {
   proxy_pass http://127.0.0.1:3000;
}
```

Significa quase sempre que **não existe nenhum processo Node ouvindo em 127.0.0.1:3000**.

Diagnóstico rápido:

```bash
sudo ss -tulpn | grep :3000
```

Se não aparecer nada, suba o servidor do jogo:

```bash
cd ~/Multiplayer-Soccer
npm install              # se ainda não tiver feito
node game-server.js      # ou npm start / pm2 start game-server.js --name multiplayer-soccer
```

Resumindo: **Nginx sozinho não serve a aplicação**, ele só repassa para o Node. Sem Node rodando na porta configurada no `proxy_pass`, o acesso dará erro.

### 9.2 Já tenho um container antigo rodando na AWS. Como subir a “nova versão” com Nginx?

Cenário típico:

- Já existe um container com o jogo rodando **sem Nginx** (por exemplo, expondo porta 3000).
- Você criou uma nova stack com **app + Nginx** (Parte B deste guia) e quer publicar essa nova versão.

Fluxo recomendado com `.tar`:

1. **Buildar as novas imagens localmente** (app + nginx):

  ```bash
  docker compose build
  ```

2. **Salvar as novas imagens em `.tar`** (pode versionar nos nomes se quiser):

  ```bash
  docker save multiplayer-soccer-app -o multiplayer-soccer-app_v2.tar
  docker save multiplayer-soccer-nginx -o multiplayer-soccer-nginx_v1.tar
  ```

3. **Enviar para a EC2**, junto com o `docker-compose.yml` atualizado:

  ```bash
  scp -i /caminho/chave.pem multiplayer-soccer-app_v2.tar ubuntu@IP_DA_EC2:~/
  scp -i /caminho/chave.pem multiplayer-soccer-nginx_v1.tar ubuntu@IP_DA_EC2:~/
  scp -i /caminho/chave.pem docker-compose.yml ubuntu@IP_DA_EC2:~/
  ```

4. **Na EC2, carregar as imagens e subir a nova stack**:

  ```bash
  docker load -i multiplayer-soccer-app_v2.tar
  docker load -i multiplayer-soccer-nginx_v1.tar

  docker compose up -d
  ```

5. **Convivência entre versões**:

  - Se quiser **manter a versão antiga** por um tempo:
    - Deixe o container antigo escutando, por exemplo, na porta 3000 (`-p 3000:3000`).
    - A nova stack com Nginx expõe a porta 80 (`-p 80:80`).
    - Resultado:
     - Versão antiga: `http://IP_DA_EC2:3000`
     - Versão nova: `http://IP_DA_EC2`

  - Se não precisar mais da versão antiga:
    - Liste os containers e pare/remova o antigo:

     ```bash
     docker ps
     docker stop NOME_OU_ID_DO_CONTAINER_ANTIGO
     ```

     (opcional) remover a imagem antiga depois:

     ```bash
     docker images
     docker rmi NOME_OU_ID_DA_IMAGEM_ANTIGA
     ```

Assim você consegue **evoluir** de uma versão “simples” (apenas Node em um container) para uma versão **com Nginx na frente**, sem necessariamente derrubar tudo de uma vez.