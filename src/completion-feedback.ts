import { animate } from "motion/mini";

const PARTICLE_COUNT = 18;
const PARTICLE_FRAME_COUNT = 11;
export const TASK_COMPLETION_FEEDBACK_DURATION_MS = 1620;
export const RECURRENCE_CREATED_FEEDBACK_DURATION_MS = 1800;

let audioContext: AudioContext | null = null;

export interface CelebrationParticle {
  color: string;
  delay: number;
  duration: number;
  gravity: number;
  height: number;
  rotation: number;
  velocityX: number;
  velocityY: number;
  width: number;
}

export function createCelebrationParticles(
  random: () => number = Math.random,
  count = PARTICLE_COUNT,
  power = 1,
): CelebrationParticle[] {
  return Array.from({ length: count }, (_, index) => {
    const angle = (index / count) * Math.PI * 2 + (random() - 0.5) * 0.42;
    const speed = (95 + random() * 100) * power;
    const width = 3 + random() * 4;

    return {
      color: confettiColor(random()),
      delay: random() * 0.07,
      duration: 0.78 + random() * 0.34,
      gravity: 300 + random() * 180,
      height: width * (1.4 + random() * 1.4),
      rotation: (index % 2 === 0 ? 1 : -1) * (420 + random() * 720),
      velocityX: Math.cos(angle) * speed,
      velocityY: Math.sin(angle) * speed - 140 * power,
      width,
    };
  });
}

function confettiColor(progress: number): string {
  const accentWeight = Math.round((1 - progress) * 100);
  return `color-mix(in srgb, var(--interactive-accent) ${accentWeight}%, var(--color-cyan, var(--text-accent)))`;
}

export function celebrationParticlePosition(
  particle: CelebrationParticle,
  elapsedSeconds: number,
): { x: number; y: number } {
  return {
    x: particle.velocityX * elapsedSeconds,
    y: particle.velocityY * elapsedSeconds + 0.5 * particle.gravity * elapsedSeconds ** 2,
  };
}

export function playCompletionFeedback(
  origin: HTMLElement,
  taskOutline: HTMLElement | null,
  completesDay = false,
): void {
  playCompletionSound(completesDay);
  playHapticTick(completesDay);
  if (taskOutline) showTaskCompletion(taskOutline);
  showTaskShake(origin);
  showCelebration(origin);
  if (completesDay) showDayCompletion(origin);
}

export function playRecurrenceCreatedFeedback(taskOutline: HTMLElement): void {
  showFadingOutline(taskOutline, "var(--tasks-calendar-recurrence-accent)", RECURRENCE_CREATED_FEEDBACK_DURATION_MS);
}

function showTaskShake(origin: HTMLElement): void {
  const task = origin.closest<HTMLElement>(".tasks-calendar-task");
  if (!task) return;

  task.animate(
    { translate: ["0 0", "-2px 0", "2px 0", "-1px 0", "1px 0", "0 0"] },
    { duration: 320, easing: "ease-out" },
  );
}

function playCompletionSound(completesDay: boolean): void {
  try {
    if (!audioContext || audioContext.state === "closed") audioContext = new AudioContext();
    const context = audioContext;
    if (context.state === "suspended") {
      void context
        .resume()
        .then(() => scheduleCompletionSound(context, completesDay))
        .catch(() => undefined);
    } else {
      scheduleCompletionSound(context, completesDay);
    }
  } catch {
    // Audio can be unavailable or disabled by the host; task completion must still proceed.
  }
}

function scheduleCompletionSound(context: AudioContext, completesDay: boolean): void {
  const startedAt = context.currentTime + 0.015;
  playTone(context, 523.25, startedAt, 0.18, 0.07);
  playTone(context, 659.25, startedAt + 0.075, 0.2, 0.065);
  playTone(context, 783.99, startedAt + 0.15, 0.25, 0.055);
  if (completesDay) {
    playTone(context, 1046.5, startedAt + 0.29, 0.28, 0.05);
    playTone(context, 1318.51, startedAt + 0.38, 0.34, 0.04);
  }
}

function playTone(context: AudioContext, frequency: number, startsAt: number, duration: number, volume: number): void {
  const oscillator = context.createOscillator();
  const gain = context.createGain();

  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(frequency, startsAt);
  gain.gain.setValueAtTime(0.0001, startsAt);
  gain.gain.exponentialRampToValueAtTime(volume, startsAt + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, startsAt + duration);

  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start(startsAt);
  oscillator.stop(startsAt + duration);
}

function playHapticTick(completesDay: boolean): void {
  try {
    navigator.vibrate?.(completesDay ? [18, 45, 28] : 18);
  } catch {
    // Some embedded browser hosts expose vibration but reject calls to it.
  }
}

