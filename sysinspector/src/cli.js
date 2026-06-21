const readline = require('readline');
const fs       = require('fs');
const path     = require('path');
const os       = require('os');
const { execSync } = require('child_process');

function execWithTimeout(cmd, timeoutMs = 6000) {
  try {
    return execSync(cmd, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore'],
      timeout: timeoutMs,
      killSignal: 'SIGKILL'
    });
  } catch (err) {
    if (err.code === 'ETIMEDOUT' || err.signal === 'SIGKILL' || (err.message && err.message.includes('timeout'))) {
      throw new Error(`Command execution timed out after ${timeoutMs / 1000} seconds`);
    }
    throw err;
  }
}
const { gatherSystemInfo, gatherDiskInfo, gatherBatteryInfo } = require('./sysinfo');
const { FileOps }           = require('./fileOps');
const { renderInfoHtml }    = require('./htmlExport');

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
  dim: (str) => `\x1b[2m${str}\x1b[22m`,
};

// ── ASCII logo for neofetch-style views ─────────────────────────────────
const LOGO = [
  '   ┌─┬─┬─┬─┐',
  ' ┌─┤ · · · ├─┐',
  ' ├─┤  ▓▓▓   ├─┤',
  ' └─┤ · · · ├─┘',
  '   └─┴─┴─┴─┘',
];

// ── Helpers ──────────────────────────────────────────────────────────────

function formatUptime(seconds) {
  if (typeof seconds !== 'number' || isNaN(seconds)) return 'N/A';
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const parts = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0 || d > 0) parts.push(`${h}h`);
  parts.push(`${m}m`);
  return parts.join(' ');
}

function getPlatformName() {
  const p = os.platform();
  if (p === 'linux') return 'Linux';
  if (p === 'darwin') return 'macOS';
  if (p === 'win32') return 'Windows';
  return p;
}

/** Visible string length, ignoring ANSI escape codes */
function visibleLen(str) {
  return str.replace(/\x1b\[[0-9;]*m/g, '').length;
}

/** Pad a string to a visible width, accounting for ANSI codes */
function padVisible(str, width) {
  const diff = width - visibleLen(str);
  return diff > 0 ? str + ' '.repeat(diff) : str;
}

// ── Neofetch-style view formatters ──────────────────────────────────────

function showOsInfo(info) {
  const hostname = info.hostname !== 'N/A' ? info.hostname : 'unknown';
  const header = `inspector@${hostname}`;
  const underline = '─'.repeat(header.length);

  const right = [
    color.bold(color.cyan(header)),
    color.dim(underline),
    `💻 ${color.bold('OS:')}        ${info.os.type} ${info.os.release} (${info.os.platform}/${info.os.arch})`,
    `🏷️  ${color.bold('Hostname:')}  ${info.hostname}`,
    `⏱️  ${color.bold('Uptime:')}    ${formatUptime(info.uptimeSeconds)}`,
    `👤 ${color.bold('User:')}      ${info.env.USER || info.env.USERNAME || 'N/A'}`,
    `🏠 ${color.bold('Home Dir:')}  ${info.homedir}`,
    `🐚 ${color.bold('Shell:')}     ${path.basename(info.shell !== 'N/A' ? info.shell : '')}`,
    `🟢 ${color.bold('Node.js:')}   ${info.nodeVersion}`,
    `🔑 ${color.bold('Env Vars:')}  ${Object.keys(info.env).length} captured (full list in export)`,
  ];

  const lines = [];
  const maxRows = Math.max(LOGO.length, right.length);
  for (let i = 0; i < maxRows; i++) {
    const logo = color.magenta(padVisible(LOGO[i] || '', 18));
    const info = right[i] || '';
    lines.push(`  ${logo}   ${info}`);
  }
  return lines.join('\n');
}

function showCpuInfo(info) {
  const header = 'CPU Info';
  const underline = '─'.repeat(header.length);

  // Load average — N/A on Windows if all zeros
  let loadStr = 'N/A';
  if (Array.isArray(info.loadAvg)) {
    if (os.platform() === 'win32' && info.loadAvg.every(v => v === 0)) {
      loadStr = 'N/A (not available on Windows)';
    } else {
      loadStr = info.loadAvg.join(', ');
    }
  }

  const right = [
    color.bold(color.cyan(header)),
    color.dim(underline),
    `🧠 ${color.bold('Model:')}        ${info.cpu.model}`,
    `⚙️  ${color.bold('Architecture:')} ${info.os.arch}`,
    `🔢 ${color.bold('Cores:')}        ${info.cpu.cores}`,
    `⚡ ${color.bold('Speed:')}        ${info.cpu.speedMHz} MHz`,
    `📊 ${color.bold('Load Avg:')}     ${loadStr}`,
  ];

  const lines = [];
  const maxRows = Math.max(LOGO.length, right.length);
  for (let i = 0; i < maxRows; i++) {
    const logo = color.magenta(padVisible(LOGO[i] || '', 18));
    const detail = right[i] || '';
    lines.push(`  ${logo}   ${detail}`);
  }
  return lines.join('\n');
}

function showNetwork() {
  const ifaces = os.networkInterfaces();
  const names = Object.keys(ifaces);

  let out = `\n  ${color.bold(color.cyan('🌐 Network'))}\n\n`;

  // Tree of interface names only — proper ├─ / └─ branch characters
  for (let i = 0; i < names.length; i++) {
    const isLast = i === names.length - 1;
    const branch = isLast ? '└─' : '├─';
    out += `    ${branch} ${color.green(names[i])}\n`;
  }

  // Flat detail blocks below the tree
  out += '\n';
  for (const name of names) {
    out += `  ${color.bold(name)}\n`;
    const addrs = ifaces[name];
    const ipv4 = addrs.find(a => a.family === 'IPv4');
    const mac = addrs[0];
    out += `    📡 ${color.bold('IPv4:')}  ${ipv4 ? ipv4.address : 'N/A'}\n`;
    out += `    🔗 ${color.bold('MAC:')}   ${mac ? mac.mac : 'N/A'}\n`;
    out += '\n';
  }
  return out;
}

function makeProgressBar(percent, width = 20) {
  if (typeof percent !== 'number' || isNaN(percent)) return '';
  const filledCount = Math.round((percent / 100) * width);
  const emptyCount = width - filledCount;
  return `[${'█'.repeat(filledCount)}${'░'.repeat(emptyCount)}] ${percent.toFixed(1)}%`;
}

function colorizeJson(obj) {
  const jsonStr = JSON.stringify(obj, null, 2);
  const lines = jsonStr.split('\n');
  const formattedLines = lines.map(line => {
    const highlighted = line.replace(
      /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?)/g,
      (match) => {
        if (/^"/.test(match)) {
          if (/:$/.test(match)) {
            return color.cyan(match);
          } else {
            return color.green(match);
          }
        } else if (/true|false/.test(match)) {
          return color.magenta(match);
        } else if (/null/.test(match)) {
          return color.red(match);
        }
        return color.yellow(match);
      }
    );
    return '    ' + highlighted;
  });
  return formattedLines.join('\n');
}

