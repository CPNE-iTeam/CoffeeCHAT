/**
 * Privacy Mode Service
 * Manages "stealth mode" that hides message contents from prying eyes
 */

export class PrivacyModeService {
  private enabled: boolean = false;
  private changeHandlers: Set<(enabled: boolean) => void> = new Set();

  constructor() {
    // Load saved preference from sessionStorage (ephemeral, like the rest of the app)
    const saved = sessionStorage.getItem('privacyMode');
    if (saved === 'true') {
      this.enabled = true;
    }
  }

  /**
   * Toggle privacy mode on/off
   */
  toggle(): boolean {
    this.enabled = !this.enabled;
    this.persist();
    this.notifyHandlers();
    this.updateDOM();
    return this.enabled;
  }

  /**
   * Set privacy mode explicitly
   */
  setEnabled(enabled: boolean): void {
    if (this.enabled !== enabled) {
      this.enabled = enabled;
      this.persist();
      this.notifyHandlers();
      this.updateDOM();
    }
  }

  /**
   * Check if privacy mode is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Register a change handler
   */
  onChange(handler: (enabled: boolean) => void): () => void {
    this.changeHandlers.add(handler);
    return () => this.changeHandlers.delete(handler);
  }

  /**
   * Initialize DOM state on startup
   */
  initialize(): void {
    this.updateDOM();
  }

  /**
   * Update DOM to reflect privacy mode state
   */
  private updateDOM(): void {
    if (this.enabled) {
      document.body.classList.add('privacy-mode');
    } else {
      document.body.classList.remove('privacy-mode');
    }
  }

  /**
   * Persist preference to sessionStorage
   */
  private persist(): void {
    sessionStorage.setItem('privacyMode', String(this.enabled));
  }

  /**
   * Notify all change handlers
   */
  private notifyHandlers(): void {
    this.changeHandlers.forEach(handler => handler(this.enabled));
  }
}
