const { BALL_RADIUS, CORNER_SIZE } = require('./constants');

function resetBall(room, io) {
    const thirdWidth = room.width / 3;
    const minX = room.width / 2 - thirdWidth / 2;
    const maxX = room.width / 2 + thirdWidth / 2;
    const thirdHeight = room.height / 3;
    const minY = room.height / 2 - thirdHeight / 2;
    const maxY = room.height / 2 + thirdHeight / 2;

    room.ball = {
        x: minX + Math.random() * (maxX - minX),
        y: minY + Math.random() * (maxY - minY),
        radius: BALL_RADIUS,
        speedX: 0,
        speedY: 0,
    };

    room.ballResetInProgress = false; // Reseta o flag de reinício da bola, serve para evitar múltiplos gols durante o cooldown

    io.to(room.id).emit('ballReset', { ball: room.ball });
}

function getCornerDefinitions(room) {
    const cs = CORNER_SIZE;
    return [
        {
            region: (ball) => ball.x < cs && ball.y < cs,
            p1: { x: 0, y: cs },
            p2: { x: cs, y: 0 },
            inside: { x: cs * 2, y: cs * 2 },
        },
        {
            region: (ball) => ball.x > room.width - cs && ball.y < cs,
            p1: { x: room.width - cs, y: 0 },
            p2: { x: room.width, y: cs },
            inside: { x: Math.max(room.width - cs * 2, room.width / 2), y: cs * 2 },
        },
        {
            region: (ball) => ball.x < cs && ball.y > room.height - cs,
            p1: { x: 0, y: room.height - cs },
            p2: { x: cs, y: room.height },
            inside: { x: cs * 2, y: Math.max(room.height - cs * 2, room.height / 2) },
        },
        {
            region: (ball) => ball.x > room.width - cs && ball.y > room.height - cs,
            p1: { x: room.width - cs, y: room.height },
            p2: { x: room.width, y: room.height - cs },
            inside: {
                x: Math.max(room.width - cs * 2, room.width / 2),
                y: Math.max(room.height - cs * 2, room.height / 2),
            },
        },
    ];
}

function enforceCornerBoundaries(room) {
    const corners = getCornerDefinitions(room);
    const ball = room.ball;

    for (const corner of corners) {
        if (!corner.region(ball)) {
            continue;
        }

        const A = corner.p2.y - corner.p1.y;
        const B = -(corner.p2.x - corner.p1.x);
        const C = (corner.p2.x - corner.p1.x) * corner.p1.y - (corner.p2.y - corner.p1.y) * corner.p1.x;
        const norm = Math.hypot(A, B) || 1;
        const insideValue = A * corner.inside.x + B * corner.inside.y + C;
        const insideSign = Math.sign(insideValue) || 1;
        const signedDistance = ((A * ball.x + B * ball.y + C) / norm) * insideSign;

        if (signedDistance >= BALL_RADIUS) {
            continue;
        }

        const penetration = BALL_RADIUS - signedDistance;
        const normalX = (A / norm) * insideSign;
        const normalY = (B / norm) * insideSign;

        ball.x += normalX * penetration;
        ball.y += normalY * penetration;

        const velocityAlongNormal = ball.speedX * normalX + ball.speedY * normalY;
        if (velocityAlongNormal < 0) {
            const damping = 0.7;
            ball.speedX -= (1 + damping) * velocityAlongNormal * normalX;
            ball.speedY -= (1 + damping) * velocityAlongNormal * normalY;
        }

        break;
    }
}

module.exports = {
    resetBall,
    enforceCornerBoundaries,
};