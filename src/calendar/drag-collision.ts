import type { CollisionDetection } from "@dnd-kit/core";
import { closestCenter, pointerWithin } from "@dnd-kit/core";

export const calendarCollisionDetection: CollisionDetection = (args) => {
  const pointerCollisions = pointerWithin(args);
  if (pointerCollisions.length > 0) return pointerCollisions;

  return closestCenter(args);
};
