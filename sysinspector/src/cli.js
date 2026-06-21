const readline = require('readline');
const fs       = require('fs');
const path     = require('path');
const { gatherSystemInfo } = require('./sysinfo');
const { FileOps }           = require('./fileOps');

// Terminal visual styling helper
const color = {
  reset: '\x1b[0m',
  red: (str) => `\x1b[31m${str}\x1b[0m`,
  green: (str) => `\x1b[32m${str}\x1b[0m`,
  yellow: (str) => `\x1b[33m${str}\x1b[0m`,
  blue: (str) => `\x1b[34m${str}\x1b[0m`,
  magenta: (str) => `\x1b[35m${str}\x1b[0m`,
  cyan: (str) => `\x1b[36m${str}\x1b[0m`,
  white: (str) => `\x1b[37m${str}\x1b[0m`,
  bold: (str) => `\x1b[1m${str}\x1b[0m`,
  inverse: (str) => `\x1b[7m${str}\x1b[27m`,
};


/**
 * Pretty-prints a system-info object to stdout in a human-readable format.
 */
function printSystemInfo(info) {
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║  SysInspector — System Snapshot                          ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  console.log(`  Timestamp    : ${info.timestamp}`);
  console.log(`  Hostname     : ${info.hostname}`);
  console.log(`  OS           : ${info.os.type} ${info.os.release} (${info.os.platform}/${info.os.arch})`);
  console.log(`  Node.js      : ${info.nodeVersion}`);
  console.log(`  Uptime (s)   : ${info.uptimeSeconds}`);
  console.log(`  Home Dir     : ${info.homedir}`);
  console.log(`  CWD          : ${info.cwd}`);

  console.log('\n  CPU');
  console.log(`    Model      : ${info.cpu.model}`);
  console.log(`    Cores      : ${info.cpu.cores}`);
  console.log(`    Speed (MHz): ${info.cpu.speedMHz}`);

  console.log('\n  Memory');
  console.log(`    Total (MB) : ${info.memory.totalMB}`);
  console.log(`    Free  (MB) : ${info.memory.freeMB}`);
  console.log(`    Used  (%)  : ${info.memory.usedPercent}`);

  const envKeys = Object.keys(info.env);
  if (envKeys.length > 0) {
    console.log('\n  Environment (whitelisted)');
    for (const key of envKeys) {
      const display = key === 'PATH'
        ? info.env[key].split(path.delimiter).join(`\n${' '.repeat(15)}`)
        : info.env[key];
      console.log(`    ${key.padEnd(10)} : ${display}`);
    }
  }
  console.log();
}

/**
 * Launches the interactive readline menu loop.
 *
 * @param {object} options
 * @param {string} options.dir – sandbox root directory
 */
