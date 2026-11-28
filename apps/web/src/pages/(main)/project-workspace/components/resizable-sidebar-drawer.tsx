import { useCallback, useEffect, useRef, useState } from "react";
import { RiCloseLine } from "@remixicon/react";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "novelova-workspace-drawer-width";
const DEFAULT_WIDTH = 280;
const MIN_WIDTH = 220;
const MAX_WIDTH = 480;
const COLLAPSE_THRESHOLD = 140;

function getEffectiveMaxWidth(): number {
  if (typeof window === "undefined") return MAX_WIDTH;
  return Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, window.innerWidth - 380));
}

export interface ResizableSidebarDrawerProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
}

export function ResizableSidebarDrawer({
  open,
  onClose,
  title,
  children,
}: ResizableSidebarDrawerProps) {
  const [width, setWidth] = useState<number>(() => {
    if (typeof window === "undefined") return DEFAULT_WIDTH;
    try {
      const saved = Number(localStorage.getItem(STORAGE_KEY));
      if (Number.isFinite(saved) && saved >= MIN_WIDTH && saved <= MAX_WIDTH) {
        return saved;
      }
    } catch {
      // ignore storage errors
    }
    return DEFAULT_WIDTH;
  });

  const [isDragging, setIsDragging] = useState(false);
  const dragStartXRef = useRef(0);
  const dragStartWidthRef = useRef(DEFAULT_WIDTH);
  const latestWidthRef = useRef(width);

  useEffect(() => {
    latestWidthRef.current = width;
  }, [width]);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      dragStartXRef.current = e.clientX;
      dragStartWidthRef.current = latestWidthRef.current;
      setIsDragging(true);
    },
    [],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!isDragging) return;
      const delta = e.clientX - dragStartXRef.current;
      const rawNext = dragStartWidthRef.current + delta;
      if (rawNext < COLLAPSE_THRESHOLD) {
        setIsDragging(false);
        onClose();
        return;
      }
      const clamped = Math.max(MIN_WIDTH, Math.min(getEffectiveMaxWidth(), rawNext));
      setWidth(clamped);
    },
    [isDragging, onClose],
  );

  const handlePointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    setIsDragging(false);
    try {
      localStorage.setItem(STORAGE_KEY, String(Math.round(latestWidthRef.current)));
    } catch {
      // ignore storage errors
    }
  }, []);

  const handleDoubleClick = useCallback(() => {
    setWidth(DEFAULT_WIDTH);
    try {
      localStorage.setItem(STORAGE_KEY, String(DEFAULT_WIDTH));
    } catch {
      // ignore storage errors
    }
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    const maxW = getEffectiveMaxWidth();
    let nextWidth: number | null = null;
    if (e.key === "ArrowLeft") nextWidth = Math.max(MIN_WIDTH, latestWidthRef.current - 16);
    else if (e.key === "ArrowRight") nextWidth = Math.min(maxW, latestWidthRef.current + 16);
    else if (e.key === "Home") nextWidth = MIN_WIDTH;
    else if (e.key === "End") nextWidth = maxW;
    else if (e.key === "Enter") nextWidth = DEFAULT_WIDTH;

    if (nextWidth !== null) {
      e.preventDefault();
      setWidth(nextWidth);
      try {
        localStorage.setItem(STORAGE_KEY, String(Math.round(nextWidth)));
      } catch {
        // ignore storage errors
      }
    }
  }, []);

  useEffect(() => {
    const handleResize = () => {
      const maxW = getEffectiveMaxWidth();
      setWidth((prev) => (prev > maxW ? maxW : prev));
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  if (!open) return null;

  const effectiveMaxWidth = getEffectiveMaxWidth();
  const displayWidth = Math.min(width, effectiveMaxWidth);

  return (
    <>
      {/* Desktop Resizable Drawer with ElevenLabs Centered Vertical Pill Rail */}
      <div
        style={{ width: displayWidth }}
        className={cn(
          "hidden md:flex relative shrink-0 h-full bg-background border-r border-border/80 flex-col overflow-hidden",
          isDragging && "select-none",
        )}
      >
        <div className="flex-1 min-h-0 w-full flex flex-col overflow-hidden">
          {children}
        </div>

        {/* Draggable Edge Rail Handle */}
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize sidebar panel"
          aria-valuenow={Math.round(displayWidth)}
          aria-valuemin={MIN_WIDTH}
          aria-valuemax={effectiveMaxWidth}
          tabIndex={0}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onKeyDown={handleKeyDown}
          onDoubleClick={handleDoubleClick}
          title="Drag or use arrow keys to resize · Double-click to reset"
          className={cn(
            "group/rail absolute top-0 right-0 bottom-0 w-2.5 translate-x-1/2 z-20 flex items-center justify-center cursor-col-resize touch-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          )}
        >
          {/* Full-height hover line */}
          <div
            className={cn(
              "absolute inset-y-0 left-1/2 -translate-x-1/2 w-[2px] transition-colors duration-150",
              isDragging
                ? "bg-neutral-900 dark:bg-neutral-100"
                : "bg-transparent group-hover/rail:bg-neutral-300 dark:group-hover/rail:bg-neutral-700",
            )}
          />
          {/* ElevenLabs-style centered vertical pill grip */}
          <div
            className={cn(
              "relative z-10 w-1 h-10 rounded-full transition-[background-color,transform] duration-150",
              isDragging
                ? "bg-neutral-900 dark:bg-neutral-100 scale-y-110"
                : "bg-neutral-300/90 dark:bg-neutral-700 group-hover/rail:bg-neutral-500 dark:group-hover/rail:bg-neutral-400",
            )}
          />
        </div>
      </div>

      {/* Mobile Slide-Over Sheet Drawer (< md) */}
      <div className="md:hidden fixed inset-0 z-40 flex">
        <div
          className="fixed inset-0 bg-black/35 backdrop-blur-[1px]"
          onClick={onClose}
          aria-hidden="true"
        />
        <div className="relative z-10 w-[86vw] max-w-sm h-full bg-white dark:bg-[#0c0a09] border-r border-border shadow-2xl flex flex-col overflow-hidden">
          <div className="h-11 px-4 border-b border-border/80 flex items-center justify-between shrink-0">
            <span className="text-xs font-semibold text-foreground capitalize">
              {title || "Panel"}
            </span>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
              aria-label="Close panel"
            >
              <RiCloseLine className="h-4 w-4" />
            </button>
          </div>
          <div className="flex-1 min-h-0 w-full flex flex-col overflow-hidden">
            {children}
          </div>
        </div>
      </div>
    </>
  );
}

export default ResizableSidebarDrawer;
