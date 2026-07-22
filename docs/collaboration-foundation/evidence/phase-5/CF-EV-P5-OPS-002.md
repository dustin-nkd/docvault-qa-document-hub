# CF-EV-P5-OPS-002 Preview key operations

Status: PASS

Operations captured read-only Time Travel bookmark fingerprints, then applied only immutable migrations 11 and 12 to the isolated Preview D1. Preview finished at schema 12 with all 12 migration rows and zero foreign-key violations. The pre-apply and post-apply bookmark SHA-256 fingerprints are `195666c7dc4cc8ff078aa66d31bc091539589809c12f1504c409510c7345b4fe` and `8783c73244c4b05553f6dff3c5c17651eb3a1b3491cdf26470c9c6430d6c03ea`; raw bookmarks are intentionally omitted.

One isolated Preview deploy activated `preview-only` key routes from source commit `199b712`. Local and Production modes remain `disabled`, Production retains zero D1 bindings, and no secret was created or changed. The qualification session was revoked; active sessions, pending OAuth transactions, rate windows, and foreign-key violations reconciled to zero. Append-only encrypted key/rotation and audit history remains intact, and no prohibited shared Preview restore or destructive history deletion occurred.
