#!/usr/bin/env node

const { spawn, execSync } = require('child_process');
const path = require('path');
const readline = require('readline');
const fs = require('fs');
const os = require('os');

// ── Colors & Formatting ─────────────────────────────────────────────────
const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  italic: '\x1b[3m',
  underline: '\x1b[4m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  magenta: '\x1b[35m',
  blue: '\x1b[34m',
  white: '\x1b[37m',
};

const fmt = {
  bold: (s) => `${c.bold}${s}${c.reset}`,
  dim: (s) => `${c.dim}${s}${c.reset}`,
  cyan: (s) => `${c.cyan}${s}${c.reset}`,
  green: (s) => `${c.green}${s}${c.reset}`,
  yellow: (s) => `${c.yellow}${s}${c.reset}`,
  red: (s) => `${c.red}${s}${c.reset}`,
  magenta: (s) => `${c.magenta}${s}${c.reset}`,
  blue: (s) => `${c.blue}${s}${c.reset}`,
  link: (s) => `${c.cyan}${c.underline}${s}${c.reset}`,
  success: (s) => `${c.green}✔${c.reset} ${s}`,
  error: (s) => `${c.red}✖${c.reset} ${s}`,
  warn: (s) => `${c.yellow}⚠${c.reset} ${s}`,
  info: (s) => `${c.cyan}ℹ${c.reset} ${s}`,
  step: (n, s) => `${c.dim}[${n}]${c.reset} ${s}`,
};

// ── Config file path ────────────────────────────────────────────────────
const CONFIG_DIR = path.join(os.homedir(), '.antigravity-chat-proxy');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');
const APP_DIR = path.join(CONFIG_DIR, 'app');

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
    }
  } catch {}
  return {};
}

function saveConfig(config) {
  try {
    if (!fs.existsSync(CONFIG_DIR)) {
      fs.mkdirSync(CONFIG_DIR, { recursive: true });
    }
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
  } catch {}
}

// ── Readline helpers ────────────────────────────────────────────────────
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function ask(question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => resolve(answer.trim()));
  });
}

async function askWithDefault(question, defaultVal) {
  const hint = defaultVal ? ` ${c.dim}(${defaultVal})${c.reset}` : '';
  const answer = await ask(`${question}${hint}: `);
  return answer || defaultVal || '';
}

async function askYesNo(question, defaultYes = true) {
  const hint = defaultYes ? `${c.dim}(Y/n)${c.reset}` : `${c.dim}(y/N)${c.reset}`;
  const answer = await ask(`${question} ${hint}: `);
  if (!answer) return defaultYes;
  return answer.toLowerCase().startsWith('y');
}

async function askPassword(question) {
  return new Promise((resolve) => {
    process.stdout.write(question);
    const stdin = process.stdin;
    const wasRaw = stdin.isRaw;

    if (stdin.isTTY) {
      stdin.setRawMode(true);
    }

    let input = '';
    const onData = (char) => {
      const s = char.toString();

      if (s === '\n' || s === '\r') {
        stdin.removeListener('data', onData);
        if (stdin.isTTY) {
          stdin.setRawMode(wasRaw || false);
        }
        process.stdout.write('\n');
        resolve(input.trim());
        return;
      }

      if (s === '\u0003') {
        process.stdout.write('\n');
        process.exit(0);
      }

      if (s === '\u007f' || s === '\b') {
        if (input.length > 0) {
          input = input.slice(0, -1);
          process.stdout.write('\b \b');
        }
        return;
      }

      input += s;
      process.stdout.write('•');
    };

    stdin.resume();
    stdin.on('data', onData);
  });
}

function printSeparator() {
  console.log(c.dim + '  ─────────────────────────────────────────────' + c.reset);
}

function clearLine() {
  process.stdout.write('\x1b[2K\r');
}

