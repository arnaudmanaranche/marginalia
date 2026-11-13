import { useEffect, useState } from 'react';
import { parseHash } from './hashRoute';

// The route the hash points at (hashRoute.ts), followed as it changes.
export function useHashRoute() {
  const [route, setRoute] = useState(() => parseHash(location.hash));
  useEffect(() => {
    const on = () => setRoute(parseHash(location.hash));
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}
