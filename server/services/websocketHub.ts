import { WebSocket, WebSocketServer } from 'ws';
import type { Server } from 'http';

export interface WsBroadcastMessage {
  type: 'SNAPSHOT_UPDATED' | 'ACTIVITY_EVENT' | 'NOTIFICATION' | 'METRICS_UPDATED';
  payload: unknown;
  timestamp: string;
}

class WebSocketHub {
  private wss: WebSocketServer | null = null;
  private clients = new Set<WebSocket>();

  public attach(server: Server): void {
    if (this.wss) return;
    this.wss = new WebSocketServer({ server, path: '/ws' });

    this.wss.on('connection', (ws) => {
      this.clients.add(ws);
      ws.on('close', () => {
        this.clients.delete(ws);
      });
      ws.on('error', () => {
        this.clients.delete(ws);
      });
    });
  }

  public broadcast(type: WsBroadcastMessage['type'], payload: unknown): void {
    const message: WsBroadcastMessage = {
      type,
      payload,
      timestamp: new Date().toISOString(),
    };
    const raw = JSON.stringify(message);
    for (const client of this.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(raw);
      }
    }
  }

  public getClientCount(): number {
    let count = 0;
    for (const client of this.clients) {
      if (client.readyState === WebSocket.OPEN) count += 1;
    }
    return count;
  }
}

export const websocketHub = new WebSocketHub();
