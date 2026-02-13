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
  contentType?: 'text' | 'image';  // Message content type
  usernameHash?: string;  // Hashed username for privacy-preserving lookup
  // Group message fields
  groupID?: string;
  groupName?: string;
  memberIDs?: string[];
  creatorID?: string;
  encryptedPayloads?: Array<{
    toID: string;
    encrypted: string;
    signature: string;
  }>;
}

export interface Contact {
  id: string;
  username?: string;  // Display name (optional)
  messages: Array<{
    content: string;
    fromID: string;
    timestamp: number;
    contentType?: 'text' | 'image';
  }>;
  lastMessage?: string;
  publicKey?: string;
  publicKeyFingerprint?: string;
  isVerified?: boolean;
  blocked?: boolean;
}

/**
 * Group chat - static membership defined at creation
 * Messages are pairwise encrypted to each member for maximum security
 */
export interface Group {
  id: string;  // Unique group identifier (generated client-side)
  name: string;  // Group display name
  memberIDs: string[];  // List of member user IDs (static, set at creation)
  creatorID: string;  // Who created the group
  createdAt: number;  // Timestamp
  messages: Array<{
    content: string;
    fromID: string;
    fromUsername?: string;  // Sender's username for display
    timestamp: number;
    contentType?: 'text' | 'image';
  }>;
  lastMessage?: string;
}

/**
 * Group message - contains pairwise encrypted payloads for each recipient
 */
export interface GroupMessagePayload {
  groupID: string;
  encryptedPayloads: Array<{
    toID: string;  // Recipient user ID
    encrypted: string;  // Message encrypted for this recipient
    signature: string;  // Signature for verification
  }>;
}

export interface EncryptedMessage {
  encrypted: string;
  signature: string;
}

export type MessageType = 'sent' | 'received' | 'system';
export type ContentType = 'text' | 'image';
