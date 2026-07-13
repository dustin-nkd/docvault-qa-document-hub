<div align="center">
  <img src="icons/icon128.png" alt="DocVault Icon" width="100" height="100">
  
  # DocVault — QA Document Hub

  **Your Ultimate Offline-First Workspace for Quality Assurance & Testing Workflows**

  [![Web App](https://img.shields.io/badge/Web_App-GitHub_Pages-4285F4?logo=github&logoColor=white)](#-live-demo)
  [![Vanilla JS](https://img.shields.io/badge/JavaScript-Vanilla_ES6+-F7DF1E?logo=javascript&logoColor=black)](#)
  [![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-Self--hosted-38B2AC?logo=tailwind-css&logoColor=white)](#)
  [![AES-256-GCM](https://img.shields.io/badge/Encryption-AES--256--GCM-6366f1?logo=letsencrypt&logoColor=white)](#-security--encryption)
  [![GitHub Sync](https://img.shields.io/badge/Sync-GitHub_API-181717?logo=github&logoColor=white)](#-github-sync--cross-device)
</div>

---

## 📌 Overview

**DocVault — QA Document Hub** is a powerful, offline-first web application built for QA Engineers, Testers, and Developers. It provides a unified workspace to draft bug reports, manage test credentials, execute test runs, organize API specs, track tasks on a Kanban board, and much more — all running locally in your browser without any backend server.

Originally a Chrome Extension, DocVault has been migrated to a standalone **Web App** deployed via **GitHub Pages**, making it accessible from any modern browser.

> **Live Demo:** [https://dustin-nkd.github.io/docvault-qa-document-hub/](https://dustin-nkd.github.io/docvault-qa-document-hub/)

---

## ✨ Key Features

### 📂 11 Document Categories
Organize documents across specialized categories, each with its own dedicated forms, templates, and color-coded UI:

| Category | Icon | Description |
|----------|------|-------------|
| **Runbook** | 📘 | Step-by-step operational procedures with troubleshooting tables |
| **Test Cases** | 🧪 | Structured test cases with dynamic step builder (Action + Expected Result) |
| **Knowledge Base** | 💡 | Internal wiki for best practices, learnings, and reference docs |
| **Task** | ✅ | Task management with **Kanban board** (To Do → In Progress → Review → Done) |
| **Bug Draft** | 🐞 | Dedicated bug report form (Environment, Severity, Steps to Reproduce, Expected/Actual) |
| **Test Plan** | 📋 | Release/feature test plans with scope, strategy, and timeline |
| **API Specs** | 🔗 | API documentation form (Method, Endpoint, Headers, Params, Request/Response JSON) |
| **Credentials** | 🔐 | Secure credential storage with one-click copy for usernames/passwords |
| **Environments** | 🌐 | Environment configuration manager with key-value properties and secret masking |
| **Test Runs** | ▶️ | Execute test cases with step-by-step Pass/Fail/Blocked tracking and progress bars |
| **Meeting Notes** | 📝 | Meeting minutes with attendees, discussion points, and action items |

### 🎯 Specialized Dynamic Forms
- **Bug Draft Form**: Structured fields for Environment, Browser/Device, Severity (Critical/Major/Minor/Trivial), Pre-conditions, Steps to Reproduce, Expected & Actual behavior — auto-generates clean Markdown output.
- **Test Cases Form**: Module, Pre-conditions, Test Data fields with a dynamic step builder (add/remove rows for Action + Expected Result).
- **API Specs Form**: Method selector (GET/POST/PUT/DELETE/PATCH), Endpoint, dynamic Headers & Query Params builders, JSON body editor with **Format JSON** button.
- **Environment Form**: Key-value property editor with secret toggle (eye icon) for sensitive values, linked credentials viewer, and notes.
- **Test Run Execution**: Select test cases from your library, then execute step-by-step with Pass ✅ / Fail ❌ / Blocked 🚫 buttons and per-test-case notes. Progress bar shows completion status.

### 📝 Rich Markdown Editor (Toast UI)
- Full-featured WYSIWYG + Markdown split-pane editor powered by **Toast UI Editor**.
- Dark theme customized to match DocVault's premium UI.
- Image paste/upload with **instant preview** (base64) and **background GitHub CDN upload**.
- Custom Markdown renderer with syntax highlighting, tables, checkboxes, code blocks with copy button, and more.

### 📌 Kanban Board for Tasks
- Drag-and-drop task management across 4 columns: **To Do**, **In Progress**, **Review**, **Done**.
- Visual task cards with tags, status badges, and quick actions.

### 🔍 Global Search (Ctrl+K)
- Spotlight-style search modal with keyboard navigation (↑↓ arrows + Enter).
- Searches across document titles, tags, and content.
- Results show category badges and match type (Title / Tag / Content).

### 🔄 GitHub Sync & Cross-Device
- **Zero-config sync**: Documents are synced to a hardcoded GitHub repository (`dustin-nkd/docvault-assets`) via the GitHub API.
- **Only a PAT (Personal Access Token) is needed** — no repo configuration required.
- **Automatic merge**: Conflicts are resolved with a last-write-wins strategy per document.
- **Bootstrap from any device**: New devices can pull the entire document database from GitHub on first load.
- **Image CDN**: Pasted images are automatically uploaded to GitHub and swapped from base64 to CDN URLs on save, eliminating storage bloat.

### 🔒 Security & Encryption
- **Master Password**: Optional vault-level encryption with a lock screen on app load.
- **AES-256-GCM + PBKDF2**: All local data and GitHub-synced data are encrypted with a 100,000-iteration PBKDF2-derived key.
- **End-to-end encrypted sharing**: Share individual documents via a URL with a one-time AES-GCM key embedded in the hash fragment (never sent to server).
- **Session-based unlock**: Master password stays in `sessionStorage` — closing the tab locks the vault.
- **Change/Reset password**: Settings panel allows changing the master password with automatic re-encryption of all stored data.

### 🔗 E2E-Encrypted Document Sharing
- Share any document as a read-only link.
- Document content is encrypted with a random AES-GCM key and uploaded to GitHub.
- The decryption key is included in the URL fragment (`#key=...`) — it never leaves the browser and is never sent to GitHub.
- Recipients see a clean read-only view with no edit/delete actions.

### 🗑️ Trash & Recovery
- Soft-delete with **Trash** view for recovering accidentally deleted documents.
- **Permanent delete** and **Empty Trash** for full cleanup.

### ⚡ Additional Features
- **Favorites**: Star documents for quick access via the Favorites sidebar.
- **Document templates**: Pre-built Markdown templates for every category to jumpstart writing.
- **Status tracking**: Documents can be Draft, Published, or Archived.
- **Tag system**: Attach multiple tags per document for filtering and search.
- **Sort & filter**: Sort by Updated, Created, or Title (A-Z). Filter by status.
- **Subfolder organization**: Group documents within categories using subfolders.
- **Copy code blocks**: One-click copy button on all rendered code blocks.
- **English-only UI**: A single language surface keeps navigation, forms, and QA workflows consistent.
- **Responsive design**: Mobile sidebar with hamburger menu, touch-friendly layout.
- **Export/Import**: Backup all documents as JSON, import with merge or replace mode.
- **Toast notifications**: Non-intrusive feedback for all user actions.
- **History navigation**: Browser-like back navigation across views.

---

## 🖥️ UI Design

- **Premium Dark Theme**: Carefully crafted dark mode with CSS custom properties for consistent theming.
- **Glassmorphism**: Frosted glass effects on header and overlays.
- **Custom Typography**: Space Grotesk (headings) + DM Sans (body), bundled locally for offline use.
- **Color-coded categories**: Each of the 11 categories has a unique accent color.
- **Smooth animations**: Fade-up transitions, hover effects, card lift animations.
- **Grid background**: Subtle radial gradient grid pattern.
- **Custom scrollbar**: Styled thin scrollbar matching the dark theme.

---

## 🚀 Getting Started

### Option 1: Use the Live App
Visit the deployed GitHub Pages version:
> **[https://dustin-nkd.github.io/docvault-qa-document-hub/](https://dustin-nkd.github.io/docvault-qa-document-hub/)**

### Option 2: Run Locally
1. **Clone the repository**:
   ```bash
   git clone https://github.com/dustin-nkd/docvault-qa-document-hub.git
   cd docvault-qa-document-hub
   ```
2. **Open directly in browser**:
   Simply open `index.html` in any modern browser. No build step is required — the app runs entirely from static files.

3. **(Optional) Run with a local dev server**:
   ```bash
   npm install
   npm run dev
   ```
   This starts a Vite dev server for hot-reload during development.

4. **Run the production quality gate before committing**:

       npm run check
       npm run build

   The gate validates JavaScript syntax, local asset references, the offline app shell, English UI string coverage, release calculations, lifecycle behavior, and persisted-data migrations/merges.

---

## 📁 Project Structure

```
docvault-qa-document-hub/
├── index.html              # Main app shell (HTML + inline CSS variables)
│                           #   Loads storage.js, then js/*.js in order below
├── storage.js              # Storage & sync layer
│                           #   - Vault (AES-256-GCM + PBKDF2 encryption)
│                           #   - GitHubSync (pull/push/bootstrap/merge, recovery blob sync)
│                           #   - DocStorage (local + remote merge, import/export)
│                           #   - LocalAuth (master password, recovery key, password hint)
├── js/                     # Core application logic (ES6, loaded as classic <script defer>)
│   ├── constants.js        #   - English UI strings, templates, sample docs, category config
│   ├── utils.js            #   - uid, date formatting, custom Markdown renderer, credential helpers
│   ├── state.js            #   - Global state, documents array, hydrate/persist, doc history
│   ├── ui.js               #   - Toasts, modals, theme toggle, lock screen, sidebar
│   ├── render-core.js      #   - Main render loop (morphdom diffing), Dashboard, DocList, Kanban board
│   ├── render-editor.js    #   - Editor view: dynamic per-category forms, date picker
│   ├── render-viewer.js    #   - Viewer view, Test Run execution
│   ├── actions.js          #   - CRUD, E2E sharing, image upload to GitHub CDN, batch ops, history/diff
│   ├── search.js           #   - Global search (Ctrl+K)
│   └── events.js           #   - App entry point/bootstrap, keyboard shortcuts, drag & drop,
│                           #     CSP-safe event delegation (data-onclick → executeAction)
├── docvault.js             # Legacy monolith (pre-refactor); NOT loaded by index.html, kept for reference
├── style.css               # Additional styles & component classes
├── main.js                 # Vite entry point (CSS import)
├── tailwind.config.js      # Tailwind CSS configuration
├── package.json            # Dependencies & scripts
├── icons/                  # App icons (SVG + PNG: 16, 48, 128)
├── vendor/                 # Offline-bundled assets (no runtime CDN dependency)
│   ├── fontawesome/        #   FontAwesome 7.x (CSS + webfonts)
│   ├── fonts/              #   Space Grotesk & DM Sans font files
│   ├── tailwind/           #   Tailwind Play build (self-hosted)
│   ├── toastui/            #   Toast UI Editor (CSS + JS)
│   └── morphdom/           #   morphdom UMD bundle
├── src/
│   └── input.css           # Tailwind directives
└── .github/
    └── workflows/
        └── deploy.yml      # GitHub Actions → GitHub Pages deployment
```

> **Note:** Most interactivity uses event delegation rather than inline `onclick` — HTML elements carry `data-onclick="fn('arg')"` attributes that are parsed and dispatched by `executeAction()` in `js/events.js`. A few inline handlers remain (e.g. favicon `onload`/`onerror`, some copy buttons), so the app is not yet fully CSP-strict.

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| **Language** | Vanilla JavaScript (ES6+ modules) |
| **Styling** | Tailwind CSS (self-hosted Play build in `vendor/`) + CSS Custom Properties |
| **Markdown Editor** | [Toast UI Editor](https://ui.toast.com/tui-editor) (WYSIWYG + Markdown) |
| **DOM Diffing** | [morphdom](https://github.com/patrick-steele-idem/morphdom) (efficient re-renders) |
| **Encryption** | Web Crypto API (AES-256-GCM, PBKDF2, SHA-256) |
| **Icons** | FontAwesome 7 (self-hosted) |
| **Fonts** | Space Grotesk, DM Sans (self-hosted) |
| **Storage** | `localStorage` / `chrome.storage.local` (dual-mode) |
| **Cloud Sync** | GitHub Contents API (REST) |
| **Image CDN** | GitHub repository as image host |
| **Deployment** | GitHub Actions → GitHub Pages |
| **Build Tool** | Vite (development server only; production serves static files) |

---

## ⚙️ Configuration

### GitHub Sync Setup
1. Click the **⚙️ gear icon** in the sidebar footer.
2. Enter your **GitHub Personal Access Token (PAT)** with `Contents: Read & Write` permission on the `docvault-assets` repo.
3. Click **Save Token** — sync starts automatically.

### Master Password
- On first visit, DocVault runs unlocked. To enable encryption:
  1. Click **⚙️ Settings** → **Master Password** section.
  2. Set a new password. All local data will be encrypted with AES-256-GCM.
  3. On subsequent visits, a lock screen will appear requiring the password.

---

## 🚢 Deployment

The app is auto-deployed to **GitHub Pages** on every push to `main` via the [deploy.yml](.github/workflows/deploy.yml) workflow using `peaceiris/actions-gh-pages@v4`.

---

## 🤝 Contributing

Contributions, issues, and feature requests are welcome!
Feel free to check the [issues page](../../issues).

---

## 📜 License

Distributed under the MIT License. See `LICENSE` for more information.

<br/>
<div align="center">
  <i>Developed with ❤️ for the QA Community.</i>
</div>
