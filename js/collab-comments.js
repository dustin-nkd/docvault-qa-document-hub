// DocVault team collaboration comments module
// Handles real-time comments, threaded replies, @mentions, and mention notifications.
(function(root) {
    'use strict';

    let _db = null;
    let _authUser = null;
    let _member = null;
    const _activeUnsubs = new Set();

    function esc(str) {
        if (str == null) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function init(db, authUser, member) { _db = db || null; _authUser = authUser || null; _member = member || null; }
    function getFirestoreDb() { return _db || root.CollabStore?.getFirestoreDb?.() || root.firebase?.firestore?.() || null; }
    function getCurrentUser() { return _authUser || root.firebase?.auth?.().currentUser || null; }
    function getCurrentMember() { return _member || root.CollabBootstrap?.getCurrentMember?.() || null; }

    function buildCommentTree(flatComments) {
        if (!Array.isArray(flatComments)) return [];
        const sorted = [...flatComments].sort((a, b) => (Number(a.createdAt) || 0) - (Number(b.createdAt) || 0));
        const roots = [];
        const rootMap = new Map();

        for (const item of sorted) {
            if (!item) continue;
            if (!item.parentId) {
                const node = { ...item, replies: [] };
                roots.push(node);
                if (node.id) rootMap.set(node.id, node);
            }
        }

        for (const item of sorted) {
            if (!item || !item.parentId) continue;
            const parent = rootMap.get(item.parentId);
            if (parent) {
                parent.replies.push({ ...item });
            } else {
                let ancestor = null;
                for (const r of roots) {
                    if (r.replies && r.replies.some(rep => rep.id === item.parentId)) {
                        ancestor = r;
                        break;
                    }
                }
                if (ancestor) {
                    ancestor.replies.push({ ...item });
                } else {
                    const placeholder = { id: item.parentId, content: '[This comment has been deleted]', isDeleted: true, createdAt: (item.createdAt || 1) - 1, replies: [{ ...item }] };
                    roots.push(placeholder);
                    if (placeholder.id) rootMap.set(placeholder.id, placeholder);
                }
            }
        }

        for (const r of roots) {
            r.replies.sort((a, b) => (Number(a.createdAt) || 0) - (Number(b.createdAt) || 0));
        }

        return roots;
    }

    function extractMentions(text, members) {
        if (!text || typeof text !== 'string') return [];
        const memberList = Array.isArray(members) ? members : (members instanceof Map ? Array.from(members.values()) : []);
        const currentUid = _authUser?.uid || _member?.uid || getCurrentUser()?.uid || getCurrentMember()?.uid || '';
        const foundUids = new Set();

        const explicitRegex = /@\[([^\]]+)\]\(([^)]+)\)/g;
        let match;
        while ((match = explicitRegex.exec(text)) !== null) {
            const uid = match[2].trim();
            if (uid && uid !== currentUid) {
                if (!memberList.length || memberList.some(m => m && (m.uid === uid || m.id === uid))) {
                    foundUids.add(uid);
                }
            }
        }

        if (memberList.length > 0) {
            const sortedMembers = memberList.filter(m => m && (m.uid || m.id)).sort((a, b) => {
                const lenA = Math.max((a.displayName || '').length, (a.email || '').length);
                const lenB = Math.max((b.displayName || '').length, (b.email || '').length);
                return lenB - lenA;
            });

            for (const m of sortedMembers) {
                const uid = m.uid || m.id;
                if (!uid || uid === currentUid || foundUids.has(uid)) continue;
                const candidates = [];
                if (m.displayName) candidates.push(m.displayName.trim());
                if (m.email) {
                    candidates.push(m.email.trim());
                    const userPart = m.email.split('@')[0];
                    if (userPart && userPart !== m.displayName) candidates.push(userPart);
                }
                for (const name of candidates) {
                    if (!name) continue;
                    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                    const regex = new RegExp(`(^|[\\s(])@${escaped}(?=[\\s.,!?:;'"()\\[\\]{}]|$)`, 'i');
                    if (regex.test(text)) {
                        foundUids.add(uid);
                        break;
                    }
                }
            }
        }

        return Array.from(foundUids);
    }

    function formatCommentContent(text, membersMap) {
        if (!text || typeof text !== 'string') return '';
        let safe = esc(text);

        let memberList = [];
        if (membersMap instanceof Map) {
            memberList = Array.from(membersMap.values());
        } else if (Array.isArray(membersMap)) {
            memberList = membersMap;
        } else if (membersMap && typeof membersMap === 'object') {
            memberList = Object.values(membersMap);
        }

        safe = safe.replace(/@\[([^\]]+)\]\(([^)]+)\)/g, (full, name, uid) => {
            let label = name;
            if (membersMap) {
                const m = (membersMap instanceof Map) ? membersMap.get(uid) : memberList.find(x => x && (x.uid === uid || x.id === uid));
                if (m && (m.displayName || m.name)) label = m.displayName || m.name;
            }
            return `<span class="collab-mention-chip">@${esc(label)}</span>`;
        });

        if (memberList.length > 0) {
            const sorted = memberList.filter(m => m && (m.displayName || m.email)).sort((a, b) => {
                const lA = (a.displayName || a.email || '').length;
                const lB = (b.displayName || b.email || '').length;
                return lB - lA;
            });

            for (const m of sorted) {
                const label = m.displayName || m.email;
                if (!label) continue;
                const candidates = [label];
                if (m.email && m.displayName && m.email !== m.displayName) candidates.push(m.email);
                for (const cand of candidates) {
                    const escCand = esc(cand);
                    const regex = new RegExp(`(^|[\\s(])@${escCand.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=[\\s.,!?:;'"()\\[\\]{}]|$)`, 'gi');
                    safe = safe.replace(regex, (mStr, prefix) => {
                        return `${prefix}<span class="collab-mention-chip">@${esc(label)}</span>`;
                    });
                }
            }
        }

        return safe;
    }

    async function notifyCommentMention(doc, comment, recipientUid) {
        if (!doc || !comment || !recipientUid) return null;
        if (recipientUid === comment.authorUid) return null;
        const db = getFirestoreDb();
        if (!db) return null;
        const notifId = 'notif_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9);
        const docId = typeof doc === 'string' ? doc : (doc?.id || '');
        const docsList = typeof root.documents !== 'undefined' ? root.documents : (typeof documents !== 'undefined' ? documents : []);
        const foundDoc = (typeof doc === 'object' && doc?.title && doc.title !== docId) ? doc
            : ((root.state?.editingDoc?.id === docId && root.state.editingDoc.title) ? root.state.editingDoc
            : (Array.isArray(docsList) ? docsList.find(d => d.id === docId) : null));
        const docTitle = foundDoc?.title || (typeof doc === 'object' && doc?.title ? doc.title : 'Untitled');
        const payload = {
            id: notifId,
            recipientUid,
            actorUid: comment.authorUid,
            actorName: comment.authorName || 'Team Member',
            actorEmail: comment.authorEmail || '',
            docId,
            docTitle,
            kind: 'comment_mention',
            signalKey: '',
            createdAt: Date.now(),
            readAt: null
        };
        try {
            await db.collection('notifications').doc(notifId).set(payload);
            return payload;
        } catch (err) {
            console.warn('[CollabComments] notifyCommentMention failed:', err);
            return null;
        }
    }

    async function addComment(docId, data, docObj) {
        if (!docId || typeof docId !== 'string') {
            throw new Error('Invalid docId');
        }
        const { content, parentId, mentions } = data || {};
        if (typeof content !== 'string') {
            throw new Error('Comment content must be a string');
        }
        const trimmed = content.trim();
        const byteLen = (typeof TextEncoder !== 'undefined') ? new TextEncoder().encode(content).length : content.length;
        if (!trimmed || content.length > 4000 || byteLen > 4000) {
            throw new Error('Comment content must be between 1 and 4000 characters');
        }
        const authUser = getCurrentUser();
        const member = getCurrentMember();
        const authorUid = authUser?.uid || member?.uid;
        if (!authorUid) {
            throw new Error('Authentication required to post comments');
        }
        const authorName = member?.displayName || authUser?.displayName || member?.email || authUser?.email || 'Team Member';
        const authorEmail = member?.email || authUser?.email || '';
        const commentId = `cmt_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

        const comment = {
            id: commentId,
            docId,
            parentId: parentId || null,
            authorUid,
            authorName,
            authorEmail,
            content,
            mentions: Array.isArray(mentions) ? mentions : [],
            createdAt: Date.now(),
            updatedAt: null
        };

        const db = getFirestoreDb();
        if (!db) throw new Error('Firestore DB unavailable');

        await db.collection('documents').doc(docId).collection('comments').doc(commentId).set(comment);

        const docsList = typeof root.documents !== 'undefined' ? root.documents : (typeof documents !== 'undefined' ? documents : []);
        const targetDoc = (docObj && docObj.title && docObj.title !== docId) ? docObj
            : ((root.state?.editingDoc?.id === docId && root.state.editingDoc.title) ? root.state.editingDoc
            : (Array.isArray(docsList) ? docsList.find(d => d.id === docId) : null))
            || docObj || { id: docId, title: 'Untitled' };
        if (Array.isArray(comment.mentions) && comment.mentions.length > 0) {
            for (const recipientUid of comment.mentions) {
                if (recipientUid && recipientUid !== authorUid) {
                    notifyCommentMention(targetDoc, comment, recipientUid).catch(err => {
                        console.warn('[CollabComments] notify mention err:', err);
                    });
                }
            }
        }

        return comment;
    }

    async function updateComment(docId, commentId, data, docObj) {
        if (!docId || !commentId) throw new Error('Invalid docId or commentId');
        const { content, mentions } = data || {};
        if (typeof content !== 'string') throw new Error('Comment content must be a string');
        const trimmed = content.trim();
        const byteLen = (typeof TextEncoder !== 'undefined') ? new TextEncoder().encode(content).length : content.length;
        if (!trimmed || content.length > 4000 || byteLen > 4000) throw new Error('Comment content must be between 1 and 4000 characters');

        const db = getFirestoreDb();
        if (!db) throw new Error('Firestore DB unavailable');

        const commentRef = db.collection('documents').doc(docId).collection('comments').doc(commentId);
        const existingSnap = (typeof commentRef.get === 'function') ? await commentRef.get() : null;
        const existingData = existingSnap?.exists ? existingSnap.data() : null;
        const oldMentions = new Set(Array.isArray(existingData?.mentions) ? existingData.mentions : []);

        const updateData = {
            content,
            updatedAt: Date.now()
        };
        if (Array.isArray(mentions)) {
            updateData.mentions = mentions;
        }

        await commentRef.update(updateData);

        if (Array.isArray(mentions) && mentions.length > 0) {
            const authorUid = existingData?.authorUid || getCurrentUser()?.uid || getCurrentMember()?.uid;
            const newMentions = mentions.filter(uid => uid && uid !== authorUid && !oldMentions.has(uid));
            if (newMentions.length > 0) {
                const docsList = typeof root.documents !== 'undefined' ? root.documents : (typeof documents !== 'undefined' ? documents : []);
                const targetDoc = (docObj && docObj.title && docObj.title !== docId) ? docObj : ((root.state?.editingDoc?.id === docId && root.state.editingDoc.title) ? root.state.editingDoc : (Array.isArray(docsList) ? docsList.find(d => d.id === docId) : null)) || docObj || { id: docId, title: 'Untitled' };
                const updatedComment = { ...(existingData || {}), ...updateData, id: commentId, docId };
                for (const recipientUid of newMentions) {
                    notifyCommentMention(targetDoc, updatedComment, recipientUid).catch(err => { console.warn('[CollabComments] notify mention err:', err); });
                }
            }
        }

        return updateData;
    }

    async function deleteComment(docId, commentId) {
        if (!docId || !commentId) throw new Error('Invalid docId or commentId');
        const db = getFirestoreDb();
        if (!db) throw new Error('Firestore DB unavailable');

        const commentsRef = db.collection('documents').doc(docId).collection('comments');
        const commentRef = commentsRef.doc(commentId);
        let hasReplies = false;
        if (typeof commentsRef.where === 'function') {
            try {
                const repliesSnap = await commentsRef.where('parentId', '==', commentId).limit(1).get();
                hasReplies = Boolean(repliesSnap && !repliesSnap.empty);
            } catch (err) {
                console.warn('[CollabComments] reply query failed, aborting delete to protect thread:', err);
                throw err;
            }
        }

        if (hasReplies) {
            await commentRef.update({ content: '[This comment has been deleted]', isDeleted: true, updatedAt: Date.now() });
        } else {
            await commentRef.delete();
        }
        return true;
    }

    function subscribe(docId, onUpdate, onError) {
        if (!docId) {
            if (typeof onError === 'function') onError(new Error('Invalid docId'));
            return () => {};
        }
        const db = getFirestoreDb();
        if (!db) {
            if (typeof onError === 'function') onError(new Error('Firestore DB unavailable'));
            return () => {};
        }

        try {
            const commentsRef = db.collection('documents').doc(docId).collection('comments');
            const query = typeof commentsRef.orderBy === 'function' ? commentsRef.orderBy('createdAt', 'asc') : commentsRef;

            const unsub = query.onSnapshot(snapshot => {
                const flatList = [];
                if (snapshot) {
                    snapshot.forEach(docSnap => {
                        const data = typeof docSnap.data === 'function' ? docSnap.data() : docSnap;
                        flatList.push({ id: docSnap.id, ...data });
                    });
                }
                flatList.sort((a, b) => (Number(a.createdAt) || 0) - (Number(b.createdAt) || 0));
                const tree = buildCommentTree(flatList);
                if (typeof onUpdate === 'function') {
                    onUpdate(tree, flatList);
                }
            }, err => {
                console.warn('[CollabComments] subscribe error:', err);
                if (typeof onError === 'function') onError(err);
            });

            const wrappedUnsub = () => {
                _activeUnsubs.delete(wrappedUnsub);
                try { unsub(); } catch (_) {}
            };
            _activeUnsubs.add(wrappedUnsub);
            return wrappedUnsub;
        } catch (err) {
            console.warn('[CollabComments] subscribe setup error:', err);
            if (typeof onError === 'function') onError(err);
            return () => {};
        }
    }

    function stopListening() {
        _activeUnsubs.forEach(unsub => { try { unsub(); } catch (_) {} });
        _activeUnsubs.clear();
        _db = null;
        _authUser = null;
        _member = null;
    }

    root.CollabComments = {
        init,
        subscribe,
        stopListening,
        addComment,
        updateComment,
        deleteComment,
        buildCommentTree,
        extractMentions,
        formatCommentContent,
        notifyCommentMention,
        getFirestoreDb,
        getCurrentUser,
        getCurrentMember
    };
})(typeof window !== 'undefined' ? window : globalThis);
