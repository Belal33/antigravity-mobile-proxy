/**
 * SSE Event Handler
 * 
 * Dispatches typed SSE events (thinking, tool_call, response, hitl,
 * notification, file_change, error, done) to the appropriate UI components.
 */

(function (App) {
    'use strict';

    App.handleSSEvent = function (eventType, data, ctx) {
        switch (eventType) {
            case 'thinking': {
                const thinkEl = App.createThinkingBlock(data.time);
                ctx.stepsContainer.appendChild(thinkEl);
                App.scrollToBottom();
                break;
            }

            case 'tool_call': {
                const existingCard = ctx.stepsContainer.querySelector(`[data-tool-index="${data.index}"]`);
                if (existingCard) {
                    App.updateToolCallCard(existingCard, data);
                } else {
                    const card = App.createToolCallCard(data);
                    ctx.stepsContainer.appendChild(card);
                }
                App.scrollToBottom();
                break;
            }

            case 'hitl': {
                // Find the most recent tool call to show context
                const lastToolCard = ctx.stepsContainer.querySelector('.tool-call-card:last-of-type');
                let toolData = null;
                if (lastToolCard) {
                    toolData = {
                        status: lastToolCard.querySelector('.tool-status-text')?.textContent,
                        command: lastToolCard.querySelector('.tool-command code')?.textContent,
                        path: lastToolCard.querySelector('.tool-path')?.textContent,
                    };
                }
                const hitlEl = App.createHITLDialog(toolData);
                ctx.stepsContainer.appendChild(hitlEl);
                App.setStatus('hitl', 'Needs approval');
                App.scrollToBottom();
                break;
            }

            case 'notification': {
                // Remove any previous HITL dialogs
                ctx.stepsContainer.querySelectorAll('.hitl-dialog').forEach(d => {
                    d.classList.add('resolved');
                    setTimeout(() => d.remove(), 500);
                });
                App.setStatus('streaming', 'Agent');
                break;
            }

            case 'status':
                App.setStatus(data.phase || 'streaming', data.isRunning ? 'Agent working...' : '');
                break;

            case 'response':
                ctx.setFullResponse(data.content);
                App.renderHTML(ctx.responseContainer, data.content);
                App.scrollToBottom();
                break;

            case 'file_change': {
                const fileEl = App.createFileChangeIndicator(data);
                ctx.stepsContainer.appendChild(fileEl);
                App.scrollToBottom();
                break;
            }

            case 'error': {
                if (ctx.typingEl.parentNode) ctx.typingEl.remove();
                const errorEl = App.createErrorBanner(data.message);
                ctx.stepsContainer.appendChild(errorEl);
                App.setStatus('error', 'Error');
                App.scrollToBottom();
                break;
            }

            case 'done':
                if (ctx.typingEl.parentNode) ctx.typingEl.remove();
                ctx.agentMsgEl.classList.remove('streaming');
                // If we have a final response that wasn't already rendered
                if (data.finalResponse && !ctx.getFullResponse()) {
                    ctx.setFullResponse(data.finalResponse);
                    if (data.isHTML) {
                        App.renderHTML(ctx.responseContainer, data.finalResponse);
                    } else {
                        App.renderMarkdown(ctx.responseContainer, data.finalResponse);
                    }
                }
                App.setStatus('connected', 'Agent');
                App.scrollToBottom();
                break;
        }
    };

})(window.App);
