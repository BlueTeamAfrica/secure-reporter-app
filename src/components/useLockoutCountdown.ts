import { useEffect, useState } from "react";

import { getLockoutUntil, getRemainingLockSeconds } from "../state/device";

/** Seconds left on the shared wrong-PIN lockout (0 when none); `start` begins a countdown. */
export function useLockoutCountdown() {
  const [until, setUntil] = useState<number | null>(null);
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    let cancelled = false;
    getLockoutUntil()
      .then((u) => {
        if (!cancelled && u) setUntil(u);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!until) return;
    const tick = () => {
      const left = getRemainingLockSeconds(until);
      setSeconds(left);
      if (left <= 0) setUntil(null);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [until]);

  return { lockedSeconds: until ? seconds : 0, start: setUntil };
}
