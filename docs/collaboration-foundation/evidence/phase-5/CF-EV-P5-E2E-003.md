# CF-EV-P5-E2E-003 Preview key journey

Status: PASS

On 2026-07-22, a real Microsoft Edge session on the isolated Preview alias completed the reviewed key-foundation journey without a deployed bypass. Device registration and keyed workspace creation returned `201`; the current envelope read and rotation commit returned `200`.

The browser generated P-256 device material and both 256-bit workspace DEKs through Web Crypto. It cryptographically unwrapped version 1, completed an Owner-authorized current-plus-one rotation, read version 2, and cryptographically unwrapped version 2. The final workspace key version was 2. No browser private key, DEK, CSRF token, cookie, provider identity, record identifier, or envelope body is retained in this evidence.
