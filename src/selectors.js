/**
 * DOM selectors for the Antigravity agent side panel.
 */

const SELECTORS = {
    chatInput: '#antigravity\\.agentSidePanelInputBox [contenteditable="true"][role="textbox"]',
    messageList: '#conversation > div:first-child .mx-auto.w-full',
    conversation: '#conversation',
    spinner: '.antigravity-agent-side-panel .animate-spin',
};

module.exports = { SELECTORS };
