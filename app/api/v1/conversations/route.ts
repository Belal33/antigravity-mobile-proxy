import { NextResponse } from 'next/server';
import { ensureCdpConnection } from '@/lib/init';
import ctx from '@/lib/context';
import os from 'os';
import path from 'path';
import fs from 'fs';
import { getIdeConversations } from '@/lib/scraper/ide-conversations';
import { filterConversationsByWorkspace } from '@/lib/scraper/workspace-filter';

export const dynamic = 'force-dynamic';

const BRAIN_DIR = path.join(os.homedir(), '.gemini', 'antigravity', 'brain');

function extractTitle(convDir: string): string | null {
  const taskFile = path.join(convDir, 'task.md');
  try {
    if (fs.existsSync(taskFile)) {
      const content = fs.readFileSync(taskFile, 'utf-8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (trimmed.startsWith('# ')) return trimmed.slice(2).trim();
      }
    }
  } catch { /* ignore */ }
  return null;
}

function getConversationFiles(convDir: string) {
  try {
    const results: any[] = [];
    const entries = fs.readdirSync(convDir, { recursive: true, withFileTypes: true });
    for (const d of entries) {
      if (!d.isFile() || !d.name.endsWith('.md')) continue;
      // @ts-ignore — Node 20+ uses parentPath
      const parentDir = d.parentPath || d.path || convDir;
      const fullPath = path.join(parentDir, d.name);
      const relPath = path.relative(convDir, fullPath).replace(/\\/g, '/');
      if (relPath.split('/').some(p => p.startsWith('.'))) continue;
      const stat = fs.statSync(fullPath);
      results.push({ name: relPath, size: stat.size, mtime: stat.mtime.toISOString() });
    }
    return results;
  } catch {
    return [];
  }
}

// Compute a simple word overlap score for fuzzy brain→IDE title matching
function getMatchScore(s1: string, s2: string): number {
  if (!s1 || !s2) return 0;
  const words1 = s1.toLowerCase().replace(/[^a-z0-9]/g, ' ').split(/\s+/).filter(w => w.length > 2);
  const words2 = s2.toLowerCase().replace(/[^a-z0-9]/g, ' ').split(/\s+/).filter(w => w.length > 2);
  if (words1.length === 0 || words2.length === 0) return 0;
  let matches = 0;
  for (const w of words1) if (words2.includes(w)) matches++;
  return matches / Math.min(words1.length, words2.length);
}

/**
 * GET /api/v1/conversations — list conversations from the IDE's history panel.
 *
 * Active conversation = the FIRST item in the IDE history dropdown (Antigravity convention).
 * We enrich each entry with brain metadata (files, mtime, brain UUID) when available.
 */
export async function GET() {
  await ensureCdpConnection();

  if (!ctx.workbenchPage) {
    return NextResponse.json({ conversations: [] });
  }

  try {
    // The scraper already marks index===0 as active — no additional heuristics needed.
    const ideConversations = await getIdeConversations(ctx);

    // Pre-calculate brain metadata to enrich IDE conversations with files/mtime/UUID
    const brainData: any[] = [];
    if (fs.existsSync(BRAIN_DIR)) {
      const entries = fs.readdirSync(BRAIN_DIR, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory() && !entry.name.startsWith('.')) {
          const dirPath = path.join(BRAIN_DIR, entry.name);
          const files = getConversationFiles(dirPath);
          const title = extractTitle(dirPath);
          const latestFileMtime = files.reduce((max, f) => {
            const t = new Date(f.mtime).getTime();
            return t > max ? t : max;
          }, 0);
          const dirMtime = fs.statSync(dirPath).mtimeMs;
          const mtime = new Date(latestFileMtime > 0 ? latestFileMtime : dirMtime).toISOString();
          brainData.push({ id: entry.name, title, files, mtime });
        }
      }
    }

    const conversations = ideConversations.map((c) => {
      // Try to find a matching brain entry for this IDE conversation title
      let mappedId = c.index.toString();
      let files: any[] = [];
      let mtime: string | undefined = undefined;

      let bestMatch: any = null;
      for (const bd of brainData) {
        if (!bd.title) continue;
        // Exact / substring match — prefer this over fuzzy
        if (bd.title === c.title || bd.title.includes(c.title) || c.title.includes(bd.title)) {
          mappedId = bd.id;
          files = bd.files;
          mtime = bd.mtime;
          bestMatch = null; // clear fuzzy candidate — exact wins
          break;
        }
        const score = getMatchScore(bd.title, c.title);
        const bdtime = new Date(bd.mtime).getTime();
        if (score > 0 && (!bestMatch || score > bestMatch.score || (score === bestMatch.score && bdtime > bestMatch.time))) {
          bestMatch = { ...bd, score, time: bdtime };
        }
      }

      if (mappedId === c.index.toString() && bestMatch && bestMatch.score >= 0.2) {
        mappedId = bestMatch.id;
        files = bestMatch.files;
        mtime = bestMatch.mtime;
      }

      return {
        id: mappedId,
        title: c.title,
        // Trust the scraper: active === (index === 0)
        active: c.active,
        index: c.index,
        files,
        mtime,
      };
    });

    // Filter to only conversations related to the active window's project
    const activeWindowTitle = ctx.allWorkbenches[ctx.activeWindowIdx]?.title;
    const filtered = filterConversationsByWorkspace(conversations, activeWindowTitle);

    return NextResponse.json({ conversations: filtered });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