async function startInteractiveMenu({ dir }) {
  const fileOps = new FileOps(dir);

  // ── Menu items ─────────────────────────────────────────────────────────
  const MENU_ITEMS = [
    { label: 'Show system info (console)',       action: '1' },
    { label: 'Export system info as JSON file',   action: '2' },
    { label: 'List files in sandbox directory',   action: '3' },
    { label: 'Show session changelog',            action: '4' },
    { label: 'Open Cross-Platform File Manager',  action: '5' },
    { label: 'Exit',                              action: '6' },
  ];

  let selected = 0;
  let menuLineCount = 0;
  let rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  // ── Draw menu (redraws in-place via ANSI escape) ─────────────────────
  function drawMenu() {
    if (menuLineCount > 0) {
      process.stdout.write(`\x1b[${menuLineCount}A\x1b[J`);
    }
    let out = '';
    let lines = 0;
    out += `  Sandbox root: ${color.cyan(fileOps.root)}\n`;
    lines++;
    out += `  ${color.bold('↑/↓ or j/k to navigate · Enter to select · q to quit')}\n`;
    lines++;
    for (let i = 0; i < MENU_ITEMS.length; i++) {
      const item = MENU_ITEMS[i];
      if (i === selected) {
        out += color.inverse(color.cyan(`  ➤ ${item.label}           `)) + '\n';
      } else {
        out += `    ${item.label}\n`;
      }
      lines++;
    }
    process.stdout.write(out);
    menuLineCount = lines;
  }

  // ── Helper: get text input with raw-mode toggling ────────────────────
  async function getTextInput(prompt) {
    if (process.stdin.isTTY) process.stdin.setRawMode(false);
    rl.close();
    rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const askQ = (q) => new Promise((r) => rl.question(q, r));
    const result = await askQ(prompt);
    rl.close();
    if (process.stdin.isTTY) process.stdin.setRawMode(true);
    rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    return result;
  }

  // ── Action dispatcher ─────────────────────────────────────────────────
  async function executeAction(action) {
    console.log();

    switch (action) {
      // ── Show system info ────────────────────────────────────────────
      case '1': {
        const info = gatherSystemInfo();
        printSystemInfo(info);
        break;
      }

      // ── Export system info as JSON ──────────────────────────────────
      case '2': {
        const info = gatherSystemInfo();
        const fileName = `sysinfo-${Date.now()}.json`;
        try {
          fileOps.create(fileName, JSON.stringify(info, null, 2));
          console.log(`\n  ✔ Exported to ${path.join(fileOps.root, fileName)}`);
        } catch (err) {
          const absPath = path.join(fileOps.root, fileName);
          fs.writeFileSync(absPath, JSON.stringify(info, null, 2), 'utf8');
          console.log(`\n  ✔ Exported to ${absPath}`);
        }
        break;
      }

      // ── List files (needs text input for sub-directory) ─────────────
      case '3': {
        const subDir = (await getTextInput('  Sub-directory to list [.]: ')) || '.';
        const entries = fileOps.list(subDir);
        if (entries.length === 0) {
          console.log('  (empty directory)');
        } else {
          console.log(`\n  Entries in "${subDir}":`);
          for (const e of entries) {
            const icon = e.type === 'directory' ? '📁' : '📄';
            console.log(`    ${icon} ${e.name}  [${e.type}]`);
          }
        }
        console.log();
        break;
      }

      // ── Show changelog ──────────────────────────────────────────────
      case '4': {
        const log = fileOps.getChangelog();
        if (log.length === 0) {
          console.log('\n  (no actions recorded this session)\n');
        } else {
          console.log('\n  Session Changelog:');
          console.log('  ' + '─'.repeat(60));
          for (const entry of log) {
            console.log(
              `  [${entry.time}]  ${entry.action.toUpperCase().padEnd(7)}  ${entry.target}  — ${entry.detail}`
            );
          }
          console.log('  ' + '─'.repeat(60));
          console.log();
        }
        break;
      }

      // ── Open Cross-Platform File Manager ────────────────────────────
      case '5': {
        const { startFileManager } = require('../../filemanager/index.js');
        await startFileManager();
        // File manager closed its own rl; code below recreates ours
        break;
      }

      // ── Exit ────────────────────────────────────────────────────────
      case '6': {
        console.log(color.green('\n  Goodbye!\n'));
        return false;
      }
    }

    // Reset so next drawMenu doesn't try to clear action output
    menuLineCount = 0;

    // Restore keypress mode for menu
    rl.close();
    if (process.stdin.isTTY) process.stdin.setRawMode(true);
    rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    return true;
  }

  // ── Arrow-key navigation loop ────────────────────────────────────────
  function keypressLoop() {
    return new Promise((resolve) => {
      readline.emitKeypressEvents(process.stdin);
      if (process.stdin.isTTY) process.stdin.setRawMode(true);

      drawMenu();

      function onKeypress(str, key) {
        if (key.ctrl && key.name === 'c') {
          cleanup();
          console.log(color.green('\n  Goodbye!\n'));
          resolve(false);
          return;
        }

        const keyName = key.name || '';

        if (keyName === 'up' || str === 'k') {
          selected = (selected - 1 + MENU_ITEMS.length) % MENU_ITEMS.length;
          drawMenu();
        } else if (keyName === 'down' || str === 'j') {
          selected = (selected + 1) % MENU_ITEMS.length;
          drawMenu();
        } else if (keyName === 'return') {
          const chosen = MENU_ITEMS[selected].action;
          cleanup();
          executeAction(chosen).then(resolve);
        } else if (str === 'q') {
          cleanup();
          console.log(color.green('\n  Goodbye!\n'));
          resolve(false);
        }
        // All other keys (Tab, Escape, function keys, etc.) are ignored
      }

      function cleanup() {
        process.stdin.removeListener('keypress', onKeypress);
        if (process.stdin.isTTY) process.stdin.setRawMode(false);
        rl.close();
      }

      process.stdin.on('keypress', onKeypress);
    });
  }

  // ── Outer loop: menu → action → menu ─────────────────────────────────
  let running = true;
  while (running) {
    const shouldContinue = await keypressLoop();
    if (!shouldContinue) break;
    running = shouldContinue;
  }

  // Final cleanup — ensure terminal is never left in raw mode
  if (process.stdin.isTTY) process.stdin.setRawMode(false);
}

module.exports = { startInteractiveMenu, printSystemInfo };

