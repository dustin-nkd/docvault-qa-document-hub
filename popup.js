/* ============================================
   DocVault Popup — Logic
   ============================================ */

(function () {
  'use strict';

  // ---- Category metadata ----
  const CATEGORY_META = {
    runbook:    { label: 'Runbook',     color: 'var(--c-run)' },
    onboarding: { label: 'Onboarding', color: 'var(--c-onb)' },
    testcases:  { label: 'Test Cases',  color: 'var(--c-tc)' },
    knowledge:  { label: 'Knowledge',   color: 'var(--c-kn)' }
  };

  const MAX_RECENT = 7;

  // ---- DOM refs ----
  const $id = (id) => document.getElementById(id);

  const els = {
    btnOpenApp:     $id('btnOpenApp'),
    btnNewDoc:      $id('btnNewDoc'),
    searchInput:    $id('searchInput'),
    docsList:       $id('docsList'),
    loadingState:   $id('loadingState'),
    emptyState:     $id('emptyState'),
    noResultsState: $id('noResultsState'),
    statsBar:       $id('statsBar'),
    statTotal:      $id('statTotal'),
    statRunbook:    $id('statRunbook'),
    statOnboarding: $id('statOnboarding'),
    statTestcases:  $id('statTestcases'),
    statKnowledge:  $id('statKnowledge'),
    statTask:       $id('statTask'),
    statBug:        $id('statBug'),
    statTestplan:   $id('statTestplan'),
    statMeeting:    $id('statMeeting'),
    statApi:        $id('statApi'),
    statCredential: $id('statCredential'),
    storageText:    $id('storageText')
  };

  // ---- State ----
  let allDocs = [];
  let searchQuery = '';

  // ---- Init ----
  document.addEventListener('DOMContentLoaded', init);

  function init() {
    bindEvents();
    loadDocuments();
    estimateStorage();
  }

  // ---- Events ----
  function bindEvents() {
    els.btnOpenApp.addEventListener('click', () => {
      chrome.tabs.create({ url: 'docvault.html' });
    });

    els.btnNewDoc.addEventListener('click', () => {
      chrome.tabs.create({ url: 'docvault.html?action=new' });
    });

    els.searchInput.addEventListener('input', (e) => {
      searchQuery = e.target.value.trim().toLowerCase();
      renderDocsList();
    });

    // Listen for storage changes to update in real-time
    if (chrome.storage && chrome.storage.onChanged) {
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'local') {
          loadDocuments();
          estimateStorage();
        }
      });
    }
  }

  // ---- Load Documents ----
  async function loadDocuments() {
    showLoading(true);

    try {
      const docs = await DocStorage.getAll();
      allDocs = Array.isArray(docs) ? docs : [];

      // Sort by updatedAt descending
      allDocs.sort((a, b) => {
        const tA = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
        const tB = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
        return tB - tA;
      });

      renderStats();
      renderDocsList();
    } catch (err) {
      console.error('DocVault popup: failed to load documents', err);
      allDocs = [];
      renderStats();
      renderDocsList();
    }

    showLoading(false);
  }

  // ---- Render Stats ----
  function renderStats() {
    const counts = { runbook: 0, onboarding: 0, testcases: 0, knowledge: 0, task: 0, bug: 0, testplan: 0, meeting: 0, api: 0, credential: 0 };

    allDocs.forEach((doc) => {
      if (counts.hasOwnProperty(doc.category)) {
        counts[doc.category]++;
      }
    });

    els.statTotal.textContent      = allDocs.length;
    els.statRunbook.textContent    = counts.runbook;
    els.statOnboarding.textContent = counts.onboarding;
    els.statTestcases.textContent  = counts.testcases;
    els.statKnowledge.textContent  = counts.knowledge;
    els.statTask.textContent       = counts.task;
    els.statBug.textContent        = counts.bug;
    els.statTestplan.textContent   = counts.testplan;
    els.statMeeting.textContent    = counts.meeting;
    els.statApi.textContent        = counts.api;
    els.statCredential.textContent = counts.credential;
  }

  // ---- Render Documents List ----
  function renderDocsList() {
    // Filter by search query
    let filtered = allDocs;
    if (searchQuery) {
      filtered = allDocs.filter((doc) =>
        (doc.title || '').toLowerCase().includes(searchQuery)
      );
    }

    // Take only recent N
    const recent = filtered.slice(0, MAX_RECENT);

    // Clear list (but keep loading element)
    els.docsList.innerHTML = '';

    // Toggle states
    if (allDocs.length === 0) {
      els.emptyState.classList.remove('hidden');
      els.noResultsState.classList.add('hidden');
      return;
    }

    els.emptyState.classList.add('hidden');

    if (recent.length === 0) {
      els.noResultsState.classList.remove('hidden');
      return;
    }

    els.noResultsState.classList.add('hidden');

    // Build items
    const fragment = document.createDocumentFragment();

    recent.forEach((doc, index) => {
      const item = createDocItem(doc, index);
      fragment.appendChild(item);
    });

    els.docsList.appendChild(fragment);
  }

  // ---- Create Document Item ----
  function createDocItem(doc, index) {
    const meta = CATEGORY_META[doc.category] || { label: doc.category || 'Unknown', color: 'var(--tx-d)' };

    const item = document.createElement('div');
    item.className = 'doc-item';
    item.style.animationDelay = `${index * 0.04}s`;

    item.addEventListener('click', () => {
      chrome.tabs.create({ url: 'docvault.html?view=' + doc.id });
    });

    // Category dot
    const dot = document.createElement('div');
    dot.className = 'doc-dot';
    dot.style.color = meta.color;
    dot.style.background = meta.color;

    // Info container
    const info = document.createElement('div');
    info.className = 'doc-info';

    // Title
    const title = document.createElement('div');
    title.className = 'doc-title';
    title.textContent = doc.title || 'Untitled';
    title.title = doc.title || 'Untitled';

    // Meta row
    const metaRow = document.createElement('div');
    metaRow.className = 'doc-meta';

    // Category badge
    const catBadge = document.createElement('span');
    catBadge.className = 'doc-badge doc-badge-cat';
    catBadge.textContent = meta.label;
    catBadge.style.color = meta.color;

    // Status badge
    const statusBadge = document.createElement('span');
    statusBadge.className = 'doc-badge doc-badge-status';
    statusBadge.textContent = doc.status || 'draft';

    metaRow.appendChild(catBadge);
    metaRow.appendChild(statusBadge);

    info.appendChild(title);
    info.appendChild(metaRow);

    // Time ago
    const time = document.createElement('div');
    time.className = 'doc-time';
    time.textContent = timeAgo(doc.updatedAt || doc.createdAt);

    item.appendChild(dot);
    item.appendChild(info);
    item.appendChild(time);

    return item;
  }

  // ---- Time Ago ----
  function timeAgo(dateStr) {
    if (!dateStr) return '--';

    const now = Date.now();
    const then = new Date(dateStr).getTime();
    const diffSec = Math.floor((now - then) / 1000);

    if (diffSec < 60) return 'just now';
    if (diffSec < 3600) {
      const m = Math.floor(diffSec / 60);
      return m + 'm ago';
    }
    if (diffSec < 86400) {
      const h = Math.floor(diffSec / 3600);
      return h + 'h ago';
    }
    if (diffSec < 604800) {
      const d = Math.floor(diffSec / 86400);
      return d + 'd ago';
    }
    const w = Math.floor(diffSec / 604800);
    return w + 'w ago';
  }

  // ---- Loading Toggle ----
  function showLoading(show) {
    if (els.loadingState) {
      if (show) {
        els.loadingState.classList.remove('hidden');
      } else {
        els.loadingState.classList.add('hidden');
      }
    }
  }

  // ---- Storage Estimate ----
  async function estimateStorage() {
    try {
      if (chrome.storage && chrome.storage.local && chrome.storage.local.getBytesInUse) {
        chrome.storage.local.getBytesInUse(null, (bytes) => {
          els.storageText.textContent = formatBytes(bytes) + ' used';
        });
      } else {
        // Fallback: estimate from document content
        const raw = JSON.stringify(allDocs);
        const bytes = new Blob([raw]).size;
        els.storageText.textContent = '~' + formatBytes(bytes) + ' used';
      }
    } catch (e) {
      els.storageText.textContent = '--';
    }
  }

  function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    const val = bytes / Math.pow(1024, i);
    return val.toFixed(i === 0 ? 0 : 1) + ' ' + units[i];
  }

})();
