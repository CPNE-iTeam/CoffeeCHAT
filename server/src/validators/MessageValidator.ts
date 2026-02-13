/**
 * Input validation utilities for server
 */

export class MessageValidator {
  /**
   * Validate public key format
   */
  static validatePublicKey(key: unknown): key is string {
    if (typeof key !== 'string') return false;
    
    // Must be valid JSON with encryption and signing keys
    try {
      const parsed = JSON.parse(key);
      if (typeof parsed !== 'object') return false;
      if (!parsed.encryption || !parsed.signing) return false;
      
      // Validate each key is proper base64
      if (!this.isValidBase64(parsed.encryption)) return false;
      if (!this.isValidBase64(parsed.signing)) return false;
      
      return true;
    } catch {
      // If not JSON, check if it's a single base64 key (for backwards compatibility)
      return this.isValidBase64(key);
    }
  }

  /**
   * Validate user ID format
   */
  static validateUserID(id: unknown): id is string {
    if (typeof id !== 'string') return false;
    if (id.length < 2 || id.length > 64) return false;
    // Alphanumeric, hyphens, underscores only
    if (!/^[a-zA-Z0-9_-]+$/.test(id)) return false;
    return true;
  }  /**
   * Validate encrypted message
   */
  static validateEncryptedMessage(encrypted: unknown): encrypted is string {
    if (typeof encrypted !== 'string') return false;
    if (encrypted.length === 0 || encrypted.length > 10 * 1024 * 1024) return false; // Max 10MB for images
    return this.isValidBase64LargePayload(encrypted);
  }

  /**
   * Validate message signature
   */
  static validateSignature(signature: unknown): signature is string {
    if (typeof signature !== 'string') return false;
    return this.isValidBase64(signature);
  }

  /**
   * Validate username hash format (SHA-256 base64)
   * The hash is computed client-side for privacy - server never sees the actual username
   */
  static validateUsernameHash(hash: unknown): hash is string {
    if (typeof hash !== 'string') return false;
    // SHA-256 produces 32 bytes = 44 base64 characters (with padding)
    if (hash.length < 40 || hash.length > 50) return false;
    return this.isValidBase64(hash);
  }

  /**
   * Check if string is valid base64 (for small payloads like keys/signatures)
   */
  private static isValidBase64(str: string): boolean {
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(str)) return false;
    if (str.length < 20 || str.length > 10000) return false;
    return true;
  }

  /**
   * Check if string is valid base64 (for any size payload)
   */
  private static isValidBase64LargePayload(str: string): boolean {
    if (str.length < 20) return false;
    
    // For small messages (under 10KB), do full validation
    if (str.length <= 10000) {
      return /^[A-Za-z0-9+/]*={0,2}$/.test(str);
    }
    
    // For large payloads, check start and end to avoid slow regex on multi-MB strings
    const start = str.substring(0, Math.min(1000, str.length));
    const end = str.substring(Math.max(0, str.length - 100));
    
    if (!/^[A-Za-z0-9+/]+$/.test(start)) return false;
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(end)) return false;
    
    return true;
  }

  /**
   * Sanitize message for error response
   */
  static sanitizeError(error: unknown): string {
    if (error instanceof Error) {
      return 'Request processing failed';
    }
    return 'Unknown error';
  }
}
