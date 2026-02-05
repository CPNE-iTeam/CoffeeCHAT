/**
 * Shared type definitions for CoffeeChat client
 */

export interface ChatMessage {
  type: string;
  content?: string;
  encrypted?: string;
  signature?: string;
  fromID?: string;
  toID?: string;
  userID?: string;
  message?: string;
  publicKey?: string;
  requestingUserID?: string;
  timestamp?: number;
  nonce?: string;
}

export interface Contact {
  id: string;
  messages: Array<{ content: string; fromID: string; timestamp: number }>;
  lastMessage?: string;
  publicKey?: string;
  publicKeyFingerprint?: string;
  isVerified?: boolean;
  blocked?: boolean;
}

export interface EncryptedMessage {
  encrypted: string;
  signature: string;
}

export type MessageType = 'sent' | 'received' | 'system';
