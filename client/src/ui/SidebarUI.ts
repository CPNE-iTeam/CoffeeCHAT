/**
 * Sidebar UI - Manages contacts and groups lists
 */

import type { Contact, Group } from '../types';
import { formatTime, truncate, getInitials, stringToColor, escapeHtml } from '../utils/helpers';

export class SidebarUI {
  private elements: {
    contactsList: HTMLElement;
    groupsList: HTMLElement;
    addContactInput: HTMLInputElement;
    addContactBtn: HTMLButtonElement;
    createGroupBtn: HTMLButtonElement;
    usernameInput: HTMLInputElement;
    setUsernameBtn: HTMLButtonElement;
    myUsername: HTMLElement;
    tabBtns: NodeListOf<HTMLButtonElement>;
    tabContents: NodeListOf<HTMLElement>;
  };

  private activeTab: 'contacts' | 'groups' = 'contacts';

  constructor() {
    this.elements = {
      contactsList: document.getElementById('contactsList')!,
      groupsList: document.getElementById('groupsList')!,
      addContactInput: document.getElementById('addContactInput') as HTMLInputElement,
      addContactBtn: document.getElementById('addContactBtn') as HTMLButtonElement,
      createGroupBtn: document.getElementById('createGroupBtn') as HTMLButtonElement,
      usernameInput: document.getElementById('usernameInput') as HTMLInputElement,
      setUsernameBtn: document.getElementById('setUsernameBtn') as HTMLButtonElement,
      myUsername: document.getElementById('myUserID')!,  // Reuse element
      tabBtns: document.querySelectorAll('.tab-btn') as NodeListOf<HTMLButtonElement>,
      tabContents: document.querySelectorAll('.tab-content') as NodeListOf<HTMLElement>
    };

    this.setupTabs();
  }

  /**
   * Set username display
   */
  setUsername(username: string): void {
    this.elements.myUsername.textContent = username;
    this.elements.usernameInput.value = username;
    this.elements.usernameInput.placeholder = username;
  }

  /**
   * Enable username editing (for changing username)
   */
  enableUsernameEdit(): void {
    this.elements.usernameInput.disabled = false;
    this.elements.setUsernameBtn.textContent = 'Set';
    this.elements.setUsernameBtn.disabled = false;
  }

  /**
   * Disable username editing after successful change
   */
  disableUsernameEdit(): void {
    this.elements.usernameInput.disabled = true;
    this.elements.setUsernameBtn.textContent = '✓';
    this.elements.setUsernameBtn.disabled = true;
  }

  /**
   * Get username input value
   */
  getUsernameInput(): string {
    return this.elements.usernameInput.value.trim();
  }

  /**
   * Get add contact input value
   */
  getAddContactInput(): string {
    return this.elements.addContactInput.value.trim();
  }

  /**
   * Clear add contact input
   */
  clearAddContactInput(): void {
    this.elements.addContactInput.value = '';
  }

  /**
   * Render contacts list
   */
  renderContacts(contacts: Contact[], selectedUsername: string | null): void {
    if (contacts.length === 0) {
      this.elements.contactsList.innerHTML = `
        <div class="empty-state" style="padding: 20px; text-align: center;">
          <p class="text-muted">No contacts yet</p>
        </div>
      `;
      return;
    }

    this.elements.contactsList.innerHTML = contacts.map(contact => {
      const displayName = contact.displayName || contact.username;
      const lastMsg = contact.messages[contact.messages.length - 1];
      const preview = lastMsg 
        ? (lastMsg.contentType === 'image' ? '🖼️ Image' : truncate(lastMsg.content, 30))
        : 'No messages';
      const time = lastMsg ? formatTime(lastMsg.timestamp) : '';
      const initials = getInitials(displayName);
      const color = stringToColor(contact.username);
      const isActive = contact.username === selectedUsername;
      const unreadBadge = contact.unreadCount > 0 
        ? `<span class="list-item-badge">${contact.unreadCount > 99 ? '99+' : contact.unreadCount}</span>` 
        : '';

      return `
        <div class="list-item ${isActive ? 'active' : ''}" data-username="${escapeHtml(contact.username)}">
          <div class="list-item-avatar" style="background: ${color}">${initials}</div>
          <div class="list-item-info">
            <div class="list-item-name">${escapeHtml(displayName)}</div>
            <div class="list-item-preview">${escapeHtml(preview)}</div>
          </div>
          ${time ? `<span class="list-item-time">${time}</span>` : ''}
          ${unreadBadge}
        </div>
      `;
    }).join('');
  }

