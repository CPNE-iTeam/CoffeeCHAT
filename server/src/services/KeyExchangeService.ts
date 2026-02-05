/**
 * Key exchange coordination service
 */

import type { CustomWebSocket } from '../types/index.js';
import type { ConnectionManager } from './ConnectionManager.js';

export class KeyExchangeService {
  constructor(private connectionManager: ConnectionManager) {}

  /**
   * Handle key exchange request between two users
   */
  handleKeyExchange(fromWs: CustomWebSocket, toID: string, publicKey: string): boolean {
    if (!fromWs.userID) {
      this.sendError(fromWs, 'Sender user ID is missing');
      return false;
    }

    const recipientWs = this.connectionManager.getConnection(toID);
    
    if (!recipientWs) {
      this.sendError(fromWs, 'Recipient not found or not connected');
      return false;
    }

    // Send requester's public key to recipient
    this.sendPublicKey(recipientWs, fromWs.userID, publicKey);

    // If recipient has a public key, send it back to requester
    const recipientPublicKey = this.connectionManager.getPublicKey(toID);
    if (recipientPublicKey) {
      this.sendPublicKey(fromWs, toID, recipientPublicKey);
    }

    return true;
  }

  /**
   * Store public key for a user
   */
  storePublicKey(userID: string, publicKey: string): void {
    this.connectionManager.storePublicKey(userID, publicKey);
  }

  /**
   * Send public key message to websocket
   */
  private sendPublicKey(ws: CustomWebSocket, fromID: string, publicKey: string): void {
    ws.send(JSON.stringify({
      type: 'publickey',
      fromID,
      publicKey
    }));
  }

  /**
   * Send error message
   */
  private sendError(ws: CustomWebSocket, message: string): void {
    ws.send(JSON.stringify({
      type: 'error',
      message
    }));
  }
}
