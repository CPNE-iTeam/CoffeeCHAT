/**
 * Contact list UI management
 */

import type { Contact } from '../types';

export class ContactListUI {
  private contactsList: HTMLElement;
  private newContactIDInput: HTMLInputElement;
  private addContactBtn: HTMLButtonElement;
  private copyBtn: HTMLButtonElement;

  constructor() {
    this.contactsList = document.getElementById('contactsList') as HTMLElement;
    this.newContactIDInput = document.getElementById('newContactID') as HTMLInputElement;
    this.addContactBtn = document.getElementById('addContactBtn') as HTMLButtonElement;
    this.copyBtn = document.getElementById('copyBtn') as HTMLButtonElement;
  }

  /**
   * Render contacts list
   */
  renderContactsList(
    contacts: Contact[],
    currentContactID: string | null,
    onContactClick: (contactID: string) => void
  ): void {
    this.contactsList.innerHTML = '';

    contacts.forEach((contact) => {
      const contactEl = document.createElement('div');
      contactEl.className = 'contact-item';
      
      if (contact.id === currentContactID) {
        contactEl.classList.add('active');
      }
      
      if (contact.blocked) {
        contactEl.classList.add('blocked');
      }

      const nameEl = document.createElement('div');
      nameEl.className = 'contact-name';
      
      const displayName = contact.id.substring(0, 12) + (contact.id.length > 12 ? '...' : '');
      
      let statusIndicator = '';
      if (contact.blocked) {
        statusIndicator = '🚫';
      } else if (contact.isVerified) {
        statusIndicator = '✅';
      } else if (contact.publicKey) {
        statusIndicator = '🔐';
      } else {
        statusIndicator = '⏳';
      }
      
      nameEl.textContent = `${statusIndicator} ${displayName}`;

      const previewEl = document.createElement('div');
      previewEl.className = 'contact-preview';
      previewEl.textContent = contact.blocked ? 'Blocked' : (contact.lastMessage || 'No messages yet');

      contactEl.appendChild(nameEl);
      contactEl.appendChild(previewEl);

      contactEl.addEventListener('click', () => {
        onContactClick(contact.id);
      });

      this.contactsList.appendChild(contactEl);
    });
  }

  /**
   * Get new contact ID input value
   */
  getNewContactInput(): string {
    return this.newContactIDInput.value.trim();
  }

  /**
   * Clear new contact input
   */
  clearNewContactInput(): void {
    this.newContactIDInput.value = '';
  }

  /**
   * Setup add contact listener
   */
  onAddContact(handler: () => void): void {
    this.addContactBtn.addEventListener('click', handler);
    
    this.newContactIDInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handler();
      }
    });
  }

  /**
   * Setup copy ID listener
   */
  onCopyID(handler: () => void): void {
    this.copyBtn.addEventListener('click', handler);
  }
}
