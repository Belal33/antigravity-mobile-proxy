/**
 * Window Selector Module
 * 
 * Manages the Antigravity window selection dropdown:
 * loading, rendering, selecting, and toggling.
 */

(function (App) {
    'use strict';

    const { dom, API_BASE, escapeHtml } = App;
    let windowDropdownOpen = false;

    App.loadWindows = async function () {
        try {
            const res = await fetch(`${API_BASE}/api/windows`);
            const data = await res.json();
            renderWindowList(data.windows || []);
        } catch (e) {
            console.error('Failed to load windows:', e);
        }
    };

    function renderWindowList(windows) {
        dom.windowList.innerHTML = '';
        if (windows.length === 0) {
            dom.windowList.innerHTML = '<div class="window-item-empty">No windows found</div>';
            return;
        }

        // Update the button label with the active window
        const active = windows.find(w => w.active);
        if (active) {
            const projectName = active.title.split(' - ')[0] || active.title;
            dom.windowSelectorLabel.textContent = projectName;
        }

        for (const win of windows) {
            const item = document.createElement('button');
            item.className = `window-item ${win.active ? 'active' : ''}`;
            const projectName = win.title.split(' - ')[0] || win.title;
            item.innerHTML = `
          <span class="window-item-dot ${win.active ? 'active' : ''}"></span>
          <span class="window-item-name">${escapeHtml(projectName)}</span>
          <span class="window-item-index">#${win.index}</span>
        `;
            item.addEventListener('click', () => selectWindow(win.index));
            dom.windowList.appendChild(item);
        }
    }

    async function selectWindow(index) {
        try {
            dom.windowSelectorLabel.textContent = 'Switching...';
            closeWindowDropdown();
            const res = await fetch(`${API_BASE}/api/windows/select`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ index }),
            });
            const data = await res.json();
            if (data.selected) {
                const projectName = data.selected.title.split(' - ')[0] || data.selected.title;
                dom.windowSelectorLabel.textContent = projectName;
                App.clearHistory();
            }
            await App.loadWindows();
        } catch (e) {
            console.error('Failed to select window:', e);
            dom.windowSelectorLabel.textContent = 'Error';
        }
    }

    function toggleWindowDropdown() {
        windowDropdownOpen = !windowDropdownOpen;
        dom.windowDropdown.classList.toggle('open', windowDropdownOpen);
        dom.windowSelectorWrapper.classList.toggle('open', windowDropdownOpen);
        if (windowDropdownOpen) App.loadWindows();
    }

    function closeWindowDropdown() {
        windowDropdownOpen = false;
        dom.windowDropdown.classList.remove('open');
        dom.windowSelectorWrapper.classList.remove('open');
    }

    // Event listeners for window selector
    dom.windowSelectorBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleWindowDropdown();
    });

    document.addEventListener('click', (e) => {
        if (!dom.windowSelectorWrapper.contains(e.target)) closeWindowDropdown();
    });

})(window.App);
