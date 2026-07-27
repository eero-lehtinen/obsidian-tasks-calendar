import type { CollisionDetection } from "@dnd-kit/core";
import { closestCenter } from "@dnd-kit/core";
import { describe, expect, it } from "vitest";
import { calendarCollisionDetection } from "../src/drag-collision";

type CollisionArguments = Parameters<CollisionDetection>[0];

function collisionArguments(): CollisionArguments {
  const targetDay = {
    id: "date:2026-07-29",
    data: { current: { date: "2026-07-29" } },
    disabled: false,
    node: { current: null },
    rect: { current: null },
  };
  const adjacentTask = {
    id: "task-on-adjacent-day",
    data: { current: { date: "2026-07-28" } },
    disabled: false,
    node: { current: null },
    rect: { current: null },
  };

  return {
    active: {
      id: "dragged-task",
      data: { current: {} },
      rect: { current: { initial: null, translated: null } },
    },
    collisionRect: {
      bottom: 85,
      height: 30,
      left: 120,
      right: 180,
      top: 55,
      width: 60,
    },
    droppableContainers: [targetDay, adjacentTask],
    droppableRects: new Map([
      [
        targetDay.id,
        {
          bottom: 600,
          height: 550,
          left: 100,
          right: 200,
          top: 50,
          width: 100,
        },
      ],
      [
        adjacentTask.id,
        {
          bottom: 90,
          height: 40,
          left: 205,
          right: 295,
          top: 50,
          width: 90,
        },
      ],
    ]),
    pointerCoordinates: { x: 150, y: 70 },
  } as unknown as CollisionArguments;
}

describe("calendarCollisionDetection", () => {
  it("keeps the drop target under the pointer in tall week cells", () => {
    const args = collisionArguments();

    expect(closestCenter(args)[0]?.id).toBe("task-on-adjacent-day");
    expect(calendarCollisionDetection(args)[0]?.id).toBe("date:2026-07-29");
  });

  it("falls back to center-based collision detection without pointer coordinates", () => {
    const args = collisionArguments();
    args.pointerCoordinates = null;

    expect(calendarCollisionDetection(args)).toEqual(closestCenter(args));
  });
});
