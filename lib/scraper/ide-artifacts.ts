/**
 * Scrapes the artifact list directly from the Antigravity IDE's conversation panel.
 *
 * The IDE maintains a "tooltip-artifacts" toggle button in the input toolbar.
 * Clicking it reveals a section headed "Artifacts (N Files for Conversation)"
 * with rows showing artifact names and last-updated timestamps.
 *
 * IMPORTANT: The IDE's "Files for Conversation" list includes BOTH:
 *  - True artifacts (generated .md plans, analysis docs, etc.)
 *  - Project context files (.ts, .json, .js, etc. that the agent read/edited)
 *
 * We filter OUT project context files and only return true artifacts.
 */

import type { ProxyContext } from '../types';
import { logger } from '../logger';

export interface IdeArtifact {
  /** Display name, e.g. "task.md" or "Pricing Blue Cards" */
  name: string;
  /** Raw timestamp text from the IDE, e.g. "Mar 10 11:21 PM" */
  lastUpdated: string | null;
  /** Whether this looks like a file (has an extension) */
  isFile: boolean;
}

export interface IdeArtifactResult {
  /** Total count stated in the section header */
  totalCount: number;
  /** Scraped artifact entries (filtered to true artifacts only) */
  artifacts: IdeArtifact[];
  /** The conversation title at the time of scraping */
  conversationTitle: string | null;
}

/**
 * Checks whether a scraped name is a valid artifact name worth keeping.
 * Rejects:
 *  - Bare extensions like ".ts", ".json", ".md" (no basename before the dot)
 *  - Names with directory paths like "lib/foo.ts" (project source files)
 *  - Well-known project config files
 *  - Empty or whitespace-only names
 */
function isValidArtifactName(name: string): boolean {
  if (!name || !name.trim()) return false;

  // Reject bare extensions: ".ts", ".json", ".md" etc.
  // A valid filename must have at least one character before the dot
  if (/^\.\w+$/.test(name)) return false;

  // Reject names with directory separators — these are project file paths
  if (name.includes('/') || name.includes('\\')) return false;

  // Reject source code / project files by extension.
  // The IDE lists ALL files the conversation touched (source files it read/edited),
  // but those are NOT artifacts — artifacts are generated documents (.md plans, etc.).
  const dotIdx = name.lastIndexOf('.');
  if (dotIdx > 0) {
    const ext = name.substring(dotIdx).toLowerCase();
    const sourceExtensions = new Set([
      '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
      '.json', '.lock',
      '.css', '.scss', '.less', '.sass',
      '.html', '.htm',
      '.py', '.pyc', '.pyi',
      '.sh', '.bash', '.zsh', '.bat', '.cmd', '.ps1',
      '.yaml', '.yml', '.toml', '.ini', '.cfg',
      '.svg', '.png', '.jpg', '.jpeg', '.gif', '.ico', '.webp',
      '.woff', '.woff2', '.ttf', '.eot',
      '.map', '.d.ts',
      '.env', '.gitignore', '.npmignore', '.eslintrc',
      '.xml', '.sql', '.graphql', '.gql',
      '.go', '.rs', '.rb', '.java', '.kt', '.swift', '.c', '.cpp', '.h',
      '.vue', '.svelte', '.astro',
    ]);
    if (sourceExtensions.has(ext)) return false;
  }

  // Reject well-known project config files (without standard extensions)
  // Also reject common root-level project documentation files (.md files that aren't artifacts)
  const lower = name.toLowerCase();
  const configFiles = [
    'dockerfile', 'makefile', 'procfile', 'gemfile',
    'rakefile', 'vagrantfile', 'jenkinsfile',
    'readme.md', 'agents.md', 'claude.md', 'contributing.md',
    'license.md', 'changelog.md', 'code_of_conduct.md'
  ];
  if (configFiles.includes(lower)) return false;

  return true;
}

