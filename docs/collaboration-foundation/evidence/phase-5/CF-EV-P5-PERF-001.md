# CF-EV-P5-PERF-001 — Browser key-protection performance evidence

Status: PASS

Story: CF-P5-003

The real-browser release gate measures enrollment protection and reload unlock separately without reducing the frozen 600,000 PBKDF2 iterations. Each operation must remain below the 2,500 ms hard ceiling; the contract target remains 2,000 ms. The module contributes zero eager bytes to Personal/Guest startup because it is isolated and absent from `index.html` and `_site`.
