/**
 * Shared type definitions for CoffeeChat server
 */

import type { WebSocket } from 'ws';

export interface ServerMessage {
  type: string;
  publicKey?: string;
  toID?: string;
  encrypted?: string;
  signature?: string;
  message?: string;
}

export interface CustomWebSocket extends WebSocket {
  userID?: string;
  publicKey?: string;
  isAlive?: boolean;
}

export interface ConnectionInfo {
  userID: string;
  publicKey?: string;
  connectedAt: number;
}
