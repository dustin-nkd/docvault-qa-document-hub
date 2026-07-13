// ========================
// GLOBAL SEARCH (Ctrl+K)
// ========================
let searchSelectedIndex = -1;
let _allSearchResults = [];
let currentSearchResults = [];
let searchCategoryFilter = null;
let _searchQuery = '';
let _searchPreviouslyFocusedEl = null;

window.openSearch = function() {
    const modal = document.getElementById('search-modal');
    const input = document.getElementById('search-input');
    if (!modal || !input) return;
    if (modal.classList.contains('hidden')) _searchPreviouslyFocusedEl = document.activeElement;

    modal.classList.remove('hidden');
    modal.classList.add('flex');
    input.value = '';
    searchSelectedIndex = -1;
    _allSearchResults = [];
    currentSearchResults = [];
    searchCategoryFilter = null;
    _searchQuery = '';
    renderSearchResults('');
    setTimeout(() => input.focus(), 50);
};

window.closeSearch = function() {
    const modal = document.getElementById('search-modal');
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }
    const previous = _searchPreviouslyFocusedEl;
    _searchPreviouslyFocusedEl = null;
    if (previous && typeof previous.focus === 'function' && document.contains(previous)) previous.focus();
};

function renderSearchResults(query) {
    const container = document.getElementById('search-results');
    if (!container) return;
    _searchQuery = query;

    if (!query.trim()) {
        searchCategoryFilter = null;
        container.innerHTML = `<div class="px-5 py-8 text-center text-sm text-[var(--tx-m)]">${t('searchTypeHint')}</div>`;
        return;
    }

    const words = query.toLowerCase().trim().split(/\s+/);

    _allSearchResults = documents
        .filter(doc => doc.status !== 'deleted')
        .map(doc => ({ doc, score: scoreSearchDocument(doc, words) }))
        .filter(({ score }) => score > 0)
        .sort((a, b) => b.score - a.score)
        .map(({ doc }) => doc);

    if (_allSearchResults.length === 0) {
        currentSearchResults = [];
        container.innerHTML = `<div class="px-5 py-8 text-center text-sm text-[var(--tx-m)]">${t('searchNoResult')}</div>`;
        return;
    }

    currentSearchResults = searchCategoryFilter
        ? _allSearchResults.filter(d => d.category === searchCategoryFilter)
        : _allSearchResults;

    _renderSearchUI(container);
}

function _renderSearchUI(container) {
    const cats = [...new Set(_allSearchResults.map(d => d.category))];
    const filterBar = cats.length > 1 ? `
        <div class="search-filter-bar">
            <button class="search-filter-chip ${!searchCategoryFilter ? 'active' : ''}" data-onclick="setSearchFilter(null)">
                All <span class="search-filter-count">${_allSearchResults.length}</span>
            </button>
            ${cats.map(cat => {
                const cnt = _allSearchResults.filter(d => d.category === cat).length;
                const m = CAT_META[cat];
                return `<button class="search-filter-chip ${searchCategoryFilter === cat ? 'active' : ''}" data-onclick="setSearchFilter('${cat}')">
                    <i class="fa-solid ${m?.icon || 'fa-file'}" style="font-size:9px;"></i> ${m?.label || cat}
                    <span class="search-filter-count">${cnt}</span>
                </button>`;
            }).join('')}
        </div>` : '';

    const resultsHtml = currentSearchResults.map((doc, idx) => {
        const titleLower = doc.title.toLowerCase();
        const words = _searchQuery.toLowerCase().trim().split(/\s+/);
        let matchHint = '';
        if (words.some(w => titleLower.includes(w))) matchHint = t('matchTitle');
        else if (words.some(w => doc.tags.some(tag => tag.toLowerCase().includes(w)))) matchHint = t('matchTag');
        else matchHint = t('matchContent');

        return `
            <div class="search-item ${idx === searchSelectedIndex ? 'active' : ''}" data-idx="${idx}" data-onclick="selectSearchResult(${idx})">
                <div class="search-item-title">${escHtml(doc.title)}</div>
                <div class="search-item-meta">
                    <span class="cat-badge ${getCatMeta(doc.category).cls}">${escHtml(getCatMeta(doc.category).label)}</span>
                    <span class="search-item-match">${matchHint}</span>
                </div>
            </div>
        `;
    }).join('');

    container.innerHTML = filterBar + `<div>${resultsHtml}</div>`;
    if (typeof enhanceInteractionSemantics === 'function') enhanceInteractionSemantics(container);
}

window.setSearchFilter = function(cat) {
    searchCategoryFilter = cat;
    searchSelectedIndex = -1;
    currentSearchResults = cat
        ? _allSearchResults.filter(d => d.category === cat)
        : _allSearchResults;
    const container = document.getElementById('search-results');
    if (container) _renderSearchUI(container);
};

window.selectSearchResult = function(idx) {
    if (idx < 0 || idx >= currentSearchResults.length) return;
    const doc = currentSearchResults[idx];
    closeSearch();
    navigate('documents', doc.category);
    setTimeout(() => viewDoc(doc.id), 50);
};

// Move the highlighted search result without re-running the whole search+render
// on every arrow key (US-406 / #5): just toggle .active on the existing items.
function _moveSearchSelection() {
    document.querySelectorAll('#search-results .search-item').forEach(el => {
        const isActive = Number(el.dataset.idx) === searchSelectedIndex;
        el.classList.toggle('active', isActive);
        if (isActive) el.scrollIntoView({ block: 'nearest' });
    });
}

// Global Ctrl+K listener and arrow-key navigation in search modal
window.addEventListener('keydown', function(e) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        openSearch();
    }

    const searchModal = document.getElementById('search-modal');
    if (searchModal && !searchModal.classList.contains('hidden')) {
        if (e.key === 'Escape') {
            closeSearch();
        } else if (e.key === 'Tab') {
            const focusable = [...searchModal.querySelectorAll('input, button, [role="button"][tabindex="0"]')].filter(el => !el.disabled && el.offsetParent !== null);
            if (focusable.length) {
                const first = focusable[0];
                const last = focusable[focusable.length - 1];
                if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
                else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
            }
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (searchSelectedIndex < currentSearchResults.length - 1) {
                searchSelectedIndex++;
                _moveSearchSelection();
            }
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (searchSelectedIndex > 0) {
                searchSelectedIndex--;
                _moveSearchSelection();
            }
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (searchSelectedIndex >= 0) {
                selectSearchResult(searchSelectedIndex);
            } else if (currentSearchResults.length > 0) {
                selectSearchResult(0);
            }
        }
    }
});

// Search input live listener
document.addEventListener('input', function(e) {
    if (e.target && e.target.id === 'search-input') {
        searchSelectedIndex = -1;
        renderSearchResults(e.target.value);
    }
});
