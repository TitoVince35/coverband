import { useEffect, useState } from "react";

/** A phone's keyboard takes at least this share of the screen's height. */
const KEYBOARD_SHARE = 0.25;

/**
 * Whether a phone's keyboard is up: the visible height (the visual viewport) is well under the
 * tallest it has been at this width.
 */
export function isKeyboardUp(visibleHeight: number, tallest: number) {
  return visibleHeight < tallest * (1 - KEYBOARD_SHARE);
}

/**
 * Whether a phone's keyboard is up (#223): the band's bottom bar hides rather than covering what's
 * typed. Read from the visual viewport's size, never the focus: dialogs move the focus around.
 */
export function useKeyboardUp() {
  const [up, setUp] = useState(false);
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    let width = viewport.width;
    let tallest = viewport.height;
    const update = () => {
      // Turned or resized: start again from this height.
      if (Math.abs(viewport.width - width) > 1) {
        width = viewport.width;
        tallest = viewport.height;
      }
      tallest = Math.max(tallest, viewport.height);
      setUp(isKeyboardUp(viewport.height, tallest));
    };
    viewport.addEventListener("resize", update);
    return () => viewport.removeEventListener("resize", update);
  }, []);
  return up;
}
