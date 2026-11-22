import { useRouter } from "@tanstack/react-router";
import { useEffect, useRef } from "react";

/** The history state's key marking a step added by `useHistoryStep`. */
const STEP_KEY = "coverbandStep";

let steps = 0;

/**
 * A step in the browser's history while something full screen is open (a photo): the phone's Back
 * (a swipe, its button) closes it instead of leaving the page, or, in an installed app with nothing
 * to go back to, the app. The step is the same address, so the page stays as it is.
 *
 * Back calls `onClose`; closing otherwise (a Close button, Escape) takes the step back off.
 */
export function useHistoryStep(open: boolean, onClose: () => void) {
  const { history } = useRouter();
  const close = useRef(onClose);
  close.current = onClose;

  useEffect(() => {
    if (!open) return;
    const step = ++steps;
    const isStep = () =>
      (history.location.state as unknown as Record<string, unknown>)[STEP_KEY] === step;
    let unsubscribe: (() => void) | undefined;
    // Pushed once the tap's render is done; a cleanup before it (React's development double run)
    // pushes nothing.
    const timer = setTimeout(() => {
      history.push(history.location.href, { ...history.location.state, [STEP_KEY]: step });
      unsubscribe = history.subscribe(() => {
        if (isStep()) return;
        unsubscribe?.();
        unsubscribe = undefined;
        close.current();
      });
    });
    return () => {
      clearTimeout(timer);
      if (!unsubscribe) return;
      unsubscribe();
      // Closed in the app: the step goes, so Back next leaves the page as before.
      if (isStep()) history.back();
    };
  }, [open, history]);
}
