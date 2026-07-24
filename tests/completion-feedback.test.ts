import { describe, expect, it } from "vitest";
import { createCelebrationParticles } from "../src/completion-feedback";

describe("createCelebrationParticles", () => {
  it("creates an evenly distributed burst with bounded particle values", () => {
    const particles = createCelebrationParticles(() => 0.5);

    expect(particles).toHaveLength(14);
    expect(new Set(particles.map((particle) => particle.color))).toHaveLength(5);
    expect(particles.every((particle) => particle.delay >= 0 && particle.delay <= 70)).toBe(true);
    expect(particles.every((particle) => Math.hypot(particle.x, particle.y + 12) >= 24)).toBe(true);
  });
});
