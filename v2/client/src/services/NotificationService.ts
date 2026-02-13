/**
 * Notification Service - Browser notifications
 */

export class NotificationService {
  private hasPermission = false;

  /**
   * Request notification permission
   */
  async requestPermission(): Promise<boolean> {
    if (!('Notification' in window)) {
      return false;
    }

    if (Notification.permission === 'granted') {
      this.hasPermission = true;
      return true;
    }

    if (Notification.permission !== 'denied') {
      const permission = await Notification.requestPermission();
      this.hasPermission = permission === 'granted';
      return this.hasPermission;
    }

    return false;
  }

  /**
   * Show a notification
   */
  show(title: string, body: string, onClick?: () => void): void {
    if (!this.hasPermission || document.hasFocus()) return;    const notification = new Notification(title, {
      body,
      icon: '/coffee-icon.svg',
      tag: 'coffeechat-message'
    });

    if (onClick) {
      notification.onclick = () => {
        window.focus();
        onClick();
        notification.close();
      };
    }

    // Auto-close after 5 seconds
    setTimeout(() => notification.close(), 5000);
  }

  /**
   * Show message notification
   */
  showMessage(from: string, content: string, onClick?: () => void): void {
    const truncatedContent = content.length > 50 
      ? content.substring(0, 47) + '...' 
      : content;
    
    this.show(from, truncatedContent, onClick);
  }
}

// Singleton
export const notificationService = new NotificationService();
