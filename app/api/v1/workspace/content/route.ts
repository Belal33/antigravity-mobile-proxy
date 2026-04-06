import { NextResponse } from 'next/server';
import { readFileSync, existsSync, statSync } from 'fs';
import { join, normalize, resolve } from 'path';
import ctx from '@/lib/context';
import { getRecentProjects } from '@/lib/cdp/recent-projects';

export const dynamic = 'force-dynamic';

const MAX_FILE_SIZE = 500 * 1024; // 500 KB

const BINARY_EXTENSIONS = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'ico',
  'woff', 'woff2', 'ttf', 'eot', 'otf',
  'zip', 'tar', 'gz', 'bz2', '7z', 'rar',
  'exe', 'dll', 'so', 'dylib',
  'pdf', 'docx', 'xlsx', 'pptx',
  'mp3', 'mp4', 'wav', 'ogg', 'webm',
  'db', 'sqlite',
  // .lock files can be large but are text — excluded from binary list
]);

const EXT_LANG: Record<string, string> = {
  ts: 'typescript', tsx: 'tsx', js: 'javascript', jsx: 'jsx',
  py: 'python', go: 'go', rs: 'rust', rb: 'ruby', java: 'java',
  c: 'c', cpp: 'cpp', cs: 'csharp', php: 'php', swift: 'swift', kt: 'kotlin',
  sh: 'bash', bash: 'bash', zsh: 'bash', ps1: 'powershell', bat: 'batch', cmd: 'batch',
  json: 'json', yaml: 'yaml', yml: 'yaml', toml: 'toml',
  css: 'css', scss: 'scss', sass: 'scss', less: 'less',
  html: 'html', htm: 'html', xml: 'xml',
  md: 'markdown', mdx: 'markdown',
  sql: 'sql', graphql: 'graphql', gql: 'graphql',
  env: 'bash', gitignore: 'bash', dockerfile: 'dockerfile',
};

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

/** Cross-platform path traversal check using resolve() */
function isWithinRoot(absFile: string, root: string): boolean {
  // resolve() normalizes separators and casing (on case-insensitive FSes)
  const resolvedFile = resolve(absFile);
  const resolvedRoot = resolve(root);
  // On Windows paths may differ only in case — use lowercase comparison
  const isWindows = process.platform === 'win32';
  const fileNorm = isWindows ? resolvedFile.toLowerCase() : resolvedFile;
  const rootNorm = isWindows ? resolvedRoot.toLowerCase() : resolvedRoot;
  return fileNorm.startsWith(rootNorm + (rootNorm.endsWith('\\') || rootNorm.endsWith('/') ? '' : isWindows ? '\\' : '/'))
      || fileNorm === rootNorm;
}

/**
 * GET /api/v1/workspace/content?path=<relative-path>
 *
 * Returns the text content of a file in the active workspace.
 * Cross-platform: works on Windows (backslash paths) and Linux (forward-slashes).
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const relPath = searchParams.get('path');

  if (!relPath) {
    return NextResponse.json({ error: 'path parameter required' }, { status: 400 });
  }

  const workspacePath = resolveWorkspacePath() || process.cwd();
  // normalize converts forward-slashes from the client into the OS separator
  const absPath = join(workspacePath, normalize(relPath));

  // Security: cross-platform path traversal check
  if (!isWithinRoot(absPath, workspacePath)) {
    return NextResponse.json({ error: 'Path traversal denied' }, { status: 403 });
  }

  if (!existsSync(absPath)) {
    return NextResponse.json({ error: 'File not found' }, { status: 404 });
  }

  const stat = statSync(absPath);
  if (!stat.isFile()) {
    return NextResponse.json({ error: 'Not a file' }, { status: 400 });
  }

  if (stat.size > MAX_FILE_SIZE) {
    return NextResponse.json({
      error: `File too large (${(stat.size / 1024).toFixed(0)} KB). Max 500 KB.`,
      size: stat.size,
      tooLarge: true,
    }, { status: 413 });
  }

  // Extract extension from the original relative path (forward-slash safe)
  const name = relPath.replace(/\\/g, '/').split('/').pop() || relPath;
  const dotIdx = name.lastIndexOf('.');
  const ext = dotIdx > 0 ? name.slice(dotIdx + 1).toLowerCase() : '';

  if (BINARY_EXTENSIONS.has(ext)) {
    return NextResponse.json({
      error: 'Binary file — cannot display content',
      binary: true,
      name,
      ext,
    }, { status: 415 });
  }

  let content: string;
  try {
    content = readFileSync(absPath, 'utf-8');
  } catch (e: any) {
    return NextResponse.json({ error: `Could not read file: ${e.message}`, binary: true }, { status: 500 });
  }

  const lang = EXT_LANG[ext] || EXT_LANG[name.toLowerCase()] || 'plaintext';

  return NextResponse.json({
    content,
    name,
    ext,
    lang,
    size: stat.size,
    lines: content.split('\n').length,
    workspacePath,
  });
}
