const { PLAYER_RADIUS, BALL_RADIUS, GOAL_HEIGHT, GOAL_WIDTH } = require('./constants');
const { enforceCornerBoundaries, resetBall } = require('./ball');

function gameLoop(room, io) {
    if (!room.isPlaying) {
        return;
    }

    // Movimento dos jogadores
    Object.values(room.players).forEach((player) => {
        const speed = 5;
        player.x += (player.input.right ? speed : 0) - (player.input.left ? speed : 0);
        player.y += (player.input.down ? speed : 0) - (player.input.up ? speed : 0);

        player.x = Math.max(PLAYER_RADIUS, Math.min(room.width - PLAYER_RADIUS, player.x));
        player.y = Math.max(PLAYER_RADIUS, Math.min(room.height - PLAYER_RADIUS, player.y));
    });

    // Colisão jogador–bola
    Object.values(room.players).forEach((player) => {
        const dx = room.ball.x - player.x;
        const dy = room.ball.y - player.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance < PLAYER_RADIUS + BALL_RADIUS) {
            const angle = Math.atan2(dy, dx);
            const overlap = PLAYER_RADIUS + BALL_RADIUS - distance;

            room.ball.x += Math.cos(angle) * overlap * 1.1;
            room.ball.y += Math.sin(angle) * overlap * 1.1;

            const playerVelocity = {
                x: (player.input.right ? 5 : 0) - (player.input.left ? 5 : 0),
                y: (player.input.down ? 5 : 0) - (player.input.up ? 5 : 0),
            };

            room.ball.speedX = Math.cos(angle) * 12 + playerVelocity.x;
            room.ball.speedY = Math.sin(angle) * 12 + playerVelocity.y;
        }
    });

    // Atualiza posição da bola
    room.ball.x += room.ball.speedX;
    room.ball.y += room.ball.speedY;

    // Atrito
    room.ball.speedX *= 0.89;
    room.ball.speedY *= 0.89;

    // Colisão paredes horizontais
    if (room.ball.x < BALL_RADIUS || room.ball.x > room.width - BALL_RADIUS) {
        room.ball.speedX *= -0.7;
        room.ball.x = Math.max(BALL_RADIUS, Math.min(room.width - BALL_RADIUS, room.ball.x));
    }

    // Colisão paredes verticais
    if (room.ball.y < BALL_RADIUS || room.ball.y > room.height - BALL_RADIUS) {
        room.ball.speedY *= -0.7;
        room.ball.y = Math.max(BALL_RADIUS, Math.min(room.height - BALL_RADIUS, room.ball.y));
    }

    // Cantos
    enforceCornerBoundaries(room);

    // Gols
    const now = Date.now(); // A cada iteração do loop pega o timestamp atual
    if (!room.ballResetInProgress && now - room.lastGoalTime > room.goalCooldown) { // Evita gols múltiplos durante o cooldown
        if (room.ball.x < GOAL_WIDTH) { // Gol do time azul
            if (
                room.ball.y > room.height / 2 - GOAL_HEIGHT / 2 &&
                room.ball.y < room.height / 2 + GOAL_HEIGHT / 2
            ) { // Verifica se a bola está dentro da área do gol
                room.score.blue += 1;
                room.lastGoalTime = now; // Atualiza o tempo do último gol para evitar múltiplos gols durante o cooldown
                room.ballResetInProgress = true;
                io.to(room.id).emit('goalScored', { team: 'blue' });
                setTimeout(() => {
                    resetBall(room, io);
                }, room.goalCooldown);
            }
        } else if (room.ball.x > room.width - GOAL_WIDTH) { // Gol do time vermelho
            if (
                room.ball.y > room.height / 2 - GOAL_HEIGHT / 2 &&
                room.ball.y < room.height / 2 + GOAL_HEIGHT / 2
            ) { // Verifica se a bola está dentro da área do gol
                room.score.red += 1;
                room.lastGoalTime = now; // Atualiza o tempo do último gol para evitar múltiplos gols durante o cooldown
                room.ballResetInProgress = true;
                io.to(room.id).emit('goalScored', { team: 'red' });
                setTimeout(() => {
                    resetBall(room, io);
                }, room.goalCooldown);
            }
        }
    }

    // Bola saiu muito para fora (fallback)
    if (!room.ballResetInProgress && (room.ball.x < 0 || room.ball.x > room.width)) {
        resetBall(room, io);
    }

    // Atualiza clientes, enviando o estado do jogo
    io.to(room.id).emit('update', {
        players: room.players,
        ball: room.ball,
        score: room.score,
        matchTime: room.matchTime,
        isPlaying: room.isPlaying,
        teams: room.teams,
        roomId: room.id,
    });
}

module.exports = {
    gameLoop,
};