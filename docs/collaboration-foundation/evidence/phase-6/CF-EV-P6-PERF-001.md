# CF-EV-P6-PERF-001 Preview document performance

Status: PASS

Story: `CF-P6-008`

Measured against the live isolated Preview alias on 2026-07-26, over the public internet, so every figure includes network round-trip time and is therefore pessimistic relative to the in-datacentre budget.

Authenticated document list reads: 20 samples, p95 **102 ms** against the 300 ms budget. Unauthenticated boundary reads: 20 samples, min 132 ms, p50 164 ms, p95 **213 ms**, max 233 ms — higher than the authenticated figure because those requests were issued in a separate burst and are dominated by connection setup rather than server work.

Single-request timings observed during the journey: document create 123 ms and document read 203 ms, both including the full TLS and HTTP round trip.

No budget was relaxed and no measurement was retried into a passing result. Authenticated write p95 was not measured as a dedicated 20-sample series; the individual create and update timings above are the only write evidence, and this record does not claim a write p95.
