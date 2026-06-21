#!/usr/bin/env node

/**
 * SysInspector — entry point
 *
 * Usage:
 *   node src/index.js              → launch interactive menu
 *   node src/index.js info         → print system info (human-readable)
 *   node src/index.js info --json  → print system info (JSON)
 *   --dir <path>                   → override sandbox root (any mode)
 */

const path = require('path');
const { gatherSystemInfo }         = require('./sysinfo');
const { startInteractiveMenu, showOsInfo, showCpuInfo } = require('./cli');

// ---------------------------------------------------------------------------
// Argument parsing (lightweight, no external deps)
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const args    = argv.slice(2);
  const opts    = { command: null, json: false, dir: process.cwd() };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--json') {
      opts.json = true;
    } else if (arg === '--dir' && i + 1 < args.length) {
      opts.dir = path.resolve(args[++i]);
    } else if (!arg.startsWith('--')) {
      opts.command = arg;
    }
  }
  return opts;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const opts = parseArgs(process.argv);

  // ── One-shot: info ──────────────────────────────────────────────────────
  if (opts.command === 'info') {
    const info = gatherSystemInfo({ includeHeavy: true });

    if (opts.json) {
      console.log(JSON.stringify(info, null, 2));
    } else {
      console.log(showOsInfo(info));
      console.log();
      console.log(showCpuInfo(info));
    }
    return; // exit cleanly
  }

  // ── Interactive menu (default) ─────────────────────────────────────────
  await startInteractiveMenu({ dir: opts.dir });
  process.exit(0);
}

main().catch((err) => {
  console.error(`Fatal: ${err.message}`);
  process.exit(1);
});
