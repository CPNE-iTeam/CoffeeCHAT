/**
 * WebSocket connection management service
 */

import type { CustomWebSocket, ConnectionInfo } from '../types/index.js';

export class ConnectionManager {
  private connections: Map<string, CustomWebSocket> = new Map();
  private connectionInfo: Map<string, ConnectionInfo> = new Map();

  /**
   * Register a new connection
   */
  registerConnection(ws: CustomWebSocket, userID: string): void {
    ws.userID = userID;
    this.connections.set(userID, ws);
    this.connectionInfo.set(userID, {
      userID,
      connectedAt: Date.now()
    });
  }

  /**
   * Unregister connection
   */
  unregisterConnection(userID: string): void {
    this.connections.delete(userID);
    this.connectionInfo.delete(userID);
  }

  /**
   * Get connection by user ID
   */
  getConnection(userID: string): CustomWebSocket | undefined {
    return this.connections.get(userID);
  }

  /**
   * Store public key for user
   */
  storePublicKey(userID: string, publicKey: string): void {
    const conn = this.connections.get(userID);
    if (conn) {
      conn.publicKey = publicKey;
    }
    
    const info = this.connectionInfo.get(userID);
    if (info) {
      info.publicKey = publicKey;
    }
  }

  /**
   * Get public key for user
   */
  getPublicKey(userID: string): string | undefined {
    const conn = this.connections.get(userID);
    return conn?.publicKey;
  }

  /**
   * Check if user is connected
   */
  isUserConnected(userID: string): boolean {
    return this.connections.has(userID);
  }

  /**
   * Get all connected user IDs
   */
  getConnectedUserIDs(): string[] {
    return Array.from(this.connections.keys());
  }

  /**
   * Get connection count
   */
  getConnectionCount(): number {
    return this.connections.size;
  }

  /**
   * Get connection info
   */
  getConnectionInfo(userID: string): ConnectionInfo | undefined {
    return this.connectionInfo.get(userID);
  }
}
