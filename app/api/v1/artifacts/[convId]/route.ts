import { NextResponse, NextRequest } from 'next/server';
import fs from 'fs';
import path from 'path';
import os from 'os';

export const dynamic = 'force-dynamic';

const BRAIN_DIR = path.join(os.homedir(), '.gemini', 'antigravity', 'brain');

/**
 * GET /api/v1/artifacts/[convId] — list files in a conversation directory.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ convId: string }> }
) {
  const { convId } = await params;
  const sanitized = convId.replace(/[^a-zA-Z0-9\-_]/g, '');
  const convDir = path.join(BRAIN_DIR, sanitized);

  if (!fs.existsSync(convDir)) {
    return NextResponse.json(
      { error: 'Conversation not found' },
      { status: 404 }
    );
  }

  try {
    const files = fs
      .readdirSync(convDir)
      .filter(
        (f) =>
          !f.startsWith('.') && fs.statSync(path.join(convDir, f)).isFile()
      )
      .map((f) => {
        const stat = fs.statSync(path.join(convDir, f));
        return {
          name: f,
          size: stat.size,
          mtime: stat.mtime.toISOString(),
        };
      });
    return NextResponse.json({ convId: sanitized, files });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
