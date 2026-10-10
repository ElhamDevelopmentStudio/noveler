import { useState, useEffect, useRef, useCallback } from "react";
import {
  RiLoader4Line,
  RiAlertLine,
  RiArrowUpLine,
  RiBookOpenLine,
  RiCheckLine,
  RiRestartLine,
} from "@remixicon/react";
import type { RawContentResponse } from "@novelova/shared-types";
import { getRawManuscriptContent } from "@/services/projects";

interface BookContentReaderProps {
  projectId: string;
  fontScaleClass: string;
}

const CHUNK_SIZE = 150_000; // ~150KB per chunk for swift network transfer & zero DOM freeze

export function BookContentReader({
  projectId,
  fontScaleClass,
}: BookContentReaderProps) {
  const [chunks, setChunks] = useState<string[]>([]);
  const [nextOffset, setNextOffset] = useState<number | null>(0);
  const [hasMore, setHasMore] = useState(true);
  const [totalCharacters, setTotalCharacters] = useState<number>(0);
  const [loadedCharacters, setLoadedCharacters] = useState<number>(0);

  const [isLoadingInitial, setIsLoadingInitial] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [initialError, setInitialError] = useState<string | null>(null);
  const [chunkError, setChunkError] = useState<string | null>(null);
  const [showScrollTop, setShowScrollTop] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const isFetchingRef = useRef(false);

  // Fetch a chunk given an offset
  const fetchChunk = useCallback(
    async (offsetToFetch: number, isInitial: boolean) => {
      if (isFetchingRef.current) return;
      isFetchingRef.current = true;

      if (isInitial) {
        setIsLoadingInitial(true);
        setInitialError(null);
      } else {
        setIsLoadingMore(true);
        setChunkError(null);
      }

      try {
        const resp: RawContentResponse = await getRawManuscriptContent(
          projectId,
          offsetToFetch,
          CHUNK_SIZE,
        );

        setChunks((prev) => (isInitial ? [resp.content] : [...prev, resp.content]));
        setNextOffset(resp.next_offset);
        setHasMore(resp.has_more);
        setTotalCharacters(resp.total_characters);
        setLoadedCharacters((prev) =>
          isInitial ? resp.chunk_size : prev + resp.chunk_size,
        );
      } catch (err: unknown) {
        const msg =
          err instanceof Error
            ? err.message
            : "Failed to load manuscript content. Please check your connection.";
        if (isInitial) {
          setInitialError(msg);
        } else {
          setChunkError(msg);
        }
      } finally {
        isFetchingRef.current = false;
        if (isInitial) {
          setIsLoadingInitial(false);
        } else {
          setIsLoadingMore(false);
        }
      }
    },
    [projectId],
  );

  // Initial load
  useEffect(() => {
    setChunks([]);
    setNextOffset(0);
    setHasMore(true);
    setLoadedCharacters(0);
    setTotalCharacters(0);
    fetchChunk(0, true);
  }, [fetchChunk]);

  // Robust "Reaching the end" detection with IntersectionObserver
  useEffect(() => {
    if (!sentinelRef.current || !hasMore || isLoadingInitial || isLoadingMore) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const first = entries[0];
        if (
          first.isIntersecting &&
          hasMore &&
          nextOffset !== null &&
          !isFetchingRef.current
        ) {
          fetchChunk(nextOffset, false);
        }
      },
      {
        root: containerRef.current,
        rootMargin: "350px", // Trigger 350px before absolute bottom for seamless reading
        threshold: 0.05,
      },
    );

    const target = sentinelRef.current;
    observer.observe(target);

    return () => {
      observer.unobserve(target);
      observer.disconnect();
    };
  }, [hasMore, nextOffset, isLoadingInitial, isLoadingMore, fetchChunk]);

  // Handle scroll position for "Back to top" button
  const handleScroll = () => {
    if (containerRef.current) {
      setShowScrollTop(containerRef.current.scrollTop > 600);
    }
  };

  const scrollToTop = () => {
    containerRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  };

  const formatSize = (chars: number) => {
    if (chars < 1024) return `${chars} B`;
    if (chars < 1024 * 1024) return `${Math.round(chars / 1024)} KB`;
    return `${(chars / (1024 * 1024)).toFixed(1)} MB`;
  };

  const progressPercent =
    totalCharacters > 0
      ? Math.min(100, Math.round((loadedCharacters / totalCharacters) * 100))
      : 0;

  // Initial loading state
  if (isLoadingInitial) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-16 min-h-[500px] select-none text-center">
        <RiLoader4Line className="h-7 w-7 animate-spin text-neutral-400 dark:text-neutral-500 mb-3" />
        <span className="shimmer-text text-sm font-medium text-neutral-700 dark:text-neutral-300">
          Loading manuscript content...
        </span>
        <p className="text-xs text-neutral-400 dark:text-neutral-500 mt-1">
          Streaming raw text in optimized chunks
        </p>
      </div>
    );
  }

  // Initial error state
  if (initialError) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-12 min-h-[500px] text-center space-y-4">
        <div className="w-12 h-12 rounded-2xl bg-destructive/10 text-destructive flex items-center justify-center mx-auto">
          <RiAlertLine className="h-6 w-6" />
        </div>
        <div className="space-y-1">
          <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
            Failed to load raw manuscript
          </h3>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 max-w-sm mx-auto">
            {initialError}
          </p>
        </div>
        <button
          type="button"
          onClick={() => fetchChunk(0, true)}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-neutral-900 hover:bg-neutral-800 dark:bg-neutral-100 dark:hover:bg-neutral-200 text-white dark:text-neutral-900 text-xs font-semibold transition-colors cursor-pointer"
        >
          <RiRestartLine className="h-3.5 w-3.5" />
          <span>Retry loading</span>
        </button>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full relative overflow-hidden bg-white dark:bg-black">
      {/* Stream Status Sticky Header */}
      <div className="px-6 sm:px-12 py-2.5 border-b border-neutral-100 dark:border-neutral-800 bg-neutral-50/70 dark:bg-neutral-900/60 flex items-center justify-between text-xs select-none">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-md bg-neutral-200 dark:bg-neutral-800 flex items-center justify-center text-neutral-700 dark:text-neutral-300">
            <RiBookOpenLine className="h-3.5 w-3.5" />
          </div>
          <span className="font-semibold text-neutral-800 dark:text-neutral-200">
            Raw Manuscript
          </span>
          <span className="text-neutral-400 dark:text-neutral-500">·</span>
          <span className="font-mono text-[11px] text-neutral-500 dark:text-neutral-400">
            {formatSize(loadedCharacters)} of {formatSize(totalCharacters)} ({progressPercent}%)
          </span>
        </div>

        {/* Stream Progress Pill */}
        <div className="flex items-center gap-2">
          {hasMore ? (
            <span className="text-[11px] font-mono text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-full flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Infinite Stream Active
            </span>
          ) : (
            <span className="text-[11px] font-mono text-neutral-500 dark:text-neutral-400 bg-neutral-100 dark:bg-neutral-800 px-2 py-0.5 rounded-full flex items-center gap-1">
              <RiCheckLine className="w-3 h-3 text-emerald-500" />
              Complete Manuscript Loaded
            </span>
          )}
        </div>
      </div>

      {/* Scrollable Text Body */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-6 sm:px-16 py-10 space-y-6"
      >
        <div className="max-w-2xl mx-auto space-y-4">
          {chunks.map((chunkText, cIdx) => (
            <div
              key={cIdx}
              className={`font-serif whitespace-pre-wrap text-neutral-900 dark:text-neutral-100 selection:bg-primary/20 ${fontScaleClass}`}
            >
              {chunkText}
            </div>
          ))}

          {/* Subsequent Chunk Error State with Inline Retry */}
          {chunkError && (
            <div className="p-4 rounded-xl border border-destructive/20 bg-destructive/5 text-destructive flex items-center justify-between text-xs animate-in fade-in">
              <div className="flex items-center gap-2">
                <RiAlertLine className="h-4 w-4 shrink-0" />
                <span>{chunkError}</span>
              </div>
              <button
                type="button"
                onClick={() => nextOffset !== null && fetchChunk(nextOffset, false)}
                className="px-3 py-1 rounded-lg bg-destructive text-white font-semibold hover:opacity-90 transition-opacity cursor-pointer text-[11px]"
              >
                Retry next section
              </button>
            </div>
          )}

          {/* Loading More Spinner Indicator */}
          {isLoadingMore && (
            <div className="py-6 flex items-center justify-center gap-2 text-neutral-400 dark:text-neutral-500 select-none animate-in fade-in">
              <RiLoader4Line className="h-4 w-4 animate-spin text-primary" />
              <span className="shimmer-text text-xs font-medium">
                Loading next section ({formatSize(loadedCharacters)} of {formatSize(totalCharacters)})...
              </span>
            </div>
          )}

          {/* End of Manuscript Notice */}
          {!hasMore && (
            <div className="pt-10 pb-6 text-center select-none space-y-1 border-t border-neutral-100 dark:border-neutral-800">
              <div className="w-7 h-7 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto mb-2">
                <RiCheckLine className="h-4 w-4" />
              </div>
              <p className="text-xs font-semibold text-neutral-800 dark:text-neutral-200">
                End of Manuscript
              </p>
              <p className="text-[11px] text-neutral-400 dark:text-neutral-500">
                All {formatSize(totalCharacters)} have been fully streamed.
              </p>
            </div>
          )}

          {/* Intersection Sentinel Trigger Element */}
          <div ref={sentinelRef} className="h-4 w-full pointer-events-none" />
        </div>
      </div>

      {/* Floating Scroll to Top Button */}
      {showScrollTop && (
        <button
          type="button"
          onClick={scrollToTop}
          className="absolute bottom-6 right-8 p-2.5 rounded-full bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 shadow-xl hover:scale-105 active:scale-95 transition-all z-20 cursor-pointer animate-in fade-in zoom-in-95"
          title="Scroll to beginning"
        >
          <RiArrowUpLine className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}
