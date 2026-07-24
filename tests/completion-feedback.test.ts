import { describe, expect, it } from "vitest";
import { celebrationParticlePosition, createCelebrationParticles } from "../src/completion-feedback";

describe("createCelebrationParticles", () => {
  it("creates sharp rectangular particles with bounded projectile values", () => {
    let seed = 42;
    const particles = createCelebrationParticles(() => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 2 ** 32;
    });

    expect(particles).toHaveLength(18);
    expect(new Set(particles.map((particle) => particle.color)).size).toBeGreaterThan(10);
    expect(particles.every((particle) => particle.color.startsWith("color-mix(in srgb"))).toBe(true);
    expect(particles.every((particle) => particle.delay >= 0 && particle.delay <= 0.07)).toBe(true);
    expect(particles.every((particle) => particle.duration >= 0.78 && particle.duration <= 1.12)).toBe(true);
    expect(particles.every((particle) => particle.gravity >= 300 && particle.gravity <= 480)).toBe(true);
    expect(particles.every((particle) => particle.height > particle.width)).toBe(true);
    expect(particles.some((particle) => particle.velocityX < 0)).toBe(true);
    expect(particles.some((particle) => particle.velocityX > 0)).toBe(true);
    expect(particles.filter((particle) => particle.velocityY < 0).length).toBeGreaterThanOrEqual(14);
  });

  it("applies constant gravity throughout each particle trajectory", () => {
    const particle = createCelebrationParticles(() => 0.5)[0];
    const start = celebrationParticlePosition(particle, 0);
    const middle = celebrationParticlePosition(particle, 0.2);
    const end = celebrationParticlePosition(particle, 0.4);

    expect(end.x - middle.x).toBeCloseTo(middle.x - start.x);
    expect(end.y - 2 * middle.y + start.y).toBeCloseTo(particle.gravity * 0.2 ** 2);
  });
});
