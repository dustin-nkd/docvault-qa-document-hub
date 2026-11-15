# Design: Disable Click-to-Detail for Credential Cards

## 1. Problem Statement
In DocVault QA Document Hub, each card in the main document list/grid has a click handler that calls `viewDoc(id)` to navigate to the full viewer view (`state.view = 'viewer'`).
For documents of category `credential`, the full viewer view renders only:
- Service name & favicon
- Username/email with a Copy button
- Password with an Eye toggle and Copy button
- Rotation reminder banner (if stale)

All primary actions (copy username, copy password, toggle favorite, more actions menu including edit/delete) are already present directly on the credential card in the grid. Clicking the card to navigate to the viewer view is redundant and jarring ("nó chỉ phóng bự lên thôi chứ không có tính năng gì khác biệt").

## 2. Goals & Non-Goals
### Goals
1. Remove the navigation to viewer (`viewDoc`) when clicking on a credential card or its title in the list/grid in normal view mode.
2. Ensure the credential card indicates it is not a clickable navigation target by setting `cursor: default` (while buttons within the card retain `cursor: pointer`).
3. Preserve full batch selection functionality: when batch mode (`state.batchMode`) is enabled, clicking the card must still toggle selection (`toggleSelectDoc`).
4. Preserve all credential action buttons on the card: Copy Username, Copy Password, Star/Favorite, More Actions (`...` menu for Edit, Delete, Duplicate, Export).

### Non-Goals
- Do not modify how other document categories (`task`, `bug`, `testcase`, `api`, `environment`, `release`) behave when clicked.
- Do not remove the `credential` viewer template code itself (it may still be used if linked from other contexts or shared views).
- Do not alter the editor modal or credential creation/editing workflow.

## 3. Detailed Design

### 3.1 Card Rendering in `js/render-core.js`
In `renderDocList(docs)`, when `d.category === 'credential'`:
1. **Outer `<li class="...">`:**
   - In normal mode (`!bm`):
     - Remove `data-onclick="${cardAction(d.id)}"` or set it only when `bm` is active:
       `${bm ? `data-onclick="${cardAction(d.id)}"` : ''}`
     - Add a CSS utility or modifier class (e.g., `doc-card-static` or `cursor-default`) so the card does not display a pointer hand cursor:
       `${cardCls(d.id)}${bm ? '' : ' doc-card-static'}`
   - In batch mode (`bm === true`):
     - Retains `data-onclick="${cardAction(d.id)}"` (which executes `toggleSelectDoc(d.id, event)`).
2. **Title `<h4 ...>`:**
   - In normal mode, do not render `<a class="doc-card-link" href="${_docHref(d.id)}" data-doc-link="${d.id}">${escHtml(d.title)}</a>`.
   - Render plain text: `<span class="doc-card-title">${escHtml(d.title)}</span>` inside `<h4>`. This prevents `js/events.js` delegated link handling from intercepting clicks and calling `viewDoc(id)`.

### 3.2 CSS Adjustments in `style.css`
Add styling for `.doc-card.doc-card-static`:
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
Interactive elements inside the static card (`button`, `input`, `.fav-btn`) maintain `cursor: pointer`.

### 3.3 Test Strategy
1. Automated contract test in `tests/interaction-contract.test.mjs`:
   - Assert that rendering a credential card in normal mode yields no `data-doc-link` and no `data-onclick="viewDoc"`.
   - Assert that rendering a credential card in batch mode (`bm = true`) retains `data-onclick` with `toggleSelectDoc`.
   - Assert that non-credential cards continue to render `data-doc-link` and `viewDoc`.
2. Run full test suite (`npm test`) to ensure all 189 tests pass without regressions.
