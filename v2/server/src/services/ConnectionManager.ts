/**
 * Connection Manager - Manages WebSocket connections
 */

import type { CustomWebSocket } from '../types/index.js';

export class ConnectionManager {
  private connections: Map<string, CustomWebSocket> = new Map(); // username -> ws
  private guestCounter = 0;

  /**
   * Register a new connection with a guest username
   */
  register(ws: CustomWebSocket): string {
    const username = this.generateGuestUsername();
    ws.username = username;
    this.connections.set(username, ws);
    console.log(`[+] User connected: ${username}`);
    return username;
  }

  /**
   * Unregister a connection
   */
  unregister(username: string): void {
    this.connections.delete(username);
    console.log(`[-] User disconnected: ${username}`);
  }

  /**
   * Get connection by username
   */
  get(username: string): CustomWebSocket | undefined {
    return this.connections.get(username);
  }

  /**
   * Check if user is connected
   */
  isConnected(username: string): boolean {
    return this.connections.has(username);
  }

  /**
   * Change username for a connection
   */
  changeUsername(oldUsername: string, newUsername: string): boolean {
    // Check if new username is taken
    if (this.connections.has(newUsername)) {
      return false;
    }

    const ws = this.connections.get(oldUsername);
    if (!ws) return false;

    // Update connection
    this.connections.delete(oldUsername);
    ws.username = newUsername;
    this.connections.set(newUsername, ws);
    
    console.log(`[~] Username changed: ${oldUsername} -> ${newUsername}`);
    return true;
  }

  /**
   * Send message to a user
   */
  send(username: string, message: object): boolean {
    const ws = this.connections.get(username);
    if (ws && ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify(message));
      return true;
    }
    return false;
  }

  /**
   * Broadcast to multiple users
   */
  broadcast(usernames: string[], message: object, excludeUsername?: string): void {
    const json = JSON.stringify(message);
    for (const username of usernames) {
      if (username === excludeUsername) continue;
      
      const ws = this.connections.get(username);
      if (ws && ws.readyState === ws.OPEN) {
        ws.send(json);
      }
    }
  }

  /**
   * Generate unique guest username
   */
  private generateGuestUsername(): string {
    this.guestCounter++;
    const num = String(this.guestCounter).padStart(3, '0');
    let username = `guest#${num}`;
    
    // Ensure uniqueness
    while (this.connections.has(username)) {
      this.guestCounter++;
      const newNum = String(this.guestCounter).padStart(3, '0');
      username = `guest#${newNum}`;
    }
    
    return username;
  }
}
