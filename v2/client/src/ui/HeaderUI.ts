/**
 * Header UI - Connection status and fire button
 */

export class HeaderUI {
  private elements: {
    status: HTMLElement;
    fireBtn: HTMLButtonElement;
  };

  constructor() {
    this.elements = {
      status: document.getElementById('connectionStatus')!,
      fireBtn: document.getElementById('fireBtn') as HTMLButtonElement
    };
  }

  /**
   * Update connection status display
   */
  setStatus(status: 'connected' | 'disconnected' | 'connecting'): void {
    this.elements.status.className = `status ${status}`;
    
    switch (status) {
      case 'connected':
        this.elements.status.textContent = 'Connected';
        break;
      case 'disconnected':
        this.elements.status.textContent = 'Disconnected';
        break;
      case 'connecting':
        this.elements.status.textContent = 'Connecting...';
        break;
    }
  }

  /**
   * Fire button click handler
   */
  onFireClick(handler: () => void): void {
    this.elements.fireBtn.addEventListener('click', handler);
  }
}
