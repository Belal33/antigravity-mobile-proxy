/**
 * Recent Projects Reader (Cross-Platform)
 * 
 * Reads Antigravity's workspaceStorage to discover recently opened projects.
 * Each workspace entry is stored as a subdirectory containing a workspace.json
 * with the folder URI.
 * 
 * Config paths by OS:
 *   Linux:   ~/.config/Antigravity/User/workspaceStorage/
 *   macOS:   ~/Library/Application Support/Antigravity/User/workspaceStorage/
 *   Windows: %APPDATA%/Antigravity/User/workspaceStorage/
 */

import { readdirSync, readFileSync, statSync, existsSync } from 'fs';
import { join, basename } from 'path';
import { homedir } from 'os';
import { logger } from '../logger';

export interface RecentProject {
  /** Absolute filesystem path to the project directory */
  path: string;
  /** Short display name (last segment of the path) */
  name: string;
  /** ISO timestamp of last time this workspace was active */
  lastOpened: string;
}

/**
 * Resolve the Antigravity workspaceStorage directory based on the OS.
 */
function getWorkspaceStoragePath(): string {
  const home = homedir();
  const platform = process.platform;

  if (platform === 'win32') {
    return join(process.env.APPDATA || join(home, 'AppData', 'Roaming'), 'Antigravity', 'User', 'workspaceStorage');
  }
  if (platform === 'darwin') {
    return join(home, 'Library', 'Application Support', 'Antigravity', 'User', 'workspaceStorage');
  }
  // Linux
  return join(process.env.XDG_CONFIG_HOME || join(home, '.config'), 'Antigravity', 'User', 'workspaceStorage');
}

/**
 * Read all workspace entries and return recent projects sorted by last-opened (desc).
 * 
 * Filters out:
 *  - Remote workspaces (vscode-remote://)
 *  - Playground directories (/.gemini/antigravity/playground/)
 *  - Directories that no longer exist on disk
 */
export function getRecentProjects(limit: number = 15): RecentProject[] {
  const storagePath = getWorkspaceStoragePath();

  if (!existsSync(storagePath)) {
    logger.warn(`[RecentProjects] Workspace storage not found at: ${storagePath}`);
    return [];
  }

  const entries: RecentProject[] = [];

  try {
    const dirs = readdirSync(storagePath, { withFileTypes: true });

    for (const dir of dirs) {
      if (!dir.isDirectory()) continue;

      const wsJsonPath = join(storagePath, dir.name, 'workspace.json');
      if (!existsSync(wsJsonPath)) continue;

      try {
        const raw = readFileSync(wsJsonPath, 'utf-8');
        const data = JSON.parse(raw);
        const folderUri: string | undefined = data.folder;

        if (!folderUri) continue;

        // Skip remote workspaces
        if (folderUri.startsWith('vscode-remote://')) continue;

        // Extract the filesystem path from file:// URI
        let fsPath: string;
        if (folderUri.startsWith('file://')) {
          fsPath = decodeURIComponent(new URL(folderUri).pathname);
          // On Windows, strip leading / from /C:/Users/...
          if (process.platform === 'win32' && fsPath.startsWith('/') && fsPath[2] === ':') {
            fsPath = fsPath.substring(1);
          }
        } else {
          fsPath = folderUri;
        }

        // Skip playground directories
        if (fsPath.includes('/playground/') || fsPath.includes('\\playground\\')) continue;

        // Skip directories that no longer exist
        try {
          const s = statSync(fsPath);
          if (!s.isDirectory()) continue;
        } catch {
          continue; // Directory doesn't exist anymore
        }

        // Use the workspace storage directory's mtime as lastOpened
        const dirPath = join(storagePath, dir.name);
        const dirStat = statSync(dirPath);

        entries.push({
          path: fsPath,
          name: basename(fsPath),
          lastOpened: dirStat.mtime.toISOString(),
        });
      } catch {
        // Skip malformed workspace.json files
      }
    }
  } catch (e: any) {
    logger.error(`[RecentProjects] Failed to read workspace storage: ${e.message}`);
    return [];
  }

  // Sort by lastOpened descending (most recent first)
  entries.sort((a, b) => new Date(b.lastOpened).getTime() - new Date(a.lastOpened).getTime());

  // Deduplicate by path (keep the most recent entry)
  const seen = new Set<string>();
  const deduped: RecentProject[] = [];
  for (const entry of entries) {
    if (!seen.has(entry.path)) {
      seen.add(entry.path);
      deduped.push(entry);
    }
  }

  return deduped.slice(0, limit);
}
