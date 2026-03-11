/**
 * Antigravity Process Manager (Cross-Platform)
 * 
 * Manages the Antigravity IDE process lifecycle:
 * - Check if CDP server is active
 * - Start the Antigravity binary with remote debugging
 * - Open new windows in a specific directory
 * - Close individual windows
 * 
 * Supports: Linux, macOS, and Windows
 */

import { exec, spawn, ChildProcess } from 'child_process';
import { promisify } from 'util';
import { existsSync, statSync } from 'fs';
import { resolve } from 'path';
import { logger } from '../logger';

const execAsync = promisify(exec);

const CDP_PORT_RAW = process.env.CDP_PORT || '9223';
const CDP_PORT = parseInt(CDP_PORT_RAW, 10);
const IS_WIN = process.platform === 'win32';
const IS_MAC = process.platform === 'darwin';

/**
 * Resolve the Antigravity binary path based on the OS.
 * Can be overridden with ANTIGRAVITY_BINARY env var.
 */
function getAntigravityBinary(): string {
  // Allow explicit override via env
  if (process.env.ANTIGRAVITY_BINARY) {
    return process.env.ANTIGRAVITY_BINARY;
  }

  if (IS_WIN) {
    // Windows: check common install locations
    const candidates = [
      resolve(process.env.LOCALAPPDATA || '', 'Programs', 'Antigravity', 'Antigravity.exe'),
      resolve(process.env.PROGRAMFILES || 'C:\\Program Files', 'Google', 'Antigravity', 'Antigravity.exe'),
      resolve(process.env.PROGRAMFILES || 'C:\\Program Files', 'Antigravity', 'Antigravity.exe'),
    ];
    for (const candidate of candidates) {
      if (candidate && existsSync(candidate)) return candidate;
    }
    // Fallback — assume it's in PATH
    return 'Antigravity.exe';
  }

  if (IS_MAC) {
    // macOS: standard .app bundle location
    const macBinary = '/Applications/Antigravity.app/Contents/MacOS/Antigravity';
    if (existsSync(macBinary)) return macBinary;
    // Also check user Applications folder
    const userMacBinary = resolve(process.env.HOME || '', 'Applications', 'Antigravity.app', 'Contents', 'MacOS', 'Antigravity');
    if (existsSync(userMacBinary)) return userMacBinary;
    return macBinary; // fallback to standard path
  }

  // Linux
  return '/usr/share/antigravity/antigravity';
}

/**
 * Kill all existing Antigravity processes (cross-platform).
 */
async function killAllAntigravity(): Promise<void> {
  try {
    if (IS_WIN) {
      await execAsync('taskkill /F /IM Antigravity.exe 2>nul || exit 0');
    } else {
      await execAsync('killall antigravity 2>/dev/null || true');
    }
    logger.info('[ProcessManager] Killed existing Antigravity processes.');
    // Wait for process cleanup
    await new Promise(resolve => setTimeout(resolve, 1500));
  } catch {
    // Ignore errors - process might not exist
  }
}

/** Track spawned processes so we can clean up if needed */
let spawnedProcess: ChildProcess | null = null;

/**
 * Check if the CDP server is accessible by pinging /json endpoint.
 */
export async function isCdpServerActive(): Promise<{
  active: boolean;
  windowCount: number;
  error?: string;
}> {
  try {
    const response = await fetch(`http://localhost:${CDP_PORT}/json`);
    if (!response.ok) {
      return { active: false, windowCount: 0, error: `HTTP ${response.status}` };
    }
    const pages = await response.json() as any[];
    const workbenches = pages.filter(
      (p: any) => p.url?.includes('workbench.html') && !p.url?.includes('jetski')
    );
    return { active: true, windowCount: workbenches.length };
  } catch (e: any) {
    return { active: false, windowCount: 0, error: e.message };
  }
}

/**
 * Start the Antigravity binary with CDP enabled.
 * 
 * IMPORTANT: From the KI, we know that if ANY Antigravity window exists,
 * new windows will merge into the existing Electron process and immediately
 * shut down the CDP server. So we must ensure a clean slate.
 * 
 * @param projectDir - The directory to open in Antigravity
 * @param killExisting - If true, kill all existing Antigravity processes first
 */
