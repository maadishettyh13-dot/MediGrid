import { useCallback, useEffect, useRef, useState } from 'react';
import { DashboardSnapshot } from '../types/medilink';

export type WsConnectionState = 'CONNECTED' | 'RECONNECTING' | 'OFFLINE';

export interface LiveNotification {
  id: string;
  title: string;
  message: string;
  severity: 'CRITICAL' | 'HIGH' | 'NORMAL';
  hospital_id: string | null;
  created_at: string;
}

export function useMediLinkSocket(enabled: boolean) {
  const [snapshot, setSnapshot] = useState<DashboardSnapshot | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [wsState, setWsState] = useState<WsConnectionState>('RECONNECTING');
  const [notifications, setNotifications] = useState<LiveNotification[]>([]);
  const [lastServedBy, setLastServedBy] = useState<string>('instance-alpha');

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const fetchInFlightRef = useRef<boolean>(false);

  const fetchSnapshot = useCallback(async () => {
    if (fetchInFlightRef.current) return;
    fetchInFlightRef.current = true;
    try {
      const res = await fetch('/api/snapshot');
      const servedBy = res.headers.get('X-MediLink-Instance');
      if (servedBy) setLastServedBy(servedBy);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const data = (await res.json()) as DashboardSnapshot;
      setSnapshot(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load operational snapshot');
    } finally {
      fetchInFlightRef.current = false;
      setLoading(false);
    }
  }, []);

  const dismissNotification = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  useEffect(() => {
    if (!enabled) return;

    void fetchSnapshot();

    let disposed = false;

    const connect = () => {
      if (disposed) return;
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws`;

      try {
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          if (disposed) return;
          setWsState('CONNECTED');
          void fetchSnapshot();
        };

        ws.onmessage = (event) => {
          if (disposed) return;
          try {
            const msg = JSON.parse(event.data as string) as {
              type: string;
              payload: Record<string, unknown>;
            };

            if (msg.type === 'SNAPSHOT_UPDATED' || msg.type === 'ACTIVITY_EVENT') {
              void fetchSnapshot();
            } else if (msg.type === 'METRICS_UPDATED') {
              setSnapshot((prev) => {
                if (!prev) return prev;
                return {
                  ...prev,
                  metrics: {
                    ...prev.metrics,
                    redis: (msg.payload.redis as DashboardSnapshot['metrics']['redis']) || prev.metrics.redis,
                    rabbitmq: (msg.payload.rabbitmq as DashboardSnapshot['metrics']['rabbitmq']) || prev.metrics.rabbitmq,
                    ws_clients:
                      typeof msg.payload.ws_clients === 'number'
                        ? msg.payload.ws_clients
                        : prev.metrics.ws_clients,
                  },
                };
              });
            } else if (msg.type === 'NOTIFICATION') {
              const notif = msg.payload as unknown as LiveNotification;
              setNotifications((prev) => {
                if (prev.some((n) => n.id === notif.id)) return prev;
                return [notif, ...prev].slice(0, 5);
              });
            }
          } catch {
            // Ignore malformed socket frames
          }
        };

        ws.onclose = () => {
          if (disposed) return;
          setWsState('RECONNECTING');
          reconnectTimerRef.current = window.setTimeout(connect, 2000);
        };

        ws.onerror = () => {
          if (disposed) return;
          setWsState('OFFLINE');
          ws.close();
        };
      } catch {
        setWsState('OFFLINE');
        reconnectTimerRef.current = window.setTimeout(connect, 2500);
      }
    };

    connect();

    return () => {
      disposed = true;
      if (reconnectTimerRef.current) {
        window.clearTimeout(reconnectTimerRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [enabled, fetchSnapshot]);

  return {
    snapshot,
    setSnapshot,
    loading,
    error,
    wsState,
    notifications,
    dismissNotification,
    refreshSnapshot: fetchSnapshot,
    lastServedBy,
  };
}
