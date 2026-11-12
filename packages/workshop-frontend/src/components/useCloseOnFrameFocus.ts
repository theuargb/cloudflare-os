import { useEffect } from "react";

/**
 * Closes an open popup when the user presses inside an iframe (a gatekeeper app). Presses inside a
 * frame never reach this document, so the popup's outside-press dismissal can't see them; the only
 * signal is this window losing focus to the frame. Switching tabs or windows also blurs the window,
 * but leaves `activeElement` off any iframe, so those keep the popup open.
 */
export function useCloseOnFrameFocus(open: boolean, setOpen: (open: boolean) => void): void {
  useEffect(() => {
    if (!open) return;
    let timer: number | undefined;
    const onBlur = () => {
      // `activeElement` points at the frame once the blur has been dispatched.
      timer = window.setTimeout(() => {
        if (document.activeElement instanceof HTMLIFrameElement) setOpen(false);
      });
    };
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("blur", onBlur);
      window.clearTimeout(timer);
    };
  }, [open, setOpen]);
}
