import { useContext, useEffect, useRef, useSyncExternalStore } from "react";
import type { VoiceCallController, VoiceCallHost, VoiceCallHostLink, VoiceCallSnapshot } from "./voice-call";
import { VoiceCallContext } from "./VoiceCallProvider";

const IDLE: VoiceCallSnapshot = { phase: "idle", chatId: null, caption: "", muted: false, error: null };
const noSubscription = () => () => {};
const idleSnapshot = () => IDLE;

/**
 * Lets this page carry the tab's voice-mode call: the call talks in the page's chat and sends
 * through `host.send`. `controller` is null when voice mode is unavailable.
 */
export function useVoiceCall(host: VoiceCallHost): {
  controller: VoiceCallController | null;
  snapshot: VoiceCallSnapshot;
} {
  const controller = useContext(VoiceCallContext);
  const hostRef = useRef(host);
  hostRef.current = host;
  const linkRef = useRef<VoiceCallHostLink | null>(null);

  useEffect(() => {
    if (!controller) return;
    const link = controller.attach(() => hostRef.current);
    linkRef.current = link;
    return () => {
      link.detach();
      linkRef.current = null;
    };
  }, [controller]);

  useEffect(() => {
    linkRef.current?.changed();
  }, [host.chatId, host.isAgentActive, host.hasQueuedSteers, host.blockedReason]);

  const snapshot = useSyncExternalStore(
    controller?.subscribe ?? noSubscription,
    controller?.getSnapshot ?? idleSnapshot,
  );
  return { controller, snapshot };
}
