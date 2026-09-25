// Runtime settings (data source + API base URL), persisted per browser.
const KEY = 'verimetrix.settings';

const defaults = {
  dataSource: import.meta.env.VITE_USE_MOCK === 'true' ? 'mock' : 'api',
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL || '',
};

export function getSettings() {
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) || '{}');
    return { ...defaults, ...stored };
  } catch {
    return { ...defaults };
  }
}

export function saveSettings(next) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...getSettings(), ...next }));
  } catch {
    // Storage blocked — settings fall back to env defaults.
  }
}

export const isMockMode = () => getSettings().dataSource === 'mock';

/** Backend image paths like "/uploads/back.jpg" are relative to the API host. */
export function resolveAssetUrl(url) {
  if (!url) return null;
  if (/^(https?:|blob:|data:)/.test(url) || url.startsWith('/samples/')) return url;
  const base = isMockMode() ? '' : getSettings().apiBaseUrl.replace(/\/$/, '');
  return `${base}${url.startsWith('/') ? '' : '/'}${url}`;
}
