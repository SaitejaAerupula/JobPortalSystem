import { Server as HttpServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { env } from './env';

let io: SocketIOServer | null = null;

export function initializeSocket(server: HttpServer) {
  io = new SocketIOServer(server, {
    cors: {
      origin: env.CLIENT_ORIGIN,
      credentials: true
    }
  });

  io.on('connection', (socket) => {
    socket.on('join:user', (userId: string) => {
      socket.join(`user:${userId}`);
    });

    socket.on('disconnect', () => {
      // Socket disconnect handled by library internals.
    });
  });

  return io;
}

export function getIO() {
  if (!io) {
    throw new Error('Socket server not initialized');
  }
  return io;
}
