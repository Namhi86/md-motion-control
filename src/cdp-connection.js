// Kết nối Chrome DevTools Protocol (CDP) qua WebSocket (tương thích cả Node 20/Electron 33 và Node 22)
import WsWebSocket from 'ws';

if (typeof globalThis.WebSocket !== 'function') {
  globalThis.WebSocket = WsWebSocket;
}

export const DEFAULT_COMMAND_MS = 30000;
export const CONNECT_MS = 10000;

export class CdpError extends Error {
  constructor(message, { code = 0, method = '' } = {}) {
    super(message);
    this.name = 'CdpError';
    this.code = code;
    this.method = method;
  }
}

export function connectCdp(
  wsUrl,
  {
    connectMs = CONNECT_MS,
    WebSocketImpl = globalThis.WebSocket || WsWebSocket,
  } = {}
) {
  return new Promise((resolve, reject) => {
    if (typeof WebSocketImpl !== 'function') {
      return reject(new CdpError('this runtime has no WebSocket'));
    }

    let ws;
    try {
      ws = new WebSocketImpl(wsUrl);
    } catch (err) {
      return reject(new CdpError('cannot connect: ' + err.message));
    }

    const connectTimer = setTimeout(() => {
      try {
        ws.close();
      } catch {
        // Bỏ qua lỗi khi đóng kết nối hết hạn
      }
      reject(new CdpError('DevTools did not answer in ' + connectMs + ' ms'));
    }, connectMs);

    let nextId = 0;
    let isOpen = false;
    const pending = new Map();
    const listeners = new Set();
    let closeReason = '';
    let resolveClosed;
    const closedPromise = new Promise((r) => {
      resolveClosed = r;
    });

    const rejectAllPending = (reason) => {
      for (const [, entry] of pending) {
        clearTimeout(entry.timer);
        entry.reject(new CdpError(reason, { method: entry.method }));
      }
      pending.clear();
    };

    ws.addEventListener('open', () => {
      clearTimeout(connectTimer);
      isOpen = true;
      resolve({
        get isOpen() {
          return isOpen;
        },
        closed: closedPromise,
        send(
          method,
          params = {},
          { sessionId, timeout = DEFAULT_COMMAND_MS } = {}
        ) {
          if (!isOpen) {
            return Promise.reject(
              new CdpError(
                closeReason || 'the DevTools connection is closed',
                { method }
              )
            );
          }
          nextId += 1;
          const id = nextId;
          return new Promise((resCmd, rejCmd) => {
            const timer = setTimeout(() => {
              pending.delete(id);
              rejCmd(
                new CdpError(
                  method + ' was not answered in ' + timeout + ' ms',
                  { method }
                )
              );
            }, timeout);
            pending.set(id, {
              resolve: resCmd,
              reject: rejCmd,
              timer,
              method,
            });
            try {
              ws.send(
                JSON.stringify({
                  id,
                  method,
                  params,
                  ...(sessionId ? { sessionId } : {}),
                })
              );
            } catch (err) {
              clearTimeout(timer);
              pending.delete(id);
              rejCmd(
                new CdpError(
                  method + ' could not be sent: ' + err.message,
                  { method }
                )
              );
            }
          });
        },
        on(fn) {
          listeners.add(fn);
          return () => listeners.delete(fn);
        },
        close() {
          isOpen = false;
          try {
            ws.close();
          } catch {
            // Bỏ qua lỗi khi đóng
          }
        },
      });
    });

    ws.addEventListener('message', (evt) => {
      let msg;
      try {
        msg = JSON.parse(
          typeof evt.data === 'string'
            ? evt.data
            : Buffer.from(evt.data).toString('utf8')
        );
      } catch {
        return;
      }

      if (msg.id !== undefined && pending.has(msg.id)) {
        const entry = pending.get(msg.id);
        pending.delete(msg.id);
        clearTimeout(entry.timer);
        if (msg.error) {
          entry.reject(
            new CdpError(msg.error.message || 'DevTools error', {
              code: msg.error.code,
              method: entry.method,
            })
          );
        } else {
          entry.resolve(msg.result ?? {});
        }
      } else if (msg.method) {
        for (const fn of [...listeners]) {
          try {
            fn({
              method: msg.method,
              params: msg.params || {},
              sessionId: msg.sessionId || '',
            });
          } catch {
            // Bỏ qua lỗi listener
          }
        }
      }
    });

    ws.addEventListener('error', () => {
      if (!isOpen) {
        clearTimeout(connectTimer);
        reject(new CdpError('cannot connect to DevTools'));
      }
    });

    ws.addEventListener('close', () => {
      isOpen = false;
      closeReason = 'the DevTools connection closed (Chrome went away)';
      rejectAllPending(closeReason);
      resolveClosed();
    });
  });
}
