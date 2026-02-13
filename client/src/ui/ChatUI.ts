/**
 * Chat UI management
 */

import type { Contact, MessageType, ContentType } from '../types';
import { ImageService } from '../services/ImageService';

export class ChatUI {
  private statusEl: HTMLElement;
  private currentChatInfo: HTMLElement;
  private messagesContainer: HTMLElement;
  private messageInput: HTMLInputElement;
  private sendBtn: HTMLButtonElement;
  private blockBtn: HTMLButtonElement;
  private imageBtn: HTMLButtonElement | null = null;
  private imageService: ImageService;

  // Track blob URLs for cleanup
  private activeBlobUrls: Set<string> = new Set();

  constructor() {
    this.statusEl = document.getElementById('status') as HTMLElement;
    this.currentChatInfo = document.getElementById('currentChatInfo') as HTMLElement;
    this.messagesContainer = document.getElementById('messages') as HTMLElement;
    this.messageInput = document.getElementById('messageInput') as HTMLInputElement;
    this.sendBtn = document.getElementById('sendBtn') as HTMLButtonElement;
    this.blockBtn = document.getElementById('blockBtn') as HTMLButtonElement;
    this.imageBtn = document.getElementById('imageBtn') as HTMLButtonElement;
    this.imageService = new ImageService();
  }

  /**
   * Update connection status display
   */
  updateStatus(status: string, isConnected: boolean): void {
    this.statusEl.textContent = status;
    this.statusEl.className = isConnected ? 'status connected' : 'status disconnected';
  }

  /**
   * Update chat header
   */
  updateChatHeader(
    contactID: string | null,
    isBlocked: boolean,
    hasPublicKey: boolean
  ): void {
    if (!contactID) {
      this.currentChatInfo.innerHTML = '<span class="chat-title">Select a contact to start chatting</span>';
      this.messageInput.disabled = true;
      this.sendBtn.disabled = true;
      this.setImageButtonEnabled(false);
      this.blockBtn.style.display = 'none';
      return;
    }

    // Show block button
    this.blockBtn.style.display = 'block';
    this.blockBtn.textContent = isBlocked ? 'Unblock' : 'Block';
    this.blockBtn.className = isBlocked ? 'block-btn blocked' : 'block-btn';

    // Update input state
    const canSend = !isBlocked && hasPublicKey;
    this.messageInput.disabled = isBlocked;
    this.sendBtn.disabled = isBlocked;
    this.setImageButtonEnabled(canSend);

    if (isBlocked) {
      this.messageInput.placeholder = 'User is blocked';
    } else if (!hasPublicKey) {
      this.messageInput.placeholder = 'Requesting secure key exchange...';
    } else {
      this.messageInput.placeholder = 'Type your message...';
    }

    let headerHTML = `
      <div class="chat-header-content">
        <div class="chat-subtitle">${contactID}${isBlocked ? ' 🚫' : ''}</div>
    `;

    if (!hasPublicKey) {
      headerHTML += '<div class="fingerprint-header"><span class="text-secondary">⏳ Exchanging keys...</span></div>';
    }

    headerHTML += '</div>';
    this.currentChatInfo.innerHTML = headerHTML;
  }
  /**
   * Add message to chat
   */
  addMessage(content: string, type: MessageType, contentType: ContentType = 'text'): void {
    const messageEl = document.createElement('div');
    messageEl.className = `message ${type}`;

    const contentEl = document.createElement('div');
    contentEl.className = 'message-content';

    if (contentType === 'image' && this.imageService.isImageMessage(content)) {
      // Handle image message
      const imageData = this.imageService.extractImageData(content);
      if (imageData) {
        try {
          const blobUrl = this.imageService.createSecureBlobUrl(imageData);
          this.activeBlobUrls.add(blobUrl);

          const imgContainer = document.createElement('div');
          imgContainer.className = 'image-message-container';

          const img = document.createElement('img');
          img.className = 'message-image';
          img.src = blobUrl;
          img.alt = 'Encrypted image';
          img.loading = 'lazy';
          
          // Click to view full size
          img.addEventListener('click', () => this.showImageModal(blobUrl));

          // Add loading state
          img.addEventListener('load', () => {
            imgContainer.classList.add('loaded');
          });

          img.addEventListener('error', () => {
            imgContainer.innerHTML = '<span class="image-error">⚠️ Failed to load image</span>';
          });

          imgContainer.appendChild(img);
          contentEl.appendChild(imgContainer);
        } catch {
          contentEl.innerHTML = '<span class="image-error">⚠️ Invalid image data</span>';
        }
      }
    } else {
      // Regular text message
      contentEl.textContent = content;
    }

    messageEl.appendChild(contentEl);
    this.messagesContainer.appendChild(messageEl);
    this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
  }

