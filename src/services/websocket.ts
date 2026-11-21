type MessageCallback = (data: any) => void;

class RealtimeSignalingService {
  private ws: WebSocket | null = null;
  private listeners: Map<string, Set<MessageCallback>> = new Map();
  private isConnected = false;
  private currentRoom: string | null = null;
  private pendingQueue: any[] = [];
  private reconnectTimer: any = null;

  connect() {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const wsUrl = `${protocol}//${host}/ws`;

    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        this.isConnected = true;
        while (this.pendingQueue.length > 0) {
          const item = this.pendingQueue.shift();
          this.sendRaw(item);
        }
        if (this.currentRoom) {
          this.emit('reconnected', { room: this.currentRoom });
        }
      };

      this.ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          const eventType = message.type;
          const handlers = this.listeners.get(eventType);
          if (handlers) {
            handlers.forEach((cb) => cb(message));
          }
          const wildcard = this.listeners.get('*');
          if (wildcard) {
            wildcard.forEach((cb) => cb(message));
          }
        } catch (e) {
          console.error('Error parsing WebSocket frame:', e);
        }
      };

      this.ws.onclose = () => {
        this.isConnected = false;
        this.emit('disconnected', {});
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = setTimeout(() => {
          this.connect();
        }, 2500);
      };

      this.ws.onerror = (err) => {
        console.warn('Signaling socket notice:', err);
      };
    } catch (e) {
      console.error('WebSocket connection error:', e);
    }
  }

  joinRoom(meetingCode: string, participant: any, options?: { idToken?: string | null; password?: string }) {
    this.currentRoom = meetingCode;
    this.send('join-room', meetingCode, {
      participant,
      idToken: options?.idToken || undefined,
      password: options?.password || undefined,
    });
  }

  leaveRoom(meetingCode: string, participantId: string) {
    this.send('leave-room', meetingCode, { participantId });
    this.currentRoom = null;
  }

  send(type: string, meetingCode: string, payload: any) {
    const data = { type, meetingCode, payload };
    if (this.isConnected && this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.sendRaw(data);
    } else {
      this.pendingQueue.push(data);
      this.connect();
    }
  }

  private sendRaw(data: any) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  on(eventType: string, callback: MessageCallback) {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, new Set());
    }
    this.listeners.get(eventType)!.add(callback);
    return () => this.off(eventType, callback);
  }

  off(eventType: string, callback: MessageCallback) {
    const handlers = this.listeners.get(eventType);
    if (handlers) {
      handlers.delete(callback);
      if (handlers.size === 0) {
        this.listeners.delete(eventType);
      }
    }
  }

  private emit(eventType: string, data: any) {
    const handlers = this.listeners.get(eventType);
    if (handlers) {
      handlers.forEach((cb) => cb(data));
    }
  }

  disconnect() {
    clearTimeout(this.reconnectTimer);
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.isConnected = false;
  }
}

export const realtime = new RealtimeSignalingService();
