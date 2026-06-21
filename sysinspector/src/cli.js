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
};


/**
 * Pretty-prints a system-info object to stdout in a human-readable format.
 */
function printSystemInfo(info) {
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║  SysInspector — System Snapshot                         ║');
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
function startInteractiveMenu({ dir }) {
  const fileOps = new FileOps(dir);

  let rl = readline.createInterface({
    input:  process.stdin,
    output: process.stdout,
  });

  let ask = (question) => new Promise((resolve) => rl.question(question, resolve));

  const MENU = `
┌───────────────────────────────────────────┐
│  SysInspector  — Interactive Menu         │
├───────────────────────────────────────────┤
│  1) Show system info (console)            │
│  2) Export system info as JSON file       │
│  3) List files in sandbox directory       │
│  4) Create a new file                     │
│  5) Read a file                           │
│  6) Update (overwrite) a file  [confirm]  │
│  7) Delete a file              [confirm]  │
│  8) Show session changelog                │
│  9) Open Cross-Platform File Manager      │
│  0) Exit                                  │
└───────────────────────────────────────────┘`;

  async function handleChoice(choice) {
    switch (choice.trim()) {

      // ── Show system info ─────────────────────────────────────────────
      case '1': {
        const info = gatherSystemInfo();
        printSystemInfo(info);
        break;
      }

      // ── Export system info as JSON ────────────────────────────────────
      case '2': {
        const info     = gatherSystemInfo();
        const fileName = `sysinfo-${Date.now()}.json`;
        // Write to sandbox root via FileOps (counts as a create)
        try {
          fileOps.create(fileName, JSON.stringify(info, null, 2));
          console.log(`\n  ✔ Exported to ${path.join(fileOps.root, fileName)}`);
        } catch (err) {
          // FileOps.create would log to changelog; fallback: write directly
          const absPath = path.join(fileOps.root, fileName);
          fs.writeFileSync(absPath, JSON.stringify(info, null, 2), 'utf8');
          console.log(`\n  ✔ Exported to ${absPath}`);
        }
        break;
      }

      // ── List files ────────────────────────────────────────────────────
      case '3': {
        const subDir = (await ask('  Sub-directory to list [.]: ')) || '.';
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

      // ── Create file ───────────────────────────────────────────────────
      case '4': {
        const relPath = await ask('  File path (relative to sandbox): ');
        if (!relPath) { console.log('  Cancelled.\n'); break; }
        const content = await ask('  Content: ');
        fileOps.create(relPath, content);
        console.log(`  ✔ Created: ${relPath}\n`);
        break;
      }

      // ── Read file ─────────────────────────────────────────────────────
      case '5': {
        const relPath = await ask('  File path (relative to sandbox): ');
        if (!relPath) { console.log('  Cancelled.\n'); break; }
        const content = fileOps.read(relPath);
        console.log(`\n  ─── ${relPath} ───`);
        console.log(content);
        console.log(`  ─── end ───\n`);
        break;
      }

      // ── Update (overwrite) file — requires typed YES ─────────────────
      case '6': {
        const relPath = await ask('  File path (relative to sandbox): ');
        if (!relPath) { console.log('  Cancelled.\n'); break; }
        const newContent = await ask('  New content: ');
        const confirmation = await ask(
          `  ⚠  This will OVERWRITE "${relPath}". Type YES to confirm: `
        );
        if (confirmation !== 'YES') {
          console.log('  Aborted — confirmation was not "YES".\n');
          break;
        }
        fileOps.update(relPath, newContent, true);
        console.log(`  ✔ Updated: ${relPath}\n`);
        break;
      }

      // ── Delete file — requires typed YES ─────────────────────────────
      case '7': {
        const relPath = await ask('  File path (relative to sandbox): ');
        if (!relPath) { console.log('  Cancelled.\n'); break; }
        const confirmation = await ask(
          `  ⚠  This will DELETE "${relPath}". Type YES to confirm: `
        );
        if (confirmation !== 'YES') {
          console.log('  Aborted — confirmation was not "YES".\n');
          break;
        }
        fileOps.delete(relPath, true);
        console.log(`  ✔ Deleted: ${relPath}\n`);
        break;
      }

      // ── Show changelog ────────────────────────────────────────────────
      case '8': {
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

      // ── Open Cross-Platform File Manager ─────────────────────────────
      case '9': {
        rl.close();
        const { startFileManager } = require('../../filemanager/index.js');
        await startFileManager();

        // Recreate readline interface and ask helper
        rl = readline.createInterface({
          input:  process.stdin,
          output: process.stdout,
        });
        ask = (question) => new Promise((resolve) => rl.question(question, resolve));
        break;
      }

      // ── Exit ──────────────────────────────────────────────────────────
      case '0': {
        console.log(color.green('\n  Goodbye!\n'));
        rl.close();
        return false; // signal loop exit
      }

      default:
        console.log(color.red('  Unknown option. Try again.\n'));
    }
    return true; // continue loop
  }

  async function loop() {
    console.log(`\n  Sandbox root: ${color.cyan(fileOps.root)}\n`);
    let running = true;
    while (running) {
      console.log(color.green(MENU));
      const choice = await ask(color.bold('  Enter choice [0-9]: '));
      try {
        running = await handleChoice(choice);
      } catch (err) {
        // Surface the error but stay in the menu so the user can recover
        console.log(`\n  ${color.red('Error:')} ${err.message}\n`);
      }
    }
  }

  return loop();
}

module.exports = { startInteractiveMenu, printSystemInfo };