/**
 * Get the list of artifacts from the IDE's conversation panel.
 *
 * Strategy:
 *  1. Check whether the artifact section is already visible.
 *  2. If not, click `[data-tooltip-id="tooltip-artifacts"]` to toggle it open.
 *  3. Read the header count — if 0, return empty immediately.
 *  4. Parse the rows to extract artifact names and timestamps.
 *  5. Filter out project/context files — keep only true artifacts.
 *  6. Close the section again (toggle) to leave the IDE clean.
 */
export async function getIdeArtifacts(ctx: ProxyContext): Promise<IdeArtifactResult> {
  if (!ctx.workbenchPage) {
    logger.info('[IdeArtifacts] No active workbench page.');
    return { totalCount: 0, artifacts: [], conversationTitle: null };
  }

  try {
    const result = await ctx.workbenchPage.evaluate(async () => {
      const panel = document.querySelector('.antigravity-agent-side-panel');
      if (!panel) return { error: 'No agent panel found' };

      // Get current conversation title
      const titleEl = panel.querySelector('span.font-semibold.text-ide-text-color');
      const conversationTitle = titleEl?.textContent?.trim() || null;

      // Check whether the artifact section is already open
      const findArtifactHeader = (): Element | null => {
        for (const el of panel.querySelectorAll('*')) {
          const t = (el.textContent || '').trim();
          if (
            t.startsWith('Artifacts (') &&
            t.includes('Files') &&
            el.children.length <= 3
          ) {
            return el;
          }
        }
        return null;
      };

      let header = findArtifactHeader();
      let didOpen = false;

      if (!header) {
        // Click the artifact button to open the section
        const btn = panel.querySelector('[data-tooltip-id="tooltip-artifacts"]');
        if (!btn) return { error: 'No artifact button (tooltip-artifacts) found' };

        (btn as HTMLElement).click();
        await new Promise(r => setTimeout(r, 1500));
        header = findArtifactHeader();
        didOpen = true;
      }

      if (!header) {
        return { error: 'Artifact section did not appear after clicking' };
      }

      // Parse total count from header like "Artifacts (15 Files for Conversation)"
      const headerText = header.textContent?.trim() || '';
      const countMatch = headerText.match(/Artifacts\s*\((\d+)\s*Files?/i);
      const totalCount = countMatch ? parseInt(countMatch[1], 10) : 0;

      // If the header explicitly says 0 files, return early.
      // The IDE does not render the table headers ("Artifact Name", "Last Updated")
      // when there are 0 files, which would cause the loop below to walk up to the
      // panel root and scan the entire chat history for filenames.
      if (totalCount === 0) {
        if (didOpen) {
          const btn = panel.querySelector('[data-tooltip-id="tooltip-artifacts"]');
          if (btn) (btn as HTMLElement).click();
        }
        return { conversationTitle, totalCount: 0, artifacts: [] };
      }

      // Find the section container — walk up until we find the container
      // that holds the header AND the file rows
      let section = header as HTMLElement;
      for (let i = 0; i < 8; i++) {
        if (!section.parentElement) break;
        section = section.parentElement;
        const text = section.textContent || '';
        if (text.includes('Artifact Name') && text.includes('Last Updated')) {
          break;
        }
      }

      // Extract artifact rows — each row has a name and a date
      // Strategy: find all visible row-like flex containers within the section
      const rows = section.querySelectorAll(
        '.flex.w-full.flex-row.items-center.justify-between'
      );

      const artifacts: Array<{ name: string; lastUpdated: string | null }> = [];

      for (const row of rows) {
        const cells = row.children;
        if (cells.length < 2) continue;

        const nameText = (cells[0].textContent || '').trim();
        const dateText = (cells[1].textContent || '').trim();

        // Skip the header row itself
        if (nameText === 'Artifact Name' || !nameText) continue;

        artifacts.push({ name: nameText, lastUpdated: dateText || null });
      }

      // Fallback: if no rows found via flex layout, try extracting from text nodes
      if (artifacts.length === 0) {
        const walker = document.createTreeWalker(section, NodeFilter.SHOW_TEXT);
        const allTexts: string[] = [];
        while (walker.nextNode()) {
          const t = walker.currentNode.textContent?.trim();
          if (t && t.length > 0) allTexts.push(t);
        }

        for (let i = 0; i < allTexts.length; i++) {
          const text = allTexts[i];
          // Skip header/control texts
          if (
            text === 'Artifact Name' ||
            text === 'Last Updated' ||
            text.startsWith('Artifacts (') ||
            text === 'Review Changes'
          ) {
            continue;
          }

          // CRITICAL: Skip bare extensions like ".ts", ".json", ".md"
          // These are extension badge/icon text nodes, NOT real filenames.
          // A valid filename must have at least 1 char before the extension dot.
          if (/^\.\w+$/.test(text)) continue;

          // Check if this has a date pattern like "Mar 10 11:21 PM"
          const dateMatch = text.match(
            /\(([A-Z][a-z]{2}\s+\d{1,2}\s+\d{1,2}:\d{2}\s*(?:AM|PM)?)\)$/
          );
          if (dateMatch) {
            const name = text.replace(dateMatch[0], '').trim();
            if (name) {
              artifacts.push({ name, lastUpdated: dateMatch[1] });
            }
          } else if (
            // Must have at least 1 char before the dot (i.e. "task.md" not ".md")
            text.match(
              /^.+\.(md|json|txt|ts|tsx|js|jsx|css|html|yaml|yml|py|sh)$/
            )
          ) {
            const nextText = allTexts[i + 1] || '';
            const nextDate = nextText.match(
              /^[A-Z][a-z]{2}\s+\d{1,2}\s+\d{1,2}:\d{2}/
            );
            artifacts.push({
              name: text,
              lastUpdated: nextDate ? nextText : null,
            });
            if (nextDate) i++;
          }
        }
      }

      // Close the section if we opened it (toggle back)
      if (didOpen) {
        const btn = panel.querySelector('[data-tooltip-id="tooltip-artifacts"]');
        if (btn) (btn as HTMLElement).click();
      }

      // Also dump debug info so we can diagnose further if needed
      const debugInfo = {
        headerText,
        totalCount,
        sectionText: section.textContent?.substring(0, 500) || '',
        rowCount: rows.length,
        rawArtifactCount: artifacts.length,
      };
      (window as any).__lastArtifactDebug = debugInfo;

      return { conversationTitle, totalCount, artifacts };
    });

    if (result && 'error' in result) {
      logger.error(`[IdeArtifacts] ${result.error}`);
      return { totalCount: 0, artifacts: [], conversationTitle: null };
    }

    // Server-side filtering: only keep valid artifact names, deduplicated
    const allScraped = result?.artifacts || [];
    const seen = new Set<string>();
    const validArtifacts: IdeArtifact[] = [];

    for (const a of allScraped) {
      if (!isValidArtifactName(a.name)) {
        continue;
      }
      // Deduplicate by name (TreeWalker picks up same filename from multiple DOM positions)
      if (seen.has(a.name)) continue;
      seen.add(a.name);

      validArtifacts.push({
        name: a.name,
        lastUpdated: a.lastUpdated,
        isFile: /\.\w{1,5}$/.test(a.name),
      });
    }

    logger.info(
      `[IdeArtifacts] Scraped ${allScraped.length} raw entries, kept ${validArtifacts.length} valid artifacts (filtered ${allScraped.length - validArtifacts.length}) for "${result?.conversationTitle}"`
    );

    return {
      totalCount: validArtifacts.length,
      artifacts: validArtifacts,
      conversationTitle: result?.conversationTitle || null,
    };
  } catch (err: any) {
    logger.error(`[IdeArtifacts] Error scraping: ${err.message}`);
    return { totalCount: 0, artifacts: [], conversationTitle: null };
  }
}
