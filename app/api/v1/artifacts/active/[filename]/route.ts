import { NextRequest, NextResponse } from 'next/server';
import ctx from '@/lib/context';
import fs from 'fs';
import path from 'path';
import os from 'os';

export const dynamic = 'force-dynamic';

const BRAIN_DIR = path.join(os.homedir(), '.gemini', 'antigravity', 'brain');

const MIME_TYPES: Record<string, string> = {
  '.md': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.ts': 'text/typescript; charset=utf-8',
  '.tsx': 'text/typescript; charset=utf-8',
  '.yaml': 'text/yaml; charset=utf-8',
  '.yml': 'text/yaml; charset=utf-8',
};

/**
 * Search ALL brain conversation directories for a file matching the given name.
 * Returns the first match found (most recently modified directory first).
 */
function findFileInBrain(fileName: string): string | null {
  try {
    if (!fs.existsSync(BRAIN_DIR)) return null;
    
    const entries = fs.readdirSync(BRAIN_DIR, { withFileTypes: true });
    
    // Sort directories by modification time (newest first)
    const dirs = entries
      .filter(e => e.isDirectory() && !e.name.startsWith('.'))
      .map(e => ({
        name: e.name,
        mtime: fs.statSync(path.join(BRAIN_DIR, e.name)).mtimeMs,
      }))
      .sort((a, b) => b.mtime - a.mtime);

    // If we have a preferred conversation ID, check it first
    if (ctx.activeConversationId) {
      const preferred = path.join(BRAIN_DIR, ctx.activeConversationId, fileName);
      if (fs.existsSync(preferred)) return preferred;
    }

    // Otherwise search all directories
    for (const dir of dirs) {
      const filePath = path.join(BRAIN_DIR, dir.name, fileName);
      if (fs.existsSync(filePath)) return filePath;
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * GET /api/v1/artifacts/active/[filename] — serve a file from the active conversation.
 *
 * Tries to find the file in:
 * 1. The ctx.activeConversationId brain directory
 * 2. Any brain directory (fallback search, newest first)
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ filename: string }> }
) {
  const { filename } = await params;

  // Security: prevent directory traversal
  if (filename.includes('..') || filename.startsWith('/')) {
    return NextResponse.json({ error: 'Invalid path' }, { status: 403 });
  }

  const filePath = findFileInBrain(filename);
  if (!filePath) {
    return NextResponse.json({ error: 'File not found' }, { status: 404 });
  }

  // Security: ensure resolved path is within BRAIN_DIR
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(path.resolve(BRAIN_DIR))) {
    return NextResponse.json({ error: 'Invalid path' }, { status: 403 });
  }

  try {
    const ext = path.extname(filename).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'text/plain; charset=utf-8';
    const content = fs.readFileSync(resolved, 'utf-8');
    return new NextResponse(content, {
      headers: { 'Content-Type': contentType },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
