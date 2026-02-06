/**
 * Contact management service
 */

import type { Contact, ContentType } from '../types';

export class ContactService {
  private contacts: Map<string, Contact> = new Map();
  private currentContactID: string | null = null;
  private changeHandlers: Set<() => void> = new Set();

  /**
   * Add a new contact
   */
  addContact(contactID: string): Contact {
    if (!this.contacts.has(contactID)) {
      const contact: Contact = {
        id: contactID,
        messages: [],
        blocked: false
      };
      this.contacts.set(contactID, contact);
      this.notifyChange();
    }
    return this.contacts.get(contactID)!;
  }

  /**
   * Get contact by ID
   */
  getContact(contactID: string): Contact | undefined {
    return this.contacts.get(contactID);
  }

  /**
   * Get all contacts as array
   */
  getAllContacts(): Contact[] {
    return Array.from(this.contacts.values());
  }

  /**
   * Update contact data
   */
  updateContact(contactID: string, updates: Partial<Contact>): void {
    const contact = this.contacts.get(contactID);
    if (contact) {
      Object.assign(contact, updates);
      this.notifyChange();
    }
  }

  /**
   * Add message to contact's history
   */
  addMessage(contactID: string, content: string, fromID: string, contentType: ContentType = 'text'): void {
    const contact = this.getContact(contactID);
    if (contact) {
      contact.messages.push({
        content,
        fromID,
        timestamp: Date.now(),
        contentType
      });
      // For images, show placeholder text in contact list
      contact.lastMessage = contentType === 'image' ? '🖼️ Image' : content;
      this.notifyChange();
    }
  }

  /**
   * Toggle block status
   */
  toggleBlock(contactID: string): boolean {
    const contact = this.getContact(contactID);
    if (contact) {
      contact.blocked = !contact.blocked;
      this.notifyChange();
      return contact.blocked;
    }
    return false;
  }

  /**
   * Set current active contact
   */
  setCurrentContact(contactID: string | null): void {
    this.currentContactID = contactID;
    this.notifyChange();
  }

  /**
   * Get current active contact ID
   */
  getCurrentContactID(): string | null {
    return this.currentContactID;
  }

  /**
   * Get current active contact
   */
  getCurrentContact(): Contact | undefined {
    return this.currentContactID ? this.getContact(this.currentContactID) : undefined;
  }

  /**
   * Check if contact exists
   */
  hasContact(contactID: string): boolean {
    return this.contacts.has(contactID);
  }

  /**
   * Register change handler
   */
  onChange(handler: () => void): () => void {
    this.changeHandlers.add(handler);
    return () => this.changeHandlers.delete(handler);
  }

  /**
   * Clear all contacts
   */
  clear(): void {
    this.contacts.clear();
    this.currentContactID = null;
    this.notifyChange();
  }

  private notifyChange(): void {
    this.changeHandlers.forEach(handler => handler());
  }
}
