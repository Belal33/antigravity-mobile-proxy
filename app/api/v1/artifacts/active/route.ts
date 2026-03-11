import { NextResponse } from 'next/server';
import ctx from '@/lib/context';
import fs from 'fs';
import path from 'path';
import os from 'os';

export const dynamic = 'force-dynamic';

const BRAIN_DIR = path.join(os.homedir(), '.gemini', 'antigravity', 'brain');

/**
 * Auto-detect the most recently modified conversation directory.
 * Ensures the artifact panel works even before a conversation is explicitly selected.
 */
function autoDetectActiveConversation(): string | null {
  try {
    if (!fs.existsSync(BRAIN_DIR)) return null;
    const entries = fs.readdirSync(BRAIN_DIR, { withFileTypes: true });
    let latest: { id: string; mtime: number } | null = null;

    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
      const dirPath = path.join(BRAIN_DIR, entry.name);
      const stat = fs.statSync(dirPath);
      if (!latest || stat.mtimeMs > latest.mtime) {
        latest = { id: entry.name, mtime: stat.mtimeMs };
      }
    }
    return latest?.id ?? null;
  } catch {
    return null;
  }
}

/**
 * GET /api/v1/artifacts/active — list files in the active conversation directory.
 * Auto-detects active conversation on first load if none is set.
 */
export async function GET() {
  try {
    // Auto-detect on first load if no conversation has been selected yet
    if (!ctx.activeConversationId && !ctx.activeTitle) {
      ctx.activeConversationId = autoDetectActiveConversation();
    }

    if (!ctx.activeConversationId) {
      return NextResponse.json({ files: [] }); // Graceful empty state
    }

    const convDir = path.join(BRAIN_DIR, ctx.activeConversationId);
    if (!fs.existsSync(convDir)) {
      return NextResponse.json({ files: [] });
    }

    const files: any[] = [];
    const entries = fs.readdirSync(convDir, { recursive: true, withFileTypes: true });
    
    for (const d of entries) {
      if (!d.isFile() || !d.name.endsWith('.md')) continue;
      
      // Node 20+ uses parentPath, older Node might use path. Fallback to convDir just in case
      // @ts-ignore
      const parentDir = d.parentPath || d.path || convDir;
      const fullPath = path.join(parentDir, d.name);
      const relPath = path.relative(convDir, fullPath).replace(/\\/g, '/');
      
      // Skip hidden folders like .system_generated
      if (relPath.split('/').some(p => p.startsWith('.'))) continue;
      
      try {
        const stats = fs.statSync(fullPath);
        files.push({
          name: relPath, // Return the relative path, e.g. "browser/scratchpad.md"
          size: stats.size,
          mtime: stats.mtime.toISOString(),
        });
      } catch {
        continue;
      }
    }

    // Sort newest first
    files.sort((a: any, b: any) => new Date(b.mtime).getTime() - new Date(a.mtime).getTime());

    return NextResponse.json({ files });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
