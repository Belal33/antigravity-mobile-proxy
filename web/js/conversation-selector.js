/**
 * Conversation Selector Module
 *
 * Manages the conversation dropdown inside the artifact panel header:
 * loading conversations, selecting, auto-opening artifacts, and polling.
 */

(function (App) {
    'use strict';

    const { dom, state, API_BASE, escapeHtml, formatRelativeTime } = App;

    let convDropdownOpen = false;
    let pollingInterval = null;
    let lastFileHash = '';

    // ============ Load & Render ============

    App.loadConversations = async function () {
        const list = document.getElementById('conv-dropdown-list');
        if (!list) return;
        list.innerHTML = '<div class="conv-dropdown-empty">Loading...</div>';

        try {
            const res = await fetch(`${API_BASE}/api/conversations`);
            const data = await res.json();
            renderConversationList(data.conversations || [], list);
        } catch (e) {
            list.innerHTML = `<div class="conv-dropdown-empty">Error: ${escapeHtml(e.message)}</div>`;
        }
    };

    function renderConversationList(conversations, listEl) {
        listEl.innerHTML = '';
        if (conversations.length === 0) {
            listEl.innerHTML = '<div class="conv-dropdown-empty">No conversations found</div>';
            return;
        }

        // Update button label with active conversation
        const active = conversations.find(c => c.active);
        const label = document.getElementById('conv-selector-label');
        if (active && label) {
            const displayName = active.title
                ? active.title.substring(0, 24)
                : active.id.substring(0, 8) + '…';
            label.textContent = displayName;
        } else if (label && !state.activeConversationId) {
            label.textContent = 'Conversation';
        }

        for (const conv of conversations) {
            const item = document.createElement('button');
            item.className = `conv-item ${conv.active ? 'active' : ''}`;

            const displayTitle = conv.title || conv.id.substring(0, 20) + '…';
            const fileBadges = conv.files.slice(0, 3).map(f =>
                `<span class="conv-item-file-badge">${escapeHtml(f.name)}</span>`
            ).join('');
            const moreFiles = conv.files.length > 3 ? `<span class="conv-item-file-badge">+${conv.files.length - 3}</span>` : '';

            item.innerHTML = `
                <div class="conv-item-header">
                    <span class="conv-item-dot"></span>
                    <span class="conv-item-title">${escapeHtml(displayTitle)}</span>
                    <span class="conv-item-id">${conv.id.substring(0, 8)}</span>
                </div>
                <span class="conv-item-time">${formatRelativeTime(conv.mtime)}</span>
                <div class="conv-item-files">${fileBadges}${moreFiles}</div>
            `;
            item.addEventListener('click', () => selectConversation(conv));
            listEl.appendChild(item);
        }
    }

    // ============ Select & Track ============

    async function selectConversation(conv) {
        closeConvDropdown();

        try {
            const res = await fetch(`${API_BASE}/api/conversations/select`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: conv.id }),
            });
            const data = await res.json();

            if (data.active) {
                state.activeConversationId = data.id;

                // Update label
                const label = document.getElementById('conv-selector-label');
                if (label) {
                    label.textContent = data.title
                        ? data.title.substring(0, 24)
                        : data.id.substring(0, 8) + '…';
                }

                // Auto-open artifact panel and show this conversation's files
                const panel = document.getElementById('artifact-panel');
                if (panel && panel.classList.contains('hidden')) {
                    panel.classList.remove('hidden');
                }

                if (App.showArtifactFilesById) {
                    App.showArtifactFilesById(data.id, data.title, data.files);
                }

                // Start polling for changes
                startPolling(data.id);
            }
        } catch (e) {
            console.error('Failed to select conversation:', e);
        }
    }

    // ============ Polling ============

    function startPolling(convId) {
        stopPolling();
        lastFileHash = '';

        pollingInterval = setInterval(async () => {
            try {
                const res = await fetch(`${API_BASE}/api/conversations/active`);
                const data = await res.json();

                if (!data.active || data.id !== convId) {
                    stopPolling();
                    return;
                }

                // Check if files changed
                const newHash = JSON.stringify(data.files.map(f => f.name + f.size + f.mtime));
                if (newHash !== lastFileHash && lastFileHash !== '') {
                    // Files changed — refresh the view
                    if (App.showArtifactFilesById) {
                        App.showArtifactFilesById(data.id, data.title, data.files);
                    }
                }
                lastFileHash = newHash;
            } catch {
                // Silently handle polling errors
            }
        }, 3000);
    }

    function stopPolling() {
        if (pollingInterval) {
            clearInterval(pollingInterval);
            pollingInterval = null;
        }
    }

    App.stopConversationPolling = stopPolling;

    // ============ Dropdown Toggle ============

    function toggleConvDropdown() {
        convDropdownOpen = !convDropdownOpen;
        const dropdown = document.getElementById('conv-dropdown');
        const wrapper = document.getElementById('conv-selector-wrapper');
        if (dropdown) dropdown.classList.toggle('open', convDropdownOpen);
        if (wrapper) wrapper.classList.toggle('open', convDropdownOpen);
        if (convDropdownOpen) App.loadConversations();
    }

    function closeConvDropdown() {
        convDropdownOpen = false;
        const dropdown = document.getElementById('conv-dropdown');
        const wrapper = document.getElementById('conv-selector-wrapper');
        if (dropdown) dropdown.classList.remove('open');
        if (wrapper) wrapper.classList.remove('open');
    }

    // ============ Event Listeners ============

    const selectorBtn = document.getElementById('conv-selector-btn');
    if (selectorBtn) {
        selectorBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleConvDropdown();
        });
    }

    document.addEventListener('click', (e) => {
        const wrapper = document.getElementById('conv-selector-wrapper');
        if (wrapper && !wrapper.contains(e.target)) closeConvDropdown();
    });

})(window.App);
