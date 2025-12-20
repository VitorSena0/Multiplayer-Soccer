import { Server as SocketIOServer, Socket } from 'socket.io';

// Definição de tipos para o jogador
// Note: O cliente pode enviar campos adicionais como 'action', mas o servidor apenas usa os direcionais
export interface PlayerInput {
    left: boolean;
    right: boolean;
    up: boolean;
    down: boolean;
}

export interface Player {
    x: number;
    y: number;
    team: 'red' | 'blue';
    input: PlayerInput;
}

// Definição de tipos para a bola
export interface Ball {
    x: number;
    y: number;
    radius: number;
    speedX: number;
    speedY: number;
}

// Definição de tipos para o placar
export interface Score {
    red: number;
    blue: number;
}

// Definição de tipos para os times
export interface Teams {
    red: string[];
    blue: string[];
}

// Definição de tipos para a sala de jogo
export interface Room {
    id: string;
    width: number;
    height: number;
    players: { [socketId: string]: Player };
    ball: Ball;
    score: Score;
    teams: Teams;
    matchTime: number;
    isPlaying: boolean;
    isResettingBall: boolean;
    nextBallPosition: { x: number; y: number } | null;
    ballResetInProgress: boolean;
    lastGoalTime: number;
    goalCooldown: number;
    waitingForRestart: boolean;
    playersReady: Set<string>;
}

// Definição de tipos para o estado do jogo
export interface GameState {
    width: number;
    height: number;
    players: { [socketId: string]: Player };
    ball: Ball;
    score: Score;
    teams: Teams;
    matchTime: number;
    isPlaying: boolean;
    roomId: string;
}

// Definição de tipos para alocação de sala
export interface RoomAllocation {
    room?: Room;
    error?: string;
    roomId?: string;
}

// Definição de tipo para ponto (coordenadas)
export interface Point {
    x: number;
    y: number;
}

// Definição de tipo para definição de canto
export interface CornerDefinition {
    region: (ball: Ball) => boolean;
    p1: Point;
    p2: Point;
    inside: Point;
}
