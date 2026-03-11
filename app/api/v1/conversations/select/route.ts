import { NextRequest, NextResponse } from 'next/server';
import { ensureCdpConnection } from '@/lib/init';
import ctx from '@/lib/context';
import { switchIdeConversation } from '@/lib/actions/switch-conversation';

import fs from 'fs';
import os from 'os';
import path from 'path';

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
  return matches / Math.min(words1.length, words2.length); // 0.0 to 1.0 (overlap ratio)
}

/**
 * POST /api/v1/conversations/select — switch conversation in the IDE.
 * Accepts { title: string }
 */
export async function POST(request: NextRequest) {
  await ensureCdpConnection();

  const body = await request.json();
  const { title } = body;
  if (!title) {
    return NextResponse.json({ error: 'title is required' }, { status: 400 });
  }

  if (!ctx.workbenchPage) {
    return NextResponse.json(
      { error: 'Not connected to Antigravity' },
      { status: 503 }
    );
  }

  try {
    // 1. Switch the IDE UI
    const success = await switchIdeConversation(ctx, title);

    // 2. Add memory cache of the selected title, in case we can't find the UUID
    ctx.activeTitle = title;
    ctx.activeConversationId = null; // Reset it

    // 3. Map the title back to a brain directory so the artifact panel works
    if (fs.existsSync(BRAIN_DIR)) {
        const entries = fs.readdirSync(BRAIN_DIR, { withFileTypes: true });
        
        let bestMatch: { id: string; score: number; mtime: number } | null = null;

        for (const entry of entries) {
            if (entry.isDirectory() && !entry.name.startsWith('.')) {
                const dirPath = path.join(BRAIN_DIR, entry.name);
                const convTitle = extractTitle(dirPath);
                
                if (convTitle) {
                    // Exact or substring match
                    if (convTitle === title || convTitle.includes(title) || title.includes(convTitle)) {
                        ctx.activeConversationId = entry.name;
                        break;
                    }

                    // Fuzzy match scoring
                    const score = getMatchScore(convTitle, title);
                    const mtime = fs.statSync(dirPath).mtimeMs;
                    if (score > 0 && (!bestMatch || score > bestMatch.score || (score === bestMatch.score && mtime > bestMatch.mtime))) {
                        bestMatch = { id: entry.name, score, mtime };
                    }
                }
            }
        }

        // 4. Fallback to best fuzzy match if no exact match found
        if (!ctx.activeConversationId && bestMatch && bestMatch.score >= 0.2) {
            ctx.activeConversationId = bestMatch.id;
        }
    }

    return NextResponse.json({ success, title, activeConversationId: ctx.activeConversationId });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
