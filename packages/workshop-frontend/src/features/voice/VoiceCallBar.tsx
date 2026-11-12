import type { KeyboardEvent } from "react";
import {
  MicrophoneIcon,
  MicrophoneSlashIcon,
  PhoneDisconnectIcon,
  SpeakerSlashIcon,
} from "@phosphor-icons/react";
import { WorkshopIconButton } from "../../components/WorkshopControls";
import type { VoiceCallController, VoiceCallPhase, VoiceCallSnapshot } from "./voice-call";
import { VoiceAurora } from "./VoiceAurora";

const STATUS: Record<Exclude<VoiceCallPhase, "idle">, string> = {
  connecting: "Connecting…",
  listening: "Listening…",
  thinking: "Thinking…",
  speaking: "Speaking…",
  blocked: "Waiting for you to resolve the request above",
};

/** Takes the composer's place during a voice-mode call. */
export function VoiceCallBar({ controller, snapshot, isAgentActive, onStop }: {
  controller: VoiceCallController;
  snapshot: VoiceCallSnapshot;
  isAgentActive: boolean;
  onStop?: () => Promise<void>;
}) {
  const phase = snapshot.phase === "idle" ? "connecting" : snapshot.phase;
  const status = snapshot.muted ? "Muted" : STATUS[phase];

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== "Escape") return;
    event.stopPropagation();
    controller.end();
  };

  return (
    <div className="flex min-h-[76px] items-center gap-3 px-4 pb-2.5 pt-3" onKeyDown={onKeyDown}>
      <VoiceAurora
        controller={controller}
        phase={phase}
        muted={snapshot.muted}
        className="h-10 w-20 shrink-0 sm:w-28"
      />
      <div className="min-w-0 flex-1" aria-live="polite">
        <div className="text-[14px] text-kumo-strong">{status}</div>
        {snapshot.error ? (
          <div className="truncate text-[13px] text-kumo-danger">{snapshot.error}</div>
        ) : snapshot.caption ? (
          <div className="truncate text-[13px] text-kumo-subtle">{snapshot.caption}</div>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        {phase === "speaking" && (
          <WorkshopIconButton
            onClick={() => controller.skipReply()}
            className="!h-10 !w-10 sm:!h-8 sm:!w-8"
            aria-label="Skip reply"
          >
            <SpeakerSlashIcon size={16} />
          </WorkshopIconButton>
        )}
        <WorkshopIconButton
          onClick={() => controller.toggleMute()}
          disabled={phase === "connecting"}
          className="!h-10 !w-10 sm:!h-8 sm:!w-8"
          aria-label={snapshot.muted ? "Unmute microphone" : "Mute microphone"}
        >
          {snapshot.muted ? <MicrophoneSlashIcon size={16} /> : <MicrophoneIcon size={16} />}
        </WorkshopIconButton>
        {isAgentActive && onStop && (
          <WorkshopIconButton
            onClick={() => void onStop()}
            className="!h-10 !w-10 sm:!h-8 sm:!w-8"
            aria-label="Stop agent"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <rect x="5" y="5" width="14" height="14" rx="2" />
            </svg>
          </WorkshopIconButton>
        )}
        <WorkshopIconButton
          onClick={() => controller.end()}
          danger
          className="!h-10 !w-10 !text-kumo-danger sm:!h-8 sm:!w-8"
          aria-label="End voice mode"
        >
          <PhoneDisconnectIcon size={16} />
        </WorkshopIconButton>
      </div>
    </div>
  );
}
