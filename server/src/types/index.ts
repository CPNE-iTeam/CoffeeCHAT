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
  usernameHash?: string;  // Hashed username for privacy-preserving lookup
}

export interface CustomWebSocket extends WebSocket {
  userID?: string;
  publicKey?: string;
  isAlive?: boolean;
  usernameHash?: string;  // Hashed username (server never sees plaintext)
}

export interface ConnectionInfo {
  userID: string;
  publicKey?: string;
  connectedAt: number;
  usernameHash?: string;  // Hashed username for lookup
}
