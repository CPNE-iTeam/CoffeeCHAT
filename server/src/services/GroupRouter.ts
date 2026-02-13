/**
 * Group message routing service
 * Routes encrypted group messages to all online members
 * Server only sees encrypted payloads - cannot read message content
 */

import type { CustomWebSocket, ServerMessage } from '../types/index.js';
import type { ConnectionManager } from './ConnectionManager.js';

export class GroupRouter {
  private connectionManager: ConnectionManager;

  constructor(connectionManager: ConnectionManager) {
    this.connectionManager = connectionManager;
  }

  /**
   * Route a group creation message to all specified members
   * Each member receives the group info to add to their local storage
   */
  routeGroupCreation(
    senderWs: CustomWebSocket,
    groupID: string,
    groupName: string,
    memberIDs: string[],
    creatorID: string
  ): void {
    if (!senderWs.userID) return;

    const message: ServerMessage = {
      type: 'groupcreated',
      groupID,
      groupName,
      memberIDs,
      creatorID
    };

    // Send to all members (including sender for confirmation)
    for (const memberID of memberIDs) {
      const memberWs = this.connectionManager.getConnection(memberID);
      if (memberWs && memberWs.readyState === 1) { // WebSocket.OPEN
        memberWs.send(JSON.stringify(message));
      }
    }
  }

  /**
   * Route a group message to all online members
   * Message contains pairwise encrypted payloads for each recipient
   */
  routeGroupMessage(
    senderWs: CustomWebSocket,
    groupID: string,
    encryptedPayloads: Array<{
      toID: string;
      encrypted: string;
      signature: string;
    }>
  ): void {
    if (!senderWs.userID) return;

    // Route each encrypted payload to its intended recipient
    for (const payload of encryptedPayloads) {
      const recipientWs = this.connectionManager.getConnection(payload.toID);
      
      if (recipientWs && recipientWs.readyState === 1) { // WebSocket.OPEN
        // Send individual message to each recipient with their specific encrypted payload
        recipientWs.send(JSON.stringify({
          type: 'groupmessage',
          groupID,
          fromID: senderWs.userID,
          encrypted: payload.encrypted,
          signature: payload.signature
        }));
      }
    }
  }
}
