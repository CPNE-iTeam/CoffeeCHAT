/**
 * Utility functions for CoffeeCHAT v2
 */

/**
 * Generate a unique ID
 */
export function generateID(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 10);
  return `${timestamp}-${random}`;
}

/**
 * Hash a string using SHA-256 (for username privacy)
 */
export async function hashString(str: string): Promise<string> {
  const normalized = str.toLowerCase().trim();
  const encoder = new TextEncoder();
  const data = encoder.encode(normalized);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Format timestamp to readable time
 */
export function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  
  // Today - show time only
  if (diff < 24 * 60 * 60 * 1000 && date.getDate() === now.getDate()) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  
  // This week - show day name
  if (diff < 7 * 24 * 60 * 60 * 1000) {
    return date.toLocaleDateString([], { weekday: 'short' });
  }
  
  // Older - show date
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

/**
 * Format full timestamp
 */
export function formatFullTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

/**
 * Truncate text with ellipsis
 */
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 1) + '…';
}

/**
 * Escape HTML to prevent XSS
 */
export function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Debounce function calls
 */
export function debounce<T extends (...args: unknown[]) => void>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout>;
  return (...args: Parameters<T>) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
}

/**
 * Get initials from name or ID
 */
export function getInitials(name: string): string {
  if (!name) return '?';
  
  // If it's a username, take first 2 chars
  if (name.startsWith('@')) {
    return name.substring(1, 3).toUpperCase();
  }
  
  // Split by spaces and take initials
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  
  return name.substring(0, 2).toUpperCase();
}

/**
 * Generate a deterministic color from a string
 */
export function stringToColor(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  
  const hue = hash % 360;
  return `hsl(${hue}, 60%, 45%)`;
}

/**
 * Check if a string looks like a user ID
 */
export function isUserID(str: string): boolean {
  // User IDs are typically 8+ alphanumeric characters
  return /^[a-zA-Z0-9-]{8,}$/.test(str);
}

/**
 * Check if a string looks like a username
 */
export function isUsername(str: string): boolean {
  // Usernames start with @ or are 2-32 chars
  return str.startsWith('@') || (str.length >= 2 && str.length <= 32);
}

/**
 * Encrypt data for local storage using a derived key
 */
export async function encryptForStorage(data: string, userID: string): Promise<string> {
  const encoder = new TextEncoder();
  
  // Derive key from userID + salt
  const salt = 'CoffeeCHAT-v2-storage';
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(userID + salt),
    'PBKDF2',
    false,
    ['deriveBits', 'deriveKey']
  );
  
  const key = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: encoder.encode(salt),
      iterations: 100000,
      hash: 'SHA-256'
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt']
  );
  
  // Generate random IV
  const iv = crypto.getRandomValues(new Uint8Array(12));
  
  // Encrypt
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoder.encode(data)
  );
  
  // Combine IV + encrypted data
  const combined = new Uint8Array(iv.length + encrypted.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(encrypted), iv.length);
  
  return btoa(String.fromCharCode(...combined));
}

/**
 * Decrypt data from local storage
 */
export async function decryptFromStorage(encryptedData: string, userID: string): Promise<string> {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  
  // Derive key from userID + salt
  const salt = 'CoffeeCHAT-v2-storage';
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(userID + salt),
    'PBKDF2',
    false,
    ['deriveBits', 'deriveKey']
  );
  
  const key = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: encoder.encode(salt),
      iterations: 100000,
      hash: 'SHA-256'
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt']
  );
  
  // Decode base64
  const combined = Uint8Array.from(atob(encryptedData), c => c.charCodeAt(0));
  
  // Extract IV and encrypted data
  const iv = combined.slice(0, 12);
  const encrypted = combined.slice(12);
  
  // Decrypt
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    encrypted
  );
  
  return decoder.decode(decrypted);
}
