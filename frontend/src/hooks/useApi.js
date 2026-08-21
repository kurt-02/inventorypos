import { useState, useEffect, useCallback, useRef } from 'react';
import api, { errorMessage } from '../utils/api';

/**
 * Fetches from the API and tracks loading/error state.
 *
 * `url` may be null to skip fetching (useful while a required id is still
 * unknown). Returns `refetch` so pages can reload after a mutation.
 */
export function useFetch(url, { params, enabled = true } = {}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(enabled && !!url);
  const [error, setError] = useState(null);

  // Serialize params so a fresh object literal on each render doesn't
  // re-trigger the effect endlessly.
  const paramsKey = JSON.stringify(params ?? null);
  const mounted = useRef(true);
  // Requests can finish out of order - paging quickly, or typing in a search
  // box, leaves several in flight at once. Only the newest one may write to
  // state, otherwise a slow earlier response paints stale rows over fresh ones.
  const latestRequest = useRef(0);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    if (!url || !enabled) {
      setLoading(false);
      return;
    }
    const requestId = ++latestRequest.current;
    const isCurrent = () => mounted.current && latestRequest.current === requestId;

    setLoading(true);
    setError(null);
    try {
      const res = await api.get(url, { params: JSON.parse(paramsKey) ?? undefined });
      if (isCurrent()) setData(res.data);
    } catch (err) {
      if (isCurrent()) setError(errorMessage(err));
    } finally {
      if (isCurrent()) setLoading(false);
    }
  }, [url, paramsKey, enabled]);

  useEffect(() => {
    load();
  }, [load]);

  return { data, loading, error, refetch: load, setData };
}

/**
 * Delays a rapidly-changing value, for search boxes.
 *
 * Without this every keystroke would be its own request - "americano" would
 * fire nine queries and the client would race to display whichever returned
 * last. The request only goes out once typing pauses.
 */
export function useDebounced(value, delay = 350) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}
