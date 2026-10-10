/**
 * DocVault Collab Images (Sprint 17 / Phase 9)
 * Manages image upload, compression, inline token replacement, and image compaction in COLLAB_MODE.
 * Images are stored in Firestore `images/{imageId}` up to 700,000 bytes.
 * Markdown contains tokens `docvault-img:{imageId}`.
 */
(function(root) {
    'use strict';

    const _imageCache = new Map();
    let _customDb = null;
    let _customUser = null;
    let _observer = null;

    function isCollabMode() {
        return typeof root.COLLAB_MODE !== 'undefined' ? Boolean(root.COLLAB_MODE) : false;
    }

    function isGuestMode() {
        return typeof root.GUEST_MODE !== 'undefined' ? Boolean(root.GUEST_MODE) : false;
    }

    function getFirestoreDb() {
        if (_customDb) return _customDb;
        return root.firebase && typeof root.firebase.firestore === 'function' ? root.firebase.firestore() : null;
    }

    function getCurrentUser() {
        if (_customUser) return _customUser;
        return root.firebase && typeof root.firebase.auth === 'function' && root.firebase.auth().currentUser
            ? root.firebase.auth().currentUser
            : null;
    }

    function getCurrentMember() {
        return root.CollabBootstrap && typeof root.CollabBootstrap.getCurrentMember === 'function'
            ? root.CollabBootstrap.getCurrentMember()
            : null;
    }

    function isViewer() {
        const m = getCurrentMember();
        return m?.role === 'viewer';
    }

    function computeByteSize(rawB64) {
        if (typeof rawB64 !== 'string') return 0;
        let padding = 0;
        if (rawB64.endsWith('==')) padding = 2;
        else if (rawB64.endsWith('=')) padding = 1;
        return Math.floor(rawB64.length * 3 / 4) - padding;
    }

    async function compress(blob) {
        if (typeof root.compressImage === 'function') {
            return root.compressImage(blob, 1200, 0.80);
        }
        if (typeof createImageBitmap === 'function' && typeof document !== 'undefined') {
            const keepPng = blob.type === 'image/png';
            const bitmap = await createImageBitmap(blob);
            let { width, height } = bitmap;
            if (width > 1200 || height > 1200) {
                if (width >= height) { height = Math.round(height * 1200 / width); width = 1200; }
                else { width = Math.round(width * 1200 / height); height = 1200; }
            }
            const canvas = document.createElement('canvas');
            canvas.width = width; canvas.height = height;
            canvas.getContext('2d').drawImage(bitmap, 0, 0, width, height);
            bitmap.close();
            return canvas.toDataURL(keepPng ? 'image/png' : 'image/jpeg', keepPng ? undefined : 0.80);
        }
        if (typeof blob === 'string') return blob;
        if (blob?.dataUrl) return blob.dataUrl;
        throw new Error('Image compression not supported');
    }

    async function uploadImage(blob, callback) {
        if (isViewer()) {
            if (typeof root.toast === 'function') root.toast('You have view access', 'error');
            return null;
        }

        let dataUrl;
        try {
            dataUrl = await compress(blob);
        } catch (err) {
            if (typeof root.toast === 'function') root.toast('Failed to process image', 'error');
            return null;
        }

        const comma = dataUrl.indexOf(',');
        const meta = comma !== -1 ? dataUrl.slice(0, comma) : '';
        const rawBase64 = comma !== -1 ? dataUrl.slice(comma + 1) : dataUrl;
        const contentType = meta.includes('image/png') ? 'image/png' : 'image/jpeg';
        const byteSize = computeByteSize(rawBase64);

        if (byteSize > 700000) {
            if (typeof root.toast === 'function') {
                root.toast('Image exceeds 700,000 bytes limit after compression.', 'error');
            }
            return null;
        }

        if (root.ensureFirebase) await root.ensureFirebase();
        const db = getFirestoreDb();
        if (!db) {
            if (typeof root.toast === 'function') root.toast('Firestore is not available', 'error');
            return null;
        }

        const user = getCurrentUser();
        const uid = user ? user.uid : (getCurrentMember()?.uid || 'user');
        const imageId = 'img_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9);
        const docData = {
            contentType,
            data: rawBase64,
            byteSize,
            createdBy: uid,
            createdAt: new Date().toISOString()
        };

        try {
            await db.collection('images').doc(imageId).set(docData);
        } catch (err) {
            if (typeof root.toast === 'function') root.toast(err.message || 'Failed to save image', 'error');
            throw err;
        }

        _imageCache.set(imageId, dataUrl);
        const token = 'docvault-img:' + imageId;
        if (typeof callback === 'function') {
            callback(token, blob.name || 'image');
        }
        return { imageId, token, byteSize };
    }

    async function getImage(imageId) {
        if (!imageId) return null;
        if (_imageCache.has(imageId)) return _imageCache.get(imageId);
        if (isGuestMode() || !isCollabMode()) return null;

        const db = getFirestoreDb();
        if (!db) return null;

        try {
            const snap = await db.collection('images').doc(imageId).get();
            if (!snap.exists) return null;
            const data = typeof snap.data === 'function' ? snap.data() : snap.data;
            if (!data || !data.data) return null;
            const dataUrl = `data:${data.contentType || 'image/jpeg'};base64,${data.data}`;
            _imageCache.set(imageId, dataUrl);
            return dataUrl;
        } catch (err) {
            console.error('[CollabImages] getImage error:', err);
            return null;
        }
    }

    async function inlineCollabImagesForShare(markdown) {
        if (typeof markdown !== 'string' || !markdown.includes('docvault-img:')) return markdown;
        const TOKEN_RE = /docvault-img:([a-zA-Z0-9_-]+)/g;
        const ids = [...new Set([...markdown.matchAll(TOKEN_RE)].map(m => m[1]))];
        let res = markdown;
        for (const id of ids) {
            try {
                const dataUrl = await getImage(id);
                if (dataUrl) {
                    res = res.replaceAll('docvault-img:' + id, dataUrl);
                }
            } catch (_) {}
        }
        return res;
    }

    function resolveImgElement(img) {
        if (!img || !img.getAttribute) return;
        const src = img.getAttribute('src');
        if (!src || !src.startsWith('docvault-img:')) return;
        const imageId = src.slice('docvault-img:'.length);
        if (_imageCache.has(imageId)) {
            img.setAttribute('src', _imageCache.get(imageId));
            return;
        }
        getImage(imageId).then(dataUrl => {
            if (dataUrl && img.getAttribute('src') === src) {
                img.setAttribute('src', dataUrl);
            }
        });
    }

    function resolveContainerImages(container) {
        if (!container || !container.querySelectorAll) return;
        const imgs = container.querySelectorAll('img[src^="docvault-img:"]');
        imgs.forEach(resolveImgElement);
    }

    function startImageObserver() {
        if (typeof MutationObserver === 'undefined' || typeof document === 'undefined') return;
        if (_observer) return;
        _observer = new MutationObserver((mutations) => {
            for (const m of mutations) {
                if (m.type === 'childList') {
                    m.addedNodes.forEach(node => {
                        if (node.nodeType === 1) {
                            if (node.tagName === 'IMG' && node.getAttribute('src')?.startsWith('docvault-img:')) {
                                resolveImgElement(node);
                            } else if (node.querySelectorAll) {
                                node.querySelectorAll('img[src^="docvault-img:"]').forEach(resolveImgElement);
                            }
                        }
                    });
                } else if (m.type === 'attributes' && m.attributeName === 'src') {
                    const node = m.target;
                    if (node.tagName === 'IMG' && node.getAttribute('src')?.startsWith('docvault-img:')) {
                        resolveImgElement(node);
                    }
                }
            }
        });
        const target = document.body || document.documentElement;
        if (target) {
            _observer.observe(target, { childList: true, subtree: true, attributes: true, attributeFilter: ['src'] });
        }
    }

    async function compactImages(options = {}) {
        if (isViewer()) {
            if (typeof root.toast === 'function') root.toast('You have view access', 'error');
            return;
        }
        const DATA_RE = /data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=]+/g;
        const docs = root.documents || [];
        let imgs = 0, bytes = 0;
        docs.forEach(d => {
            if (d.status === 'deleted' || typeof d.content !== 'string') return;
            [...new Set(d.content.match(DATA_RE) || [])].forEach(u => { imgs++; bytes += u.length; });
        });
        if (imgs === 0) {
            if (typeof root.toast === 'function') root.toast('No inline images to compact.', 'info');
            return;
        }
        if (!options.skipModal && typeof root.showModal === 'function') {
            const mb = (bytes / 1048576).toFixed(1);
            root.showModal(`
                <div class="text-center">
                    <div class="w-12 h-12 rounded-full mx-auto mb-4 flex items-center justify-center" style="background:rgba(99,102,241,0.12);"><i class="fa-solid fa-compress" style="color:#818cf8;"></i></div>
                    <h3 class="font-heading font-semibold text-lg mb-2">Compact ${imgs} inline image${imgs > 1 ? 's' : ''}?</h3>
                    <p class="text-sm mb-5" style="color:var(--tx-m);">This uploads ~${mb} MB of embedded images to Firestore team storage and replaces them with tokens, shrinking your documents.</p>
                    <div class="flex gap-3 justify-center">
                        <button class="btn-s" data-onclick="closeModal()">Cancel</button>
                        <button class="btn-p" data-onclick="CollabImages.doCompactImages()">Compact</button>
                    </div>
                </div>`);
            return;
        }
        return doCompactImages();
    }

    async function doCompactImages() {
        if (typeof root.closeModal === 'function') root.closeModal();
        if (isViewer()) {
            if (typeof root.toast === 'function') root.toast('You have view access', 'error');
            return;
        }
        if (typeof root.toast === 'function') root.toast('Compacting images…', 'info');
        const DATA_RE = /data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=]+/g;
        const docs = root.documents || [];
        let uploaded = 0, failed = 0;

        for (const d of docs) {
            if (d.status === 'deleted' || typeof d.content !== 'string' || !d.content.includes('data:image/')) continue;
            const urls = [...new Set(d.content.match(DATA_RE) || [])];
            if (!urls.length) continue;
            let content = d.content, changed = false;

            for (const dataUrl of urls) {
                try {
                    const comma = dataUrl.indexOf(',');
                    const meta = comma !== -1 ? dataUrl.slice(0, comma) : '';
                    const rawBase64 = comma !== -1 ? dataUrl.slice(comma + 1) : dataUrl;
                    const contentType = meta.includes('image/png') ? 'image/png' : 'image/jpeg';
                    const byteSize = computeByteSize(rawBase64);

                    if (byteSize > 700000) {
                        failed++;
                        continue;
                    }

                    const user = getCurrentUser();
                    const uid = user ? user.uid : (getCurrentMember()?.uid || 'user');
                    const imageId = 'img_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9);
                    const db = getFirestoreDb();
                    if (!db) { failed++; continue; }

                    await db.collection('images').doc(imageId).set({
                        contentType,
                        data: rawBase64,
                        byteSize,
                        createdBy: uid,
                        createdAt: new Date().toISOString()
                    });

                    _imageCache.set(imageId, dataUrl);
                    content = content.replaceAll(dataUrl, 'docvault-img:' + imageId);
                    changed = true;
                    uploaded++;
                } catch (_) {
                    failed++;
                }
            }

            if (changed) {
                d.content = content;
                d.updatedAt = Date.now();
            }
        }

        if (typeof root.persist === 'function') await root.persist();
        if (root.state?.editingDoc) {
            const cur = (root.documents || []).find(x => x.id === root.state.editingDoc.id);
            if (cur) root.state.editingDoc = { ...cur };
        }
        if (typeof root.render === 'function') root.render();
        if (typeof root.toast === 'function') {
            root.toast(`Compacted ${uploaded} image${uploaded !== 1 ? 's' : ''}${failed ? `, ${failed} failed` : ''}.`, failed ? 'error' : 'success');
        }
        return { uploaded, failed };
    }

    if (typeof document !== 'undefined') {
        startImageObserver();
    }

    const CollabImages = {
        uploadImage,
        getImage,
        inlineCollabImagesForShare,
        compactImages,
        doCompactImages,
        resolveContainerImages,
        resolveImgElement,
        startImageObserver,
        computeByteSize,
        getImageCache: () => _imageCache,
        clearImageCache: () => _imageCache.clear(),
        setDb: (db) => { _customDb = db; },
        setUser: (user) => { _customUser = user; }
    };

    root.CollabImages = CollabImages;
})(typeof window !== 'undefined' ? window : globalThis);
