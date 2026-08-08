import { useEffect, useState } from "react";
import { millisecondsUntilNextDay, toDateKey } from "./date-utils";

export function useCurrentDay(): string {
  const [today, setToday] = useState(() => toDateKey(new Date()));

  useEffect(() => {
    let midnightTimer: number | null = null;

    const updateToday = () => setToday(toDateKey(new Date()));
    const scheduleMidnightUpdate = () => {
      if (midnightTimer !== null) window.clearTimeout(midnightTimer);
      midnightTimer = window.setTimeout(() => {
        updateToday();
        scheduleMidnightUpdate();
      }, millisecondsUntilNextDay(new Date()));
    };
    const updateAfterInactivity = () => {
      updateToday();
      scheduleMidnightUpdate();
    };

    scheduleMidnightUpdate();
    window.addEventListener("focus", updateAfterInactivity);
    document.addEventListener("visibilitychange", updateAfterInactivity);
    return () => {
      if (midnightTimer !== null) window.clearTimeout(midnightTimer);
      window.removeEventListener("focus", updateAfterInactivity);
      document.removeEventListener("visibilitychange", updateAfterInactivity);
    };
  }, []);

  return today;
}