// ── Banner ──────────────────────────────────────────────────────────────
function printBanner() {
  console.log('');
  console.log(`  ${c.bold}${c.cyan}╔═══════════════════════════════════════════════════════╗${c.reset}`);
  console.log(`  ${c.bold}${c.cyan}║${c.reset}  ${c.bold}🚀 Antigravity Chat Proxy${c.reset}                           ${c.bold}${c.cyan}║${c.reset}`);
  console.log(`  ${c.bold}${c.cyan}║${c.reset}  ${c.dim}Secure tunnel to your IDE with Google OAuth${c.reset}          ${c.bold}${c.cyan}║${c.reset}`);
  console.log(`  ${c.bold}${c.cyan}╚═══════════════════════════════════════════════════════╝${c.reset}`);
  console.log('');
}

// ── CLI Arg Parsing ─────────────────────────────────────────────────────
function parseArgs() {
  const args = process.argv.slice(2);
  const parsed = {};

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--email' && args[i + 1]) parsed.email = args[++i];
    else if (args[i] === '--port' && args[i + 1]) parsed.port = args[++i];
    else if (args[i] === '--authtoken' && args[i + 1]) parsed.authtoken = args[++i];
    else if (args[i] === '--no-tunnel') parsed.noTunnel = true;
    else if (args[i] === '--help') parsed.help = true;
    else if (args[i] === '--reset') parsed.reset = true;
    else if (args[i] === '--non-interactive') parsed.nonInteractive = true;
  }

  return parsed;
}

function printHelp() {
  printBanner();
  console.log(`  ${fmt.bold('Usage:')}`);
  console.log(`    ${fmt.cyan('npx antigravity-chat-proxy')}                ${fmt.dim('# Interactive setup wizard')}`);
  console.log(`    ${fmt.cyan('npx antigravity-chat-proxy --email me@gmail.com')}  ${fmt.dim('# Skip wizard')}`);
  console.log('');
  console.log(`  ${fmt.bold('Options:')}`);
  console.log(`    ${fmt.cyan('--email')} <email>       Google email to allow access`);
  console.log(`    ${fmt.cyan('--port')} <number>       Local port (default: 5555)`);
  console.log(`    ${fmt.cyan('--authtoken')} <token>   ngrok authtoken`);
  console.log(`    ${fmt.cyan('--no-tunnel')}           Run locally without ngrok`);
  console.log(`    ${fmt.cyan('--reset')}               Reset saved configuration`);
  console.log(`    ${fmt.cyan('--help')}                Show this help`);
  console.log('');
  console.log(`  ${fmt.bold('Environment Variables:')}`);
  console.log(`    ${fmt.cyan('NGROK_AUTHTOKEN')}       Your ngrok authtoken`);
  console.log('');
  console.log(`  ${fmt.bold('First-time setup?')} Just run ${fmt.cyan('npx antigravity-chat-proxy')} and follow the wizard!`);
  console.log('');
}

// ── Check if ngrok authtoken exists ─────────────────────────────────────
function detectAuthtoken() {
  if (process.env.NGROK_AUTHTOKEN) {
    return { token: process.env.NGROK_AUTHTOKEN, source: 'environment variable' };
  }

  const config = loadConfig();
  if (config.authtoken) {
    return { token: config.authtoken, source: 'saved config' };
  }

  const ngrokConfigPaths = [
    path.join(os.homedir(), '.config', 'ngrok', 'ngrok.yml'),
    path.join(os.homedir(), '.ngrok2', 'ngrok.yml'),
    path.join(os.homedir(), 'Library', 'Application Support', 'ngrok', 'ngrok.yml'),
  ];

  for (const configPath of ngrokConfigPaths) {
    try {
      if (fs.existsSync(configPath)) {
        const content = fs.readFileSync(configPath, 'utf-8');
        const match = content.match(/authtoken:\s*(.+)/);
        if (match && match[1].trim()) {
          return { token: match[1].trim(), source: `ngrok config (${configPath})` };
        }
      }
    } catch {}
  }

  return null;
}

