import { useEffect, useRef, useState } from 'react';
import { parseHash } from './hashRoute';
import { changeScreen } from './screenTransition';

// The route the hash points at (hashRoute.ts), followed as it changes; a change of screen moves the
// title of the review opened or left instead of cutting (screenTransition.ts).
export function useHashRoute() {
  const [route, setRoute] = useState(() => parseHash(location.hash));
  const shown = useRef(route);
  useEffect(() => {
    const on = () => {
      const next = parseHash(location.hash);
      const from = shown.current.slug;
      shown.current = next;
      changeScreen(() => setRoute(next), from, next.slug);
    };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}
