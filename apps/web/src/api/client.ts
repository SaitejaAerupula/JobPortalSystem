import axios from 'axios';

function resolveBaseUrl() {
  const configured = import.meta.env.VITE_API_BASE_URL;

  if (typeof window !== 'undefined') {
    const isRemoteForwardedHost = window.location.hostname.endsWith('.app.github.dev');
    const isLocalhostConfigured =
      typeof configured === 'string' && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/i.test(configured);

    // In forwarded browser sessions, localhost points to the user's machine, not the dev container.
    if (isRemoteForwardedHost && isLocalhostConfigured) {
      return '/api/v1';
    }
  }

  return configured ?? '/api/v1';
}

const baseURL = resolveBaseUrl();

export const api = axios.create({
  baseURL,
  headers: {
    'Content-Type': 'application/json'
  }
});

export function setAuthToken(token: string | null) {
  if (token) {
    api.defaults.headers.common.Authorization = `Bearer ${token}`;
  } else {
    delete api.defaults.headers.common.Authorization;
  }
}
