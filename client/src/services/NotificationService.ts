/**
 * Web Push Notification Service
 * Handles requesting permission and displaying notifications for new messages
 */

export type NotificationPermissionState = 'granted' | 'denied' | 'default';

export interface NotificationOptions {
  title: string;
  body: string;
  icon?: string;
  tag?: string;
  data?: Record<string, unknown>;
}

export class NotificationService {
  private permission: NotificationPermissionState = 'default';
  private enabled: boolean = true;

  constructor() {
    this.checkPermission();
  }

  /**
   * Check current notification permission
   */
  private checkPermission(): void {
    if ('Notification' in window) {
      this.permission = Notification.permission as NotificationPermissionState;
    }
  }

  /**
   * Request permission to show notifications
   */
  async requestPermission(): Promise<NotificationPermissionState> {
    if (!('Notification' in window)) {
      console.warn('This browser does not support notifications');
      return 'denied';
    }

    if (this.permission === 'granted') {
      return 'granted';
    }

    try {
      const result = await Notification.requestPermission();
      this.permission = result as NotificationPermissionState;
      return this.permission;
    } catch (error) {
      console.error('Failed to request notification permission:', error);
      return 'denied';
    }
  }

  /**
   * Check if notifications are supported and permitted
   */
  canShowNotifications(): boolean {
    return 'Notification' in window && this.permission === 'granted' && this.enabled;
  }

  /**
   * Get current permission state
   */
  getPermissionState(): NotificationPermissionState {
    return this.permission;
  }

  /**
   * Enable/disable notifications (user preference)
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  /**
   * Check if notifications are enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }  /**
   * Show a notification for a new chat message
   */
  showMessageNotification(
    senderID: string,
    _messageContent: string,
    onClick?: () => void
  ): Notification | null {
    // Don't show if page is visible
    if (!document.hidden) {
      return null;
    }

    if (!this.canShowNotifications()) {
      return null;
    }

    // Privacy: Don't expose sender ID or message content in notification
    return this.showNotification({
      title: 'New Message',
      body: 'You have a new encrypted message',
      icon: '/coffee-icon.svg',
      tag: 'new-message', // Single tag to avoid revealing number of contacts
      data: { senderID }
    }, onClick);
  }
  /**
   * Show a notification for key exchange
   */
  showKeyExchangeNotification(_userID: string): Notification | null {
    if (!document.hidden) {
      return null;
    }

    if (!this.canShowNotifications()) {
      return null;
    }

    // Privacy: Don't expose user ID in notification
    return this.showNotification({
      title: 'Secure Key Exchange',
      body: 'A new secure key has been received. Verify the emoji chain!',
      icon: '/coffee-icon.svg',
      tag: 'key-exchange'
    });
  }

  /**
   * Show a generic notification
   */
  showNotification(
    options: NotificationOptions,
    onClick?: () => void
  ): Notification | null {
    if (!this.canShowNotifications()) {
      return null;
    }    try {
      const notification = new Notification(options.title, {
        body: options.body,
        icon: options.icon || '/coffee-icon.svg',
        tag: options.tag,
        data: options.data,
        badge: '/coffee-icon.svg',
        requireInteraction: false,
        silent: false
      });

      notification.onclick = () => {
        window.focus();
        notification.close();
        onClick?.();
      };

      // Auto-close after 5 seconds
      setTimeout(() => {
        notification.close();
      }, 5000);

      return notification;
    } catch (error) {
      console.error('Failed to show notification:', error);
      return null;
    }
  }

  /**
   * Show a system notification (e.g., connection status)
   */
  showSystemNotification(title: string, body: string): Notification | null {
    if (!document.hidden) {
      return null;
    }

    return this.showNotification({
      title,
      body,
      tag: 'system'
    });
  }
}
