# CF-EV-P6-SEC-006 Offline outbox security review

Status: PASS

Story: `CF-P6-006`

A queued entry is not permission to execute later. Every claim is submitted through the ordinary mutation path, which re-authorizes against current membership, device, and user state before applying or replaying, so authority that has lapsed cannot be spent from the queue. This is proven against real D1: membership is removed while an entry sits queued, and the entry is quarantined with the database left empty.

Every authority or context change quarantines pending work with its reason recorded: logout, account change, workspace change, role removal, device revocation, membership loss, key rotation, unsupported schema, and incompatible lifecycle. A quarantined entry is never claimable again, so reauthentication alone cannot resurrect work that a changed authority decision invalidated — the user must explicitly re-apply, save a copy, export, or discard.

The store holds ciphertext and routing metadata only. The payload and draft fields accept `Uint8Array` exclusively and reject strings outright, so plaintext cannot be persisted even by mistake, and the persisted entry shape is asserted to contain no title, body, content, plaintext, or category field. The draft context is sealed by the caller before it reaches the outbox.

Namespaces bind environment, provider subject, workspace, and device, and isolation is verified over one shared store in Node and over one shared IndexedDB database in three browsers: a different namespace sees nothing and claims nothing. Personal, guest, preview, and production therefore cannot share queued state.

Retries cannot become an attack on the server or on the user's data. The non-retryable set covers 400, 401, 403, 404, and 409 together with the key-version, validation, conflict, idempotency-reuse, and not-found codes, so an authority or contract failure stops immediately. Retryable failures use exponential backoff with full jitter — so competing clients do not synchronise into a thundering herd — bounded by a five-minute ceiling and an attempt ceiling that converts a persistent failure into a terminal state.

Every retry carries the original client mutation id, which is what allows the server's idempotency ledger to recognise it. Without that, a lost response would create a duplicate revision; with it, the replay returns the original result, proven against real D1.

Nothing is silently destroyed. Seven-day expiry quarantines rather than deletes, quota refusal leaves queued work intact, and disposal is refused until a server result is durably recorded. The module makes no claim of forensic erasure from browser storage.

Residual scope: recovery user experience — export of an encrypted draft backup, save-as-copy, and the explicit resolution prompts — belongs to `CF-P6-007`. This record covers the queue and its lifecycle, not the interface presented for resolving quarantined work.
