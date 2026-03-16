import { NextResponse } from 'next/server';
import { ensureCdpConnection } from '@/lib/init';
import ctx from '@/lib/context';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { getIdeArtifacts } from '@/lib/scraper/ide-artifacts';

export const dynamic = 'force-dynamic';

const BRAIN_DIR = path.join(os.homedir(), '.gemini', 'antigravity', 'brain');

/**
 * Scan a brain conversation directory recursively for artifact files.
 * Returns .md files, skipping hidden directories like .system_generated.
 */
function scanBrainDir(convId: string) {
  const convDir = path.join(BRAIN_DIR, convId);
  if (!fs.existsSync(convDir)) return [];

  const files: any[] = [];
  try {
    const entries = fs.readdirSync(convDir, { recursive: true, withFileTypes: true });
    for (const d of entries) {
      if (!d.isFile() || !d.name.endsWith('.md')) continue;
      // @ts-ignore - Node 20+ parentPath
      const parentDir = d.parentPath || d.path || convDir;
      const fullPath = path.join(parentDir, d.name);
      const relPath = path.relative(convDir, fullPath).replace(/\\/g, '/');

      // Skip hidden folders like .system_generated
      if (relPath.split('/').some(p => p.startsWith('.'))) continue;

      try {
        const stats = fs.statSync(fullPath);
        files.push({
          name: relPath,
          size: stats.size,
          mtime: stats.mtime.toISOString(),
        });
      } catch { continue; }
    }
    files.sort((a, b) => new Date(b.mtime).getTime() - new Date(a.mtime).getTime());
  } catch { /* ignore */ }
  return files;
}

/**
 * GET /api/v1/artifacts/active — list artifacts for the active conversation.
 *
 * PRIMARY: Scrapes the IDE's artifact panel for the exact list of artifacts
 * the IDE knows about for the current conversation.
 *
 * FALLBACK: If CDP isn't available or scraping fails, falls back to scanning
 * the brain directory for the active conversation.
 */
export async function GET() {
  try {
    await ensureCdpConnection();

    // 1. Try the IDE scraper first — this gives us the correct conversation's artifacts
    if (ctx.workbenchPage) {
      try {
        const ideResult = await getIdeArtifacts(ctx);

        if (ideResult.artifacts.length > 0) {
          // Map IDE artifacts to the response format
          const files = ideResult.artifacts.map((a, idx) => ({
            name: a.name,
            size: 0, // Not available from IDE — will be populated if we match to brain
            mtime: a.lastUpdated || new Date().toISOString(),
            isFile: a.isFile,
            source: 'ide' as const,
          }));

          // Try to enrich with brain directory data if we can match the conversation
          if (ctx.activeConversationId) {
            const brainFiles = scanBrainDir(ctx.activeConversationId);
            for (const f of files) {
              const match = brainFiles.find(
                bf => bf.name === f.name || bf.name.endsWith('/' + f.name) || f.name.endsWith(bf.name)
              );
              if (match) {
                f.size = match.size;
                f.mtime = match.mtime;
              }
            }
          }

          return NextResponse.json({
            files,
            source: 'ide',
            conversationTitle: ideResult.conversationTitle,
            totalCount: ideResult.totalCount,
          });
        }
      } catch {
        // IDE scraping failed — fall through to brain directory
      }
    }

    // 2. Fallback: scan brain directory for the active conversation
    if (!ctx.activeConversationId) {
      // Auto-detect from most recently modified conversation dir
      ctx.activeConversationId = autoDetectActiveConversation();
    }

    if (!ctx.activeConversationId) {
      return NextResponse.json({ files: [], source: 'none' });
    }

    const files = scanBrainDir(ctx.activeConversationId);
    return NextResponse.json({ files, source: 'brain' });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/**
 * Auto-detect the most recently modified conversation directory.
 */
function autoDetectActiveConversation(): string | null {
  try {
    if (!fs.existsSync(BRAIN_DIR)) return null;
    const entries = fs.readdirSync(BRAIN_DIR, { withFileTypes: true });
    let latest: { id: string; mtime: number } | null = null;

    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
      const dirPath = path.join(BRAIN_DIR, entry.name);
      const stat = fs.statSync(dirPath);
      if (!latest || stat.mtimeMs > latest.mtime) {
        latest = { id: entry.name, mtime: stat.mtimeMs };
      }
    }
    return latest?.id ?? null;
  } catch {
    return null;
  }
}
