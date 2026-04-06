import { NextResponse } from 'next/server';
import { execSync } from 'child_process';
import { existsSync } from 'fs';
import ctx from '@/lib/context';
import { getRecentProjects } from '@/lib/cdp/recent-projects';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/git/status
 *
 * Returns live git status for the active IDE workspace:
 * - Current branch name
 * - Ahead/behind counts vs remote
 * - Staged files
 * - Unstaged (modified/deleted) files
 * - Untracked files
 * - Last N commits
 * - Stash count
 */
export async function GET() {
  try {
    const workspacePath = resolveIdeWorkspacePath();
    const cwd = workspacePath || process.cwd();

    // Verify it's a git repo
    let gitRoot: string;
    try {
      gitRoot = execSync('git rev-parse --show-toplevel', { cwd, encoding: 'utf-8' }).trim();
    } catch {
      return NextResponse.json({
        isGitRepo: false,
        branch: null,
        ahead: 0,
        behind: 0,
        staged: [],
        unstaged: [],
        untracked: [],
        commits: [],
        stashCount: 0,
        workspacePath: cwd,
      });
    }

    // Branch name
    let branch = 'HEAD';
    try {
      branch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: gitRoot, encoding: 'utf-8' }).trim();
    } catch { /* detached HEAD */ }

    // Ahead/behind tracking remote
    let ahead = 0;
    let behind = 0;
    let remoteBranch: string | null = null;
    try {
      remoteBranch = execSync(`git rev-parse --abbrev-ref --symbolic-full-name @{u}`, { cwd: gitRoot, encoding: 'utf-8' }).trim();
      const ab = execSync(`git rev-list --left-right --count HEAD...${remoteBranch}`, { cwd: gitRoot, encoding: 'utf-8' }).trim();
      const [a, b] = ab.split('\t').map(Number);
      ahead = a || 0;
      behind = b || 0;
    } catch { /* no remote */ }

    // Parse `git status --porcelain=v1`
    let statusOutput = '';
    try {
      statusOutput = execSync('git status --porcelain=v1 -u', { cwd: gitRoot, encoding: 'utf-8', maxBuffer: 2 * 1024 * 1024 });
    } catch { /* ignore */ }

    type GitFileStatus = 'modified' | 'added' | 'deleted' | 'renamed' | 'copied' | 'untracked' | 'unmerged';
    interface GitFile {
      path: string;
      originalPath?: string;
      status: GitFileStatus;
      statusCode: string;
    }

    const staged: GitFile[] = [];
    const unstaged: GitFile[] = [];
    const untracked: GitFile[] = [];

    for (const line of statusOutput.split('\n')) {
      if (!line) continue;
      const xy = line.substring(0, 2);
      const x = xy[0]; // index (staged)
      const y = xy[1]; // worktree (unstaged)
      const filePart = line.substring(3);

      // Handle rename format: "old -> new"
      const [filePath, originalPath] = filePart.includes(' -> ')
        ? [filePart.split(' -> ')[1], filePart.split(' -> ')[0]]
        : [filePart, undefined];

      const toStatus = (code: string): GitFileStatus => {
        switch (code) {
          case 'M': return 'modified';
          case 'A': return 'added';
          case 'D': return 'deleted';
          case 'R': return 'renamed';
          case 'C': return 'copied';
          case 'U': return 'unmerged';
          default:  return 'modified';
        }
      };

      if (x === '?' && y === '?') {
        untracked.push({ path: filePath.trim(), status: 'untracked', statusCode: '??' });
        continue;
      }

      if (x !== ' ' && x !== '?') {
        staged.push({
          path: filePath.trim(),
          originalPath: originalPath?.trim(),
          status: toStatus(x),
          statusCode: x,
        });
      }

      if (y !== ' ' && y !== '?') {
        unstaged.push({
          path: filePath.trim(),
          status: toStatus(y),
          statusCode: y,
        });
      }
    }

    // Last 10 commits
    let commits: { hash: string; shortHash: string; subject: string; author: string; relativeDate: string }[] = [];
    try {
      const logOutput = execSync(
        'git log -10 --pretty=format:"%H|%h|%s|%an|%cr"',
        { cwd: gitRoot, encoding: 'utf-8', maxBuffer: 1024 * 1024 }
      );
      commits = logOutput.split('\n').filter(Boolean).map(line => {
        const [hash, shortHash, subject, author, relativeDate] = line.split('|');
        return { hash, shortHash, subject: subject || '', author: author || '', relativeDate: relativeDate || '' };
      });
    } catch { /* ignore */ }

    // Stash count
    let stashCount = 0;
    try {
      const stashList = execSync('git stash list', { cwd: gitRoot, encoding: 'utf-8' });
      stashCount = stashList.trim() ? stashList.trim().split('\n').length : 0;
    } catch { /* ignore */ }

    return NextResponse.json({
      isGitRepo: true,
      branch,
      remoteBranch,
      ahead,
      behind,
      staged,
      unstaged,
      untracked,
      commits,
      stashCount,
      workspacePath: gitRoot,
      stagedCount: staged.length,
      unstagedCount: unstaged.length + untracked.length,
    });
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