export async function startCdpServer(
  projectDir: string = '.',
  killExisting: boolean = false,
): Promise<{
  success: boolean;
  message: string;
  pid?: number;
}> {
  // Check if CDP is already active
  const status = await isCdpServerActive();
  if (status.active) {
    return {
      success: true,
      message: `CDP server already active on port ${CDP_PORT} with ${status.windowCount} window(s).`,
    };
  }

  // Kill existing Antigravity instances if requested (required for clean CDP start)
  if (killExisting) {
    await killAllAntigravity();
  }

  const binaryPath = getAntigravityBinary();
  // resolve() handles both absolute ('/home/user/proj') and relative ('my-proj') paths correctly
  const absoluteDir = resolve(projectDir || '.');

  // Validate the directory exists
  try {
    const stat = statSync(absoluteDir);
    if (!stat.isDirectory()) {
      return { success: false, message: `"${absoluteDir}" is not a directory.` };
    }
  } catch {
    return { success: false, message: `Directory not found: "${absoluteDir}"` };
  }

  // Spawn the Antigravity binary
  try {
    logger.info(`[ProcessManager] Starting Antigravity: ${binaryPath} --remote-debugging-port=${CDP_PORT} --new-window ${absoluteDir}`);
    logger.info(`[ProcessManager] Platform: ${process.platform}, Binary: ${binaryPath}`);

    spawnedProcess = spawn(
      binaryPath,
      [`--remote-debugging-port=${CDP_PORT}`, '--new-window', absoluteDir],
      {
        detached: !IS_WIN, // detached not needed on Windows
        stdio: 'ignore',
        env: { ...process.env },
        // On Windows, use shell to resolve .exe correctly
        shell: IS_WIN,
      }
    );

    // Unref so the process doesn't keep Node alive
    spawnedProcess.unref();

    const pid = spawnedProcess.pid;

    spawnedProcess.on('error', (err) => {
      logger.error(`[ProcessManager] Antigravity process error: ${err.message}`);
      spawnedProcess = null;
    });

    spawnedProcess.on('exit', (code) => {
      logger.info(`[ProcessManager] Antigravity process exited with code ${code}`);
      spawnedProcess = null;
    });

    // Wait for CDP to become available (poll up to 15 seconds)
    const started = await waitForCdp(15000);
    if (started) {
      return {
        success: true,
        message: `Antigravity started with CDP on port ${CDP_PORT}.`,
        pid: pid || undefined,
      };
    } else {
      return {
        success: false,
        message: `Antigravity process started but CDP server did not become available on port ${CDP_PORT} within 15s.`,
        pid: pid || undefined,
      };
    }
  } catch (e: any) {
    logger.error(`[ProcessManager] Failed to start Antigravity: ${e.message}`);
    return {
      success: false,
      message: `Failed to start Antigravity: ${e.message}`,
    };
  }
}

/**
 * Open a new Antigravity window with a specified directory.
 * 
 * If CDP is already active (Antigravity is running), this will open
 * a new window in the existing Electron process.
 * If CDP is NOT active, it will start Antigravity fresh.
 */
export async function openNewWindow(projectDir: string): Promise<{
  success: boolean;
  message: string;
}> {
  // resolve() handles both absolute ('/home/user/proj') and relative ('my-proj') paths correctly
  const absoluteDir = resolve(projectDir);

  // Validate the directory exists before trying to open
  try {
    const stat = statSync(absoluteDir);
    if (!stat.isDirectory()) {
      return { success: false, message: `"${absoluteDir}" is not a directory. Please provide a folder path.` };
    }
  } catch {
    return { success: false, message: `Directory not found: "${absoluteDir}". Make sure the path exists.` };
  }

  const status = await isCdpServerActive();
  const binaryPath = getAntigravityBinary();

  if (status.active) {
    // Antigravity is already running — open a new window via CLI
    // This will open a new window in the same Electron process
    try {
      logger.info(`[ProcessManager] Opening new window for: ${absoluteDir}`);
      const child = spawn(
        binaryPath,
        ['--new-window', absoluteDir],
        {
          detached: !IS_WIN,
          stdio: 'ignore',
          env: { ...process.env },
          shell: IS_WIN,
        }
      );
      child.unref();

      // Wait for the new window to appear
      await new Promise(resolve => setTimeout(resolve, 3000));
      return {
        success: true,
        message: `Opened new window for "${absoluteDir}".`,
      };
    } catch (e: any) {
      return { success: false, message: `Failed to open window: ${e.message}` };
    }
  } else {
    // No CDP server — start fresh with this directory
    const result = await startCdpServer(projectDir, false);
    return { success: result.success, message: result.message };
  }
}

/**
 * Close a specific workbench window by its CDP page index.
 * Uses the CDP protocol to close the page's target.
 */
export async function closeWindow(targetId: string): Promise<{
  success: boolean;
  message: string;
}> {
  try {
    const response = await fetch(`http://localhost:${CDP_PORT}/json/close/${targetId}`);
    if (response.ok) {
      return { success: true, message: 'Window closed successfully.' };
    } else {
      return { success: false, message: `Failed to close window: HTTP ${response.status}` };
    }
  } catch (e: any) {
    return { success: false, message: `Failed to close window: ${e.message}` };
  }
}

/**
 * Get detailed info about all CDP targets (workbench windows).
 */
export async function getWindowTargets(): Promise<{
  targets: Array<{ id: string; title: string; url: string }>;
  error?: string;
}> {
  try {
    const response = await fetch(`http://localhost:${CDP_PORT}/json`);
    if (!response.ok) {
      return { targets: [], error: `HTTP ${response.status}` };
    }
    const pages = await response.json() as any[];
    const workbenches = pages
      .filter((p: any) => p.url?.includes('workbench.html') && !p.url?.includes('jetski'))
      .map((p: any) => ({
        id: p.id,
        title: p.title || 'Untitled',
        url: p.url,
      }));
    return { targets: workbenches };
  } catch (e: any) {
    return { targets: [], error: e.message };
  }
}

/**
 * Poll until CDP server is accessible.
 */
async function waitForCdp(timeoutMs: number): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const status = await isCdpServerActive();
    if (status.active) return true;
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  return false;
}
