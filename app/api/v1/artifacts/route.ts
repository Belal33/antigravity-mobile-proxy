import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import os from 'os';

export const dynamic = 'force-dynamic';

const BRAIN_DIR = path.join(os.homedir(), '.gemini', 'antigravity', 'brain');

/**
 * GET /api/v1/artifacts — list all conversation directories with artifact files.
 */
export async function GET() {
  try {
    if (!fs.existsSync(BRAIN_DIR)) {
      return NextResponse.json({ artifacts: [] });
    }

    const dirs = fs
      .readdirSync(BRAIN_DIR, { withFileTypes: true })
      .filter((d) => d.isDirectory() && !d.name.startsWith('.'))
      .map((d) => {
        const dirPath = path.join(BRAIN_DIR, d.name);
        try {
          const files = fs
            .readdirSync(dirPath)
            .filter(
              (f) =>
                !f.startsWith('.') &&
                fs.statSync(path.join(dirPath, f)).isFile()
            );
          return { id: d.name, fileCount: files.length };
        } catch {
          return { id: d.name, fileCount: 0 };
        }
      })
      .filter((d) => d.fileCount > 0);

    return NextResponse.json({ artifacts: dirs });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
