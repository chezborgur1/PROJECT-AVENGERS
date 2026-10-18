import type { EngineConfig, Mailbox } from "../config.ts";
import { addDays, daysBetween } from "../util/dates.ts";

// How many cold emails a mailbox may carry today. A new mailbox spends
// `sending.warmup_weeks` on warm-up with zero cold sends, then climbs the
// `sending.ramp` table one entry per week, and the last entry holds. Every
// figure is also capped by `max_per_mailbox_per_day` and the mailbox's own
// `max_per_day`. The cap includes follow-ups.
//
// The defaults follow docs/research/deliverability.md section 6 (per-mailbox
// ramp table: weeks 1-2 warm-up only, then 5, 10, 15, 20 a day, hard max
// 25-30) and section 3 (vendor norms of 14-21 days of warm-up before any
// cold email). These are vendor rules of thumb, so they live in config.

/** Cold-sending week for a mailbox: 0 during warm-up (or before it starts), then 1, 2, ... */
export function coldWeek(mailbox: Mailbox, config: EngineConfig, today: string): number {
  const days = daysBetween(mailbox.warmup_started, today);
  if (days < 0) return 0;
  const week = Math.floor(days / 7) + 1; // 1-based week since warm-up began
  return Math.max(0, week - config.sending.warmup_weeks);
}

/** The first day a mailbox may send cold email (the end of warm-up). */
export function coldStartDate(mailbox: Mailbox, config: EngineConfig): string {
  return addDays(mailbox.warmup_started, 7 * config.sending.warmup_weeks);
}

/** Today's cold cap for a mailbox: ramp[min(week, len) - 1], capped by the config ceilings; 0 when paused or warming up. */
export function mailboxDailyCap(mailbox: Mailbox, config: EngineConfig, today: string): number {
  if (mailbox.paused) return 0;
  const week = coldWeek(mailbox, config, today);
  const ramp = config.sending.ramp;
  if (week === 0 || !ramp.length) return 0;
  const step = ramp[Math.min(week, ramp.length) - 1] ?? 0;
  return Math.max(0, Math.min(step, config.sending.max_per_mailbox_per_day, mailbox.max_per_day ?? Number.POSITIVE_INFINITY));
}
