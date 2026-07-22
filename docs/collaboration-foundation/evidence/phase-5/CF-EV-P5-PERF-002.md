# CF-EV-P5-PERF-002 Preview performance

Status: PASS

Microsoft Edge executed 20 sequential authenticated current-envelope reads against isolated Preview. Observed p95 was 238.7 ms, passing the 300 ms budget with 61.3 ms headroom. Every measured request returned `200`; the run recorded zero skipped samples and zero accepted flakes.
