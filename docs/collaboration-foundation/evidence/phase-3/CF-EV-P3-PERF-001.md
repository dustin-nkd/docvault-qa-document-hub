# CF-EV-P3-PERF-001 — Bounded overload and provider budget

Status: PASS

Story: `CF-P3-007`

The overload test admits exactly the configured authoritative capacity and rejects excess work without domain mutation. Provider requests remain bounded by a 5-second per-call timeout, 8-second total budget, one identity retry, zero token-exchange retries, and 1-second maximum backoff. An open circuit performs zero provider calls.
