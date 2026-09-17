// src/hooks/useFetch.js
// A tiny data-loading hook.
//
// The old pages did `useEffect(load, [])` where `load` returned a promise. React expects an
// effect to return either nothing or a cleanup function, and any failed request had no .catch,
// so a single API error left the screen blank with no explanation. This hook fixes both:
// it always returns a proper cleanup, and it captures the error so the page can show it.
import { useCallback, useEffect, useRef, useState } from 'react';
import api from '../api/axios';
import { errorMessage } from '../components/ui';

/**
 * @param {string|null} url         endpoint to GET, or null to skip fetching
 * @param {object}  options
 * @param {any}     options.initialData  value to use before the first response
 * @param {Array}   options.deps         re-fetch when any of these change
 */
export default function useFetch(url, { initialData = null, deps = [] } = {}) {
  const [data, setData] = useState(initialData);
  const [loading, setLoading] = useState(Boolean(url));
  const [error, setError] = useState('');
  const alive = useRef(true);

  useEffect(() => () => { alive.current = false; }, []);

  const load = useCallback(async () => {
    if (!url) { setLoading(false); return; }
    setLoading(true);
    setError('');
    try {
      const res = await api.get(url);
      if (alive.current) setData(res.data);
    } catch (err) {
      // A 401 is already handled globally by the axios interceptor (it redirects to login).
      if (err.response?.status !== 401 && alive.current) setError(errorMessage(err));
    } finally {
      if (alive.current) setLoading(false);
    }
  }, [url]);

  useEffect(() => {
    alive.current = true;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, ...deps]);

  return { data, setData, loading, error, reload: load };
}

/**
 * Same idea, but for a page that needs several endpoints at once.
 * `map` looks like { items: '/items', customers: '/customers' }.
 */
export function useFetchAll(map, deps = []) {
  const keys = Object.keys(map);
  const signature = keys.map((k) => `${k}:${map[k]}`).join('|');

  const [data, setData] = useState(() => Object.fromEntries(keys.map((k) => [k, null])));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const alive = useRef(true);

  useEffect(() => () => { alive.current = false; }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const responses = await Promise.all(keys.map((k) => api.get(map[k])));
      if (!alive.current) return;
      setData(Object.fromEntries(keys.map((k, i) => [k, responses[i].data])));
    } catch (err) {
      if (err.response?.status !== 401 && alive.current) setError(errorMessage(err));
    } finally {
      if (alive.current) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  useEffect(() => {
    alive.current = true;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, ...deps]);

  return { data, setData, loading, error, reload: load };
}
