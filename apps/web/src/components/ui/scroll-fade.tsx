import * as React from "react";
import { cn } from "@/lib/utils";

export interface ScrollFadeProps extends React.HTMLAttributes<HTMLElement> {
  as?: React.ElementType;
  fadeSize?: number; // Size of the fade edge in pixels, default 28
}

export const ScrollFade = React.forwardRef<HTMLElement, ScrollFadeProps>(
  (
    { as: Component = "div", className, children, fadeSize = 28, style, ...props },
    forwardedRef,
  ) => {
    const internalRef = React.useRef<HTMLElement | null>(null);
    const [showTop, setShowTop] = React.useState(false);
    const [showBottom, setShowBottom] = React.useState(false);

    // Merge refs
    const setRef = React.useCallback(
      (node: HTMLElement | null) => {
        internalRef.current = node;
        if (typeof forwardedRef === "function") {
          forwardedRef(node);
        } else if (forwardedRef) {
          (forwardedRef as React.MutableRefObject<HTMLElement | null>).current = node;
        }
      },
      [forwardedRef],
    );

    const updateFade = React.useCallback(() => {
      const el = internalRef.current;
      if (!el) return;

      const { scrollTop, scrollHeight, clientHeight } = el;
      const isScrollable = scrollHeight > clientHeight + 2;

      // Top fade: only appears if user has started scrolling down
      const canScrollTop = scrollTop > 2;

      // Bottom fade: only appears if the container is scrollable AND not yet at the very bottom
      const canScrollBottom =
        isScrollable && scrollTop + clientHeight < scrollHeight - 4;

      setShowTop((prev) => (prev !== canScrollTop ? canScrollTop : prev));
      setShowBottom((prev) => (prev !== canScrollBottom ? canScrollBottom : prev));
    }, []);

    React.useEffect(() => {
      const el = internalRef.current;
      if (!el) return;

      updateFade();

      // Listen to scroll events
      el.addEventListener("scroll", updateFade, { passive: true });

      // Observe size changes of the container and its content
      const resizeObserver = new ResizeObserver(() => {
        updateFade();
      });
      resizeObserver.observe(el);

      // Observe mutations in child elements (e.g., dynamically loaded data)
      const mutationObserver = new MutationObserver(() => {
        updateFade();
      });
      mutationObserver.observe(el, { childList: true, subtree: true });

      // Window resize
      window.addEventListener("resize", updateFade);

      return () => {
        el.removeEventListener("scroll", updateFade);
        resizeObserver.disconnect();
        mutationObserver.disconnect();
        window.removeEventListener("resize", updateFade);
      };
    }, [updateFade]);

    // Calculate dynamic mask based on scroll state
    let mask = "none";
    if (showTop && showBottom) {
      mask = `linear-gradient(to bottom, transparent 0%, black ${fadeSize}px, black calc(100% - ${fadeSize}px), transparent 100%)`;
    } else if (showTop && !showBottom) {
      mask = `linear-gradient(to bottom, transparent 0%, black ${fadeSize}px, black 100%)`;
    } else if (!showTop && showBottom) {
      mask = `linear-gradient(to bottom, black 0%, black calc(100% - ${fadeSize}px), transparent 100%)`;
    }

    return (
      <Component
        ref={setRef}
        className={cn("overflow-y-auto", className)}
        style={{
          maskImage: mask,
          WebkitMaskImage: mask,
          transition: "mask-image 0.15s ease, -webkit-mask-image 0.15s ease",
          ...style,
        }}
        {...props}
      >
        {children}
      </Component>
    );
  },
);

ScrollFade.displayName = "ScrollFade";

export default ScrollFade;
