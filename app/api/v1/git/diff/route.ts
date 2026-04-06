import { NextRequest, NextResponse } from 'next/server';
import { execSync } from 'child_process';
import { existsSync } from 'fs';
import ctx from '@/lib/context';
import { getRecentProjects } from '@/lib/cdp/recent-projects';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/git/diff?filepath=…&staged=true|false
 *
 * Returns git diff for a specific file in the active IDE workspace.
 * staged=true for index diff, staged=false (default) for working tree diff.
 */
export async function GET(request: NextRequest) {
  const filepath = request.nextUrl.searchParams.get('filepath');
  const staged = request.nextUrl.searchParams.get('staged') === 'true';
  const untracked = request.nextUrl.searchParams.get('untracked') === 'true';

  if (!filepath) {
    return NextResponse.json({ error: 'Missing filepath parameter' }, { status: 400 });
  }

  if (filepath.includes('..')) {
    return NextResponse.json({ error: 'Invalid path' }, { status: 403 });
  }

  const workspacePath = resolveIdeWorkspacePath();
  const cwd = workspacePath || process.cwd();

  let gitRoot: string;
  try {
    gitRoot = execSync('git rev-parse --show-toplevel', { cwd, encoding: 'utf-8' }).trim();
  } catch {
    return NextResponse.json({ error: 'Not a git repository' }, { status: 404 });
  }

  const escapedPath = filepath.replace(/"/g, '\\"');
  const maxBuffer = 5 * 1024 * 1024;

  try {
    let diff = '';

    if (untracked) {
      // Untracked file: show as new file diff by reading content
      const fullPath = `${gitRoot}/${filepath}`;
      if (existsSync(fullPath)) {
        const { readFileSync } = await import('fs');
        const content = readFileSync(fullPath, 'utf-8');
        const lines = content.split('\n');
        const diffLines = [
          `diff --git a/${filepath} b/${filepath}`,
          'new file mode 100644',
          '--- /dev/null',
          `+++ b/${filepath}`,
          `@@ -0,0 +1,${lines.length} @@`,
          ...lines.map(l => `+${l}`),
        ];
        diff = diffLines.join('\n');
      }
    } else if (staged) {
      diff = execSync(`git diff --cached -- "${escapedPath}"`, { cwd: gitRoot, encoding: 'utf-8', maxBuffer });
    } else {
      diff = execSync(`git diff -- "${escapedPath}"`, { cwd: gitRoot, encoding: 'utf-8', maxBuffer });
    }

    return NextResponse.json({ diff: diff.trim(), filepath });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
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
    const recentProjects = getRecentProjects(30);
    const match = recentProjects.find(p => p.name === projectName);
    if (match && existsSync(match.path)) return match.path;
    return null;
  } catch {
    return null;
  }
}
