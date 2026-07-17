# CF-EV-P3-OPS-002 — Isolated Preview identity provisioning

Status: PASS

Story: `CF-P3-008`

The stable Preview alias serves the approved identity shell with a dedicated D1 binding, Preview-only secret names, and a Service Binding to `docvault-identity-burst-preview`. The private Worker has zero public targets. Production has no D1, identity secrets, or burst service binding and returns `503` for the session route; GitHub Pages remains static and returns `404`.

Live checks observed Preview session `200`, wrong Origin `403`, business route `404`, successful OAuth transaction creation, and private Service Binding invocation. All synthetic rows were removed after testing; users, sessions, OAuth transactions, rate windows, workspaces, and documents each ended at zero.
