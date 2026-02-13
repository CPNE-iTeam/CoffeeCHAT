/**
 * WebSocket Service - Handles connection and message routing
 */

import type { WSMessage } from '../types';
import { eventBus } from './EventEmitter';

const RECONNECT_DELAYS = [1000, 2000, 5000, 10000, 30000];
const HEARTBEAT_INTERVAL = 25000;

export class WebSocketService {
  private ws: WebSocket | null = null;
  private url: string;
  private reconnectAttempt = 0;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private messageQueue: WSMessage[] = [];
  private _isConnected = false;

  constructor() {
    const port = import.meta.env.VITE_WSS_PORT || '8080';
    this.url = `wss://localhost:${port}`;
  }

  get isConnected(): boolean {
    return this._isConnected;
  }

  /**
   * Connect to WebSocket server
   */
  connect(): void {
    if (this.ws?.readyState === WebSocket.OPEN) return;

    this.updateStatus('connecting');

    try {
      this.ws = new WebSocket(this.url);
      this.setupEventHandlers();
    } catch (error) {
      console.error('WebSocket connection error:', error);
      this.scheduleReconnect();
    }
  }

  /**
   * Disconnect from server
   */
  disconnect(): void {
    this.clearTimers();
    
    if (this.ws) {
      this.ws.onclose = null; // Prevent reconnect
      this.ws.close();
      this.ws = null;
    }
    
    this._isConnected = false;
    this.updateStatus('disconnected');
  }

  /**
   * Send a message to the server
   */
  send(message: WSMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    } else {
      // Queue message for when connection is restored
      this.messageQueue.push(message);
    }
  }

  private setupEventHandlers(): void {
    if (!this.ws) return;

    this.ws.onopen = () => {
      this._isConnected = true;
      this.reconnectAttempt = 0;
      this.updateStatus('connected');
      this.startHeartbeat();
      this.flushMessageQueue();
    };

    this.ws.onclose = () => {
      this._isConnected = false;
      this.updateStatus('disconnected');
      this.clearTimers();
      this.scheduleReconnect();
    };

    this.ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    this.ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data) as WSMessage;
        this.handleMessage(message);
      } catch (error) {
        console.error('Failed to parse message:', error);
      }
    };
  }

  private handleMessage(message: WSMessage): void {
    // Emit event for the message type
    eventBus.emit(`ws:${message.type}`, message);
    
    // Also emit a general message event
    eventBus.emit('ws:message', message);
  }

  private updateStatus(status: 'connected' | 'disconnected' | 'connecting'): void {
    eventBus.emit('connection:status', status);
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimeout) return;

    const delay = RECONNECT_DELAYS[Math.min(this.reconnectAttempt, RECONNECT_DELAYS.length - 1)];
    this.reconnectAttempt++;

    this.reconnectTimeout = setTimeout(() => {
      this.reconnectTimeout = null;
      this.connect();
    }, delay);
  }

  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.send({ type: 'ping' });
      }
    }, HEARTBEAT_INTERVAL);
  }

  private clearTimers(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  private flushMessageQueue(): void {
    while (this.messageQueue.length > 0) {
      const message = this.messageQueue.shift();
      if (message) this.send(message);
    }
  }
}

// Singleton instance
export const wsService = new WebSocketService();
