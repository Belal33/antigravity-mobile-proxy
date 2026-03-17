import { NextRequest, NextResponse } from 'next/server';
import { execSync } from 'child_process';
import path from 'path';

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
 * The `filepath` is relative to the workspace root or can be the
 * path as reported by the IDE's Changes Overview (e.g.,
 * "antigravity-chat-proxy/components/artifact-panel.tsx").
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

  // Determine git repo root. The server runs from the project directory.
  const cwd = process.cwd();

  // Try to find the file path relative to git root
  let gitRoot: string;
  try {
    gitRoot = execSync('git rev-parse --show-toplevel', { cwd, encoding: 'utf-8' }).trim();
  } catch {
    return NextResponse.json({ error: 'Not a git repository' }, { status: 500 });
  }

  // The IDE reports paths like "antigravity-chat-proxy/components/artifact-panel.tsx"
  // or absolute paths like "/tmp/scrape-changes.js".
  // We need to resolve relative to git root.
  let resolvedPath: string;
  if (path.isAbsolute(filepath)) {
    // Absolute path — try to make it relative to gitRoot
    if (filepath.startsWith(gitRoot)) {
      resolvedPath = path.relative(gitRoot, filepath);
    } else {
      // File outside git — can't diff
      return NextResponse.json({ diff: '', filename: path.basename(filepath), message: 'File is outside git repository' });
    }
  } else {
    // The IDE path might include the project folder name as prefix
    // e.g. "antigravity-chat-proxy/components/artifact-panel.tsx"
    // The gitRoot is /home/belal/repos/ide_agent/antigravity-chat-proxy
    // So the relative path is "components/artifact-panel.tsx"
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
    const fs = require('fs');
    if (fs.existsSync(fullPath)) {
      const content = fs.readFileSync(fullPath, 'utf-8');
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