  /**
   * Show image in fullscreen modal
   */
  private showImageModal(imageUrl: string): void {
    const modal = document.createElement('div');
    modal.className = 'image-modal';
    
    const img = document.createElement('img');
    img.src = imageUrl;
    img.alt = 'Full size image';
    
    const closeBtn = document.createElement('button');
    closeBtn.className = 'image-modal-close';
    closeBtn.innerHTML = '✕';
    closeBtn.addEventListener('click', () => modal.remove());

    // Close on backdrop click
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.remove();
    });

    // Close on Escape key
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        modal.remove();
        document.removeEventListener('keydown', handleEscape);
      }
    };
    document.addEventListener('keydown', handleEscape);

    modal.appendChild(img);
    modal.appendChild(closeBtn);
    document.body.appendChild(modal);
  }

  /**
   * Add system message
   */
  addSystemMessage(content: string): void {
    this.addMessage(content, 'system');
  }
  /**
   * Clear all messages
   */
  clearMessages(): void {
    // Revoke all blob URLs to free memory
    this.activeBlobUrls.forEach(url => this.imageService.revokeBlobUrl(url));
    this.activeBlobUrls.clear();
    
    this.messagesContainer.innerHTML = '';
  }

  /**
   * Render all messages from contact
   */
  renderMessages(contact: Contact, myID: string): void {
    this.clearMessages();
    
    contact.messages.forEach((msg) => {
      const type = msg.fromID === myID ? 'sent' : 'received';
      const contentType = msg.contentType || 'text';
      this.addMessage(msg.content, type, contentType);
    });
  }

  /**
   * Get message input value
   */
  getMessageInput(): string {
    return this.messageInput.value;
  }

  /**
   * Clear message input
   */
  clearMessageInput(): void {
    this.messageInput.value = '';
  }
  /**
   * Setup event listeners
   */
  onSendMessage(handler: () => void): void {
    this.sendBtn.addEventListener('click', handler);
    
    this.messageInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handler();
      }
    });
  }
  /**
   * Setup image button listener
   */
  onSendImage(handler: () => void): void {
    if (this.imageBtn) {
      this.imageBtn.addEventListener('click', handler);
    }
  }
  /**
   * Setup paste image listener
   * Allows users to paste images from clipboard (Ctrl+V)
   */
  onPasteImage(handler: (file: File) => void): void {
    // Single document-level listener to avoid duplicate handling
    document.addEventListener('paste', (e: ClipboardEvent) => {
      // Skip if focus is in contact input
      const target = e.target as HTMLElement;
      if (target.id === 'newContactID') return;

      const items = e.clipboardData?.items;
      if (!items) return;

      for (const item of items) {
        if (item.type.startsWith('image/')) {
          e.preventDefault();
          e.stopPropagation();
          const file = item.getAsFile();
          if (file) {
            handler(file);
          }
          return;
        }
      }
    });
  }

  /**
   * Enable/disable image button
   */
  setImageButtonEnabled(enabled: boolean): void {
    if (this.imageBtn) {
      this.imageBtn.disabled = !enabled;
    }
  }

  /**
   * Setup block button listener
   */
  onBlockContact(handler: () => void): void {
    this.blockBtn.addEventListener('click', handler);
  }
}