  /**
   * Render groups list
   */
  renderGroups(groups: Group[], selectedID: string | null): void {
    if (groups.length === 0) {
      this.elements.groupsList.innerHTML = `
        <div class="empty-state" style="padding: 20px; text-align: center;">
          <p class="text-muted">No groups yet</p>
        </div>
      `;
      return;
    }

    this.elements.groupsList.innerHTML = groups.map(group => {
      const lastMsg = group.messages[group.messages.length - 1];
      const preview = lastMsg 
        ? (lastMsg.contentType === 'image' ? '🖼️ Image' : truncate(lastMsg.content, 30))
        : 'No messages';
      const time = lastMsg ? formatTime(lastMsg.timestamp) : '';
      const isActive = group.id === selectedID;
      const unreadBadge = group.unreadCount > 0 
        ? `<span class="list-item-badge">${group.unreadCount > 99 ? '99+' : group.unreadCount}</span>` 
        : '';

      return `
        <div class="list-item ${isActive ? 'active' : ''}" data-id="${group.id}" data-type="group">
          <div class="list-item-avatar" style="background: var(--accent)">👥</div>
          <div class="list-item-info">
            <div class="list-item-name">${escapeHtml(group.name)}</div>
            <div class="list-item-preview">${escapeHtml(preview)}</div>
          </div>
          ${time ? `<span class="list-item-time">${time}</span>` : ''}
          ${unreadBadge}
        </div>
      `;
    }).join('');
  }

  /**
   * Setup tab switching
   */
  private setupTabs(): void {
    this.elements.tabBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const tab = btn.dataset.tab as 'contacts' | 'groups';
        this.switchTab(tab);
      });
    });
  }

  /**
   * Switch to a tab
   */
  switchTab(tab: 'contacts' | 'groups'): void {
    this.activeTab = tab;

    this.elements.tabBtns.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tab);
    });

    this.elements.tabContents.forEach(content => {
      content.classList.toggle('active', content.id === `${tab}Tab`);
    });
  }

  /**
   * Get active tab
   */
  getActiveTab(): 'contacts' | 'groups' {
    return this.activeTab;
  }

  // Event handlers
  onSetUsername(handler: () => void): void {
    this.elements.setUsernameBtn.addEventListener('click', handler);
    this.elements.usernameInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') handler();
    });
  }

  onAddContact(handler: () => void): void {
    this.elements.addContactBtn.addEventListener('click', handler);
    this.elements.addContactInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') handler();
    });
  }

  onCreateGroup(handler: () => void): void {
    this.elements.createGroupBtn.addEventListener('click', handler);
  }

  onSelectContact(handler: (username: string) => void): void {
    this.elements.contactsList.addEventListener('click', (e) => {
      const item = (e.target as HTMLElement).closest('.list-item');
      if (item) {
        const username = item.getAttribute('data-username');
        if (username) handler(username);
      }
    });
  }

  onSelectGroup(handler: (id: string) => void): void {
    this.elements.groupsList.addEventListener('click', (e) => {
      const item = (e.target as HTMLElement).closest('.list-item');
      if (item) {
        const id = item.getAttribute('data-id');
        if (id) handler(id);
      }
    });
  }
}
