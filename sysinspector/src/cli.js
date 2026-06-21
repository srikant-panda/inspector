const readline = require('readline');
const fs       = require('fs');
const path     = require('path');
const os       = require('os');
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
      // Build the menu frame
      const cols = process.stdout.columns || 80;
      const isWide = cols >= 115;
      const previewLines = getDynamicPreview(MENU_ITEMS[selected].action);

      const headerLines = [];
      headerLines.push(`  Sandbox root: ${color.cyan(fileOps.root)}`);
      headerLines.push(`  ${color.bold('↑/↓ or j/k · Enter to select · q to quit')}`);
      headerLines.push('');

      const menuLines = [];
      for (let i = 0; i < MENU_ITEMS.length; i++) {
        if (i === selected) {
          menuLines.push(color.inverse(color.cyan(`  ➤ ${MENU_ITEMS[i].label}  `)));
        } else {
          menuLines.push(`    ${MENU_ITEMS[i].label}`);
        }
        if (i < MENU_ITEMS.length - 1) {
          menuLines.push(''); // add empty line to increase height/spacing of menu
        }
      }

      const borderedPreview = previewLines.map(l =>
        l ? color.dim('│ ') + l : color.dim('│')
      );

      frame = '';
      for (const line of headerLines) {
        frame += line + '\n';
      }

      if (isWide) {
        const menuColWidth = 38;
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
        frame += '\n';
        for (const line of borderedPreview) {
          frame += '  ' + line + '\n';
        }
      }
    }

    // THE ONLY write for menu rendering — clear screen + full frame, one call
    process.stdout.write('\x1b[2J\x1b[H' + frame);
  }

  // ── Helper: get text input (creates temporary readline, closes it) ─
  async function getTextInput(prompt) {
    // Exit raw mode for text input
    if (process.stdin.isTTY) process.stdin.setRawMode(false);
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const askQ = (q) => new Promise((r) => rl.question(q, r));
    const result = await askQ(prompt);
    rl.close();
    // Re-enable raw mode for keypress navigation
    if (process.stdin.isTTY) process.stdin.setRawMode(true);
    return result;
  }

  // ── Action dispatcher (returns output string, NEVER writes to stdout) ─
  async function executeAction(action) {
    switch (action) {
      case 'os-info': {
        const info = gatherSystemInfo();
        let output = showOsInfo(info);
        
        // Append full details
        output += '\n\n  ' + color.bold(color.cyan('📁 Additional OS & Env Details')) + '\n';
        output += '  ' + '─'.repeat(45) + '\n';
        output += `  ${color.bold('CWD:')}        ${info.cwd}\n`;
        output += `  ${color.bold('Timestamp:')}  ${info.timestamp}\n\n`;
        output += `  ${color.bold('🔑 Environment Variables:')}\n`;
        for (const [key, val] of Object.entries(info.env)) {
          const displayVal = key === 'PATH' && val.length > 60 ? val.slice(0, 57) + '...' : val;
          output += `    ${color.green(key.padEnd(10))} ${displayVal}\n`;
        }

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

        // Append full details
        output += '\n\n  ' + color.bold(color.cyan('🧠 Detailed CPU Core Info')) + '\n';
        output += '  ' + '─'.repeat(45) + '\n';
        const cpus = os.cpus();
        if (Array.isArray(cpus) && cpus.length > 0) {
          output += `  ${color.bold('Core count:')} ${cpus.length}\n`;
          output += `  ${color.bold('Speeds by core:')}\n`;
          const limit = Math.min(cpus.length, 8);
          for (let i = 0; i < limit; i++) {
            output += `    Core ${i}: ${color.green(cpus[i].speed + ' MHz')} - ${cpus[i].model.trim()}\n`;
          }
          if (cpus.length > limit) {
            output += `    ... and ${cpus.length - limit} more cores\n`;
          }
        } else {
          output += '  Core details not available.\n';
        }

        const exportDir = path.join(fileOps.root, 'cpu-info');
        ensureDir(exportDir);
        const cpuData = {
          model: info.cpu.model,
          architecture: info.os.arch,
          cores: info.cpu.cores,
          speedMHz: info.cpu.speedMHz,
          loadAvg: info.loadAvg,
          memory: info.memory,
        };
        fs.writeFileSync(path.join(exportDir, 'cpu-info.json'), JSON.stringify(cpuData, null, 2), 'utf8');
        fs.writeFileSync(path.join(exportDir, 'cpu-info.html'), renderInfoHtml('CPU Info', cpuData), 'utf8');
        output += '\n' + color.green('  ✔ Full details exported to cpu-info/cpu-info.json and cpu-info/cpu-info.html');
        return output;
      }

      case 'memory-info': {
        const info = gatherSystemInfo();
        let output = showMemoryInfo(info);

        // Append full details
        const totalBytes = os.totalmem();
        const freeBytes = os.freemem();
        const usedBytes = totalBytes - freeBytes;
        output += '\n\n  ' + color.bold(color.cyan('📊 Raw Memory Allocation')) + '\n';
        output += '  ' + '─'.repeat(45) + '\n';
        output += `  ${color.bold('Total Bytes:')} ${totalBytes.toLocaleString()} B\n`;
        output += `  ${color.bold('Free Bytes:')}  ${freeBytes.toLocaleString()} B\n`;
        output += `  ${color.bold('Used Bytes:')}  ${usedBytes.toLocaleString()} B\n`;
        output += `  ${color.bold('Load Average (1m, 5m, 15m):')} ${info.loadAvg !== 'N/A' ? info.loadAvg.join(', ') : 'N/A'}\n`;

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

        // Append full details
        output += '\n\n  ' + color.bold(color.cyan('💾 All Mounted Filesystems')) + '\n';
        output += '  ' + '─'.repeat(45) + '\n';
        try {
          const platform = os.platform();
          let dfOut = '';
          if (platform === 'win32') {
            dfOut = execSync('wmic logicaldisk get Caption,FileSystem,FreeSpace,Size', {
              encoding: 'utf8',
              stdio: ['pipe', 'pipe', 'ignore']
            });
          } else {
            dfOut = execSync('df -h 2>/dev/null', {
              encoding: 'utf8',
              stdio: ['pipe', 'pipe', 'ignore']
            });
          }
          const lines = dfOut.trim().split('\n').slice(0, 10);
          for (const line of lines) {
            output += '  ' + line + '\n';
          }
          if (dfOut.trim().split('\n').length > 10) {
            output += '  ...\n';
          }
        } catch {
          output += '  Extended mount details not available.\n';
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

        // Append full details
        output += '\n\n  ' + color.bold(color.cyan('🔋 Power Status Details')) + '\n';
        output += '  ' + '─'.repeat(45) + '\n';
        const platform = os.platform();
        if (platform === 'win32') {
          output += '  Windows WMIC query returned:\n';
          try {
            const raw = execSync('wmic path Win32_Battery get /value', {
              encoding: 'utf8',
              stdio: ['pipe', 'pipe', 'ignore']
            });
            const lines = raw.trim().split('\r\n').filter(l => l.includes('Status') || l.includes('Charge') || l.includes('Name') || l.includes('Design'));
            for (const line of lines) output += '    ' + line + '\n';
          } catch {
            output += '    No wmic battery details.\n';
          }
        } else if (platform === 'darwin') {
          output += '  macOS pmset query returned:\n';
          try {
            const raw = execSync('pmset -g batt', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
            output += '    ' + raw.trim().replace(/\n/g, '\n    ') + '\n';
          } catch {}
        } else if (platform === 'linux') {
          output += '  Linux power supply BAT status:\n';
          try {
            const powerSupplyDir = '/sys/class/power_supply';
            const dirs = fs.readdirSync(powerSupplyDir);
            const batDir = dirs.find(d => d.startsWith('BAT'));
            if (batDir) {
              const uevent = fs.readFileSync(path.join(powerSupplyDir, batDir, 'uevent'), 'utf8');
              const lines = uevent.trim().split('\n').filter(l => l.includes('POWER_SUPPLY_NAME') || l.includes('POWER_SUPPLY_STATUS') || l.includes('POWER_SUPPLY_CAPACITY') || l.includes('POWER_SUPPLY_TEMP') || l.includes('POWER_SUPPLY_VOLTAGE_NOW'));
              for (const line of lines) output += '    ' + line + '\n';
            } else {
              output += '    No BAT device found under /sys/class/power_supply.\n';
            }
          } catch {
            output += '    Failed to read battery sysfs details.\n';
          }
        } else {
          output += '  No extended battery details available for this platform.\n';
        }

        const exportDir = path.join(fileOps.root, 'battery-info');
        ensureDir(exportDir);
        fs.writeFileSync(path.join(exportDir, 'battery-info.json'), JSON.stringify(battery, null, 2), 'utf8');
        fs.writeFileSync(path.join(exportDir, 'battery-info.html'), renderInfoHtml('Battery Info', battery), 'utf8');
        output += '\n' + color.green('  ✔ Full details exported to battery-info/battery-info.json and battery-info/battery-info.html');
        return output;
      }

      case 'network':
        return showNetwork();

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
        // Clear screen, show intro, hand off to file manager
        renderMenu(color.dim(`  Sandboxed CRUD file manager — supports all ${pName} commands`) + '\n\n', { rawFrame: true });
        const { startFileManager } = require('../../filemanager/index.js');
        await startFileManager();
        return null; // no output — go straight to menu on return
      }

      case 'exit':
        renderMenu(color.green('\n  Goodbye!\n\n'), { rawFrame: true });
        return null; // special: signals exit
    }
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

      // Initial render
      renderMenu();

      // Recompute layout on terminal resize
      const onResize = () => renderMenu();
      process.stdout.on('resize', onResize);

      function onKeypress(str, key) {
        if (key.ctrl && key.name === 'c') {
          cleanup();
          renderMenu(color.green('\n  Goodbye!\n\n'), { rawFrame: true });
          resolve(false);
          return;
        }

        const keyName = key.name || '';

        if (keyName === 'up' || str === 'k') {
          selected = (selected - 1 + MENU_ITEMS.length) % MENU_ITEMS.length;
          renderMenu();
        } else if (keyName === 'down' || str === 'j') {
          selected = (selected + 1) % MENU_ITEMS.length;
          renderMenu();
        } else if (keyName === 'return') {
          const chosen = MENU_ITEMS[selected].action;
          cleanup();
          executeAction(chosen).then((output) => {
            if (output === null) {
              // exit or filemanager — resolve immediately
              // (exit writes its own goodbye; filemanager handled internally)
              if (chosen === 'exit') {
                resolve(false);
              } else {
                // filemanager returned — re-enter keypress loop
                resolve(true);
              }
            } else {
              // Show action output, wait for dismiss key, then resolve
              renderMenu(output);
              if (process.stdin.isTTY) process.stdin.setRawMode(true);
              const onDismiss = (str2, key2) => {
                process.stdin.removeListener('keypress', onDismiss);
                resolve(true);
              };
              process.stdin.on('keypress', onDismiss);
            }
          });
        } else if (str === 'q') {
          cleanup();
          renderMenu(color.green('\n  Goodbye!\n\n'), { rawFrame: true });
          resolve(false);
        }
      }

      function cleanup() {
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