// ── Interactive Setup Wizard ────────────────────────────────────────────
async function runWizard(cliArgs) {
  printBanner();

  const config = loadConfig();
  const isFirstRun = !config.email && !config.port;

  if (isFirstRun) {
    console.log(`  ${fmt.info('Welcome! Let\'s set up your Antigravity Chat Proxy.')}`);
    console.log(`  ${fmt.dim('This wizard will guide you through the configuration.')}`);
    console.log(`  ${fmt.dim('Your settings will be saved for next time.')}`);
    console.log('');
  } else {
    console.log(`  ${fmt.info('Welcome back! Loading your saved settings.')}`);
    console.log(`  ${fmt.dim('Press Enter to keep defaults, or type new values.')}`);
    console.log('');
  }

  printSeparator();

  // ── Step 1: ngrok Authtoken ───────────────────────────────────────
  console.log('');
  console.log(`  ${fmt.step('1/3', fmt.bold('ngrok Authentication'))}`);
  console.log('');

  const existingAuth = detectAuthtoken();
  let authtoken = null;

  if (existingAuth) {
    const masked = existingAuth.token.slice(0, 8) + '••••••••' + existingAuth.token.slice(-4);
    console.log(`  ${fmt.success(`Found authtoken from ${fmt.dim(existingAuth.source)}`)}`);
    console.log(`  ${fmt.dim('  Token:')} ${masked}`);
    console.log('');

    const useExisting = await askYesNo(`  Use this token?`);
    if (useExisting) {
      authtoken = existingAuth.token;
    }
  }

  if (!authtoken) {
    console.log('');
    console.log(`  ${fmt.warn('ngrok authtoken is required for tunneling.')}`);
    console.log('');
    console.log(`  ${fmt.bold('How to get your authtoken:')}`);
    console.log(`    ${fmt.cyan('1.')} Go to ${fmt.link('https://dashboard.ngrok.com/signup')}`);
    console.log(`    ${fmt.cyan('2.')} Sign up (it's free) or log in`);
    console.log(`    ${fmt.cyan('3.')} Go to ${fmt.link('https://dashboard.ngrok.com/authtokens')}`);
    console.log(`    ${fmt.cyan('4.')} Copy your authtoken`);
    console.log('');

    authtoken = await askPassword(`  ${fmt.cyan('?')} Paste your authtoken: `);

    if (!authtoken) {
      console.log('');
      console.log(`  ${fmt.error('Authtoken is required. Exiting.')}`);
      process.exit(1);
    }

    console.log(`  ${fmt.success('Authtoken received')}`);

    const shouldSave = await askYesNo(`  ${fmt.cyan('?')} Save authtoken for future use?`);
    if (shouldSave) {
      config.authtoken = authtoken;
      saveConfig(config);
      console.log(`  ${fmt.success(`Saved to ${fmt.dim(CONFIG_FILE)}`)}`);
    }
  }

  // ── Step 2: Email ─────────────────────────────────────────────────
  console.log('');
  printSeparator();
  console.log('');
  console.log(`  ${fmt.step('2/3', fmt.bold('Access Control'))}`);
  console.log(`  ${fmt.dim('  Only the specified Google email will be able to access your proxy.')}`);
  console.log('');

  const email = await askWithDefault(
    `  ${fmt.cyan('?')} Google email to allow`,
    config.email || ''
  );

  if (!email || !email.includes('@')) {
    console.log('');
    console.log(`  ${fmt.error('A valid email address is required.')}`);
    process.exit(1);
  }

  console.log(`  ${fmt.success(`Access restricted to ${fmt.cyan(email)}`)}`);

  // ── Step 3: Port ──────────────────────────────────────────────────
  console.log('');
  printSeparator();
  console.log('');
  console.log(`  ${fmt.step('3/3', fmt.bold('Server Configuration'))}`);
  console.log('');

  const port = await askWithDefault(
    `  ${fmt.cyan('?')} Local port for the server`,
    config.port || '5555'
  );

  console.log(`  ${fmt.success(`Server will run on port ${fmt.cyan(port)}`)}`);

  // ── Save config ───────────────────────────────────────────────────
  config.email = email;
  config.port = port;
  saveConfig(config);

  // ── Summary ───────────────────────────────────────────────────────
  console.log('');
  printSeparator();
  console.log('');
  console.log(`  ${fmt.bold('📋 Configuration Summary')}`);
  console.log('');
  console.log(`  ${fmt.dim('Server Port')}     ${fmt.cyan(port)}`);
  console.log(`  ${fmt.dim('Tunnel')}          ${fmt.green('ngrok + Google OAuth')}`);
  console.log(`  ${fmt.dim('Allowed Email')}   ${fmt.cyan(email)}`);
  console.log(`  ${fmt.dim('Authtoken')}       ${authtoken.slice(0, 8)}••••••••${authtoken.slice(-4)}`);
  console.log('');

  const proceed = await askYesNo(`  ${fmt.cyan('?')} Start the server?`);

  if (!proceed) {
    console.log('');
    console.log(`  ${fmt.dim('Settings saved. Run again anytime!')}`);
    rl.close();
    process.exit(0);
  }

  rl.close();

  return { email, port, authtoken };
}

