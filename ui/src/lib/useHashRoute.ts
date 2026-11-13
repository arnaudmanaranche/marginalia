import { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { parseHash } from './hashRoute';
import { changeScreen } from './screenTransition';
import { arrivalScroll, rememberScroll } from './scrollMemory';

// The route the hash points at (hashRoute.ts), followed as it changes; a change of screen moves the
// title of the review opened or left instead of cutting (screenTransition.ts), and lands where that
// screen was left on Back, at the top otherwise (scrollMemory.ts).
export function useHashRoute() {
  const [route, setRoute] = useState(() => parseHash(location.hash));
  const shown = useRef(route);
  useEffect(() => {
    const stop = rememberScroll();
    const on = () => {
      const next = parseHash(location.hash);
      const from = shown.current.slug;
      const top = arrivalScroll();
      shown.current = next;
      changeScreen(() => {
        flushSync(() => setRoute(next));
        // Within one screen (a finding, a version), the reader keeps its place.
        if (from !== next.slug) window.scrollTo({ top, behavior: 'instant' });
      }, from, next.slug);
    };
    window.addEventListener('hashchange', on);
    return () => {
      stop();
      window.removeEventListener('hashchange', on);
    };
  }, []);
  return route;
}
