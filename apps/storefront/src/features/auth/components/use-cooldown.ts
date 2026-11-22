"use client";

import { useEffect, useState } from "react";
import { decrementCooldownSeconds } from "@/lib/auth/auth-validation";

/**
 * Manages a client-side countdown timer clamped at zero for cooldown-protected auth submissions.
 *
 * @param initialSeconds Optional initial remaining cooldown seconds.
 * @returns Remaining cooldown counter and helper to trigger a new countdown.
 */
export function useCooldown(initialSeconds = 0) {
  const [remainingSeconds, setRemainingSeconds] = useState(initialSeconds);
  const isActive = remainingSeconds > 0;

  useEffect(() => {
    if (!isActive) {
      return;
    }

    const timer = window.setInterval(() => {
      setRemainingSeconds((prev) => decrementCooldownSeconds(prev));
    }, 1000);

    return () => window.clearInterval(timer);
  }, [isActive]);

  return {
    remainingSeconds,
    startCooldown: (seconds: number) => setRemainingSeconds(seconds),
  };
}
