import { useEffect, useRef } from "react";
import type { VoiceLevels } from "./realtime-connection";
import type { VoiceCallController, VoiceCallPhase } from "./voice-call";

type Phase = Exclude<VoiceCallPhase, "idle">;
type Rgb = [number, number, number];

// Raw RMS of speech sits well under 0.3; this maps it onto the ribbons' 0-1 range.
const LEVEL_GAIN = 4;
const RIBBONS = [
  { weight: 1, frequency: 1.6, speed: 1.0 },
  { weight: 0.8, frequency: 2.1, speed: 1.35 },
  { weight: 0.6, frequency: 2.7, speed: 0.8 },
  { weight: 0.45, frequency: 1.3, speed: 1.7 },
];

// Per phase: the ribbons' colours, their resting amplitude (0-1, at time t in seconds) and how
// fast they flow.
const LOOKS: Record<Phase, { palette: string[]; base: (t: number) => number; speed: number }> = {
  connecting: { palette: ["#94a3b8", "#a5b4fc", "#cbd5e1", "#93c5fd"], base: (t) => 0.08 + 0.05 * Math.sin(2 * t), speed: 0.5 },
  listening: { palette: ["#22d3ee", "#3b82f6", "#8b5cf6", "#2dd4bf"], base: () => 0.12, speed: 1 },
  thinking: { palette: ["#8b5cf6", "#ec4899", "#3b82f6", "#22d3ee"], base: (t) => 0.22 + 0.08 * Math.sin(3 * t), speed: 2.2 },
  speaking: { palette: ["#ec4899", "#a855f7", "#f97316", "#6366f1"], base: () => 0.15, speed: 1.3 },
  blocked: { palette: ["#f59e0b", "#fb923c", "#facc15", "#f97316"], base: (t) => 0.18 + 0.08 * Math.sin(1.5 * t), speed: 0.6 },
};
const PALETTES = Object.fromEntries(Object.entries(LOOKS).map(([phase, look]) =>
  [phase, look.palette.map(parseHex)])) as Record<Phase, Rgb[]>;

/**
 * The call bar's voice visualizer: glowing translucent ribbons that swell with whoever is talking
 * and take the phase's colours (cool while the user talks, warm while the assistant does, a fast
 * shimmer while thinking, amber while waiting on the user).
 */
export function VoiceAurora({ controller, phase, muted, className }: {
  controller: VoiceCallController;
  phase: Phase;
  muted: boolean;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const mutedRef = useRef(muted);
  mutedRef.current = muted;
  // Redraws the still frame when motion is reduced; null while animating.
  const redrawRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let levels: VoiceLevels = { user: 0, assistant: 0 };
    const stopLevels = controller.onLevel((next) => {
      levels = next;
    });
    let level = 0;
    let colors = PALETTES[phaseRef.current].map((rgb): Rgb => [...rgb]);
    let frame = 0;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(canvas.clientWidth * dpr);
      canvas.height = Math.round(canvas.clientHeight * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const draw = (t: number, still: boolean) => {
      const current = phaseRef.current;
      const look = LOOKS[current];
      const rms = current === "listening" ? (mutedRef.current ? 0 : levels.user)
          : current === "speaking" ? levels.assistant : 0;
      const target = still ? 0 : Math.min(1, rms * LEVEL_GAIN);
      level += (target - level) * 0.25;
      const palette = PALETTES[current];
      colors = still ? palette.map((rgb): Rgb => [...rgb]) : colors.map((rgb, i) =>
        rgb.map((value, channel) => value + (palette[i][channel] - value) * 0.08) as Rgb);
      const base = still ? 0.35 : look.base(t);

      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      const middle = height / 2;
      ctx.clearRect(0, 0, width, height);
      ctx.globalCompositeOperation = "source-over";
      RIBBONS.forEach((ribbon, i) => {
        const amplitude = (middle - 2) * ribbon.weight * Math.min(1, Math.max(0, base + level * 0.9));
        const shift = t * ribbon.speed * look.speed + i * 1.3;
        const wave = (x: number, offset: number) => {
          const envelope = Math.sin((Math.PI * x) / width) ** 2;
          return envelope * Math.sin((ribbon.frequency * 2 * Math.PI * x) / width + shift + offset);
        };
        const top: [number, number][] = [];
        const bottom: [number, number][] = [];
        for (let x = 0; x <= width; x += 2) {
          top.push([x, middle + amplitude * wave(x, 0)]);
          bottom.push([x, middle - 0.55 * amplitude * wave(x, 0.9)]);
        }
        const from = colors[i];
        const to = colors[(i + 1) % colors.length];
        const gradient = ctx.createLinearGradient(0, 0, width, 0);
        gradient.addColorStop(0, rgba(from, 0.45));
        gradient.addColorStop(1, rgba(to, 0.45));
        ctx.shadowColor = rgba(from, 1);
        ctx.shadowBlur = 6 + 10 * level;

        ctx.beginPath();
        top.forEach(([x, y], index) => (index ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        for (let index = bottom.length - 1; index >= 0; index--) ctx.lineTo(bottom[index][0], bottom[index][1]);
        ctx.closePath();
        ctx.fillStyle = gradient;
        ctx.fill();

        ctx.beginPath();
        top.forEach(([x, y], index) => (index ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = rgba(from, 0.8);
        ctx.stroke();
      });
      ctx.shadowBlur = 0;
    };

    const observer = new ResizeObserver(() => {
      resize();
      if (reduced) draw(0, true);
    });
    observer.observe(canvas);
    resize();

    if (reduced) {
      redrawRef.current = () => draw(0, true);
      draw(0, true);
    } else {
      const loop = (now: number) => {
        draw(now / 1000, false);
        frame = requestAnimationFrame(loop);
      };
      frame = requestAnimationFrame(loop);
    }
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      stopLevels();
      redrawRef.current = null;
    };
  }, [controller]);

  useEffect(() => {
    if (canvasRef.current) canvasRef.current.style.opacity = muted ? "0.45" : "1";
    redrawRef.current?.();
  }, [phase, muted]);

  return <canvas ref={canvasRef} aria-hidden className={className} />;
}

function parseHex(hex: string): Rgb {
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function rgba([r, g, b]: Rgb, alpha: number): string {
  return `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${alpha})`;
}
