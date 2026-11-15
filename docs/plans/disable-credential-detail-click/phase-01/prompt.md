# Phase 1: Disable Card Click and Link Navigation for Credential Cards

## Task
In DocVault QA Document Hub, remove the full-page viewer navigation (`viewDoc`) when clicking on credential cards or titles in the main document grid during normal view mode, while preserving batch selection behavior when batch mode is active and keeping all existing card action buttons fully functional.

## Context & Files to Modify
- `js/render-core.js`: Inside `renderDocList(docs)`, update credential card rendering (`d.category === 'credential'`).
  1. On the `<li>` tag:
     - In normal mode (`!bm`): Do not attach `data-onclick="viewDoc(...)"`. Add modifier class `doc-card-static` to the card class list.
     - In batch mode (`bm === true`): Attach `data-onclick="${cardAction(d.id)}"` (which executes `toggleSelectDoc`) and do not add `doc-card-static`.
  2. On the title `<h4>`:
     - Render static text `<span class="doc-card-title">${escHtml(d.title)}</span>` instead of an `<a>` tag with `data-doc-link="${d.id}"` and `href="${_docHref(d.id)}"`.
- `style.css`:
  - Add styles for `.doc-card.doc-card-static` to set `cursor: default;` and prevent hover translation/elevation:
    ```css
    .doc-card.doc-card-static {
        cursor: default;
    }
    .doc-card.doc-card-static:hover {
        transform: none;
        box-shadow: none;
        background-color: var(--card);
        border-color: var(--brd);
    }
    ```
- `tests/interaction-contract.test.mjs`:
  - Add unit/contract tests asserting:
    1. A credential document rendered in normal mode (`bm = false`) has `doc-card-static`, has no `data-onclick="viewDoc"`, and contains no `data-doc-link`.
    2. A credential document rendered in batch mode (`bm = true`) has `data-onclick="toggleSelectDoc"` and does not have `doc-card-static`.
    3. Other categories (e.g. `task`, `bug`) still render `data-doc-link` and `viewDoc`.

## Constraints & Invariants
- All 189 baseline tests in `node tests/run.mjs` must continue to pass without errors.
- Do not break batch selection mode (`toggleSelectDoc`).
- Do not break inner action buttons on the card (Copy username, Copy password, Star favorite, More menu).
- Do not alter linked credentials in Environment viewer (`tests/environment-view.test.mjs`).

## Verification Command
Run:
`node tests/run.mjs`
All tests must pass.
