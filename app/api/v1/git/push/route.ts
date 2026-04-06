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
 * POST /api/v1/git/push
 * Body: { force?: boolean }
 *
 * Uses execFileSync (args array) for cross-platform safety — avoids
 * shell quoting issues on Windows cmd.exe.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const force: boolean = body.force === true;

    const workspacePath = resolveWorkspacePath() || process.cwd();
    const opts = { cwd: workspacePath, encoding: 'utf-8' as const };

    let gitRoot: string;
    try {
      gitRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], opts).trim();
    } catch {
      return NextResponse.json({ error: 'Not a git repository' }, { status: 400 });
    }

    const gitOpts = { cwd: gitRoot, encoding: 'utf-8' as const };

    const branch = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], gitOpts).trim();
    if (branch === 'HEAD') {
      return NextResponse.json({ error: 'Cannot push in detached HEAD state' }, { status: 400 });
    }

    let hasUpstream = false;
    try {
      execFileSync('git', ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'], gitOpts);
      hasUpstream = true;
    } catch { /* no upstream */ }

    const pushArgs = hasUpstream
      ? (force ? ['push', '--force-with-lease'] : ['push'])
      : ['push', '--set-upstream', 'origin', branch];

    const output = execFileSync('git', pushArgs, gitOpts).trim();

    return NextResponse.json({ success: true, output, branch });
  } catch (err: any) {
    const msg = err.stderr?.toString?.().trim() || err.message || 'Push failed';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
