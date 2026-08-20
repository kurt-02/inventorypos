import axios from 'axios';

/**
 * Shared axios instance.
 *
 * Access tokens are kept in memory only (never localStorage) and attached as a
 * Bearer header. The refresh token lives in an httpOnly cookie the JS never
 * touches, so `withCredentials: true` is required for /api/auth/refresh.
 */
const api = axios.create({
  baseURL: `${import.meta.env.VITE_API_URL || ''}/api`,
  withCredentials: true,
});

let accessToken = null;
let onAuthFailure = () => {};

export function setAccessToken(token) {
  accessToken = token;
}
export function getAccessToken() {
  return accessToken;
}
/** Registers the callback the AuthContext uses to log the user out when refresh fails. */
export function setAuthFailureHandler(handler) {
  onAuthFailure = handler;
}

api.interceptors.request.use((config) => {
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  return config;
});

// --- Automatic token refresh -----------------------------------------------
// When a request 401s because the short-lived access token expired, we call
// /auth/refresh once and replay the original request. Concurrent 401s all
// wait on the same refresh promise so we never fire several refreshes at once
// (which would fail, since refresh tokens rotate on every use).
let refreshPromise = null;

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;
    const status = error.response?.status;
    const isRefreshCall = original?.url?.includes('/auth/refresh');

    if (status === 401 && !original?._retried && !isRefreshCall) {
      original._retried = true;

      if (!refreshPromise) {
        refreshPromise = api
          .post('/auth/refresh')
          .then((res) => {
            setAccessToken(res.data.accessToken);
            return res.data.accessToken;
          })
          .catch((err) => {
            setAccessToken(null);
            onAuthFailure();
            throw err;
          })
          .finally(() => {
            refreshPromise = null;
          });
      }

      try {
        const newToken = await refreshPromise;
        original.headers.Authorization = `Bearer ${newToken}`;
        return api(original);
      } catch {
        return Promise.reject(error);
      }
    }

    return Promise.reject(error);
  }
);

/** Pulls a human-readable message out of an axios error for display in the UI. */
export function errorMessage(error, fallback = 'Something went wrong.') {
  return error?.response?.data?.error || error?.message || fallback;
}

export default api;
