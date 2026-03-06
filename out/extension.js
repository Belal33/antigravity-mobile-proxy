"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const os = __importStar(require("os"));
async function activate(context) {
    const logFile = path.join(os.tmpdir(), "antigravity-lm-test.log");
    try {
        if (!vscode.lm || !vscode.lm.selectChatModels) {
            fs.writeFileSync(logFile, "vscode.lm.selectChatModels is NOT AVAILABLE\\n");
            return;
        }
        const models = await vscode.lm.selectChatModels();
        const modelInfo = models.map(m => `ID: ${m.id}, Vendor: ${m.vendor}, Family: ${m.family}, Name: ${m.name}, MaxTokens: ${m.maxInputTokens}`).join('\\n');
        fs.writeFileSync(logFile, `AVAILABLE MODELS:\\n${modelInfo}\\n`);
    }
    catch (e) {
        fs.writeFileSync(logFile, `ERROR: ${e.message}\\n`);
    }
}
function deactivate() { }
//# sourceMappingURL=extension.js.map