// ── Project Setup (handles npx case) ────────────────────────────────────
function getPackageRoot() {
  return path.resolve(__dirname, '..');
}

function isInsideNodeModules(dir) {
  return dir.includes('node_modules');
}

function copyDirSync(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    // Skip node_modules, .next, .git
    if (['node_modules', '.next', '.git', '.env.local'].includes(entry.name)) continue;

    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function getPackageVersion() {
  try {
    const pkgPath = path.join(getPackageRoot(), 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    return pkg.version || '0.0.0';
  } catch {
    return '0.0.0';
  }
}

function prepareWorkingDirectory() {
  const packageRoot = getPackageRoot();

  // If running from the actual project (not node_modules), use it directly
  if (!isInsideNodeModules(packageRoot)) {
    return packageRoot;
  }

  // Running from npx/node_modules — copy to a working directory
  const currentVersion = getPackageVersion();
  const versionFile = path.join(APP_DIR, '.version');

  // Check if already set up with the same version
  let existingVersion = null;
  try {
    if (fs.existsSync(versionFile)) {
      existingVersion = fs.readFileSync(versionFile, 'utf-8').trim();
    }
  } catch {}

  if (existingVersion === currentVersion && fs.existsSync(path.join(APP_DIR, 'package.json'))) {
    console.log(`  ${fmt.success(`App v${currentVersion} already installed`)}`);
    return APP_DIR;
  }

  // Copy files to working directory
  console.log(`  ${fmt.dim('▸ Setting up app directory...')}`);

  // Clean old version if exists
  if (fs.existsSync(APP_DIR)) {
    fs.rmSync(APP_DIR, { recursive: true, force: true });
  }

  copyDirSync(packageRoot, APP_DIR);

  // Write version marker
  fs.writeFileSync(versionFile, currentVersion);

  console.log(`  ${fmt.success(`App files copied to ${fmt.dim(APP_DIR)}`)}`);

  // Install dependencies
  console.log(`  ${fmt.dim('▸ Installing dependencies (this may take a minute)...')}`);

  try {
    execSync('npm install --production', {
      cwd: APP_DIR,
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 120000,
    });
    console.log(`  ${fmt.success('Dependencies installed')}`);
  } catch (err) {
    console.log(`  ${fmt.error('Failed to install dependencies')}`);
    console.log(`  ${err.stderr ? err.stderr.toString() : err.message}`);
    process.exit(1);
  }

  return APP_DIR;
}

// ── Spawn helper (avoids shell: true deprecation) ───────────────────────
function spawnNext(args, cwd, stdio) {
  const nextBin = path.join(cwd, 'node_modules', '.bin', 'next');

  // Try local next binary first, fallback to npx
  if (fs.existsSync(nextBin)) {
    return spawn(nextBin, args, { cwd, stdio });
  }

  return spawn(process.execPath, [
    path.join(cwd, 'node_modules', 'next', 'dist', 'bin', 'next'),
    ...args,
  ], { cwd, stdio });
}

// ── Server Startup ──────────────────────────────────────────────────────
function startServer({ email, port, authtoken, noTunnel }) {
  console.log('');
  printSeparator();
  console.log('');
  console.log(`  ${fmt.bold('🔧 Starting up...')}`);
  console.log('');

  // Prepare working directory (handles npx case)
  const projectRoot = prepareWorkingDirectory();

  // ── Build ─────────────────────────────────────────────────────────
  process.stdout.write(`  ${fmt.dim('▸ Building Next.js app...')}`);

  const build = spawnNext(['build'], projectRoot, ['ignore', 'pipe', 'pipe']);

  let buildOutput = '';
  build.stdout.on('data', (data) => { buildOutput += data.toString(); });
  build.stderr.on('data', (data) => { buildOutput += data.toString(); });

  build.on('close', (code) => {
    clearLine();

    if (code !== 0) {
      console.log(`  ${fmt.error('Build failed!')}`);
      console.log('');
      console.log(buildOutput);
      process.exit(1);
    }

    console.log(`  ${fmt.success('Build complete')}`);

    // ── Start Next.js ─────────────────────────────────────────────
    process.stdout.write(`  ${fmt.dim('▸ Starting server on port ' + port + '...')}`);

    const nextServer = spawnNext(['start', '-p', port], projectRoot, ['ignore', 'pipe', 'pipe']);

    let serverStarted = false;

    nextServer.stdout.on('data', (data) => {
      const line = data.toString();
      if (!serverStarted && (line.includes('Ready') || line.includes('started') || line.includes(port))) {
        serverStarted = true;
        clearLine();
        console.log(`  ${fmt.success('Server running on port ' + port)}`);

        if (!noTunnel) {
          startTunnel({ port, email, authtoken, projectRoot });
        } else {
          printLocalOnly(port);
        }
      }
    });

    nextServer.stderr.on('data', (data) => {
      const line = data.toString().trim();
      if (line && line.toLowerCase().includes('error')) {
        console.log(`  ${fmt.dim('[next]')} ${line}`);
      }
    });

    nextServer.on('close', (exitCode) => {
      console.log(`\n  ${fmt.dim('Next.js server stopped.')}`);
      process.exit(exitCode);
    });

    // ── Graceful shutdown ─────────────────────────────────────────
    const cleanup = () => {
      console.log('');
      console.log(`  ${fmt.dim('👋 Shutting down...')}`);
      nextServer.kill();
      process.exit(0);
    };

    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);

    // Fallback: if we don't detect "Ready", start tunnel after timeout
    setTimeout(() => {
      if (!serverStarted) {
        serverStarted = true;
        clearLine();
        console.log(`  ${fmt.success('Server likely running on port ' + port)}`);
        if (!noTunnel) {
          startTunnel({ port, email, authtoken, projectRoot });
        } else {
          printLocalOnly(port);
        }
      }
    }, 8000);
  });
}

// ── Start ngrok Tunnel ──────────────────────────────────────────────────
async function startTunnel({ port, email, authtoken, projectRoot }) {
  process.stdout.write(`  ${fmt.dim('▸ Opening ngrok tunnel...')}`);

  try {
    // Try loading ngrok from the project's node_modules first
    let ngrok;
    const localNgrok = path.join(projectRoot, 'node_modules', '@ngrok', 'ngrok');
    try {
      ngrok = require(localNgrok);
    } catch {
      ngrok = require('@ngrok/ngrok');
    }

    const listener = await ngrok.forward({
      addr: parseInt(port, 10),
      authtoken: authtoken,
      oauth_provider: 'google',
      oauth_allow_emails: email,
    });

    clearLine();
    console.log(`  ${fmt.success('ngrok tunnel established')}`);

    const url = listener.url();

    console.log('');
    console.log(`  ${c.bold}${c.cyan}╔═══════════════════════════════════════════════════════╗${c.reset}`);
    console.log(`  ${c.bold}${c.cyan}║${c.reset}                                                       ${c.bold}${c.cyan}║${c.reset}`);
    console.log(`  ${c.bold}${c.cyan}║${c.reset}   ${c.green}${c.bold}🌐 Your app is live!${c.reset}                              ${c.bold}${c.cyan}║${c.reset}`);
    console.log(`  ${c.bold}${c.cyan}║${c.reset}                                                       ${c.bold}${c.cyan}║${c.reset}`);
    console.log(`  ${c.bold}${c.cyan}║${c.reset}   ${fmt.bold(url)}${' '.repeat(Math.max(0, 40 - url.length))}${c.bold}${c.cyan}║${c.reset}`);
    console.log(`  ${c.bold}${c.cyan}║${c.reset}                                                       ${c.bold}${c.cyan}║${c.reset}`);
    console.log(`  ${c.bold}${c.cyan}║${c.reset}   ${c.dim}🔒 Google OAuth → ${email}${' '.repeat(Math.max(0, 23 - email.length))}${c.reset}${c.bold}${c.cyan}║${c.reset}`);
    console.log(`  ${c.bold}${c.cyan}║${c.reset}                                                       ${c.bold}${c.cyan}║${c.reset}`);
    console.log(`  ${c.bold}${c.cyan}╚═══════════════════════════════════════════════════════╝${c.reset}`);
    console.log('');
    console.log(`  ${fmt.dim('Press Ctrl+C to stop.')}`);
    console.log('');

  } catch (err) {
    clearLine();
    console.log(`  ${fmt.error('ngrok tunnel failed!')}`);
    console.log('');
    console.log(`  ${fmt.red(err.message)}`);

    if (err.message.includes('authtoken') || err.message.includes('ERR_NGROK_')) {
      console.log('');
      console.log(`  ${fmt.warn('Your authtoken may be invalid or expired.')}`);
      console.log(`  ${fmt.dim('Get a new one at:')} ${fmt.link('https://dashboard.ngrok.com/authtokens')}`);
      console.log(`  ${fmt.dim('Then run:')} ${fmt.cyan('npx antigravity-chat-proxy --reset')}`);
    }

    console.log('');
  }
}

function printLocalOnly(port) {
  console.log('');
  console.log(`  ${c.bold}${c.cyan}╔═══════════════════════════════════════════════════════╗${c.reset}`);
  console.log(`  ${c.bold}${c.cyan}║${c.reset}                                                       ${c.bold}${c.cyan}║${c.reset}`);
  console.log(`  ${c.bold}${c.cyan}║${c.reset}   ${c.green}${c.bold}🖥  Running locally${c.reset}                               ${c.bold}${c.cyan}║${c.reset}`);
  console.log(`  ${c.bold}${c.cyan}║${c.reset}   ${fmt.cyan(`http://localhost:${port}`)}                            ${c.bold}${c.cyan}║${c.reset}`);
  console.log(`  ${c.bold}${c.cyan}║${c.reset}                                                       ${c.bold}${c.cyan}║${c.reset}`);
  console.log(`  ${c.bold}${c.cyan}╚═══════════════════════════════════════════════════════╝${c.reset}`);
  console.log('');
  console.log(`  ${fmt.dim('Press Ctrl+C to stop.')}`);
  console.log('');
}

// ── Main ────────────────────────────────────────────────────────────────
async function main() {
  const args = parseArgs();

  if (args.help) {
    printHelp();
    process.exit(0);
  }

  if (args.reset) {
    try {
      if (fs.existsSync(CONFIG_FILE)) {
        fs.unlinkSync(CONFIG_FILE);
        console.log(fmt.success('Configuration reset. Run again to reconfigure.'));
      } else {
        console.log(fmt.info('No saved configuration found.'));
      }
    } catch {}
    process.exit(0);
  }

  if (args.noTunnel) {
    printBanner();
    startServer({
      email: null,
      port: args.port || '5555',
      authtoken: null,
      noTunnel: true,
    });
    return;
  }

  if (args.nonInteractive || (args.email && (args.authtoken || process.env.NGROK_AUTHTOKEN))) {
    printBanner();
    const authtoken = args.authtoken || process.env.NGROK_AUTHTOKEN;
    const port = args.port || '5555';

    console.log(`  ${fmt.dim('Port:')}     ${fmt.cyan(port)}`);
    console.log(`  ${fmt.dim('Email:')}    ${fmt.cyan(args.email)}`);
    console.log(`  ${fmt.dim('Tunnel:')}   ${fmt.green('ngrok + Google OAuth')}`);
    console.log('');

    startServer({
      email: args.email,
      port,
      authtoken,
      noTunnel: false,
    });
    return;
  }

  try {
    const settings = await runWizard(args);
    startServer({
      email: settings.email,
      port: settings.port,
      authtoken: settings.authtoken,
      noTunnel: false,
    });
  } catch (err) {
    if (err.message === 'readline was closed') {
      process.exit(0);
    }
    console.error(`\n  ${fmt.error(err.message)}`);
    process.exit(1);
  }
}

main();
