import { NextResponse } from 'next/server';
import { readdirSync, statSync, existsSync } from 'fs';
import { join, normalize, basename } from 'path';
import ctx from '@/lib/context';
import { getRecentProjects } from '@/lib/cdp/recent-projects';

export const dynamic = 'force-dynamic';

export interface WorkspaceNode {
  name: string;
  path: string;       // relative to workspace root — always forward-slashes
  type: 'file' | 'dir';
  children?: WorkspaceNode[];
  size?: number;
  ext?: string;
}

// Directories to always skip
const SKIP_DIRS = new Set([
  'node_modules', '.git', '.next', '.cache', 'dist', 'build',
  '__pycache__', '.venv', 'venv', '.tox', '.mypy_cache',
  '.pytest_cache', '.eggs', 'coverage', '.turbo', '.vercel',
]);

const MAX_DEPTH = 4;
const MAX_ENTRIES_PER_DIR = 150;

/** Normalize a path to always use forward-slashes (works on Windows too) */
function toForwardSlash(p: string): string {
  return p.replace(/\\/g, '/');
}

function buildTree(absPath: string, relPath: string, depth: number): WorkspaceNode[] {
  if (depth > MAX_DEPTH) return [];

  let entries;
  try {
    entries = readdirSync(absPath, { withFileTypes: true });
  } catch {
    return [];
  }

  // Sort: dirs first, then files, alphabetically (case-insensitive)
  entries.sort((a, b) => {
    if (a.isDirectory() && !b.isDirectory()) return -1;
    if (!a.isDirectory() && b.isDirectory()) return 1;
    return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
  });

  const result: WorkspaceNode[] = [];

  for (const entry of entries.slice(0, MAX_ENTRIES_PER_DIR)) {
    // Skip hidden files (except .env*) and skip dirs
    if (entry.name.startsWith('.') && !entry.name.startsWith('.env')) continue;

    const childAbs = join(absPath, entry.name);
    // Always use forward slashes in returned paths
    const childRel = relPath ? `${relPath}/${entry.name}` : entry.name;

    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name.toLowerCase())) continue;
      result.push({
        name: entry.name,
        path: childRel,
        type: 'dir',
        children: buildTree(childAbs, childRel, depth + 1),
      });
    } else if (entry.isFile()) {
      let size: number | undefined;
      let ext: string | undefined;
      try {
        size = statSync(childAbs).size;
      } catch { /* ignore */ }
      const dotIdx = entry.name.lastIndexOf('.');
      if (dotIdx > 0) ext = entry.name.slice(dotIdx + 1).toLowerCase();

      result.push({ name: entry.name, path: childRel, type: 'file', size, ext });
    }
  }

  return result;
}

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
 * GET /api/v1/workspace/files
 *
 * Returns the directory tree for the currently active IDE workspace.
 * All path values use forward-slashes regardless of OS.
 * Skips node_modules, .git, .next, dist, etc.
 * Max depth: 4, max entries per dir: 150.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  // The client sends forward-slash paths; normalize to OS separator for fs ops
  const subPath = normalize(searchParams.get('path') || '');

  const workspacePath = resolveWorkspacePath() || process.cwd();
  const rootAbs = subPath && subPath !== '.' ? join(workspacePath, subPath) : workspacePath;

  if (!existsSync(rootAbs)) {
    return NextResponse.json({ error: 'Path not found', workspacePath }, { status: 404 });
  }

  // Use forward-slash relative path as root label base
  const fwdSubPath = toForwardSlash(subPath === '.' ? '' : subPath);
  const tree = buildTree(rootAbs, fwdSubPath, 0);

  // Return workspacePath with forward-slashes for display consistency
  const displayRoot = toForwardSlash(workspacePath);

  return NextResponse.json({
    workspacePath: displayRoot,
    rootLabel: fwdSubPath || basename(workspacePath) || displayRoot,
    tree,
  });
}
