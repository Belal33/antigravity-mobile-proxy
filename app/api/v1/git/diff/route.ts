import { NextRequest, NextResponse } from 'next/server';
import { execFileSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { join, normalize, resolve } from 'path';
import ctx from '@/lib/context';
import { getRecentProjects } from '@/lib/cdp/recent-projects';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/git/diff?filepath=…&staged=true|false
 *
 * Returns git diff for a specific file in the active IDE workspace.
 * Cross-platform: uses execFileSync with arg arrays (no shell quoting).
 */
export async function GET(request: NextRequest) {
  const filepath = request.nextUrl.searchParams.get('filepath');
  const staged = request.nextUrl.searchParams.get('staged') === 'true';
  const untracked = request.nextUrl.searchParams.get('untracked') === 'true';

  if (!filepath) {
    return NextResponse.json({ error: 'Missing filepath parameter' }, { status: 400 });
  }

  // Security: reject path traversal
  const normalized = normalize(filepath);
  if (normalized.includes('..')) {
    return NextResponse.json({ error: 'Invalid path' }, { status: 403 });
  }

  const workspacePath = resolveIdeWorkspacePath();
  const cwd = workspacePath || process.cwd();

  let gitRoot: string;
  try {
    gitRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], {
      cwd,
      encoding: 'utf-8',
    }).trim();
  } catch {
    return NextResponse.json({ error: 'Not a git repository' }, { status: 404 });
  }

  const maxBuffer = 5 * 1024 * 1024;
  const opts = { cwd: gitRoot, encoding: 'utf-8' as const, maxBuffer } as any;

  // Forward-slash path for git (git always uses / even on Windows)
  const gitFilepath = filepath.replace(/\\/g, '/');

  try {
    let diff = '';

    if (untracked) {
      // Untracked file: show as new file diff by reading content
      const fullPath = join(gitRoot, normalize(filepath));
      // Verify path stays within git root
      if (!resolve(fullPath).toLowerCase().startsWith(resolve(gitRoot).toLowerCase())) {
        return NextResponse.json({ error: 'Path traversal denied' }, { status: 403 });
      }
      if (existsSync(fullPath)) {
        const content = readFileSync(fullPath, 'utf-8');
        const lines = content.split('\n');
        const diffLines = [
          `diff --git a/${gitFilepath} b/${gitFilepath}`,
          'new file mode 100644',
          '--- /dev/null',
          `+++ b/${gitFilepath}`,
          `@@ -0,0 +1,${lines.length} @@`,
          ...lines.map(l => `+${l}`),
        ];
        diff = diffLines.join('\n');
      }
    } else if (staged) {
      // Pass filepath as a separate arg — no shell quoting needed
      diff = execFileSync('git', ['diff', '--cached', '--', gitFilepath], opts);
    } else {
      diff = execFileSync('git', ['diff', '--', gitFilepath], opts);
    }

    return NextResponse.json({ diff: diff.trim(), filepath });
  } catch (err: any) {
    return NextResponse.json({ error: err.stderr?.toString?.().trim() || err.message }, { status: 500 });
  }
}

function resolveIdeWorkspacePath(): string | null {
  try {
    const activeIdx = ctx.activeWindowIdx;
    const activeWb = ctx.allWorkbenches[activeIdx];
    const title = activeWb?.title || ctx.activeTitle || '';
    if (!title) return null;
    const projectName = title.split(' - ')[0]?.trim();
    if (!projectName) return null;
    const projects = getRecentProjects(30);
    const match = projects.find(p => p.name === projectName);
    if (match && existsSync(match.path)) return match.path;
    return null;
  } catch {
    return null;
  }
}
