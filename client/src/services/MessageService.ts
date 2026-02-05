/**
 * Message encryption, decryption, and handling service
 */

import { CryptoManager } from '../crypto';
import type { ChatMessage } from '../types';
import type { WebSocketService } from './WebSocketService';

export class MessageService {
  private crypto: CryptoManager;
  private wsService: WebSocketService;

  constructor(crypto: CryptoManager, wsService: WebSocketService) {
    this.crypto = crypto;
    this.wsService = wsService;
  }

  /**
   * Encrypt and send message to contact
   */
  async sendEncryptedMessage(toID: string, content: string): Promise<void> {
    const { encrypted, signature } = await this.crypto.encryptAndSign(toID, content);

    const message: ChatMessage = {
      type: 'chatmessage',
      encrypted,
      signature,
      toID
    };

    this.wsService.send(message);
  }

  /**
   * Decrypt and verify received message
   */
  async decryptMessage(fromID: string, encrypted: string, signature?: string): Promise<string> {
    if (signature) {
      return await this.crypto.decryptAndVerify(fromID, encrypted, signature);
    } else {
      return await this.crypto.decryptMessage(fromID, encrypted);
    }
  }

  /**
   * Request key exchange with contact
   */
  async requestKeyExchange(toID: string, myPublicKey: string): Promise<void> {
    const message: ChatMessage = {
      type: 'keyexchange',
      toID,
      publicKey: myPublicKey
    };

    this.wsService.send(message);
  }

  /**
   * Store received public key
   */
  async storePublicKey(contactID: string, publicKey: string): Promise<void> {
    await this.crypto.storePublicKey(contactID, publicKey);
  }

  /**
   * Generate emoji fingerprint for verification
   */
  async generateFingerprint(publicKey: string): Promise<string> {
    return await this.crypto.generateEmojiFingerprint(publicKey);
  }

  /**
   * Combine two fingerprints for comparison
   */
  combineFingerprints(fingerprint1: string, fingerprint2: string): string {
    const emojis1 = fingerprint1.split(' ').filter(e => e.length > 0);
    const emojis2 = fingerprint2.split(' ').filter(e => e.length > 0);
    const combined = [...emojis1, ...emojis2];
    
    const sorted = combined.sort((a, b) => (a.codePointAt(0) ?? 0) - (b.codePointAt(0) ?? 0));
    
    return sorted.join(' ');
  }

  /**
   * Check if we have public key for contact
   */
  hasPublicKey(contactID: string): boolean {
    return this.crypto.hasPublicKey(contactID);
  }

  /**
   * Clear all cached keys
   */
  clearCache(): void {
    this.crypto.clearCache();
  }
}
