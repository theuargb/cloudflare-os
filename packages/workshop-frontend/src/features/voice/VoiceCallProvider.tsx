import { createContext, useEffect, useMemo, useRef, type ReactNode } from "react";
import { useKumoToastManager } from "@cloudflare/kumo";
import { useAuthenticatedApi } from "../../AuthContext";
import { useServerConfig } from "../../ServerConfigContext";
import { VoiceCallController } from "./voice-call";

/** The tab's voice-mode call; null when the deployment has voice mode off or the browser can't. */
export const VoiceCallContext = createContext<VoiceCallController | null>(null);

function browserCanCall(): boolean {
  return typeof navigator !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia) &&
      typeof RTCPeerConnection !== "undefined";
}

/** Holds the call above the routes, so it survives moving from Home into the chat it started. */
export function VoiceCallProvider({ children }: { children: ReactNode }) {
  const { authenticatedApi } = useAuthenticatedApi();
  const toasts = useKumoToastManager();
  const toastsRef = useRef(toasts);
  toastsRef.current = toasts;
  const enabled = Boolean(useServerConfig()?.voiceModeEnabled) && browserCanCall();
  const controller = useMemo(
    () => enabled ? new VoiceCallController(authenticatedApi) : null,
    [enabled, authenticatedApi],
  );
  useEffect(() => () => controller?.end(), [controller]);

  // A call that ended on an error says why once its bar is gone.
  useEffect(() => {
    if (!controller) return;
    let active = false;
    return controller.subscribe(() => {
      const { phase, error } = controller.getSnapshot();
      if (active && phase === "idle" && error) toastsRef.current.add({ title: error, variant: "error" });
      active = phase !== "idle";
    });
  }, [controller]);

  return <VoiceCallContext.Provider value={controller}>{children}</VoiceCallContext.Provider>;
}
