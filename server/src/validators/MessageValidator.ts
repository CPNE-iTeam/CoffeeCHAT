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
  }

  /**
   * Validate encrypted message
   */
  static validateEncryptedMessage(encrypted: unknown): encrypted is string {
    if (typeof encrypted !== 'string') return false;
    if (encrypted.length === 0 || encrypted.length > 100000) return false; // Max 100KB
    return this.isValidBase64(encrypted);
  }

  /**
   * Validate message signature
   */
  static validateSignature(signature: unknown): signature is string {
    if (typeof signature !== 'string') return false;
    return this.isValidBase64(signature);
  }

  /**
   * Check if string is valid base64
   */
  private static isValidBase64(str: string): boolean {
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(str)) return false;
    if (str.length < 20 || str.length > 10000) return false;
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
