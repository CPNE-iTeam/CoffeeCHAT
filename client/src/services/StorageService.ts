/**
 * Storage Service - Encrypted local storage with automatic persistence
 */

import type { StoredData, Contact, Group, AppSettings } from '../types';
import { encryptForStorage, decryptFromStorage } from '../utils/helpers';
import { eventBus } from './EventEmitter';

const STORAGE_KEY = 'coffeechat-v2-data';
const STORAGE_VERSION = 2;

const DEFAULT_SETTINGS: AppSettings = {
  notifications: true,
  sounds: true,
  theme: 'dark'
};

export class StorageService {
  private data: StoredData;
  private sessionKey: string | null = null;
  private saveTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.data = this.createEmptyData();
  }

  /**
   * Initialize storage with session key (derived from username, used for encryption)
   */
  async initialize(username: string): Promise<void> {
    // Generate session key from username for encryption
    this.sessionKey = await this.deriveSessionKey(username);
    await this.load();
    
    // If stored username differs or is null, update it
    if (!this.data.username || this.data.username !== username) {
      this.data.username = username;
      await this.save();
    }
  }

  /**
   * Derive a session key from username for storage encryption
   */
  private async deriveSessionKey(username: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(`coffeechat-v2-session-${username}-${navigator.userAgent}`);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Load data from localStorage
   */
  private async load(): Promise<void> {
    try {
      const encrypted = localStorage.getItem(STORAGE_KEY);
      if (!encrypted || !this.sessionKey) {
        this.data = this.createEmptyData();
        return;
      }

      const decrypted = await decryptFromStorage(encrypted, this.sessionKey);
      const parsed = JSON.parse(decrypted) as StoredData;

      // Version migration if needed
      if (parsed.version !== STORAGE_VERSION) {
        this.data = this.migrateData(parsed);
      } else {
        this.data = parsed;
      }
    } catch {
      // If decryption fails (different user/corrupted), start fresh
      console.warn('Failed to load stored data, starting fresh');
      this.data = this.createEmptyData();
    }
  }

  /**
   * Save data to localStorage (debounced)
   */
  private async save(): Promise<void> {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }

    this.saveTimeout = setTimeout(async () => {
      try {
        if (!this.sessionKey) return;
        
        const json = JSON.stringify(this.data);
        const encrypted = await encryptForStorage(json, this.sessionKey);
        localStorage.setItem(STORAGE_KEY, encrypted);
      } catch (error) {
        console.error('Failed to save data:', error);
      }
    }, 500);
  }

  /**
   * Force immediate save
   */
  async forceSave(): Promise<void> {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
      this.saveTimeout = null;
    }
    
    if (!this.sessionKey) return;
    
    const json = JSON.stringify(this.data);
    const encrypted = await encryptForStorage(json, this.sessionKey);
    localStorage.setItem(STORAGE_KEY, encrypted);
  }

  private createEmptyData(): StoredData {
    return {
      version: STORAGE_VERSION,
      username: null,
      contacts: {},
      groups: {},
      settings: { ...DEFAULT_SETTINGS }
    };
  }

  private migrateData(oldData: StoredData): StoredData {
    // Handle version migrations here
    return {
      ...this.createEmptyData(),
      ...oldData,
      version: STORAGE_VERSION
    };
  }

  // ==================== User ====================

  getUsername(): string | null {
    return this.data.username;
  }

  setUsername(username: string): void {
    this.data.username = username;
    this.save();
  }

  // ==================== Contacts ====================

  getContacts(): Contact[] {
    return Object.values(this.data.contacts).sort((a, b) => {
      const aTime = a.messages[a.messages.length - 1]?.timestamp || a.createdAt;
      const bTime = b.messages[b.messages.length - 1]?.timestamp || b.createdAt;
      return bTime - aTime;
    });
  }

  getContact(username: string): Contact | undefined {
    return this.data.contacts[username];
  }

  hasContact(username: string): boolean {
    return username in this.data.contacts;
  }

  addContact(contact: Contact): void {
    this.data.contacts[contact.username] = contact;
    this.save();
    eventBus.emit('contact:added', contact);
  }

  updateContact(username: string, updates: Partial<Contact>): void {
    const contact = this.data.contacts[username];
    if (contact) {
      Object.assign(contact, updates);
      this.save();
      eventBus.emit('contact:updated', contact);
    }
  }

  removeContact(username: string): void {
    delete this.data.contacts[username];
    this.save();
    eventBus.emit('contact:removed', username);
  }

  // ==================== Groups ====================

  getGroups(): Group[] {
    return Object.values(this.data.groups).sort((a, b) => {
      const aTime = a.messages[a.messages.length - 1]?.timestamp || a.createdAt;
      const bTime = b.messages[b.messages.length - 1]?.timestamp || b.createdAt;
      return bTime - aTime;
    });
  }

  getGroup(id: string): Group | undefined {
    return this.data.groups[id];
  }

  hasGroup(id: string): boolean {
    return id in this.data.groups;
  }

  addGroup(group: Group): void {
    this.data.groups[group.id] = group;
    this.save();
    eventBus.emit('group:added', group);
  }

  updateGroup(id: string, updates: Partial<Group>): void {
    const group = this.data.groups[id];
    if (group) {
      Object.assign(group, updates);
      this.save();
      eventBus.emit('group:updated', group);
    }
  }

  removeGroup(id: string): void {
    delete this.data.groups[id];
    this.save();
    eventBus.emit('group:removed', id);
  }

  // ==================== Settings ====================

  getSettings(): AppSettings {
    return { ...this.data.settings };
  }

  updateSettings(updates: Partial<AppSettings>): void {
    Object.assign(this.data.settings, updates);
    this.save();
  }

  // ==================== Clear All ====================

  async clearAll(): Promise<void> {
    this.data = this.createEmptyData();
    localStorage.removeItem(STORAGE_KEY);
    eventBus.emit('storage:cleared');
  }
}

// Singleton instance
export const storage = new StorageService();
