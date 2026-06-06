import { useEffect, useRef } from "react";

/**
 * Trap keyboard focus within a container while a modal is open.
 *
 * - On mount, moves focus to the first focusable element inside the container.
 * - Tab / Shift+Tab cycle within the container instead of escaping to the page
 *   behind it (WCAG 2.4.3 / 2.1.2 — modal dialogs must contain focus).
 * - On unmount, restores focus to whatever was focused before the modal opened.
 *
 * Usage:
 *   const ref = useFocusTrap<HTMLDivElement>(true);
 *   return <div ref={ref} role="dialog" aria-modal="true">…</div>;
 */
export function useFocusTrap<T extends HTMLElement>(active = true) {
  const containerRef = useRef<T>(null);

  useEffect(() => {
    if (!active) return;
    const container = containerRef.current;
    if (!container) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;

    const FOCUSABLE =
      'a[href], button:not([disabled]), textarea:not([disabled]), ' +
      'input:not([disabled]):not([type="hidden"]), select:not([disabled]), ' +
      '[tabindex]:not([tabindex="-1"])';

    function focusable(): HTMLElement[] {
      if (!container) return [];
      return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        el => el.offsetParent !== null || el === document.activeElement,
      );
    }

    // Move focus inside on open (unless something inside is already focused, e.g.
    // an autoFocus input).
    if (!container.contains(document.activeElement)) {
      const first = focusable()[0];
      first?.focus();
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Tab") return;
      const items = focusable();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      const activeEl = document.activeElement as HTMLElement | null;

      if (e.shiftKey) {
        if (activeEl === first || !container!.contains(activeEl)) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (activeEl === last || !container!.contains(activeEl)) {
          e.preventDefault();
          first.focus();
        }
      }
    }

    container.addEventListener("keydown", onKeyDown);
    return () => {
      container.removeEventListener("keydown", onKeyDown);
      // Restore focus to the trigger element when the modal closes.
      previouslyFocused?.focus?.();
    };
  }, [active]);

  return containerRef;
}
