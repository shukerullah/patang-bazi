// ============================================
// PATANG BAZI — Player Preferences
// Single localStorage key for all client prefs.
// Gracefully handles private browsing & errors.
// ============================================

const STORAGE_KEY = 'patang';

export interface PatangPrefs {
  /** Player display name */
  name?: string;
  /** Has the player seen the in-game tutorial? */
  tutorialSeen?: boolean;
}

/** Read all prefs (migrates legacy keys on first read) */
export function getPrefs(): PatangPrefs {
  try {
    // Migrate legacy `patang_name` key if it exists
    const legacyName = localStorage.getItem('patang_name');
    if (legacyName) {
      const prefs: PatangPrefs = { name: legacyName };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
      localStorage.removeItem('patang_name');
      return prefs;
    }

    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

/** Update prefs (merges with existing) */
export function savePrefs(partial: Partial<PatangPrefs>): void {
  try {
    const current = getPrefs();
    const merged = { ...current, ...partial };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
  } catch { /* private browsing — silently fail */ }
}

/**
 * Detect touch-capable device.
 * Covers phones, tablets, and touchscreen laptops in tablet mode.
 * Cached on first call since hardware doesn't change mid-session.
 */
let _isTouchCached: boolean | null = null;

export function isTouchDevice(): boolean {
  if (_isTouchCached !== null) return _isTouchCached;
  _isTouchCached = (
    'ontouchstart' in window ||
    navigator.maxTouchPoints > 0
  );
  return _isTouchCached;
}
