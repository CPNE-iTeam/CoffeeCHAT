/**
 * Group list UI management
 */

import type { Group, Contact } from '../types';

export class GroupListUI {
  private groupsList: HTMLElement;
  private createGroupBtn: HTMLButtonElement;
  private createGroupModal: HTMLElement;
  private closeGroupModalBtn: HTMLButtonElement;
  private groupNameInput: HTMLInputElement;
  private memberSelectionList: HTMLElement;
  private confirmCreateGroupBtn: HTMLButtonElement;

  constructor() {
    this.groupsList = document.getElementById('groupsList') as HTMLElement;
    this.createGroupBtn = document.getElementById('createGroupBtn') as HTMLButtonElement;
    this.createGroupModal = document.getElementById('createGroupModal') as HTMLElement;
    this.closeGroupModalBtn = document.getElementById('closeGroupModal') as HTMLButtonElement;
    this.groupNameInput = document.getElementById('groupNameInput') as HTMLInputElement;
    this.memberSelectionList = document.getElementById('memberSelectionList') as HTMLElement;
    this.confirmCreateGroupBtn = document.getElementById('confirmCreateGroup') as HTMLButtonElement;

    this.setupModalHandlers();
  }

  private setupModalHandlers(): void {
    // Close modal on X button
    this.closeGroupModalBtn.addEventListener('click', () => {
      this.hideModal();
    });

    // Close modal on outside click
    this.createGroupModal.addEventListener('click', (e) => {
      if (e.target === this.createGroupModal) {
        this.hideModal();
      }
    });

    // Close modal on Escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.createGroupModal.style.display !== 'none') {
        this.hideModal();
      }
    });
  }

  /**
   * Render groups list
   */
  renderGroupsList(
    groups: Group[],
    currentGroupID: string | null,
    onGroupClick: (groupID: string) => void
  ): void {
    this.groupsList.innerHTML = '';

    groups.forEach((group) => {
      const groupEl = document.createElement('div');
      groupEl.className = 'group-item';
      
      if (group.id === currentGroupID) {
        groupEl.classList.add('active');
      }

      const nameEl = document.createElement('div');
      nameEl.className = 'group-name';
      nameEl.textContent = `👥 ${group.name}`;

      const previewEl = document.createElement('div');
      previewEl.className = 'group-preview';
      previewEl.textContent = group.lastMessage || `${group.memberIDs.length} members`;

      groupEl.appendChild(nameEl);
      groupEl.appendChild(previewEl);

      groupEl.addEventListener('click', () => {
        onGroupClick(group.id);
      });

      this.groupsList.appendChild(groupEl);
    });
  }

  /**
   * Show create group modal
   */
  showModal(contacts: Contact[]): void {
    this.groupNameInput.value = '';
    this.populateMemberSelection(contacts);
    this.createGroupModal.style.display = 'flex';
    this.groupNameInput.focus();
  }

  /**
   * Hide create group modal
   */
  hideModal(): void {
    this.createGroupModal.style.display = 'none';
    this.groupNameInput.value = '';
    this.memberSelectionList.innerHTML = '';
  }

  /**
   * Populate member selection list
   */
  private populateMemberSelection(contacts: Contact[]): void {
    this.memberSelectionList.innerHTML = '';

    // Only show contacts that have completed key exchange
    const eligibleContacts = contacts.filter(c => c.publicKey && !c.blocked);

    if (eligibleContacts.length === 0) {
      const emptyMsg = document.createElement('div');
      emptyMsg.style.padding = '20px';
      emptyMsg.style.textAlign = 'center';
      emptyMsg.style.color = 'var(--text-secondary)';
      emptyMsg.textContent = 'No contacts with key exchange completed';
      this.memberSelectionList.appendChild(emptyMsg);
      return;
    }

    eligibleContacts.forEach((contact) => {
      const itemEl = document.createElement('label');
      itemEl.className = 'member-selection-item';

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.value = contact.id;
      checkbox.dataset.username = contact.username || '';

      const nameSpan = document.createElement('span');
      nameSpan.textContent = contact.username || contact.id.substring(0, 12) + '...';

      itemEl.appendChild(checkbox);
      itemEl.appendChild(nameSpan);
      this.memberSelectionList.appendChild(itemEl);
    });
  }

  /**
   * Get selected member IDs
   */
  getSelectedMemberIDs(): string[] {
    const checkboxes = this.memberSelectionList.querySelectorAll('input[type="checkbox"]:checked');
    return Array.from(checkboxes).map(cb => (cb as HTMLInputElement).value);
  }

  /**
   * Get group name input
   */
  getGroupNameInput(): string {
    return this.groupNameInput.value.trim();
  }

  /**
   * Setup create group button listener
   */
  onCreateGroupClick(handler: () => void): void {
    this.createGroupBtn.addEventListener('click', handler);
  }

  /**
   * Setup confirm create group listener
   */
  onConfirmCreateGroup(handler: () => void): void {
    this.confirmCreateGroupBtn.addEventListener('click', handler);

    // Also allow Enter key in group name input
    this.groupNameInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handler();
      }
    });
  }
}
