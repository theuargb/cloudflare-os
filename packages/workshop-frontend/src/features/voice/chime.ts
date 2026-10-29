/** Two falling tones: the call needs the user's attention on screen. */
export function chime(): void {
  let context = new AudioContext();
  let gain = context.createGain();
  gain.gain.value = 0.15;
  gain.connect(context.destination);
  [880, 660].forEach((frequency, i) => {
    let tone = context.createOscillator();
    tone.frequency.value = frequency;
    tone.connect(gain);
    tone.start(context.currentTime + i * 0.12);
    tone.stop(context.currentTime + (i + 1) * 0.12);
    if (i === 1) tone.addEventListener("ended", () => void context.close());
  });
}
