import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export async function activate(context: vscode.ExtensionContext) {
    const logFile = path.join(os.tmpdir(), "antigravity-lm-test.log");

    try {
        if (!vscode.lm || !vscode.lm.selectChatModels) {
            fs.writeFileSync(logFile, "vscode.lm.selectChatModels is NOT AVAILABLE\\n");
            return;
        }

        const models = await vscode.lm.selectChatModels();
        const modelInfo = models.map(m => `ID: ${m.id}, Vendor: ${m.vendor}, Family: ${m.family}, Name: ${m.name}, MaxTokens: ${m.maxInputTokens}`).join('\\n');

        fs.writeFileSync(logFile, `AVAILABLE MODELS:\\n${modelInfo}\\n`);
    } catch (e: any) {
        fs.writeFileSync(logFile, `ERROR: ${e.message}\\n`);
    }
}

export function deactivate() { }
