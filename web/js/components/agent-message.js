/**
 * Agent Message Component
 * 
 * Creates the structured agent message DOM element with
 * steps container and response container.
 */

(function (App) {
    'use strict';

    App.createAgentMessageElement = function () {
        const msgDiv = document.createElement('div');
        msgDiv.className = 'message agent streaming';

        const header = document.createElement('div');
        header.className = 'message-header';

        const avatar = document.createElement('div');
        avatar.className = 'message-avatar agent';
        avatar.textContent = '✦';

        const sender = document.createElement('span');
        sender.className = 'message-sender';
        sender.textContent = 'Antigravity';

        header.appendChild(avatar);
        header.appendChild(sender);

        // Steps container (thinking, tool calls, HITL)
        const stepsDiv = document.createElement('div');
        stepsDiv.className = 'agent-steps';

        // Response container (final markdown)
        const responseDiv = document.createElement('div');
        responseDiv.className = 'agent-response message-content';

        msgDiv.appendChild(header);
        msgDiv.appendChild(stepsDiv);
        msgDiv.appendChild(responseDiv);
        return msgDiv;
    };

})(window.App);