function renderTable(headers, rows) {
  const colWidths = headers.map(h => visibleLen(h));
  for (const row of rows) {
    for (let i = 0; i < headers.length; i++) {
      const val = String(row[i] !== undefined && row[i] !== null ? row[i] : '');
      const len = visibleLen(val);
      if (len > colWidths[i]) {
        colWidths[i] = len;
      }
    }
  }

  const topBorder = '  ┌─' + colWidths.map(w => '─'.repeat(w)).join('─┬─') + '─┐';
  const headerLine = '  │ ' + headers.map((h, i) => padVisible(color.bold(color.cyan(h)), colWidths[i])).join(' │ ') + ' │';
  const divider = '  ├─' + colWidths.map(w => '─'.repeat(w)).join('─┼─') + '─┤';
  const bottomBorder = '  └─' + colWidths.map(w => '─'.repeat(w)).join('─┴─') + '─┘';

  const lines = [topBorder, headerLine, divider];
  for (const row of rows) {
    const rowLine = '  │ ' + row.map((cell, i) => {
      const val = String(cell !== undefined && cell !== null ? cell : '');
      return padVisible(val, colWidths[i]);
    }).join(' │ ') + ' │';
    lines.push(rowLine);
  }
  lines.push(bottomBorder);
  return lines.join('\n');
}


function showDiskInfo(disks) {
  const header = 'Disk Info';
  const underline = '─'.repeat(header.length);
  const right = [
    color.bold(color.cyan(header)),
    color.dim(underline),
  ];

  if (disks === 'N/A' || !Array.isArray(disks) || disks.length === 0) {
    right.push('  No disk information available.');
  } else {
    for (const d of disks) {
      right.push(`📁 ${color.bold('Mount/Drive:')}  ${d.drive}`);
      right.push(`  💾 ${color.bold('Total:')} ${d.totalGB}  ${color.bold('Used:')} ${d.usedGB}  ${color.bold('Free:')} ${d.freeGB}`);
      if (typeof d.usedPct === 'number') {
        right.push(`  📊 ${color.bold('Usage:')} ${makeProgressBar(d.usedPct, 15)}`);
      } else {
        right.push(`  📊 ${color.bold('Usage:')} ${d.usedPct}`);
      }
      right.push('');
    }
  }

  const lines = [];
  const maxRows = Math.max(LOGO.length, right.length);
  for (let i = 0; i < maxRows; i++) {
    const logo = color.magenta(padVisible(LOGO[i] || '', 18));
    const detail = right[i] || '';
    lines.push(`  ${logo}   ${detail}`);
  }
  return lines.join('\n');
}

function showMemoryInfo(info) {
  const header = 'Memory Info';
  const underline = '─'.repeat(header.length);
  const totalGB = (info.memory.totalMB / 1024).toFixed(2);
  const freeGB = (info.memory.freeMB / 1024).toFixed(2);
  const usedGB = ((info.memory.totalMB - info.memory.freeMB) / 1024).toFixed(2);

  const right = [
    color.bold(color.cyan(header)),
    color.dim(underline),
    `📦 ${color.bold('Total RAM:')} ${info.memory.totalMB} MB (${totalGB} GB)`,
    `🟢 ${color.bold('Free RAM:')}  ${info.memory.freeMB} MB (${freeGB} GB)`,
    `🔴 ${color.bold('Used RAM:')}  ${(info.memory.totalMB - info.memory.freeMB).toFixed(2)} MB (${usedGB} GB)`,
    `📊 ${color.bold('Usage:')}     ${typeof info.memory.usedPercent === 'number' ? makeProgressBar(info.memory.usedPercent, 20) : info.memory.usedPercent}`,
  ];

  const lines = [];
  const maxRows = Math.max(LOGO.length, right.length);
  for (let i = 0; i < maxRows; i++) {
    const logo = color.magenta(padVisible(LOGO[i] || '', 18));
    const detail = right[i] || '';
    lines.push(`  ${logo}   ${detail}`);
  }
  return lines.join('\n');
}

function showBatteryInfo(battery) {
  const header = 'Battery Info';
  const underline = '─'.repeat(header.length);
  const right = [
    color.bold(color.cyan(header)),
    color.dim(underline),
  ];

  if (battery === 'N/A' || !battery || typeof battery.percent !== 'number') {
    right.push('  🔋 Status: N/A (Desktop/AC powered or no battery detected)');
  } else {
    const batteryIcon = battery.status === 'Charging' ? '⚡🔋' : '🔋';
    right.push(`${batteryIcon} ${color.bold('Level:')}  ${makeProgressBar(battery.percent, 20)}`);
    right.push(`🏷️  ${color.bold('Status:')} ${battery.status}`);
  }

  const lines = [];
  const maxRows = Math.max(LOGO.length, right.length);
  for (let i = 0; i < maxRows; i++) {
    const logo = color.magenta(padVisible(LOGO[i] || '', 18));
    const detail = right[i] || '';
    lines.push(`  ${logo}   ${detail}`);
  }
  return lines.join('\n');
}

