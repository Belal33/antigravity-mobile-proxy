/**
 * Artifacts Panel Module
 * 
 * Manages the artifact browser panel: loading conversations,
 * browsing files, and viewing file contents.
 */

(function (App) {
    'use strict';

    const { escapeHtml, renderMarkdown, formatRelativeTime, formatFileSize } = App;

    const artifactPanel = document.getElementById('artifact-panel');
    const artifactBtn = document.getElementById('artifacts-btn');
    const artifactCloseBtn = document.getElementById('artifact-close-btn');
    const artifactList = document.getElementById('artifact-list');
    const artifactViewer = document.getElementById('artifact-viewer');
    const artifactViewerTitle = document.getElementById('artifact-viewer-title');
    const artifactViewerBody = document.getElementById('artifact-viewer-body');
    const artifactBackBtn = document.getElementById('artifact-back-btn');

    let artifactViewState = 'list'; // 'list' | 'files' | 'viewer'
    let artifactCurrentConv = null;

    // ============ Panel Toggle ============

    if (artifactBtn) {
        artifactBtn.addEventListener('click', () => {
            const isHidden = artifactPanel.classList.contains('hidden');
            if (isHidden) {
                artifactPanel.classList.remove('hidden');
                loadArtifacts();
            } else {
                artifactPanel.classList.add('hidden');
            }
        });
    }

    if (artifactCloseBtn) {
        artifactCloseBtn.addEventListener('click', () => {
            artifactPanel.classList.add('hidden');
        });
    }

    if (artifactBackBtn) {
        artifactBackBtn.addEventListener('click', () => {
            if (artifactViewState === 'viewer') {
                showArtifactFiles(artifactCurrentConv);
            } else if (artifactViewState === 'files') {
                artifactViewState = 'list';
                artifactList.style.display = '';
                artifactViewer.style.display = 'none';
                loadArtifacts();
            }
        });
    }

    // ============ Public API for Conversation Selector ============

    /**
     * Programmatically show a conversation's files by ID.
     * Called from conversation-selector.js when a conversation is selected.
     */
    App.showArtifactFilesById = function (convId, title, files) {
        const conv = {
            id: convId,
            files: files || [],
            title: title,
        };
        showArtifactFiles(conv);
    };

    // ============ Data Loading ============

    async function loadArtifacts() {
        artifactList.innerHTML = '<div class="artifact-loading">Loading artifacts...</div>';
        try {
            const res = await fetch('/api/artifacts');
            const data = await res.json();
            if (!data.conversations || data.conversations.length === 0) {
                artifactList.innerHTML = '<div class="artifact-loading">No artifacts found</div>';
                return;
            }
            artifactList.innerHTML = '';
            for (const conv of data.conversations) {
                const card = document.createElement('div');
                card.className = 'artifact-conv-card';
                const filesBadges = conv.files.map(f =>
                    `<span class="artifact-file-badge">📄 ${escapeHtml(f.name)}</span>`
                ).join('');
                card.innerHTML = `
                    <div class="artifact-conv-id">${conv.id}</div>
                    <div class="artifact-conv-files">${filesBadges}</div>
                    <div class="artifact-conv-time">${formatRelativeTime(conv.mtime)}</div>
                `;
                card.addEventListener('click', () => showArtifactFiles(conv));
                artifactList.appendChild(card);
            }
        } catch (err) {
            artifactList.innerHTML = `<div class="artifact-loading">Error: ${escapeHtml(err.message)}</div>`;
        }
    }

    function showArtifactFiles(conv) {
        artifactCurrentConv = conv;
        artifactViewState = 'files';
        artifactList.style.display = 'none';
        artifactViewer.style.display = 'flex';
        artifactViewerTitle.textContent = conv.id.substring(0, 8) + '...';
        artifactViewerBody.innerHTML = '';

        const fileList = document.createElement('div');
        fileList.className = 'artifact-file-list';
        for (const file of conv.files) {
            const item = document.createElement('div');
            item.className = 'artifact-file-item';
            const iconSvg = file.name.endsWith('.md')
                ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>'
                : '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/></svg>';
            item.innerHTML = `
                <span class="artifact-file-icon">${iconSvg}</span>
                <span class="artifact-file-name">${escapeHtml(file.name)}</span>
                <span class="artifact-file-size">${formatFileSize(file.size)}</span>
            `;
            item.addEventListener('click', () => openArtifactFile(conv.id, file.name));
            fileList.appendChild(item);
        }
        artifactViewerBody.appendChild(fileList);
    }

    async function openArtifactFile(convId, fileName) {
        artifactViewState = 'viewer';
        artifactViewerTitle.textContent = fileName;
        artifactViewerBody.innerHTML = '<div class="artifact-loading">Loading file...</div>';
        try {
            const res = await fetch(`/api/artifacts/${convId}/${fileName}`);
            const content = await res.text();
            if (fileName.endsWith('.md')) {
                artifactViewerBody.innerHTML = marked.parse(content);
                if (typeof hljs !== 'undefined') {
                    artifactViewerBody.querySelectorAll('pre code').forEach(block => {
                        hljs.highlightElement(block);
                    });
                }
            } else {
                artifactViewerBody.innerHTML = `<pre>${escapeHtml(content)}</pre>`;
            }
        } catch (err) {
            artifactViewerBody.innerHTML = `<div class="artifact-loading">Error: ${escapeHtml(err.message)}</div>`;
        }
    }

})(window.App);
