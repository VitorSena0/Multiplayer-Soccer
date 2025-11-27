# Multiplayer Soccer

Jogo de futebol multiplayer em tempo real construído com **Node.js**, **Express** e **Socket.IO**. O servidor simula a física básica (colisão jogador x bola) e transmite o estado oficial para todos os clientes conectados.

## Requisitos

- Node.js 18+ e npm
- Porta TCP 3000 liberada (ou configure `PORT`)

## Instalação e execução local

```bash
npm install
npm run start # ou node server.js
```

O front-end é servido a partir de `public/`. Abra `http://localhost:3000` no navegador para iniciar uma sessão.

## Salas e balanceamento

- Cada sala comporta até **6 jogadores** simultâneos (`MAX_PLAYERS_PER_ROOM`).
- Ao acessar o jogo sem parâmetros, o servidor procura uma sala disponível ou cria uma nova (`room-1`, `room-2`, ...).
- Para entrar em uma sala específica, compartilhe um link com o parâmetro `room` (ex.: `https://seu-dominio.com/?room=amigos`). O identificador é sanitizado automaticamente (apenas letras, números, `-` e `_`).
- Se uma sala estiver cheia, o cliente recebe o evento `roomFull` e a conexão é encerrada para evitar sobrecarga.
- Times são automaticamente balanceados (diferença máxima de 1 jogador). Quando houver ao menos um jogador em cada time, a partida é iniciada ou reiniciada conforme necessário.

## Reinício de partida

Quando o cronômetro chega a zero, a partida é congelada e todos os jogadores devem clicar em **Jogar Novamente** para sinalizar que estão prontos. Assim que todos estiverem prontos (e ainda houver pelo menos um jogador em cada equipe) o servidor reinicia a partida e reposiciona todos os jogadores e a bola.

## Hospedagem

- Para expor o servidor durante o desenvolvimento remoto, use `ngrok http 3000`.
- Exemplo de deploy: `https://multiplayer-soccer.onrender.com` (Render) ou instância EC2 atrás de Nginx. Garanta que `socket.io` esteja liberado através de WebSockets.

> Histórico de endpoints úteis: `191.34.226.49`, `https://4726-2804-1b1-1293-7fcc-2167-4b14-41da-1f38.ngrok-free.app`.