// ── Export helper ────────────────────────────────────────────────────────

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

// ── Interactive Menu ─────────────────────────────────────────────────────

/**
 * Launches the interactive readline menu loop.
 *
 * @param {object} options
 * @param {string} options.dir – sandbox root directory
 */
async function startInteractiveMenu({ dir }) {
  // Enter alternate screen buffer, disable alternate scroll mode (no mouse/touchpad scrolling to arrows), & hide cursor for raw keypress navigation
  process.stdout.write('\x1b[?1049h\x1b[?1007l\x1b[?25l');
  const fileOps = new FileOps(dir);

  // ── Menu items ──────────────────────────────────────────────────────
  const platformName = getPlatformName();
  const MENU_ITEMS = [
    { label: 'OS Info', action: 'os-info' },
    { label: 'CPU Info', action: 'cpu-info' },
    { label: 'Memory Info', action: 'memory-info' },
    { label: 'Disk Info', action: 'disk-info' },
    { label: 'Battery Info', action: 'battery-info' },
    { label: 'Network', action: 'network' },
    { label: 'List files in sandbox directory', action: 'list' },
    { label: 'Show session changelog', action: 'changelog' },
    { label: 'Open File Manager', action: 'filemanager' },
    { label: 'Exit', action: 'exit' },
  ];

  /**
   * Generates a dynamic, real-time preview (array of lines) for the selected action.
   */
  function getDynamicPreview(action) {
    switch (action) {
      case 'os-info': {
        const info = gatherSystemInfo();
        return showOsInfo(info).split('\n');
      }
      case 'cpu-info': {
        const info = gatherSystemInfo();
        return showCpuInfo(info).split('\n');
      }
      case 'memory-info': {
        const info = gatherSystemInfo();
        return showMemoryInfo(info).split('\n');
      }
      case 'disk-info': {
        const disks = gatherDiskInfo();
        return showDiskInfo(disks).split('\n');
      }
      case 'battery-info': {
        const battery = gatherBatteryInfo();
        return showBatteryInfo(battery).split('\n');
      }
      case 'network': {
        const ifaces = os.networkInterfaces();
        const names = Object.keys(ifaces);
        const lines = [color.bold(color.cyan('🌐 Network Interfaces'))];
        for (let i = 0; i < names.length; i++) {
          const isLast = i === names.length - 1;
          const branch = isLast ? '└─' : '├─';
          const name = names[i];
          const addrs = ifaces[name] || [];
          const ipv4 = addrs.find(a => a.family === 'IPv4');
          const ipStr = ipv4 ? ipv4.address : 'N/A';
          lines.push(`  ${branch} ${color.green(name)} (${ipStr})`);
        }
        return lines;
      }
      case 'list': {
        try {
          const entries = fileOps.list('.');
          const lines = [color.bold('Sandbox Root Files ("."):')];
          if (entries.length === 0) {
            lines.push('  (empty directory)');
          } else {
            const limit = 10;
            const shown = entries.slice(0, limit);
            for (const e of shown) {
              const icon = e.type === 'directory' ? '📁' : '📄';
              lines.push(`  ${icon} ${e.name}`);
            }
            if (entries.length > limit) {
              lines.push(`  ... and ${entries.length - limit} more entries`);
            }
          }
          return lines;
        } catch (err) {
          return [`Error listing root:`, `  ${err.message}`];
        }
      }
      case 'changelog': {
        const log = fileOps.getChangelog();
        const lines = [color.bold('Session Changelog:')];
        if (log.length === 0) {
          lines.push('  (no actions recorded this session)');
        } else {
          const limit = 8;
          const shown = log.slice(-limit);
          for (const entry of shown) {
            const timeStr = entry.time ? entry.time.slice(11, 19) : 'N/A';
            lines.push(`  [${timeStr}] ${entry.action.toUpperCase()} - ${entry.target}`);
          }
          if (log.length > limit) {
            lines.push(`  ... and ${log.length - limit} older actions`);
          }
        }
        return lines;
      }
      case 'filemanager': {
        return [
          color.bold('Sandboxed CRUD File Manager'),
          'Press Enter to launch.',
          '',
          `Supports all ${platformName} commands:`,
          '  cd, ls/dir, cat/type, rm/del,',
          '  cp/copy, mv/move/ren, mkdir/md.',
        ];
      }
      case 'exit': {
        return [
          color.bold('Exit Inspector'),
          'Press Enter to quit and return to terminal.',
        ];
      }
      default:
        return [];
    }
  }

  let selected = 0;

  // ══════════════════════════════════════════════════════════════════
  // SINGLE RENDER FUNCTION — the ONLY place that writes to stdout
  // for menu-related content. Every other function returns strings.
  // ══════════════════════════════════════════════════════════════════

  function renderLoadingScreen(label) {
    const frame = `\n` +
      `  ┌────────────────────────────────────────────────────────┐\n` +
      `  │                                                        │\n` +
      `  │   ⏳  Loading ${padVisible(label, 30)}...   │\n` +
      `  │       Please wait, querying system diagnostics...     │\n` +
      `  │                                                        │\n` +
      `  └────────────────────────────────────────────────────────┘\n`;
    process.stdout.write('\x1b[H\x1b[J' + frame);
  }

  /**
   * Clear screen + write the complete frame in ONE atomic write.
   * @param {string} [actionOutput] – if provided, shows action result
   *   instead of the menu (with a dismiss prompt)
   * @param {object} [options] – customization options
   * @param {boolean} [options.rawFrame] – if true, output actionOutput exactly without dismiss prompt
   */
  function renderMenu(actionOutput, options = {}) {
    let frame;

    if (actionOutput !== undefined) {
      if (options.rawFrame) {
        frame = actionOutput;
      } else {
        // Show action result on clean screen
        frame = actionOutput + '\n\n' + color.dim('  Press any key to return to menu...') + '\n';
      }
    } else {
      // Build the menu frame responsively based on terminal size
      const cols = process.stdout.columns || 80;
      const rows = process.stdout.rows || 24;
      const isWide = cols >= 115;
      const previewLines = options.previewOverride || getDynamicPreview(MENU_ITEMS[selected].action);

      const headerLines = [];
      headerLines.push(`  Sandbox root: ${color.cyan(fileOps.root)}`);
      headerLines.push(`  ${color.bold('↑/↓ or j/k · Enter to select · q to quit')}`);
      headerLines.push('');

      // Avoid double spacing menu items on short terminal windows to prevent overflow
      const useSpacing = rows >= 25;

      const menuLines = [];
      for (let i = 0; i < MENU_ITEMS.length; i++) {
        if (i === selected) {
          menuLines.push(color.inverse(color.cyan(`  ➤ ${MENU_ITEMS[i].label}  `)));
        } else {
          menuLines.push(`    ${MENU_ITEMS[i].label}`);
        }
        if (useSpacing && i < MENU_ITEMS.length - 1) {
          menuLines.push('');
        }
      }

      frame = '';
      for (const line of headerLines) {
        frame += line + '\n';
      }

      if (isWide) {
        const menuColWidth = 38;
        // Calculate max preview height based on available screen rows
        const maxPreviewHeight = Math.max(5, rows - headerLines.length - 2);
        const slicedPreview = previewLines.slice(0, maxPreviewHeight);
        
        const borderedPreview = slicedPreview.map(l =>
          l ? color.dim('│ ') + l : color.dim('│')
        );

        const maxRows = Math.max(menuLines.length, borderedPreview.length);
        for (let i = 0; i < maxRows; i++) {
          const left = padVisible(menuLines[i] || '', menuColWidth);
          const right = borderedPreview[i] || '';
          frame += left + '  ' + right + '\n';
        }
      } else {
        for (const line of menuLines) {
          frame += line + '\n';
        }
        
        // Only show preview if there is sufficient vertical space remaining
        const usedHeight = headerLines.length + menuLines.length + 2;
        const maxPreviewHeight = rows - usedHeight;
        if (maxPreviewHeight >= 4) {
          frame += '\n';
          const slicedPreview = previewLines.slice(0, maxPreviewHeight);
          const borderedPreview = slicedPreview.map(l =>
            l ? color.dim('│ ') + l : color.dim('│')
          );
          for (const line of borderedPreview) {
            frame += '  ' + line + '\n';
          }
        }
      }
    }

    // THE ONLY write for menu rendering — clear screen + full frame, one call
    process.stdout.write('\x1b[H\x1b[J' + frame);
  }

  // ── Helper: get text input (creates temporary readline, closes it) ─
  async function getTextInput(prompt) {
    // Exit raw mode for text input
    if (process.stdin.isTTY) process.stdin.setRawMode(false);
    // Show cursor for user typing
    process.stdout.write('\x1b[?25h');
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const askQ = (q) => new Promise((r) => rl.question(q, r));
    const result = await askQ(prompt);
    rl.close();
    // Hide cursor again
    process.stdout.write('\x1b[?25l');
    // Re-enable raw mode for keypress navigation
    if (process.stdin.isTTY) process.stdin.setRawMode(true);
    return result;
  }

  // ── Action dispatcher (returns output string, NEVER writes to stdout) ─
  async function executeAction(action) {
    switch (action) {
      case 'os-info': {
        const info = gatherSystemInfo({ includeHeavy: true });
        let output = showOsInfo(info);
        
        const uptimeStr = formatUptime(info.uptimeSeconds);
        const osRows = [
          ['OS Type', info.os.type],
          ['Platform', info.os.platform],
          ['Release', info.os.release],
          ['Architecture', info.os.arch],
          ['Hostname', info.hostname],
          ['Node.js Version', info.nodeVersion],
          ['Uptime', uptimeStr],
          ['Current Directory (CWD)', info.cwd],
          ['Home Directory', info.homedir],
          ['User Shell', info.shell],
          ['Timestamp', info.timestamp]
        ];

        const cols = process.stdout.columns || 80;
        const maxValLen = Math.max(30, cols - 30);
        const envRows = Object.entries(info.env).map(([key, val]) => {
          const displayVal = val.length > maxValLen ? val.slice(0, maxValLen - 3) + '...' : val;
          return [key, displayVal];
        });

        output += '\n\n' + color.bold(color.cyan('🖥️  OS Core Properties\n'));
        output += renderTable(['Property', 'Value'], osRows) + '\n\n';
        output += color.bold(color.cyan('🔑 Captured Environment Variables\n'));
        output += renderTable(['Variable Name', 'Value'], envRows) + '\n';

        const exportDir = path.join(fileOps.root, 'os-info');
        ensureDir(exportDir);
        fs.writeFileSync(path.join(exportDir, 'os-info.json'), JSON.stringify(info, null, 2), 'utf8');
        fs.writeFileSync(path.join(exportDir, 'os-info.html'), renderInfoHtml('OS Info', info), 'utf8');
        output += '\n' + color.green('  ✔ Full details exported to os-info/os-info.json and os-info/os-info.html');
        return output;
      }

      case 'cpu-info': {
        const info = gatherSystemInfo();
        let output = showCpuInfo(info);

        let loadStr = 'N/A';
        if (Array.isArray(info.loadAvg)) {
          loadStr = info.loadAvg.join(', ');
        }
        const summaryRows = [
          ['Model', info.cpu.model],
          ['Architecture', info.os.arch],
          ['Cores', String(info.cpu.cores)],
          ['Base/Current Speed', `${info.cpu.speedMHz} MHz`],
          ['Load Avg (1m, 5m, 15m)', loadStr]
        ];

        const cpus = os.cpus();
        const coreRows = [];
        if (Array.isArray(cpus)) {
          for (let i = 0; i < cpus.length; i++) {
            coreRows.push([
              `Core ${i}`,
              cpus[i].model.trim(),
              `${cpus[i].speed} MHz`
            ]);
          }
        }

        output += '\n\n' + color.bold(color.cyan('🧠 CPU Summary\n'));
        output += renderTable(['Property', 'Value'], summaryRows) + '\n\n';
        if (coreRows.length > 0) {
          output += color.bold(color.cyan('⚙️  Individual Cores\n'));
          output += renderTable(['Core #', 'Model Name', 'Current Speed'], coreRows) + '\n';
        }

        const cpuData = {
          model: info.cpu.model,
          architecture: info.os.arch,
          cores: info.cpu.cores,
          speedMHz: info.cpu.speedMHz,
          loadAvg: info.loadAvg,
          memory: info.memory,
        };

        const exportDir = path.join(fileOps.root, 'cpu-info');
        ensureDir(exportDir);
        fs.writeFileSync(path.join(exportDir, 'cpu-info.json'), JSON.stringify(cpuData, null, 2), 'utf8');
        fs.writeFileSync(path.join(exportDir, 'cpu-info.html'), renderInfoHtml('CPU Info', cpuData), 'utf8');
        output += '\n' + color.green('  ✔ Full details exported to cpu-info/cpu-info.json and cpu-info/cpu-info.html');
        return output;
      }

      case 'memory-info': {
        const info = gatherSystemInfo();
        let output = showMemoryInfo(info);

        const totalBytes = os.totalmem();
        const freeBytes = os.freemem();
        const usedBytes = totalBytes - freeBytes;

        const formatMB = (val) => `${val.toFixed(2)} MB`;
        const formatGB = (bytes) => `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
        const formatPercent = (pct) => typeof pct === 'number' ? makeProgressBar(pct, 15) : pct;

        const memRows = [
          ['Total Memory', `${formatMB(info.memory.totalMB)} / ${formatGB(totalBytes)} / ${totalBytes.toLocaleString()} Bytes`],
          ['Free Memory', `${formatMB(info.memory.freeMB)} / ${formatGB(freeBytes)} / ${freeBytes.toLocaleString()} Bytes`],
          ['Used Memory', `${formatMB(info.memory.totalMB - info.memory.freeMB)} / ${formatGB(usedBytes)} / ${usedBytes.toLocaleString()} Bytes`],
          ['Memory Usage', formatPercent(info.memory.usedPercent)],
          ['Load Average (1m, 5m, 15m)', Array.isArray(info.loadAvg) ? info.loadAvg.join(', ') : 'N/A']
        ];

        output += '\n\n' + color.bold(color.cyan('📊 Memory Allocation Table\n'));
        output += renderTable(['Memory Metric', 'Value / Bar'], memRows) + '\n';

        const exportDir = path.join(fileOps.root, 'memory-info');
        ensureDir(exportDir);
        fs.writeFileSync(path.join(exportDir, 'memory-info.json'), JSON.stringify(info.memory, null, 2), 'utf8');
        fs.writeFileSync(path.join(exportDir, 'memory-info.html'), renderInfoHtml('Memory Info', info.memory), 'utf8');
        output += '\n' + color.green('  ✔ Full details exported to memory-info/memory-info.json and memory-info/memory-info.html');
        return output;
      }

      case 'disk-info': {
        const disks = gatherDiskInfo();
        let output = showDiskInfo(disks);

        const summaryRows = [];
        if (Array.isArray(disks)) {
          for (const d of disks) {
            summaryRows.push([
              d.drive,
              d.totalGB,
              d.usedGB,
              d.freeGB,
              typeof d.usedPct === 'number' ? makeProgressBar(d.usedPct, 15) : d.usedPct
            ]);
          }
        }

        const platform = os.platform();
        const allDiskRows = [];
        try {
          let dfOut = '';
          if (platform === 'win32') {
            try {
              const psOut = execWithTimeout('powershell -Command "Get-CimInstance Win32_LogicalDisk | Select-Object DeviceID, FileSystem, FreeSpace, Size | ConvertTo-Json -Compress"');
              if (psOut.trim()) {
                const parsed = JSON.parse(psOut.trim());
                const list = Array.isArray(parsed) ? parsed : [parsed];
                for (const d of list) {
                  if (d && d.DeviceID && d.Size > 0) {
                    const caption = d.DeviceID;
                    const fsType = d.FileSystem || 'Unknown';
                    const free = d.FreeSpace || 0;
                    const size = d.Size || 0;
                    const freeGB = (free / (1024**3)).toFixed(2) + ' GB';
                    const sizeGB = (size / (1024**3)).toFixed(2) + ' GB';
                    const usedGB = ((size - free) / (1024**3)).toFixed(2) + ' GB';
                    const pct = (((size - free) / size) * 100).toFixed(1) + '%';
                    allDiskRows.push([caption, fsType, sizeGB, usedGB, freeGB, pct]);
                  }
                }
              }
            } catch (psErr) {
              if (psErr.message && psErr.message.includes('timed out')) {
                throw psErr;
              }
              // Fallback to wmic
              dfOut = execWithTimeout('wmic logicaldisk get Caption,FileSystem,FreeSpace,Size');
              const lines = dfOut.trim().split('\r\n');
              for (let i = 1; i < lines.length; i++) {
                const parts = lines[i].trim().split(/\s+/);
                if (parts.length >= 4) {
                  const caption = parts[0];
                  const fsType = parts[1];
                  const free = parseInt(parts[2], 10);
                  const size = parseInt(parts[3], 10);
                  if (!isNaN(free) && !isNaN(size) && size > 0) {
                    const freeGB = (free / (1024**3)).toFixed(2) + ' GB';
                    const sizeGB = (size / (1024**3)).toFixed(2) + ' GB';
                    const usedGB = ((size - free) / (1024**3)).toFixed(2) + ' GB';
                    const pct = (((size - free) / size) * 100).toFixed(1) + '%';
                    allDiskRows.push([caption, fsType, sizeGB, usedGB, freeGB, pct]);
                  }
                }
              }
            }
          } else {
            dfOut = execWithTimeout('df -h 2>/dev/null');
            const lines = dfOut.trim().split('\n');
            for (let i = 1; i < lines.length; i++) {
              const parts = lines[i].trim().split(/\s+/);
              if (parts.length >= 6) {
                const filesystem = parts[0];
                const size = parts[1];
                const used = parts[2];
                const avail = parts[3];
                const pct = parts[4];
                const mountedOn = parts[5];
                allDiskRows.push([filesystem, mountedOn, size, used, avail, pct]);
              }
            }
          }
        } catch (err) {
          if (err.message && err.message.includes('timed out')) {
            throw err;
          }
        }

        output += '\n\n' + color.bold(color.cyan('📁 Summary of Primary Drives\n'));
        output += renderTable(['Drive/Mount', 'Total Size', 'Used Space', 'Free Space', 'Usage Bar'], summaryRows) + '\n\n';

        if (allDiskRows.length > 0) {
          output += color.bold(color.cyan('💾 All Mounted Filesystems & Partitions\n'));
          if (platform === 'win32') {
            output += renderTable(['Drive', 'File System', 'Total Size', 'Used Space', 'Free Space', 'Use%'], allDiskRows) + '\n';
          } else {
            output += renderTable(['Filesystem', 'Mounted On', 'Size', 'Used', 'Avail', 'Use%'], allDiskRows) + '\n';
          }
        }

        const exportDir = path.join(fileOps.root, 'disk-info');
        ensureDir(exportDir);
        fs.writeFileSync(path.join(exportDir, 'disk-info.json'), JSON.stringify(disks, null, 2), 'utf8');
        fs.writeFileSync(path.join(exportDir, 'disk-info.html'), renderInfoHtml('Disk Info', disks), 'utf8');
        output += '\n' + color.green('  ✔ Full details exported to disk-info/disk-info.json and disk-info/disk-info.html');
        return output;
      }

      case 'battery-info': {
        const battery = gatherBatteryInfo();
        let output = showBatteryInfo(battery);

        const platform = os.platform();
        const batteryRows = [];

        if (platform === 'win32') {
          try {
            const raw = execWithTimeout('powershell -Command "Get-CimInstance Win32_Battery | ConvertTo-Json -Compress"');
            if (raw.trim()) {
              const parsed = JSON.parse(raw.trim());
              const entries = Array.isArray(parsed) ? parsed : [parsed];
              for (const item of entries) {
                if (!item) continue;
                for (const [key, val] of Object.entries(item)) {
                  if (val !== null && val !== undefined && val !== '' && typeof val !== 'object') {
                    batteryRows.push([key, String(val)]);
                  }
                }
              }
            }
          } catch (e) {
            if (e.message && e.message.includes('timed out')) {
              throw e;
            }
            try {
              const raw = execWithTimeout('wmic path Win32_Battery get /value');
              const lines = raw.trim().split('\r\n').filter(l => l.includes('='));
              for (const line of lines) {
                const parts = line.split('=');
                const key = parts[0].trim();
                const val = parts.slice(1).join('=').trim();
                if (key && val) {
                  batteryRows.push([key, val]);
                }
              }
            } catch {}
          }
        } else if (platform === 'darwin') {
          try {
            const raw = execWithTimeout('pmset -g batt');
            const lines = raw.trim().split('\n');
            if (lines.length > 0) {
              batteryRows.push(['Power Source Details', lines[0]]);
            }
            if (lines.length > 1) {
              const match = lines[1].match(/([A-Za-z0-9-]+)\s+\(id=\d+\)\s+(\d+%);\s+([^;]+);\s*(.*)/);
              if (match) {
                batteryRows.push(['Device Name', match[1]]);
                batteryRows.push(['Charge Level', match[2]]);
                batteryRows.push(['Power Status', match[3]]);
                batteryRows.push(['Remaining Estimate', match[4] || 'N/A']);
              } else {
                batteryRows.push(['Status Line', lines[1]]);
              }
            }
          } catch (e) {
            if (e.message && e.message.includes('timed out')) {
              throw e;
            }
          }
        } else if (platform === 'linux') {
          try {
            const powerSupplyDir = '/sys/class/power_supply';
            const dirs = fs.readdirSync(powerSupplyDir);
            const batDir = dirs.find(d => d.startsWith('BAT'));
            if (batDir) {
              const uevent = fs.readFileSync(path.join(powerSupplyDir, batDir, 'uevent'), 'utf8');
              const lines = uevent.trim().split('\n').filter(l => l.includes('='));
              for (const line of lines) {
                const parts = line.split('=');
                const key = parts[0].replace('POWER_SUPPLY_', '').replace(/_/g, ' ').trim();
                const val = parts.slice(1).join('=').trim();
                if (key && val) {
                  batteryRows.push([key, val]);
                }
              }
            }
          } catch {}
        }

        output += '\n\n';
        if (batteryRows.length > 0) {
          output += color.bold(color.cyan('🔋 Detailed Battery/Power Attributes\n'));
          output += renderTable(['Attribute', 'Value'], batteryRows) + '\n';
        } else {
          output += color.dim('  Extended power supply attributes not available on this system.') + '\n';
        }

        const exportDir = path.join(fileOps.root, 'battery-info');
        ensureDir(exportDir);
        fs.writeFileSync(path.join(exportDir, 'battery-info.json'), JSON.stringify(battery, null, 2), 'utf8');
        fs.writeFileSync(path.join(exportDir, 'battery-info.html'), renderInfoHtml('Battery Info', battery), 'utf8');
        output += '\n' + color.green('  ✔ Full details exported to battery-info/battery-info.json and battery-info/battery-info.html');
        return output;
      }

      case 'network': {
        const ifaces = os.networkInterfaces();
        let output = showNetwork();

        const networkRows = [];
        for (const [name, addrs] of Object.entries(ifaces)) {
          for (let i = 0; i < addrs.length; i++) {
            const addr = addrs[i];
            networkRows.push([
              i === 0 ? name : '',
              addr.family,
              addr.address,
              addr.netmask || 'N/A',
              addr.mac || 'N/A',
              addr.internal ? 'Internal (lo)' : 'External',
              addr.cidr || 'N/A'
            ]);
          }
        }

        const cols = process.stdout.columns || 80;
        output += '\n\n' + color.bold(color.cyan('🌐 Network Interface Details\n'));
        if (cols >= 110) {
          output += renderTable(['Interface', 'Family', 'IP Address', 'Netmask', 'MAC Address', 'Type', 'CIDR'], networkRows) + '\n';
        } else {
          for (const [name, addrs] of Object.entries(ifaces)) {
            output += `\n  📁 ${color.bold(color.green(name))}:\n`;
            for (const addr of addrs) {
              output += `    ${color.cyan('•')} ${color.bold('Family:')}      ${addr.family}\n`;
              output += `      ${color.bold('IP Address:')}  ${addr.address}\n`;
              output += `      ${color.bold('Netmask:')}     ${addr.netmask || 'N/A'}\n`;
              output += `      ${color.bold('MAC:')}         ${addr.mac || 'N/A'}\n`;
              output += `      ${color.bold('Type:')}        ${addr.internal ? 'Internal (lo)' : 'External'}\n`;
              output += `      ${color.bold('CIDR:')}        ${addr.cidr || 'N/A'}\n`;
            }
          }
        }

        const exportDir = path.join(fileOps.root, 'network-info');
        ensureDir(exportDir);
        fs.writeFileSync(path.join(exportDir, 'network-info.json'), JSON.stringify(ifaces, null, 2), 'utf8');
        fs.writeFileSync(path.join(exportDir, 'network-info.html'), renderInfoHtml('Network Info', ifaces), 'utf8');
        output += '\n' + color.green('  ✔ Full details exported to network-info/network-info.json and network-info/network-info.html');
        return output;
      }

      case 'list': {
        const subDir = (await getTextInput('  Sub-directory to list [.]: ')) || '.';
        const entries = fileOps.list(subDir);
        let output = '';
        if (entries.length === 0) {
          output = '  (empty directory)';
        } else {
          output = `\n  Entries in "${subDir}":\n`;
          for (const e of entries) {
            const icon = e.type === 'directory' ? '📁' : '📄';
            output += `    ${icon} ${e.name}  [${e.type}]\n`;
          }
        }
        return output + '\n';
      }

      case 'changelog': {
        const log = fileOps.getChangelog();
        if (log.length === 0) {
          return '\n  (no actions recorded this session)\n';
        }
        let output = '\n  Session Changelog:\n';
        output += '  ' + '─'.repeat(60) + '\n';
        for (const entry of log) {
          output += `  [${entry.time}]  ${entry.action.toUpperCase().padEnd(7)}  ${entry.target}  — ${entry.detail}\n`;
        }
        output += '  ' + '─'.repeat(60) + '\n';
        return output;
      }

      case 'filemanager': {
        const pName = getPlatformName();
        // Show cursor for file manager prompt
        process.stdout.write('\x1b[?25h');
        // Clear screen, show intro, hand off to file manager
        renderMenu(color.dim(`  Sandboxed CRUD file manager — supports all ${pName} commands`) + '\n\n', { rawFrame: true });
        const { startFileManager } = require('../../filemanager/index.js');
        await startFileManager();
        // Hide cursor again when returning to menu navigation
        process.stdout.write('\x1b[?25l');
        return null; // no output — go straight to menu on return
      }

      case 'exit':
        // Restore alternate scroll mode, cursor and exit alternate screen buffer
        process.stdout.write('\x1b[?1007h\x1b[?25h\x1b[?1049l');
        process.stdout.write(color.green('\n  Goodbye!\n\n'));
        return null; // special: signals exit
    }
  }

  // ── Scrollable Output Viewer (allows mouse/touchpad scrolling inside action output) ──
  function viewScrollableOutput(output) {
    return new Promise((resolve) => {
      // Disable mouse tracking and re-enable alternate scroll mode so mouse/touchpad scroll sends ArrowUp/ArrowDown
      process.stdout.write('\x1b[?1000l\x1b[?1007h');
      
      const lines = output.split('\n');
      let scrollOffset = 0;

      function render() {
        const termHeight = process.stdout.rows || 24;
        // Leave space for footer (3 lines)
        const visibleHeight = Math.max(5, termHeight - 3);
        
        // Calculate max scroll offset
        const maxScroll = Math.max(0, lines.length - visibleHeight);
        if (scrollOffset > maxScroll) {
          scrollOffset = maxScroll;
        }
        if (scrollOffset < 0) {
          scrollOffset = 0;
        }

        // Get slice of lines to display
        const visibleLines = lines.slice(scrollOffset, scrollOffset + visibleHeight);
        
        // Build the frame
        let frame = visibleLines.join('\n');
        
        // Add padding newlines if the output has fewer lines than visibleHeight
        const paddingCount = visibleHeight - visibleLines.length;
        if (paddingCount > 0) {
          frame += '\n'.repeat(paddingCount);
        }

        // Add footer with responsive pagination info
        const scrollInfo = lines.length > visibleHeight 
          ? ` (Lines ${scrollOffset + 1}-${Math.min(scrollOffset + visibleHeight, lines.length)} of ${lines.length})` 
          : '';
        const footer = '\n\n' + color.bold(color.cyan(`  [↑/↓ or j/k to scroll · Enter/q/Esc to return]${scrollInfo}`));
        frame += footer + '\n';

        // Write atomic frame
        process.stdout.write('\x1b[H\x1b[J' + frame);
      }

      // Initial render
      render();

      // Handle terminal resizing responsively
      const onResize = () => render();
      process.stdout.on('resize', onResize);

      if (process.stdin.isTTY) process.stdin.setRawMode(true);

      function onScrollKeypress(str, key) {
        if (!key) return; // Ignore unrecognized sequences
        const keyName = key.name || '';

        if (keyName === 'up' || str === 'k') {
          if (scrollOffset > 0) {
            scrollOffset--;
            render();
          }
        } else if (keyName === 'down' || str === 'j') {
          const termHeight = process.stdout.rows || 24;
          const visibleHeight = Math.max(5, termHeight - 3);
          if (scrollOffset < lines.length - visibleHeight) {
            scrollOffset++;
            render();
          }
        } else if (keyName === 'return' || str === 'q' || keyName === 'escape') {
          // Cleanup this scroll listener
          process.stdin.removeListener('keypress', onScrollKeypress);
          process.stdout.removeListener('resize', onResize);
          // Re-disable alternate scroll mode for the main menu
          process.stdout.write('\x1b[?1007l');
          
          // Defer resolving to flush any buffered keystrokes pressed during transitions
          setTimeout(() => {
            resolve();
          }, 150);
        }
      }

      // Defer registering the listener slightly to flush initial transition keypresses
      setTimeout(() => {
        process.stdin.on('keypress', onScrollKeypress);
      }, 150);
    });
  }

  // ── Arrow-key navigation loop (NO readline interface — raw stdin only) ─
  function keypressLoop() {
    return new Promise((resolve) => {
      // Kill readline during keypress mode to prevent stdout resize interference
      if (process.stdin._readlineInterface) {
        process.stdin._readlineInterface.close();
      }
      readline.emitKeypressEvents(process.stdin);
      if (process.stdin.isTTY) process.stdin.setRawMode(true);

      // Enable mouse tracking to prevent scroll-to-arrow translation on editors like VS Code
      process.stdout.write('\x1b[?1000h');

      // Initial render
      renderMenu();

      // Recompute layout on terminal resize
      const onResize = () => renderMenu();
      process.stdout.on('resize', onResize);

      function onKeypress(str, key) {
        if (!key) return; // Ignore any mouse reporting events
        if (str && (str.startsWith('\x1b[M') || str.startsWith('\x1b[<'))) return;

        if (key.ctrl && key.name === 'c') {
          cleanup();
          process.stdout.write('\x1b[?1007h\x1b[?25h\x1b[?1049l');
          process.stdout.write(color.green('\n  Goodbye!\n\n'));
          resolve(false);
          return;
        }

        const keyName = key.name || '';

        if (keyName === 'up' || str === 'k' || keyName === 'down' || str === 'j') {
          // Block input during preview loading
          process.stdin.removeListener('keypress', onKeypress);

          if (keyName === 'up' || str === 'k') {
            selected = (selected - 1 + MENU_ITEMS.length) % MENU_ITEMS.length;
          } else {
            selected = (selected + 1) % MENU_ITEMS.length;
          }

          const isHeavy = MENU_ITEMS[selected].action === 'disk-info' || MENU_ITEMS[selected].action === 'battery-info';
          if (isHeavy) {
            renderLoadingScreen(MENU_ITEMS[selected].label);
          } else {
            renderMenu();
          }

          // Defer actual preview rendering/queries slightly to let loading screen paint
          setTimeout(() => {
            try {
              renderMenu();
            } catch (err) {
              const errLines = [
                color.bold(color.red('❌ Load Error')),
                color.dim('─'.repeat(12)),
                `Error: ${err.message || err}`,
              ];
              renderMenu(undefined, { previewOverride: errLines });
            }

            // Flush buffered inputs by delaying listener re-attachment
            setTimeout(() => {
              process.stdin.on('keypress', onKeypress);
            }, 150);
          }, 50);
        } else if (keyName === 'return') {
          const chosen = MENU_ITEMS[selected].action;
          cleanup();
          
          // Render the loading screen
          renderLoadingScreen(MENU_ITEMS[selected].label);

          // Defer execution slightly to let stdout render the loading frame first
          setTimeout(() => {
            executeAction(chosen).then((output) => {
              if (output === null) {
                if (chosen === 'exit') {
                  resolve(false);
                } else {
                  resolve(true);
                }
              } else {
                // Show action output in a responsive scrollable view
                viewScrollableOutput(output).then(() => {
                  resolve(true);
                });
              }
            }).catch((err) => {
              // Print error message inside the crashed feature view
              const errOutput = `\n  ❌ Error: Feature "${MENU_ITEMS[selected].label}" failed to load.\n\n` +
                                `  Details: ${err.message || err}\n`;
              viewScrollableOutput(errOutput).then(() => {
                resolve(true);
              });
            });
          }, 100);
        } else if (str === 'q') {
          cleanup();
          process.stdout.write('\x1b[?1007h\x1b[?25h\x1b[?1049l');
          process.stdout.write(color.green('\n  Goodbye!\n\n'));
          resolve(false);
        }
      }

      function cleanup() {
        // Disable mouse tracking
        process.stdout.write('\x1b[?1000l');
        process.stdin.removeListener('keypress', onKeypress);
        process.stdout.removeListener('resize', onResize);
        if (process.stdin.isTTY) process.stdin.setRawMode(false);
      }

      process.stdin.on('keypress', onKeypress);
    });
  }

  // ── Outer loop: menu → action → menu ─────────────────────────────
  let running = true;
  while (running) {
    const shouldContinue = await keypressLoop();
    if (!shouldContinue) break;
    running = shouldContinue;
  }

  // Final cleanup — ensure terminal is never left in raw mode
  if (process.stdin.isTTY) process.stdin.setRawMode(false);
}

module.exports = { startInteractiveMenu, showOsInfo, showCpuInfo };
