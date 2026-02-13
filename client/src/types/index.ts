/**
 * CoffeeCHAT v2 - Type Definitions
 */

// ==================== Core Types ====================

export interface Contact {
  username: string;
  displayName?: string;
  isOnline?: boolean;
  lastSeen?: number;
  messages: Message[];
  unreadCount: number;
  blocked: boolean;
  createdAt: number;
}

export interface Group {
  id: string;
  name: string;
  members: string[];  // usernames
  creator: string;    // creator username
  createdAt: number;
  messages: Message[];
  unreadCount: number;
}

export interface Message {
  id: string;
  content: string;
  from: string;       // username
  timestamp: number;
  contentType: ContentType;
  status: MessageStatus;
}

export type ContentType = 'text' | 'image';
export type MessageStatus = 'sending' | 'sent' | 'delivered' | 'failed';
export type MessageDisplayType = 'sent' | 'received' | 'system';

// ==================== WebSocket Messages ====================

export interface WSMessage {
  type: string;
  [key: string]: unknown;
}

export interface WSWelcome extends WSMessage {
  type: 'welcome';
  username: string;
}

export interface WSChatMessage extends WSMessage {
  type: 'chatmessage';
  to?: string;        // recipient username (for outgoing)
  from?: string;      // sender username (for incoming)
  content: string;
  contentType: ContentType;
  timestamp?: number;
}

export interface WSGroupMessage extends WSMessage {
  type: 'groupmessage';
  groupID: string;
  from?: string;      // sender username
  content: string;
  contentType: ContentType;
  timestamp?: number;
}

export interface WSGroupCreated extends WSMessage {
  type: 'groupcreated';
  groupID: string;
  groupName: string;
  members: string[];  // usernames
  creator: string;    // creator username
}

export interface WSGroupMemberAdded extends WSMessage {
  type: 'groupmemberadded';
  groupID: string;
  members: string[];  // newly added usernames
  addedBy: string;    // username who added them
}

export interface WSSetUsername extends WSMessage {
  type: 'setusername';
  username: string;
}

export interface WSUsernameChanged extends WSMessage {
  type: 'usernamechanged';
  oldUsername: string;
  newUsername: string;
}

export interface WSFindUser extends WSMessage {
  type: 'finduser';
  username: string;
}

export interface WSUserFound extends WSMessage {
  type: 'userfound';
  username: string;
  isOnline: boolean;
}

export interface WSUserStatus extends WSMessage {
  type: 'userstatus';
  username: string;
  isOnline: boolean;
}

export interface WSTyping extends WSMessage {
  type: 'typing';
  to?: string;
  groupID?: string;
  isTyping: boolean;
}

export interface WSError extends WSMessage {
  type: 'error';
  message: string;
}

// ==================== Storage Types ====================

export interface StoredData {
  version: number;
  username: string | null;
  contacts: Record<string, Contact>;
  groups: Record<string, Group>;
  settings: AppSettings;
}

export interface AppSettings {
  notifications: boolean;
  sounds: boolean;
  theme: 'dark' | 'light';
}

// ==================== UI State ====================

export interface AppState {
  connected: boolean;
  currentView: 'contact' | 'group' | null;
  currentID: string | null;
  typingUsers: Map<string, Set<string>>; // groupID/contactUsername -> Set of usernames typing
}

// ==================== Events ====================

export type EventCallback<T = unknown> = (data: T) => void;

export interface EventMap {
  'connection:change': boolean;
  'contact:added': Contact;
  'contact:updated': Contact;
  'contact:removed': string;
  'group:added': Group;
  'group:updated': Group;
  'group:removed': string;
  'message:received': { conversationID: string; message: Message; isGroup: boolean };
  'message:sent': { conversationID: string; message: Message; isGroup: boolean };
  'typing:update': { conversationID: string; username: string; isTyping: boolean };
}
