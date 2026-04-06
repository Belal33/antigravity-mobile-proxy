import { NextResponse } from 'next/server';
import { execFileSync } from 'child_process';
import { existsSync } from 'fs';
import ctx from '@/lib/context';
import { getRecentProjects } from '@/lib/cdp/recent-projects';

export const dynamic = 'force-dynamic';

function resolveWorkspacePath(): string | null {
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

/**
 * POST /api/v1/git/commit
 * Body: { message: string, stageAll?: boolean }
 *
 * Uses execFileSync (args array) for cross-platform safety — avoids
 * shell quoting issues on Windows cmd.exe.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const message: string = (body.message || '').trim();
    const stageAll: boolean = body.stageAll === true;

    if (!message) {
      return NextResponse.json({ error: 'Commit message is required' }, { status: 400 });
    }

    const workspacePath = resolveWorkspacePath() || process.cwd();
    const opts = { cwd: workspacePath, encoding: 'utf-8' as const };

    let gitRoot: string;
    try {
      gitRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], opts).trim();
    } catch {
      return NextResponse.json({ error: 'Not a git repository' }, { status: 400 });
    }

    const gitOpts = { cwd: gitRoot, encoding: 'utf-8' as const };

    if (stageAll) {
      execFileSync('git', ['add', '-A'], gitOpts);
    }

    const staged = execFileSync('git', ['diff', '--cached', '--name-only'], gitOpts).trim();
    if (!staged) {
      return NextResponse.json({ error: 'Nothing staged to commit', nothingStaged: true }, { status: 400 });
    }

    // Pass message as a separate arg — no shell quoting needed
    const output = execFileSync('git', ['commit', '-m', message], gitOpts).trim();

    return NextResponse.json({ success: true, output });
  } catch (err: any) {
    return NextResponse.json({ error: err.stderr?.toString?.().trim() || err.message || 'Commit failed' }, { status: 500 });
  }
}
