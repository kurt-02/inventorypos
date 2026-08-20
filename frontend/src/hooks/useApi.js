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
    setLoading(true);
    setError(null);
    try {
      const res = await api.get(url, { params: JSON.parse(paramsKey) ?? undefined });
      if (mounted.current) setData(res.data);
    } catch (err) {
      if (mounted.current) setError(errorMessage(err));
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [url, paramsKey, enabled]);

  useEffect(() => {
    load();
  }, [load]);

  return { data, loading, error, refetch: load, setData };
}
