import { Server as SocketIOServer, Socket } from 'socket.io';

// Tipos para entrada de controle do jogador
export interface PlayerInput {
    left: boolean;
    right: boolean;
    up: boolean;
    down: boolean;
}

// Tipos para jogador
export interface Player {
    x: number;
    y: number;
    team: 'red' | 'blue';
    input: PlayerInput;
}

// Tipos para bola
export interface Ball {
    x: number;
    y: number;
    radius: number;
    speedX: number;
    speedY: number;
}

// Tipos para placar
export interface Score {
    red: number;
    blue: number;
}

// Tipos para times
export interface Teams {
    red: string[];
    blue: string[];
}

// Tipos para sala de jogo
export interface Room {
    id: string;
    width: number;
    height: number;
    players: Record<string, Player>;
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

// Tipos para estado do jogo enviado ao cliente
export interface GameState {
    width: number;
    height: number;
    players: Record<string, Player>;
    ball: Ball;
    score: Score;
    teams: Teams;
    matchTime: number;
    isPlaying: boolean;
    roomId: string;
}

// Tipo para resultado da alocação de sala
export interface RoomAllocationResult {
    room?: Room;
    error?: 'room-full';
    roomId?: string;
}

// Tipo para definição de canto
export interface CornerDefinition {
    region: (ball: Ball) => boolean;
    p1: { x: number; y: number };
    p2: { x: number; y: number };
    inside: { x: number; y: number };
}

// Socket.IO types
export type GameSocket = Socket;
export type GameIO = SocketIOServer;
