/**
 * Username Service - Client-side username management with privacy-preserving hashing
 * 
 * The username is hashed client-side using SHA-256 before being sent to the server.
 * This ensures the server never has access to the plaintext username and cannot
 * link message metadata to user identity.
 */

export class UsernameService {
  private username: string = '';
  private usernameHash: string = '';
  private changeHandlers: Set<(username: string, hash: string) => void> = new Set();

  /**
   * Set the username and compute its hash
   * Returns the hash that will be sent to the server
   */
  async setUsername(username: string): Promise<string> {
    this.username = username.trim();
    
    if (this.username) {
      this.usernameHash = await this.hashUsername(this.username);
    } else {
      this.usernameHash = '';
    }
    
    this.notifyHandlers();
    return this.usernameHash;
  }

  /**
   * Get the current username (plaintext - never sent to server)
   */
  getUsername(): string {
    return this.username;
  }

  /**
   * Get the current username hash (safe to send to server)
   */
  getUsernameHash(): string {
    return this.usernameHash;
  }

  /**
   * Hash a username using SHA-256
   * The hash is computed client-side to preserve privacy
   */
  async hashUsername(username: string): Promise<string> {
    // Normalize the username: lowercase and trim
    const normalized = username.toLowerCase().trim();
    
    // Convert to bytes
    const encoder = new TextEncoder();
    const data = encoder.encode(normalized);
    
    // Compute SHA-256 hash
    const hashBuffer = await window.crypto.subtle.digest('SHA-256', data);
    
    // Convert to base64 for compact representation
    const hashArray = new Uint8Array(hashBuffer);
    const hashBase64 = btoa(String.fromCharCode(...hashArray));
    
    return hashBase64;
  }

  /**
   * Register a change handler
   */
  onChange(handler: (username: string, hash: string) => void): () => void {
    this.changeHandlers.add(handler);
    return () => this.changeHandlers.delete(handler);
  }

  /**
   * Clear the username
   */
  clear(): void {
    this.username = '';
    this.usernameHash = '';
    this.notifyHandlers();
  }

  /**
   * Check if a username is set
   */
  hasUsername(): boolean {
    return this.username.length > 0;
  }

  private notifyHandlers(): void {
    this.changeHandlers.forEach(handler => handler(this.username, this.usernameHash));
  }
}
