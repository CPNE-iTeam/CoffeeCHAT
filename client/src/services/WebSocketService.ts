/**
 * WebSocket connection management service
 */

import type { ChatMessage } from '../types';

export type MessageHandler = (message: ChatMessage) => void;
export type StatusHandler = (status: string, isConnected: boolean) => void;

export class WebSocketService {
  private ws: WebSocket | null = null;
  private messageHandlers: Set<MessageHandler> = new Set();
  private statusHandlers: Set<StatusHandler> = new Set();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 2000;

  /**
   * Connect to WebSocket server
   */
  connect(url: string): void {
    this.updateStatus('Connecting...', false);
    this.ws = new WebSocket(url);

    this.ws.onopen = () => {
      this.reconnectAttempts = 0;
      this.updateStatus('Connected', true);
    };

    this.ws.onmessage = (event) => {
      try {
        const data: ChatMessage = JSON.parse(event.data);
        this.notifyMessageHandlers(data);
      } catch (error) {
        // Silently ignore malformed messages
      }
    };

    this.ws.onerror = () => {
      this.updateStatus('Connection error', false);
    };

    this.ws.onclose = () => {
      this.updateStatus('Disconnected', false);
      this.attemptReconnect(url);
    };
  }

  /**
   * Send message through WebSocket
   */
  send(message: ChatMessage): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    } else {
      throw new Error('WebSocket not connected');
    }
  }

  /**
   * Register message handler
   */
  onMessage(handler: MessageHandler): () => void {
    this.messageHandlers.add(handler);
    // Return unsubscribe function
    return () => this.messageHandlers.delete(handler);
  }

  /**
   * Register status change handler
   */
  onStatusChange(handler: StatusHandler): () => void {
    this.statusHandlers.add(handler);
    return () => this.statusHandlers.delete(handler);
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  /**
   * Disconnect WebSocket
   */
  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  private notifyMessageHandlers(message: ChatMessage): void {
    this.messageHandlers.forEach(handler => handler(message));
  }

  private updateStatus(status: string, isConnected: boolean): void {
    this.statusHandlers.forEach(handler => handler(status, isConnected));
  }

  private attemptReconnect(url: string): void {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      this.updateStatus(`Reconnecting (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`, false);
      setTimeout(() => this.connect(url), this.reconnectDelay);
    } else {
      this.updateStatus('Connection failed', false);
    }
  }
}