function showTaskCompletion(outline: HTMLElement): void {
  showFadingOutline(outline, "var(--interactive-accent)", TASK_COMPLETION_FEEDBACK_DURATION_MS);
}

function showFadingOutline(outline: HTMLElement, color: string, duration: number): void {
  animate(
    outline,
    {
      borderColor: [color, color],
      opacity: [1, 0],
    },
    { duration: duration / 1000, ease: "easeOut" },
  );
}

function showCelebration(origin: HTMLElement): void {
  const bounds = origin.getBoundingClientRect();
  showCelebrationAt(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2);
}

function showCelebrationAt(x: number, y: number, particles = createCelebrationParticles()): void {
  const burst = document.createElement("span");
  burst.ariaHidden = "true";
  burst.className = "tasks-calendar-celebration";
  burst.style.left = `${x}px`;
  burst.style.top = `${y}px`;
  document.body.append(burst);

  showShockwaves(burst);
  for (const definition of particles) {
    const particle = document.createElement("span");
    const piece = document.createElement("span");
    particle.className = "tasks-calendar-celebration-particle";
    piece.className = "tasks-calendar-celebration-piece";
    piece.style.width = `${definition.width}px`;
    piece.style.height = `${definition.height}px`;
    piece.style.backgroundColor = definition.color;
    piece.style.color = definition.color;
    particle.append(piece);
    burst.append(particle);

    const progress = Array.from({ length: PARTICLE_FRAME_COUNT }, (_, index) => index / (PARTICLE_FRAME_COUNT - 1));
    const positions = progress.map((value) => celebrationParticlePosition(definition, definition.duration * value));
    animate(
      particle,
      {
        opacity: progress.map((value) => (value < 0.72 ? 1 : (1 - value) / 0.28)),
        transform: positions.map(
          ({ x: particleX, y: particleY }) => `translate(calc(-50% + ${particleX}px), calc(-50% + ${particleY}px))`,
        ),
      },
      {
        delay: definition.delay,
        duration: definition.duration,
        ease: "linear",
        times: progress,
      },
    );
    animate(
      piece,
      {
        transform: progress.map(
          (value) => `rotate(${definition.rotation * value}deg) scale(${0.7 + Math.sin(value * Math.PI) * 0.35})`,
        ),
      },
      { delay: definition.delay, duration: definition.duration, ease: "linear", times: progress },
    );
  }

  const longestDuration = Math.max(...particles.map(({ delay, duration }) => delay + duration));
  window.setTimeout(() => burst.remove(), (longestDuration + 0.15) * 1000);
}

function showShockwaves(burst: HTMLElement): void {
  for (let index = 0; index < 2; index += 1) {
    const ring = document.createElement("span");
    ring.className = "tasks-calendar-celebration-ring";
    burst.append(ring);
    animate(
      ring,
      {
        opacity: [0.85, 0],
        transform: ["translate(-50%, -50%) scale(0.15)", "translate(-50%, -50%) scale(1)"],
      },
      { delay: index * 0.09, duration: 0.52 + index * 0.08, ease: "easeOut" },
    );
  }
}

function showDayCompletion(origin: HTMLElement): void {
  const target =
    origin.closest<HTMLElement>(".tasks-calendar-day") ?? origin.closest<HTMLElement>(".tasks-calendar-task");
  if (!target) return;

  const bounds = target.getBoundingClientRect();
  const overlay = document.createElement("span");
  overlay.ariaHidden = "true";
  overlay.className = "tasks-calendar-day-complete-overlay";
  overlay.style.left = `${bounds.left}px`;
  overlay.style.top = `${bounds.top}px`;
  overlay.style.width = `${bounds.width}px`;
  overlay.style.height = `${bounds.height}px`;
  overlay.style.borderRadius = getComputedStyle(target).borderRadius;
  document.body.append(overlay);

  animate(
    overlay,
    {
      boxShadow: [
        "inset 0 0 0 0 transparent, 0 0 0 0 transparent",
        "inset 0 0 32px color-mix(in srgb, #facc15 18%, transparent), 0 0 0 3px color-mix(in srgb, #facc15 80%, transparent)",
        "inset 0 0 18px color-mix(in srgb, #facc15 8%, transparent), 0 0 24px 2px transparent",
      ],
      opacity: [0, 1, 0],
      transform: ["scale(0.97)", "scale(1.015)", "scale(1)"],
    },
    { duration: 1.5, ease: "easeOut", times: [0, 0.24, 1] },
  ).then(() => overlay.remove());
}
