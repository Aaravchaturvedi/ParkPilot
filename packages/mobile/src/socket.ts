import { io, type Socket } from 'socket.io-client';

// Single shared socket per app. The old implementation disconnected and
// recreated the socket on EVERY call, which silently killed all listeners
// registered by other screens (e.g. the partner inbox died the moment the
// ride screen connected). This version is idempotent: calling it with the
// same baseURL+token returns the live socket instead of destroying it.
//
// Tab-switching rule: screens NEVER own the socket. The App shell owns one
// connection for the whole login session; screens only attach/detach their
// event listeners (and must clean them up on unmount).

let socket: Socket | null = null;
let currentBaseURL: string | null = null;
let currentToken: string | null = null;

function sameIdentity(baseURL: string, token: string): boolean {
  return socket !== null && currentBaseURL === baseURL && currentToken === token && socket.connected;
}

/**
 * Return the live socket, creating (or re-creating) it only when the
 * identity changed or the previous socket is dead. Safe to call from any
 * screen on every render/effect — it will NOT drop existing listeners when
 * the connection is already healthy.
 */
export function ensureSocket(baseURL: string, token: string): Socket {
  if (socket && currentBaseURL === baseURL && currentToken === token) {
    if (!socket.connected) {
      try {
        socket.connect();
      } catch {
        // connect() failures surface via connect_error; caller handles acks
      }
    }
    // Refresh auth in case the token rotated (15m access expiry + refresh).
    try {
      (socket.auth as Record<string, unknown>).token = token;
    } catch {
      // older client shape — ignore
    }
    return socket;
  }
  disconnectSocket();
  socket = io(baseURL, {
    auth: { token },
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    timeout: 10000,
    transports: ['websocket', 'polling'],
  });
  currentBaseURL = baseURL;
  currentToken = token;
  return socket;
}

/** Back-compat alias. Prefer ensureSocket in new code. */
export function connectSocket(baseURL: string, token: string): Socket {
  // Preserve old "force reconnect" semantics ONLY when explicitly needed:
  // if the live socket already matches, reuse it (this is the bug fix).
  if (sameIdentity(baseURL, token) && socket) return socket;
  return ensureSocket(baseURL, token);
}

/** Force a fresh connection (logout, token rotation, server change). */
export function reconnectSocket(baseURL: string, token: string): Socket {
  disconnectSocket();
  return ensureSocket(baseURL, token);
}

export function getSocket(): Socket | null {
  return socket;
}

export function isSocketConnected(): boolean {
  return socket?.connected === true;
}

export function disconnectSocket(): void {
  try {
    socket?.removeAllListeners();
  } catch {
    // ignore
  }
  try {
    socket?.close();
  } catch {
    // ignore
  }
  socket = null;
  currentBaseURL = null;
  currentToken = null;
}
