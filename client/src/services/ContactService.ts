/**
 * Contact Service - Manages contacts and direct messages
 */

import type { Contact, Message, ContentType } from '../types';
import { storage } from './StorageService';
import { eventBus } from './EventEmitter';
import { generateID } from '../utils/helpers';

export class ContactService {
  private currentUsername: string | null = null;

  /**
   * Get all contacts sorted by recent activity
   */
  getAll(): Contact[] {
    return storage.getContacts();
  }

  /**
   * Get a specific contact by username
   */
  get(username: string): Contact | undefined {
    return storage.getContact(username);
  }

  /**
   * Check if contact exists
   */
  has(username: string): boolean {
    return storage.hasContact(username);
  }

  /**
   * Add a new contact
   */
  add(username: string, displayName?: string): Contact {
    if (storage.hasContact(username)) {
      return storage.getContact(username)!;
    }

    const contact: Contact = {
      username,
      displayName,
      messages: [],
      unreadCount: 0,
      blocked: false,
      createdAt: Date.now()
    };

    storage.addContact(contact);
    return contact;
  }

  /**
   * Update contact info
   */
  update(username: string, updates: Partial<Contact>): void {
    storage.updateContact(username, updates);
  }

  /**
   * Remove a contact
   */
  remove(username: string): void {
    storage.removeContact(username);
    if (this.currentUsername === username) {
      this.currentUsername = null;
    }
  }

  /**
   * Toggle block status
   */
  toggleBlock(username: string): boolean {
    const contact = storage.getContact(username);
    if (!contact) return false;

    const blocked = !contact.blocked;
    storage.updateContact(username, { blocked });
    return blocked;
  }

  /**
   * Add a message to contact's history
   */
  addMessage(
    contactUsername: string,
    content: string,
    fromUsername: string,
    contentType: ContentType = 'text'
  ): Message {
    const contact = storage.getContact(contactUsername);
    if (!contact) {
      throw new Error(`Contact ${contactUsername} not found`);
    }

    const message: Message = {
      id: generateID(),
      content,
      from: fromUsername,
      timestamp: Date.now(),
      contentType,
      status: 'sent'
    };

    contact.messages.push(message);
    
    // Update unread count if it's a received message and not viewing this contact
    const myUsername = storage.getUsername();
    if (fromUsername !== myUsername && this.currentUsername !== contactUsername) {
      contact.unreadCount++;
    }

    storage.updateContact(contactUsername, {
      messages: contact.messages,
      unreadCount: contact.unreadCount
    });

    eventBus.emit('message:received', {
      conversationID: contactUsername,
      message,
      isGroup: false
    });

    return message;
  }

  /**
   * Get current contact username
   */
  getCurrentUsername(): string | null {
    return this.currentUsername;
  }

  /**
   * Set current contact (for viewing)
   */
  setCurrent(username: string | null): void {
    this.currentUsername = username;
    
    // Clear unread count
    if (username) {
      const contact = storage.getContact(username);
      if (contact && contact.unreadCount > 0) {
        storage.updateContact(username, { unreadCount: 0 });
      }
    }
  }

  /**
   * Get messages for a contact
   */
  getMessages(username: string): Message[] {
    return storage.getContact(username)?.messages || [];
  }
}

// Singleton
export const contactService = new ContactService();
