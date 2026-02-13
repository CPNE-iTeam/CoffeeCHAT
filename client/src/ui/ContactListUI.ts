/**
 * Contact list UI management
 */

import type { Contact } from '../types';

export class ContactListUI {
  private contactsList: HTMLElement;
  private usernameInput: HTMLInputElement;
  private setUsernameBtn: HTMLButtonElement;
  private findUsernameInput: HTMLInputElement;
  private findUserBtn: HTMLButtonElement;

  constructor() {
    this.contactsList = document.getElementById('contactsList') as HTMLElement;
    this.usernameInput = document.getElementById('usernameInput') as HTMLInputElement;
    this.setUsernameBtn = document.getElementById('setUsernameBtn') as HTMLButtonElement;
    this.findUsernameInput = document.getElementById('findUsernameInput') as HTMLInputElement;
    this.findUserBtn = document.getElementById('findUserBtn') as HTMLButtonElement;
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
      }      const nameEl = document.createElement('div');
      nameEl.className = 'contact-name';
      
      // Show username if available, otherwise show truncated ID
      const displayName = contact.username || 
        (contact.id.substring(0, 12) + (contact.id.length > 12 ? '...' : ''));
      
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
      });      this.contactsList.appendChild(contactEl);
    });
  }

  /**
   * Get username input value
   */
  getUsernameInput(): string {
    return this.usernameInput.value.trim();
  }

  /**
   * Set username input value
   */
  setUsernameInputValue(username: string): void {
    this.usernameInput.value = username;
  }

  /**
   * Setup set username listener
   */
  onSetUsername(handler: () => void): void {
    this.setUsernameBtn.addEventListener('click', handler);
    
    this.usernameInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handler();
      }
    });
  }

  /**
   * Get find username input value
   */
  getFindUsernameInput(): string {
    return this.findUsernameInput.value.trim();
  }

  /**
   * Clear find username input
   */
  clearFindUsernameInput(): void {
    this.findUsernameInput.value = '';
  }

  /**
   * Setup find user listener
   */
  onFindUser(handler: () => void): void {
    this.findUserBtn.addEventListener('click', handler);
    
    this.findUsernameInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handler();
      }
    });
  }
}
