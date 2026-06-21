/**
 * DocVault Background Service Worker
 * Handles extension lifecycle events and badge updates.
 */

// On install: set initial badge
chrome.runtime.onInstalled.addListener((details) => {
    if (details.reason === 'install') {
        chrome.action.setBadgeText({ text: 'New' });
        chrome.action.setBadgeBackgroundColor({ color: '#10b981' });
    }
});

// Update badge count when storage changes
chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.docvault_docs) {
        const docs = changes.docvault_docs.newValue;
        if (docs && Array.isArray(docs)) {
            chrome.action.setBadgeText({ text: docs.length.toString() });
            chrome.action.setBadgeBackgroundColor({ color: '#10b981' });
        }
    }
});

// On startup: refresh badge from current storage
chrome.runtime.onStartup.addListener(() => {
    chrome.storage.local.get('docvault_docs', (result) => {
        const docs = result.docvault_docs;
        if (docs && Array.isArray(docs)) {
            chrome.action.setBadgeText({ text: docs.length.toString() });
            chrome.action.setBadgeBackgroundColor({ color: '#10b981' });
        }
    });
});
