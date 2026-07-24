const PARTICLE_COLORS = ["#f43f5e", "#f59e0b", "#22c55e", "#06b6d4", "#8b5cf6"];
const PARTICLE_COUNT = 14;

let audioContext: AudioContext | null = null;

export interface CelebrationParticle {
  color: string;
  delay: number;
  rotation: number;
  x: number;
  y: number;
}

export function createCelebrationParticles(random: () => number = Math.random): CelebrationParticle[] {
  return Array.from({ length: PARTICLE_COUNT }, (_, index) => {
    const angle = (index / PARTICLE_COUNT) * Math.PI * 2 + (random() - 0.5) * 0.35;
    const distance = 24 + random() * 28;
    return {
      color: PARTICLE_COLORS[index % PARTICLE_COLORS.length],
      delay: random() * 70,
      rotation: (random() - 0.5) * 540,
      x: Math.cos(angle) * distance,
      y: Math.sin(angle) * distance - 12,
    };
  });
}

export function playCompletionFeedback(origin: HTMLElement): void {
  playCompletionSound();
  showCelebration(origin);
}

function playCompletionSound(): void {
  try {
    audioContext ??= new AudioContext();
    if (audioContext.state === "suspended") void audioContext.resume();

    const startedAt = audioContext.currentTime;
    playTone(audioContext, 523.25, startedAt, 0.16);
    playTone(audioContext, 659.25, startedAt + 0.09, 0.2);
  } catch {
    // Audio can be unavailable or disabled by the host; task completion must still proceed.
  }
}

function playTone(context: AudioContext, frequency: number, startsAt: number, duration: number): void {
  const oscillator = context.createOscillator();
  const gain = context.createGain();

  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(frequency, startsAt);
  gain.gain.setValueAtTime(0.0001, startsAt);
  gain.gain.exponentialRampToValueAtTime(0.08, startsAt + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, startsAt + duration);

  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start(startsAt);
  oscillator.stop(startsAt + duration);
}

function showCelebration(origin: HTMLElement): void {
  const bounds = origin.getBoundingClientRect();
  const burst = document.createElement("span");
  burst.ariaHidden = "true";
  burst.className = "tasks-calendar-celebration";
  burst.style.left = `${bounds.left + bounds.width / 2}px`;
  burst.style.top = `${bounds.top + bounds.height / 2}px`;

  for (const definition of createCelebrationParticles()) {
    const particle = document.createElement("span");
    particle.className = "tasks-calendar-celebration-particle";
    particle.style.setProperty("--particle-color", definition.color);
    particle.style.setProperty("--particle-delay", `${definition.delay}ms`);
    particle.style.setProperty("--particle-rotation", `${definition.rotation}deg`);
    particle.style.setProperty("--particle-x", `${definition.x}px`);
    particle.style.setProperty("--particle-y", `${definition.y}px`);
    burst.append(particle);
  }

  document.body.append(burst);
  window.setTimeout(() => burst.remove(), 900);
}
