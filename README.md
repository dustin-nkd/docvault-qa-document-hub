<div align="center">
  <img src="icons/icon128.png" alt="DocVault Icon" width="100" height="100">
  
  # DocVault - QA Document Hub
  
  **Your Ultimate Offline Companion for Quality Assurance & Testing Workflows**
  
  [![Chrome Extension](https://img.shields.io/badge/Chrome-Extension-4285F4?logo=googlechrome&logoColor=white)](#)
  [![Vanilla JS](https://img.shields.io/badge/JavaScript-Vanilla-F7DF1E?logo=javascript&logoColor=black)](#)
  [![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-38B2AC?logo=tailwind-css&logoColor=white)](#)
</div>

---

## 📌 Overview
**DocVault - QA Document Hub** is a powerful, offline-first Chrome Extension meticulously designed for QA Engineers, Testers, and Developers. It serves as a unified workspace right inside your browser to draft bug reports, manage test credentials, write runbooks, and organize API specs—all without relying on external servers or internet connectivity.

With a beautiful Glassmorphism UI, a rich Markdown editor, and specialized forms, DocVault ensures your testing documents are always just one click away.

---

## ✨ Key Features

- **🐞 Specialized Bug Drafts**: Stop struggling with raw text boxes! DocVault offers a dedicated, dynamic form for drafting bug reports. Add "Steps to Reproduce" row-by-row, specify Environment, Severity, and automatically generate a perfectly formatted Markdown report ready to paste into Jira or GitHub.
- **🔐 Integrated Credential Manager**: Keep your QA environment accounts organized. Quickly copy usernames, passwords, and portal URLs with a single click.
- **📚 Multi-Category Support**: Organize your thoughts seamlessly across 10 distinct categories:
  - `Runbook` | `Onboarding` | `Test Cases` | `Knowledge Base` | `Task` | `Bug Draft` | `Test Plan` | `Meeting Notes` | `API Specs` | `Credentials`
- **📝 Live Markdown Editor**: Write documentation confidently with a side-by-side or toggleable live preview, featuring GitHub-flavored Markdown rendering.
- **🌍 Bilingual Support (i18n)**: Instantly switch the entire interface between **English** and **Vietnamese**.
- **⚡ 100% Offline & Secure**: Your data never leaves your computer. Everything is stored locally via the blazing-fast `chrome.storage.local` API.
- **🎨 Premium Dark UI**: A modern, sleek dark mode experience utilizing Tailwind CSS, custom fonts (Space Grotesk & DM Sans), and smooth transitions.

---

## 🚀 Installation Guide

Since this is a developer tool, you can easily install it in Developer Mode on Chrome or any Chromium-based browser (Edge, Brave).

1. **Clone the repository**:
   ```bash
   git clone https://github.com/dustin-nkd/docvault-qa-document-hub.git
   ```
2. **Open Extensions Management**:
   Navigate to `chrome://extensions/` in your browser.
3. **Enable Developer Mode**:
   Toggle the "Developer mode" switch in the top right corner.
4. **Load the Extension**:
   Click the **"Load unpacked"** button and select the `docvault-qa-document-hub` folder you just cloned.
5. **Pin it!**:
   Click the puzzle 🧩 icon in your toolbar and pin (📌) the **DocVault** icon for quick access.

---

## 🛠️ Built With
- **Vanilla JavaScript**: Lightweight, fast, and no heavy frameworks.
- **Chrome Extension Manifest V3**: Built with the latest, most secure web extension standards.
- **Tailwind CSS**: For rapid, beautiful, and consistent UI styling.
- **Marked.js** *(Custom implementation)*: For robust Markdown parsing.
- **FontAwesome**: Scalable vector icons.

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
