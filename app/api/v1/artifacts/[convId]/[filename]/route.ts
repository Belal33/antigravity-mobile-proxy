import { NextResponse, NextRequest } from 'next/server';
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
  '.yaml': 'text/yaml; charset=utf-8',
  '.yml': 'text/yaml; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
};

/**
 * GET /api/v1/artifacts/[convId]/[filename] — serve a specific artifact file.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ convId: string; filename: string }> }
) {
  const { convId, filename } = await params;
  const sanitizedConv = convId.replace(/[^a-zA-Z0-9\-_]/g, '');
  const sanitizedFile = filename.replace(/[^a-zA-Z0-9\-_.]/g, '');
  const filePath = path.join(BRAIN_DIR, sanitizedConv, sanitizedFile);

  // Security: ensure file is within BRAIN_DIR
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(BRAIN_DIR)) {
    return NextResponse.json(
      { error: 'Access denied' },
      { status: 403 }
    );
  }

  if (!fs.existsSync(filePath)) {
    return NextResponse.json(
      { error: 'File not found' },
      { status: 404 }
    );
  }

  try {
    const ext = path.extname(sanitizedFile).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    const isText = contentType.startsWith('text/') || contentType.includes('json');

    if (isText) {
      const content = fs.readFileSync(filePath, 'utf-8');
      return new Response(content, {
        headers: { 'Content-Type': contentType },
      });
    } else {
      const buffer = fs.readFileSync(filePath);
      return new Response(buffer, {
        headers: { 'Content-Type': contentType },
      });
    }
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
