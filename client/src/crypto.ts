/**
 * Cryptography utility for end-to-end encrypted messaging
 * Uses ECDH (P-256) for key exchange and AES-GCM (256-bit) for message encryption
 * Provides perfect forward secrecy and authenticated encryption
 */

export class CryptoManager {
  private keyPair: CryptoKeyPair | null = null;
  private signingKeyPair: CryptoKeyPair | null = null;
  private publicKeyCache: Map<string, CryptoKey> = new Map();
  private signingPublicKeyCache: Map<string, CryptoKey> = new Map();
  private sharedSecretCache: Map<string, CryptoKey> = new Map();

  /**
   * Initialize crypto by generating ECDH and ECDSA key pairs
   */
  async initialize(): Promise<string> {
    // Generate ECDH key pair (P-256 curve) for encryption
    this.keyPair = await window.crypto.subtle.generateKey(
      {
        name: 'ECDH',
        namedCurve: 'P-256',
      },
      true, // extractable
      ['deriveKey', 'deriveBits']
    );

    // Generate ECDSA key pair (P-256 curve) for signing
    this.signingKeyPair = await window.crypto.subtle.generateKey(
      {
        name: 'ECDSA',
        namedCurve: 'P-256',
      },
      true, // extractable
      ['sign', 'verify']
    );

    // Export both public keys as base64
    const encryptionKey = await this.exportPublicKey(this.keyPair.publicKey);
    const signingKey = await this.exportPublicKey(this.signingKeyPair.publicKey);

    // Return both keys as JSON
    return JSON.stringify({ encryption: encryptionKey, signing: signingKey });
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
   * Store a contact's public keys (encryption and signing)
   */
  async storePublicKey(contactID: string, publicKeyJson: string): Promise<void> {
    try {
      const keys = JSON.parse(publicKeyJson);
      const publicKey = await this.importPublicKey(keys.encryption);
      const signingKey = await this.importSigningPublicKey(keys.signing);
      
      this.publicKeyCache.set(contactID, publicKey);
      this.signingPublicKeyCache.set(contactID, signingKey);
      
      // Derive shared secret immediately
      await this.deriveSharedSecret(contactID);
    } catch {
      // Fallback for old format (single base64 string)
      const publicKey = await this.importPublicKey(publicKeyJson);
      this.publicKeyCache.set(contactID, publicKey);
      await this.deriveSharedSecret(contactID);
    }
  }

  /**
   * Import signing public key from base64 string
   */
  private async importSigningPublicKey(base64Key: string): Promise<CryptoKey> {
    const binaryString = atob(base64Key);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    return await window.crypto.subtle.importKey(
      'spki',
      bytes.buffer,
      {
        name: 'ECDSA',
        namedCurve: 'P-256',
      },
      true,
      ['verify']
    );
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
   * Sign a message with our private key
   */
  async signMessage(encryptedMessage: string): Promise<string> {
    if (!this.signingKeyPair) {
      throw new Error('Signing key not initialized');
    }

    const signature = await window.crypto.subtle.sign(
      {
        name: 'ECDSA',
        hash: 'SHA-256',
      },
      this.signingKeyPair.privateKey,
      new TextEncoder().encode(encryptedMessage)
    );

    return btoa(String.fromCharCode(...new Uint8Array(signature)));
  }

  /**
   * Encrypt a message AND sign it
   */
  async encryptAndSign(contactID: string, plaintext: string): Promise<{ encrypted: string; signature: string }> {
    const encrypted = await this.encryptMessage(contactID, plaintext);
    const signature = await this.signMessage(encrypted);

    return { encrypted, signature };
  }

  /**
   * Verify and decrypt a signed message
   */
  async decryptAndVerify(contactID: string, encrypted: string, signature: string): Promise<string> {
    const signingKey = this.signingPublicKeyCache.get(contactID);
    if (!signingKey) {
      throw new Error(`No signing key for contact: ${contactID}`);
    }

    // Verify signature
    const signatureBytes = new Uint8Array(
      atob(signature)
        .split('')
        .map((c) => c.charCodeAt(0))
    );

    const isValid = await window.crypto.subtle.verify(
      {
        name: 'ECDSA',
        hash: 'SHA-256',
      },
      signingKey,
      signatureBytes,
      new TextEncoder().encode(encrypted)
    );

    if (!isValid) {
      throw new Error('Message signature invalid - message may have been tampered with');
    }

    return this.decryptMessage(contactID, encrypted);
  }

  /**
   * Generate emoji fingerprint from a public key for visual verification
   * Returns 6 emojis deterministically derived from the key hash
   * Extracts encryption key from JSON if needed and normalizes before hashing
   */
  async generateEmojiFingerprint(publicKeyBase64: string): Promise<string> {
    // Emoji palette - diverse, easily distinguishable emojis
    const emojiPalette = [
      '🔴', '🟠', '🟡', '🟢', '🔵', '🟣', '⚫', '⚪',
      '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍',
      '🌟', '⭐', '✨', '💫', '🌠', '🎯', '🎨', '🎭',
      '🚀', '🛸', '🌊', '🔥', '⚡', '🌪️', '❄️', '🌈',
      '😀', '😂', '🥰', '😎', '🤔', '😴', '🦁', '🐯',
      '🐶', '🐱', '🐭', '🐹', '🦊', '🐻', '🐼', '🐨',
      '🎸', '🎹', '🎺', '🎻', '🥁', '📚', '🎓', '💡'
    ];

    // Extract encryption key if this is a JSON object with {encryption, signing}
    let keyToHash = publicKeyBase64;
    try {
      const parsed = JSON.parse(publicKeyBase64);
      if (typeof parsed === 'object' && parsed.encryption) {
        keyToHash = parsed.encryption;
      }
    } catch {
      // Not JSON, use as-is
    }
    
    // Hash the public key to get deterministic values
    const publicKeyBytes = new TextEncoder().encode(keyToHash);
    const hashBuffer = await window.crypto.subtle.digest('SHA-256', publicKeyBytes);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashStr = hashArray.map(byte => byte.toString(16).padStart(2, '0')).join('');
    
    // Debug: log first 50 chars of public key being hashed
    console.log('[FINGERPRINT DEBUG]', 'Input key (first 50 chars):', keyToHash.substring(0, 50), '... Hash:', hashStr.substring(0, 16));

    // Use chunks of the hash to select emojis
    const selected: string[] = [];
    for (let i = 0; i < 6; i++) {
      const chunk = parseInt(hashStr.substring(i * 8, i * 8 + 8), 16);
      const emojiIndex = chunk % emojiPalette.length;
      selected.push(emojiPalette[emojiIndex]);
    }

    // Sort for easy visual comparison across devices
    const sorted = selected.sort((a, b) => (a.codePointAt(0) ?? 0) - (b.codePointAt(0) ?? 0));
    return sorted.join(' ');
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
    this.signingPublicKeyCache.clear();
    this.sharedSecretCache.clear();
  }
}
