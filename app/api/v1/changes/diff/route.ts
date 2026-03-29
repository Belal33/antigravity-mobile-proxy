import { NextRequest, NextResponse } from 'next/server';
import { execSync } from 'child_process';
import path from 'path';
import { existsSync, readFileSync } from 'fs';
import ctx from '@/lib/context';
import { getRecentProjects } from '@/lib/cdp/recent-projects';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/changes/diff?filepath=…
 *
 * Returns the git diff for a specific file. Tries multiple strategies:
 *  1. Unstaged working-tree diff: `git diff -- <path>`
 *  2. Staged diff: `git diff --cached -- <path>`
 *  3. Last commit diff: `git diff HEAD~1 HEAD -- <path>`
 *  4. If all empty, returns full file content as "new file"
 *
 * The `filepath` is relative to the **IDE's active workspace**, not the proxy's
 * own cwd. We resolve the workspace path from the active window title and the
 * recent-projects list so git operations run in the correct repository.
 */
export async function GET(request: NextRequest) {
  const filepath = request.nextUrl.searchParams.get('filepath');
  if (!filepath) {
    return NextResponse.json({ error: 'Missing filepath parameter' }, { status: 400 });
  }

  // Security: block directory traversal
  if (filepath.includes('..')) {
    return NextResponse.json({ error: 'Invalid path' }, { status: 403 });
  }

  // ── Resolve the IDE's active workspace directory ──
  // The proxy runs from its own cwd, but files are from the IDE's project.
  // Extract the project name from the active window title (format: "project - Antigravity - file.md")
  // and look it up in recent projects for the actual filesystem path.
  const ideWorkspace = resolveIdeWorkspacePath();
  const workspaceCwd = ideWorkspace || process.cwd();

  // Try to find the git root from the workspace directory
  let gitRoot: string | null = null;
  try {
    gitRoot = execSync('git rev-parse --show-toplevel', { cwd: workspaceCwd, encoding: 'utf-8' }).trim();
  } catch {
    // Workspace is not a git repo.
    // If we resolved an IDE workspace, show file content directly from it.
    if (ideWorkspace) {
      return showFileAsNewDiff(ideWorkspace, filepath);
    }
    // Otherwise try with the filepath itself if it's absolute
    if (path.isAbsolute(filepath)) {
      try {
        gitRoot = execSync('git rev-parse --show-toplevel', { cwd: path.dirname(filepath), encoding: 'utf-8' }).trim();
      } catch { /* not a git repo */ }
    }
  }

  // ── Non-git workspace: show file content directly ──
  if (!gitRoot) {
    return showFileAsNewDiff(workspaceCwd, filepath);
  }

  // The IDE reports paths in several formats:
  //   - Relative to workspace: "src/components/foo.tsx"
  //   - With project folder prefix: "project/src/components/foo.tsx"
  //   - Absolute: "/home/user/repos/project/src/components/foo.tsx"
  let resolvedPath: string;
  if (path.isAbsolute(filepath)) {
    // Absolute path — try to make it relative to gitRoot
    if (filepath.startsWith(gitRoot)) {
      resolvedPath = path.relative(gitRoot, filepath);
    } else {
      return NextResponse.json({ diff: '', filename: path.basename(filepath), message: 'File is outside git repository' });
    }
  } else {
    // Strip the project folder name prefix if present
    // e.g. "project/src/foo.tsx" → "src/foo.tsx" when gitRoot ends with /project
    const gitRootBasename = path.basename(gitRoot);
    if (filepath.startsWith(gitRootBasename + '/')) {
      resolvedPath = filepath.substring(gitRootBasename.length + 1);
    } else {
      resolvedPath = filepath;
    }
  }

  const filename = path.basename(resolvedPath);

  // Try different diff strategies
  const strategies = [
    // 1. Unstaged changes
    `git diff -- "${resolvedPath}"`,
    // 2. Staged changes
    `git diff --cached -- "${resolvedPath}"`,
    // 3. Last commit
    `git diff HEAD~1 HEAD -- "${resolvedPath}"`,
    // 4. Last 2 commits
    `git diff HEAD~2 HEAD -- "${resolvedPath}"`,
  ];

  for (const cmd of strategies) {
    try {
      const diff = execSync(cmd, { cwd: gitRoot, encoding: 'utf-8', maxBuffer: 5 * 1024 * 1024 });
      if (diff.trim()) {
        return NextResponse.json({ diff, filename });
      }
    } catch {
      // Strategy failed, try next
    }
  }

  // 5. Fallback: show as new file if it exists (untracked)
  try {
    const fullPath = path.resolve(gitRoot, resolvedPath);
    // Security check
    if (!fullPath.startsWith(gitRoot)) {
      return NextResponse.json({ error: 'Path outside repository' }, { status: 403 });
    }
    if (existsSync(fullPath)) {
      const content = readFileSync(fullPath, 'utf-8');
      // Format as unified diff for new file
      const lines = content.split('\n');
      const diffLines = [
        `diff --git a/${resolvedPath} b/${resolvedPath}`,
        'new file mode 100644',
        `--- /dev/null`,
        `+++ b/${resolvedPath}`,
        `@@ -0,0 +1,${lines.length} @@`,
        ...lines.map((l: string) => `+${l}`),
      ];
      return NextResponse.json({ diff: diffLines.join('\n'), filename });
    }
  } catch {
    // Ignore
  }

  return NextResponse.json({ diff: '', filename, message: 'No changes found' });
}

