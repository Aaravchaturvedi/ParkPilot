import { io, type Socket } from 'socket.io-client';

let socket: Socket | null = null;

export function connectSocket(baseURL: string, token: string): Socket {
  disconnectSocket();
  socket = io(baseURL, { auth: { token } });
  return socket;
}

export function getSocket(): Socket | null {
  return socket;
}

export function disconnectSocket(): void {
  socket?.close();
  socket = null;
}
