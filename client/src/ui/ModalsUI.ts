/**
 * Modals UI - Manages all modal dialogs
 */

import type { Contact } from '../types';
import { escapeHtml } from '../utils/helpers';

export class ModalsUI {
  private elements: {
    createGroupModal: HTMLElement;
    addMemberModal: HTMLElement;
    fireModal: HTMLElement;
    imageModal: HTMLElement;
  };

  constructor() {
    this.elements = {
      createGroupModal: document.getElementById('createGroupModal')!,
      addMemberModal: document.getElementById('addMemberModal')!,
      fireModal: document.getElementById('fireModal')!,
      imageModal: document.getElementById('imageModal')!
    };

    this.setupBackdropClicks();
  }

  /**
   * Setup backdrop click to close modals
   */
  private setupBackdropClicks(): void {
    document.querySelectorAll('.modal-backdrop').forEach(backdrop => {
      backdrop.addEventListener('click', () => this.hideAll());
    });
  }

  /**
   * Hide all modals
   */
  hideAll(): void {
    Object.values(this.elements).forEach(modal => {
      modal.classList.add('hidden');
    });
  }

  // ==================== Create Group Modal ====================

  showCreateGroup(contacts: Contact[]): void {
    const checkboxes = document.getElementById('memberCheckboxes')!;
    const nameInput = document.getElementById('groupNameInput') as HTMLInputElement;
    
    nameInput.value = '';
    
    if (contacts.length === 0) {
      checkboxes.innerHTML = `
        <div style="padding: 16px; text-align: center; color: var(--text-muted);">
          Add contacts first
        </div>
      `;
    } else {
      checkboxes.innerHTML = contacts.map(contact => {
        const displayName = contact.displayName || contact.username;
        return `
          <label class="checkbox-item">
            <input type="checkbox" value="${escapeHtml(contact.username)}">
            <span>${escapeHtml(displayName)}</span>
          </label>
        `;
      }).join('');
    }

    this.elements.createGroupModal.classList.remove('hidden');
    nameInput.focus();
  }

  hideCreateGroup(): void {
    this.elements.createGroupModal.classList.add('hidden');
  }

  getCreateGroupData(): { name: string; memberUsernames: string[] } {
    const nameInput = document.getElementById('groupNameInput') as HTMLInputElement;
    const checkboxes = document.querySelectorAll('#memberCheckboxes input[type="checkbox"]:checked');
    
    return {
      name: nameInput.value.trim(),
      memberUsernames: Array.from(checkboxes).map(cb => (cb as HTMLInputElement).value)
    };
  }

  onConfirmCreateGroup(handler: () => void): void {
    document.getElementById('confirmGroupBtn')!.addEventListener('click', handler);
  }

  onCancelCreateGroup(handler: () => void): void {
    document.getElementById('cancelGroupBtn')!.addEventListener('click', handler);
  }

  // ==================== Add Member Modal ====================

  showAddMember(contacts: Contact[], existingMembers: string[]): void {
    const checkboxes = document.getElementById('addMemberCheckboxes')!;
    
    const availableContacts = contacts.filter(c => !existingMembers.includes(c.username));
    
    if (availableContacts.length === 0) {
      checkboxes.innerHTML = `
        <div style="padding: 16px; text-align: center; color: var(--text-muted);">
          No contacts to add
        </div>
      `;
    } else {
      checkboxes.innerHTML = availableContacts.map(contact => {
        const displayName = contact.displayName || contact.username;
        return `
          <label class="checkbox-item">
            <input type="checkbox" value="${escapeHtml(contact.username)}">
            <span>${escapeHtml(displayName)}</span>
          </label>
        `;
      }).join('');
    }

    this.elements.addMemberModal.classList.remove('hidden');
  }

  hideAddMember(): void {
    this.elements.addMemberModal.classList.add('hidden');
  }

  getAddMemberData(): string[] {
    const checkboxes = document.querySelectorAll('#addMemberCheckboxes input[type="checkbox"]:checked');
    return Array.from(checkboxes).map(cb => (cb as HTMLInputElement).value);
  }

  onConfirmAddMember(handler: () => void): void {
    document.getElementById('confirmAddMemberBtn')!.addEventListener('click', handler);
  }

  onCancelAddMember(handler: () => void): void {
    document.getElementById('cancelAddMemberBtn')!.addEventListener('click', handler);
  }

  // ==================== Fire Modal ====================

  showFireModal(): void {
    this.elements.fireModal.classList.remove('hidden');
  }

  hideFireModal(): void {
    this.elements.fireModal.classList.add('hidden');
  }

  onConfirmFire(handler: () => void): void {
    document.getElementById('confirmFireBtn')!.addEventListener('click', handler);
  }

  onCancelFire(handler: () => void): void {
    document.getElementById('cancelFireBtn')!.addEventListener('click', handler);
  }

  // ==================== Image Modal ====================

  showImage(src: string): void {
    const img = document.getElementById('imageModalImg') as HTMLImageElement;
    img.src = src;
    this.elements.imageModal.classList.remove('hidden');
  }

  hideImage(): void {
    this.elements.imageModal.classList.add('hidden');
  }

  onCloseImage(handler: () => void): void {
    this.elements.imageModal.querySelector('.close-btn')!.addEventListener('click', handler);
    this.elements.imageModal.addEventListener('click', (e) => {
      if (e.target === this.elements.imageModal) handler();
    });
  }
}
