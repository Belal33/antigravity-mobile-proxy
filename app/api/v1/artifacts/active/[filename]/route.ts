import { NextRequest, NextResponse } from 'next/server';
import ctx from '@/lib/context';
import fs from 'fs';
import path from 'path';
import os from 'os';

export const dynamic = 'force-dynamic';

const BRAIN_DIR = path.join(os.homedir(), '.gemini', 'antigravity', 'brain');

/**
 * GET /api/v1/artifacts/active/[filename] — serve a file from the active conversation.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ filename: string }> }
) {
  const { filename } = await params;

  if (!ctx.activeConversationId) {
    return NextResponse.json({ error: 'No active conversation' }, { status: 404 });
  }

  const filePath = path.join(BRAIN_DIR, ctx.activeConversationId, filename);
  const resolved = path.resolve(filePath);
  const expected = path.resolve(path.join(BRAIN_DIR, ctx.activeConversationId));
  if (!resolved.startsWith(expected)) {
    return NextResponse.json({ error: 'Invalid path' }, { status: 403 });
  }

  if (!fs.existsSync(resolved)) {
    return NextResponse.json({ error: 'File not found' }, { status: 404 });
  }

  const content = fs.readFileSync(resolved, 'utf-8');
  const ext = path.extname(filename).toLowerCase();
  const mimeTypes: Record<string, string> = {
    '.md': 'text/markdown',
    '.json': 'application/json',
    '.ts': 'text/typescript',
    '.tsx': 'text/typescript',
    '.css': 'text/css',
    '.txt': 'text/plain',
  };
  const contentType = mimeTypes[ext] || 'text/plain';

  return new NextResponse(content, {
    headers: { 'Content-Type': contentType },
  });
}
