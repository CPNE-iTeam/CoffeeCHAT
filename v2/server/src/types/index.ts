/**
 * Server Types
 */

import type { WebSocket } from 'ws';

export interface CustomWebSocket extends WebSocket {
  username?: string;
  isAlive?: boolean;
}

export interface ServerMessage {
  type: string;
  [key: string]: unknown;
}

export interface ChatMessage extends ServerMessage {
  type: 'chatmessage';
  to: string;  // recipient username
  content: string;
  contentType: 'text' | 'image';
}

export interface GroupMessage extends ServerMessage {
  type: 'groupmessage';
  groupID: string;
  content: string;
  contentType: 'text' | 'image';
}

export interface CreateGroup extends ServerMessage {
  type: 'creategroup';
  groupID: string;
  groupName: string;
  members: string[];  // usernames
  creator: string;    // creator username
}

export interface AddGroupMembers extends ServerMessage {
  type: 'addgroupmembers';
  groupID: string;
  members: string[];  // usernames to add
}

export interface SetUsername extends ServerMessage {
  type: 'setusername';
  username: string;
}

export interface FindUser extends ServerMessage {
  type: 'finduser';
  username: string;
}

// Group storage (in-memory)
export interface GroupInfo {
  id: string;
  name: string;
  members: string[];  // usernames
  creator: string;    // creator username
}
