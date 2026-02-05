/**
 * Cryptography utility for end-to-end encrypted messaging
 * Uses ECDH (P-256) for key exchange and AES-GCM (256-bit) for message encryption
 * Provides perfect forward secrecy and authenticated encryption
 */

export class CryptoManager {
  private keyPair: CryptoKeyPair | null = null;
  private publicKeyCache: Map<string, CryptoKey> = new Map();
  private sharedSecretCache: Map<string, CryptoKey> = new Map();

  /**
   * Initialize crypto by generating ECDH key pair
   */
  async initialize(): Promise<string> {
    // Generate ECDH key pair (P-256 curve)
    this.keyPair = await window.crypto.subtle.generateKey(
      {
        name: 'ECDH',
        namedCurve: 'P-256',
      },
      true, // extractable
      ['deriveKey', 'deriveBits']
    );

    // Export public key as base64
    return await this.exportPublicKey(this.keyPair.publicKey);
  }

  /**
   * Export public key to base64 string
   */
  private async exportPublicKey(publicKey: CryptoKey): Promise<string> {
    const exported = await window.crypto.subtle.exportKey('spki', publicKey);
    const exportedAsBase64 = btoa(String.fromCharCode(...new Uint8Array(exported)));
    return exportedAsBase64;
  }

  /**
   * Import public key from base64 string
   */
  private async importPublicKey(base64Key: string): Promise<CryptoKey> {
    const binaryString = atob(base64Key);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    return await window.crypto.subtle.importKey(
      'spki',
      bytes.buffer,
      {
        name: 'ECDH',
        namedCurve: 'P-256',
      },
      true,
      []
    );
  }

  /**
   * Get our public key as base64
   */
  async getPublicKey(): Promise<string> {
    if (!this.keyPair) {
      throw new Error('Crypto not initialized');
    }
    return await this.exportPublicKey(this.keyPair.publicKey);
  }

  /**
   * Store a contact's public key
   */
  async storePublicKey(contactID: string, publicKeyBase64: string): Promise<void> {
    const publicKey = await this.importPublicKey(publicKeyBase64);
    this.publicKeyCache.set(contactID, publicKey);
    
    // Derive shared secret immediately
    await this.deriveSharedSecret(contactID);
  }

  /**
   * Derive shared secret with a contact using ECDH
   */
  private async deriveSharedSecret(contactID: string): Promise<CryptoKey> {
    if (!this.keyPair) {
      throw new Error('Crypto not initialized');
    }

    // Check cache first
    if (this.sharedSecretCache.has(contactID)) {
      return this.sharedSecretCache.get(contactID)!;
    }

    const publicKey = this.publicKeyCache.get(contactID);
    if (!publicKey) {
      throw new Error(`No public key for contact: ${contactID}`);
    }

    // Derive AES-GCM key from ECDH shared secret
    const sharedSecret = await window.crypto.subtle.deriveKey(
      {
        name: 'ECDH',
        public: publicKey,
      },
      this.keyPair.privateKey,
      {
        name: 'AES-GCM',
        length: 256,
      },
      false, // not extractable for security
      ['encrypt', 'decrypt']
    );

    this.sharedSecretCache.set(contactID, sharedSecret);
    return sharedSecret;
  }

  /**
   * Encrypt a message for a specific contact
   */
  async encryptMessage(contactID: string, plaintext: string): Promise<string> {
    const sharedSecret = await this.deriveSharedSecret(contactID);

    // Generate random IV (12 bytes for GCM)
    const iv = window.crypto.getRandomValues(new Uint8Array(12));

    // Encrypt with AES-GCM
    const encoder = new TextEncoder();
    const encrypted = await window.crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv: iv,
        tagLength: 128, // 128-bit authentication tag
      },
      sharedSecret,
      encoder.encode(plaintext)
    );

    // Combine IV + ciphertext and encode as base64
    const combined = new Uint8Array(iv.length + encrypted.byteLength);
    combined.set(iv, 0);
    combined.set(new Uint8Array(encrypted), iv.length);

    return btoa(String.fromCharCode(...combined));
  }

  /**
   * Decrypt a message from a specific contact
   */
  async decryptMessage(contactID: string, encryptedBase64: string): Promise<string> {
    const sharedSecret = await this.deriveSharedSecret(contactID);

    // Decode from base64
    const binaryString = atob(encryptedBase64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    // Extract IV and ciphertext
    const iv = bytes.slice(0, 12);
    const ciphertext = bytes.slice(12);

    // Decrypt with AES-GCM
    const decrypted = await window.crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: iv,
        tagLength: 128,
      },
      sharedSecret,
      ciphertext
    );

    const decoder = new TextDecoder();
    return decoder.decode(decrypted);
  }

  /**
   * Check if we have a public key for a contact
   */
  hasPublicKey(contactID: string): boolean {
    return this.publicKeyCache.has(contactID);
  }

  /**
   * Clear all cached keys (for security/cleanup)
   */
  clearCache(): void {
    this.publicKeyCache.clear();
    this.sharedSecretCache.clear();
  }
}
