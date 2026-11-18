import { useRef } from 'react';

// The bar between the chapter panel and the diff: drag it, or focus it and use ← →, to give one
// side more room. `width` is in px and belongs to the panel on the left.
export const MIN_PANEL = 320;
export const DEFAULT_PANEL = 544;
export const maxPanel = (total: number) => Math.max(MIN_PANEL, Math.round(total * 0.7));

export function SplitHandle({ width, onWidth, container }: { width: number; onWidth: (w: number) => void; container: React.RefObject<HTMLElement | null> }) {
  const start = useRef<{ x: number; w: number } | null>(null);
  const clamp = (w: number) => Math.min(maxPanel(container.current?.clientWidth ?? 1600), Math.max(MIN_PANEL, Math.round(w)));
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize the chapter panel"
      aria-valuenow={width}
      aria-valuemin={MIN_PANEL}
      tabIndex={0}
      title="Drag to resize (double-click to reset)"
      onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); start.current = { x: e.clientX, w: width }; }}
      onPointerMove={(e) => { if (start.current) onWidth(clamp(start.current.w + e.clientX - start.current.x)); }}
      onPointerUp={() => { start.current = null; }}
      onPointerCancel={() => { start.current = null; }}
      onDoubleClick={() => onWidth(clamp(DEFAULT_PANEL))}
      onKeyDown={(e) => {
        const step = e.shiftKey ? 80 : 24;
        if (e.key === 'ArrowLeft') { e.preventDefault(); e.stopPropagation(); onWidth(clamp(width - step)); }
        else if (e.key === 'ArrowRight') { e.preventDefault(); e.stopPropagation(); onWidth(clamp(width + step)); }
      }}
      className="group relative hidden w-4 shrink-0 cursor-col-resize touch-none select-none outline-none lg:block"
    >
      <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-line transition-colors group-hover:w-0.5 group-hover:bg-run group-focus-visible:w-0.5 group-focus-visible:bg-run group-active:w-0.5 group-active:bg-run" />
    </div>
  );
}
