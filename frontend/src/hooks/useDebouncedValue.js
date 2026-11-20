import { useEffect, useState } from 'react';

// Returns `value` once it has stopped changing for `delay` ms, so typing in the
// search box sends one request instead of one per keystroke. The first render
// returns the value immediately (e.g. a search restored from the URL).
export function useDebouncedValue(value, delay = 300) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}