/**
 * For non-git workspaces, resolve the file path and show its content
 * formatted as a unified "new file" diff.
 */
function showFileAsNewDiff(workspaceDir: string, filepath: string): NextResponse {
  const filename = path.basename(filepath);

  // Resolve the file — could be absolute, relative, or prefixed with project name
  let fullPath: string;
  if (path.isAbsolute(filepath)) {
    fullPath = filepath;
  } else {
    // Strip project folder prefix if present
    const wsBasename = path.basename(workspaceDir);
    const relativePath = filepath.startsWith(wsBasename + '/')
      ? filepath.substring(wsBasename.length + 1)
      : filepath;
    fullPath = path.resolve(workspaceDir, relativePath);
  }

  // Security: must be within the workspace
  if (!fullPath.startsWith(workspaceDir) && !path.isAbsolute(filepath)) {
    return NextResponse.json({ diff: '', filename, message: 'File is outside workspace' });
  }

  try {
    if (existsSync(fullPath)) {
      const content = readFileSync(fullPath, 'utf-8');
      const relPath = path.relative(workspaceDir, fullPath) || filepath;
      const lines = content.split('\n');
      const diffLines = [
        `diff --git a/${relPath} b/${relPath}`,
        'new file mode 100644',
        `--- /dev/null`,
        `+++ b/${relPath}`,
        `@@ -0,0 +1,${lines.length} @@`,
        ...lines.map((l: string) => `+${l}`),
      ];
      return NextResponse.json({ diff: diffLines.join('\n'), filename });
    }
  } catch { /* ignore */ }

  return NextResponse.json({ diff: '', filename, message: 'File not found' });
}

/**
 * Resolve the IDE's active workspace filesystem path.
 *
 * Strategy:
 *  1. Extract the project name from the active window title
 *     (format: "project - Antigravity - file.md")
 *  2. Look up that name in the recent-projects list to get the absolute path
 *  3. Verify the directory exists
 *
 * Returns null if we can't determine the workspace path.
 */
function resolveIdeWorkspacePath(): string | null {
  try {
    // Get the active window title from context
    const activeIdx = ctx.activeWindowIdx;
    const activeWb = ctx.allWorkbenches[activeIdx];
    const title = activeWb?.title || ctx.activeTitle || '';

    if (!title) return null;

    // Title format: "project - Antigravity - file.md"
    // The first segment before " - " is the project/folder name
    const projectName = title.split(' - ')[0]?.trim();
    if (!projectName) return null;

    // Look up the project name in recent projects
    const recentProjects = getRecentProjects(30);
    const match = recentProjects.find(p => p.name === projectName);
    if (match && existsSync(match.path)) {
      return match.path;
    }

    return null;
  } catch {
    return null;
  }
}

