import * as vscode from 'vscode';
import { GoogleGenAI } from '@google/genai';

interface ChatMessage {
    role: 'user' | 'model';
    text: string;
}

/**
 * ChatProxy sends messages directly to the Gemini API
 * using the same model that powers the Antigravity agent.
 * Uses streaming for real-time responses.
 */
export class ChatProxy {
    private ai: GoogleGenAI | null = null;
    private chatHistory: ChatMessage[] = [];

    /**
     * Initialize or reinitialize the Gemini client with an API key.
     */
    setApiKey(apiKey: string) {
        this.ai = new GoogleGenAI({ apiKey });
        console.log('[Chat Proxy] Gemini AI client initialized');
    }

    /**
     * Get the API key from VS Code settings or prompt the user.
     */
    async ensureApiKey(): Promise<boolean> {
        if (this.ai) return true;

        const config = vscode.workspace.getConfiguration('antigravity-chat-proxy');
        let apiKey = config.get<string>('geminiApiKey', '');

        if (!apiKey) {
            apiKey = await vscode.window.showInputBox({
                title: 'Gemini API Key',
                prompt: 'Enter your Google Gemini API key (get one at ai.google.dev)',
                password: true,
                ignoreFocusOut: true,
            }) || '';

            if (apiKey) {
                await config.update('geminiApiKey', apiKey, vscode.ConfigurationTarget.Global);
            }
        }

        if (!apiKey) {
            return false;
        }

        this.setApiKey(apiKey);
        return true;
    }

    /**
     * Send a message to Gemini and stream the response.
     */
    async sendMessage(
        message: string,
        _mode: string,
        onChunk: (text: string) => void,
        onStatus: (status: string) => void,
    ): Promise<void> {
        onStatus('connecting');

        const hasKey = await this.ensureApiKey();
        if (!hasKey || !this.ai) {
            onChunk('⚠️ **No Gemini API key configured.**\n\n');
            onChunk('Please set your API key:\n');
            onChunk('1. Get a free key at [ai.google.dev](https://ai.google.dev/)\n');
            onChunk('2. In Antigravity settings, search for `geminiApiKey`\n');
            onChunk('3. Paste your key and reload the window\n');
            return;
        }

        onStatus('streaming');

        // Build conversation history for context
        const contents = this.chatHistory.map(msg => ({
            role: msg.role,
            parts: [{ text: msg.text }],
        }));

        // Add current user message
        contents.push({
            role: 'user' as const,
            parts: [{ text: message }],
        });

        try {
            const response = await this.ai.models.generateContentStream({
                model: 'gemini-2.5-flash',
                contents: contents,
                config: {
                    systemInstruction: 'You are Antigravity, an expert AI coding assistant. You help with programming, debugging, architecture, and general software engineering questions. Be concise, helpful, and provide code examples when relevant. Use markdown formatting.',
                },
            });

            let fullResponse = '';

            for await (const chunk of response) {
                const text = chunk.text;
                if (text) {
                    fullResponse += text;
                    onChunk(text);
                }
            }

            // Save to history
            this.chatHistory.push({ role: 'user', text: message });
            this.chatHistory.push({ role: 'model', text: fullResponse });

            // Keep history manageable (last 20 turns)
            if (this.chatHistory.length > 40) {
                this.chatHistory = this.chatHistory.slice(-40);
            }

            onStatus('complete');
        } catch (err: any) {
            console.error('[Chat Proxy] Gemini API error:', err);

            if (err.message?.includes('API_KEY_INVALID') || err.message?.includes('401')) {
                onChunk('\n\n⚠️ **Invalid API key.** Please check your Gemini API key in settings.');
                // Clear the bad key
                this.ai = null;
            } else if (err.message?.includes('429') || err.message?.includes('RATE_LIMIT')) {
                onChunk('\n\n⚠️ **Rate limited.** Please wait a moment and try again.');
            } else if (err.message?.includes('SAFETY')) {
                onChunk('\n\n⚠️ **Response blocked by safety filters.** Try rephrasing your question.');
            } else {
                onChunk(`\n\n⚠️ **Error:** ${err.message || 'Unknown error'}`);
            }
        }
    }

    /**
     * Clear chat history for a new conversation.
     */
    clearHistory() {
        this.chatHistory = [];
    }
}
