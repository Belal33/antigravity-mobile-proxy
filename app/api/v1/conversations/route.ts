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
  let title = null;
  try {
    if (fs.existsSync(taskFile)) {
      const content = fs.readFileSync(taskFile, 'utf-8');
      const lines = content.split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('# ')) {
          title = trimmed.slice(2).trim();
          break;
        }
      }
    }
  } catch { /* ignore */ }
  return title;
}

function getConversationFiles(convDir: string) {
  try {
    const results: any[] = [];
    const entries = fs.readdirSync(convDir, { recursive: true, withFileTypes: true });
    for (const d of entries) {
      if (!d.isFile() || !d.name.endsWith('.md')) continue;
      
      // Node 20+ uses parentPath, older Node might use path. Fallback to convDir just in case
      // @ts-ignore
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

// Compute a simple word overlap score for fuzzy string matching
function getMatchScore(s1: string, s2: string): number {
  if (!s1 || !s2) return 0;
  const words1 = s1.toLowerCase().replace(/[^a-z0-9]/g, ' ').split(/\s+/).filter(w => w.length > 2);
  const words2 = s2.toLowerCase().replace(/[^a-z0-9]/g, ' ').split(/\s+/).filter(w => w.length > 2);
  
  if (words1.length === 0 || words2.length === 0) return 0;
  
  let matches = 0;
  for (const w of words1) {
    if (words2.includes(w)) matches++;
  }
  return matches / Math.min(words1.length, words2.length);
}

/**
 * GET /api/v1/conversations — list conversations from the IDE's history panel.
 * These are per-window (only shows conversations for the active window).
 */
export async function GET() {
  await ensureCdpConnection();

  if (!ctx.workbenchPage) {
    return NextResponse.json({ conversations: [] });
  }

  try {
    const ideConversations = await getIdeConversations(ctx);

    // Get the globally active backend title
    let globalActiveTitle: string | null = ctx.activeTitle || null;
    if (ctx.activeConversationId) {
        const dirPath = path.join(BRAIN_DIR, ctx.activeConversationId);
        const title = extractTitle(dirPath);
        if (title) globalActiveTitle = title;
    }

    // Pre-calculate BRAIN metadata so we can map it to IDE conversations
    const brainData: any[] = [];
    if (fs.existsSync(BRAIN_DIR)) {
      const entries = fs.readdirSync(BRAIN_DIR, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory() && !entry.name.startsWith('.')) {
          const dirPath = path.join(BRAIN_DIR, entry.name);
          const files = getConversationFiles(dirPath);
          const title = extractTitle(dirPath);
          // Use max file mtime; fall back to directory stat when no tracked files exist yet
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

    let foundActive = false;
    let conversations = ideConversations.map((c) => {
      // Map IDE title back to Brain first, so we can also check by brain ID
      let mappedId = c.index.toString();
      let files: any[] = [];
      let mtime: string | undefined = undefined;

      let bestMatch: any = null;
      for (const bd of brainData) {
          if (!bd.title) continue;
          if (bd.title === c.title || bd.title.includes(c.title) || c.title.includes(bd.title)) {
              mappedId = bd.id;
              files = bd.files;
              mtime = bd.mtime;
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

      // Mark active: match by brain ID first (most reliable), then by title
      const isActive = (ctx.activeConversationId && mappedId === ctx.activeConversationId)
        || (globalActiveTitle
          ? (c.title === globalActiveTitle || c.title.includes(globalActiveTitle) || globalActiveTitle.includes(c.title))
          : c.active);
      if (isActive) foundActive = true;

      return {
        id: mappedId,
        title: c.title,
        active: isActive,
        index: c.index,
        files,
        mtime
      };
    });

    // If the globally active conversation isn't in the IDE dropdown yet, but we know it's active
    if (!foundActive && globalActiveTitle) {
        let files: any[] = [];
        let mtime: string | undefined = undefined;
        let mappedId = '-1';
        
        if (ctx.activeConversationId) {
            const bd = brainData.find(b => b.id === ctx.activeConversationId);
            if (bd) {
                mappedId = bd.id;
                files = bd.files;
                mtime = bd.mtime;
            }
        }

        conversations.unshift({
            id: mappedId,
            title: globalActiveTitle,
            active: true,
            index: -1,
            files,
            mtime
        });
    }

    // Fallback: if nothing is active, default back to the first one like the IDE does
    if (!foundActive && conversations.length > 0 && !globalActiveTitle) {
        conversations[0].active = true;
    }

    // Filter conversations to only show those related to the active window's project
    const activeWindowTitle = ctx.allWorkbenches[ctx.activeWindowIdx]?.title;
    const filtered = filterConversationsByWorkspace(conversations, activeWindowTitle);

    return NextResponse.json({ conversations: filtered });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
