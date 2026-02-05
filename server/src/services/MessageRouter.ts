/**
 * Message routing service for encrypted messages
 */

import type { CustomWebSocket } from '../types/index.js';
import type { ConnectionManager } from './ConnectionManager.js';

export class MessageRouter {
  constructor(private connectionManager: ConnectionManager) {}

  /**
   * Route encrypted message from sender to recipient
   */
  routeMessage(
    fromWs: CustomWebSocket,
    toID: string,
    encrypted: string,
    signature?: string
  ): boolean {
    if (!fromWs.userID) {
      this.sendError(fromWs, 'Sender user ID is missing');
      return false;
    }

    const recipientWs = this.connectionManager.getConnection(toID);
    
    if (!recipientWs) {
      this.sendError(fromWs, 'Recipient not found or not connected');
      return false;
    }

    // Relay encrypted message (server cannot decrypt it)
    const relayMessage: any = {
      type: 'chatmessage',
      encrypted,
      fromID: fromWs.userID
    };

    if (signature) {
      relayMessage.signature = signature;
    }

    recipientWs.send(JSON.stringify(relayMessage));
    return true;
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
