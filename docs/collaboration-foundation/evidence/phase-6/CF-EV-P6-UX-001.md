# CF-EV-P6-UX-001 Conflict and copy experience evidence

Status: PASS

Story: `CF-P6-007`

The conflict experience presents exactly four actions and no more: review the latest version, reapply to the latest revision, save as a separate copy, and discard with confirmation. Each is proven reachable from a freshly opened conflict in Node and in Chromium, Firefox, and WebKit.

Reviewing is not resolving. `review-latest` moves the conflict to a reviewing state and leaves every other option available, so a user can look at what changed and then still choose any resolution. This matters because the alternative — forcing a decision before showing the user what they are deciding about — is how people lose work.

The destructive action is the only one that asks. Discard requires an explicit confirmation flag and refuses without it; the other three retain the draft. A user who mis-clicks loses nothing.

Status is never communicated by colour alone. Each of the four conflict states and both copy states exposes a text `label` and a non-colour `shape` token alongside an advisory `tone`. Tests in Node and in all three browser engines assert that both the label and the shape are non-empty for every state, and that the eligible and blocked copy states use different shapes rather than only different tones. A colour-blind user, a high-contrast user, and a screen-reader user all receive the same information.

The labels state the reassuring fact first: the unresolved state reads "Conflict — your draft is safe" rather than naming only the failure, because the user's first question at a conflict is whether their work survived.

Copy to workspace is manual and explicit end to end. A Credential document is marked non-selectable so it never appears as a choice, rather than being offered and then rejected on submit. An eligible copy requires the user to confirm the data-classification consequence before an intent is produced, and the intent records that the source is unchanged and the copy is unlinked — the two facts a user needs to understand that later edits will not synchronise.
