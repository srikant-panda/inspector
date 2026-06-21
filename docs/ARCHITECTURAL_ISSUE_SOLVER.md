# Inspector — Architectural Issue Solver

This document catalogs the small but significant architectural problems encountered during development and the solutions implemented to resolve them. Each entry explains **why the issue existed**, **what problem it caused**, and **how it was solved** with code references.

- [Rendering & Terminal UI](#rendering--terminal-ui)
- [Performance & Responsiveness](#performance--responsiveness)
- [Input Handling & Raw Mode Safety](#input-handling--raw-mode-safety)
- [Cross-Platform Compatibility](#cross-platform-compatibility)
- [File Manager Intelligence](#file-manager-intelligence)
- [Data Export & Logging](#data-export--logging)

---

## Rendering & Terminal UI

### 1. Single Atomic Render Function (`renderOnce` Pattern)

**Why it existed:** Early versions had multiple scattered `console.log()` calls writing to stdout at different points — menu rendering, action output, preview panes. This caused flickering, partial redraws, and race conditions during terminal resize.

**Problem:** Every `console.log()` call is a separate write to stdout. Between calls, the terminal could render a half-drawn frame, causing visible tearing. Resizing the terminal mid-render compounded the issue.

**Solution:** Consolidated ALL menu-related stdout writes into a single `renderMenu()` function that clears the screen and writes the complete frame in one atomic `process.stdout.write()` call:

```javascript
// cli.js → renderMenu()
// THE ONLY write for menu rendering — clear screen + full frame, one call
process.stdout.write('\x1b[H\x1b[J' + frame);
```

Every view function (`showOsInfo`, `showCpuInfo`, `showNetwork`, etc.) returns a string rather than writing to stdout directly. The central render function composes the full frame and emits it atomically.

---

### 2. Responsive Preview Pane (Side-by-Side vs Stacked Layout)

**Why it existed:** The arrow-key menu shows a live preview of the selected item. On wide terminals, the preview should sit beside the menu (side-by-side). On narrow terminals, it should stack below to avoid line-wrapping corruption.

**Problem:** Fixed layouts broke on terminals narrower than ~115 columns — preview text would wrap and misalign the menu. On short terminals (< 25 rows), double-spaced menu items pushed the preview off-screen.

**Solution:** `renderMenu()` queries `process.stdout.columns` and `process.stdout.rows` in real-time and switches layout strategy:

```javascript
// cli.js → renderMenu()
const cols = process.stdout.columns || 80;
const rows = process.stdout.rows || 24;
const isWide = cols >= 115;
const useSpacing = rows >= 25;
```

On wide terminals, the menu and preview are rendered side-by-side in a single pass. On narrow terminals, they stack vertically with dynamic height clipping to prevent overflow.

---

### 3. Scrollable Output Viewer

**Why it existed:** Detailed views (OS info, CPU cores, disk partitions, network interfaces, environment variables) produce output far exceeding terminal height. Users needed a way to scroll through long output without losing the top.

**Problem:** Raw `console.log()` dumps all output at once. Long outputs scroll past the visible area with no way to scroll back up, especially inside the alternate screen buffer.

**Solution:** `viewScrollableOutput()` renders a paginated window into the output lines, with arrow-key/j-k scrolling and a footer showing pagination info:

```javascript
// cli.js → viewScrollableOutput()
const visibleHeight = Math.max(5, termHeight - 3);
const maxScroll = Math.max(0, lines.length - visibleHeight);
const visibleLines = lines.slice(scrollOffset, scrollOffset + visibleHeight);
// Footer: [↑/↓ or j/k to scroll · Enter/q/Esc to return] (Lines 12–53 of 53)
```

The viewer also handles terminal resize events dynamically, recomputing visible height on the fly.

---

### 4. Loading Screen for Heavy Operations

**Why it existed:** Disk info and battery info queries invoke `execSync()` calls to PowerShell/wmic/df which can take 1–5 seconds. During this time, the menu appeared frozen with no visual feedback.

**Problem:** Users would see the menu freeze and assume the app crashed, especially on Windows where PowerShell startup has significant latency.

**Solution:** A `renderLoadingScreen()` function paints a spinner box before heavy operations begin, providing immediate visual feedback:

```javascript
// cli.js → renderLoadingScreen()
function renderLoadingScreen(label) {
  const frame = `\n` +
    `  ┌────────────────────────────────────────────────────────┐\n` +
    `  │   ⏳  Loading ${padVisible(label, 30)}...   │\n` +
    `  │       Please wait, querying system diagnostics...     │\n` +
    `  └────────────────────────────────────────────────────────┘\n`;
  process.stdout.write('\x1b[H\x1b[J' + frame);
}
```

Heavy menu items (disk-info, battery-info) trigger the loading screen immediately on hover, while lighter items render the preview directly.

---

## Performance & Responsiveness

### 5. Dynamic Adaptive Timeout System

**Why it existed:** Shell command execution (`execSync`) needed timeouts to prevent hanging. Hardcoded timeouts (e.g., 5000ms) were too short on slow Windows VMs and too long on fast Linux machines, causing either premature kills or unnecessary waiting.

**Problem:** A 5-second timeout works on a fast Linux laptop but fires prematurely on a Windows VM where PowerShell startup takes 3+ seconds. Conversely, a 30-second timeout means a genuinely hung command blocks the UI for too long.

**Solution:** `execWithTimeout()` measures a baseline delay at startup by timing a trivial `echo 1` command, then derives all subsequent timeouts dynamically from that baseline:

```javascript
// sysinfo.js → getBaselineDelay()
const start = Date.now();
execSync('echo 1', { stdio: 'ignore', timeout: 2000 });
baselineDelay = Date.now() - start;

// sysinfo.js → execWithTimeout()
const minTimeout = Math.max(3000, baseline * 3);
const maxTimeout = Math.max(15000, baseline * 12);
timeoutMs = Math.round(commandStats[cmdKey].avg * 4 + baseline * 2);
```

The system also tracks per-command average execution times and adjusts timeouts based on historical performance, creating a self-tuning boundary.

---

### 6. Execution Result Caching

**Why it existed:** The preview pane calls `gatherSystemInfo()` on every keypress to show live metrics. Without caching, hovering over "OS Info" would re-execute shell commands (df, wmic, etc.) multiple times per second.

**Problem:** Redundant shell executions caused CPU spikes and visible lag when navigating the menu with rapid keypresses.

**Solution:** `execWithTimeout()` caches command results with a TTL (time-to-live) of 5 seconds. Repeated calls within the window return the cached result instantly:

```javascript
// sysinfo.js → execWithTimeout()
const CACHE_TTL_MS = 5000;
if (execCache[cmd] && (now - execCache[cmd].timestamp < CACHE_TTL_MS)) {
  return execCache[cmd].result;
}
```

Heavy gatherers (disk, battery) also have their own separate cache layers with the same TTL pattern.

---

### 7. Input Buffer Flush After Transitions

**Why it existed:** When transitioning between menu → action output → menu, keystrokes pressed during the transition (loading screen, computation) were buffered by stdin and replayed after the new listener registered, causing phantom navigation.

**Problem:** Pressing arrow keys while the loading screen was visible would cause the menu to jump 2–3 items when it finally rendered, because buffered keypresses were processed all at once.

**Solution:** Keypress listeners are removed before async work begins and re-registered after a 150ms delay to flush buffered inputs:

```javascript
// cli.js → keypressLoop()
process.stdin.removeListener('keypress', onKeypress);
// ... do work ...
setTimeout(() => {
  process.stdin.on('keypress', onKeypress);
}, 150);
```

---

### 8. Terminal Resize Reactive Redraw

**Why it existed:** The menu layout is responsive (side-by-side vs stacked). When users resize their terminal window, the layout needs to recompute immediately.

**Problem:** Without a resize handler, resizing the terminal left the menu misaligned — preview text would overflow or leave gaps until the next keypress triggered a redraw.

**Solution:** Both the menu loop and the scrollable viewer subscribe to `process.stdout.on('resize')` and trigger a full re-render:

```javascript
// cli.js → keypressLoop()
const onResize = () => renderMenu();
process.stdout.on('resize', onResize);
// Cleanup on exit:
process.stdout.removeListener('resize', onResize);
```

---

## Input Handling & Raw Mode Safety

### 9. Raw Mode Try/Finally Safety Net

**Why it existed:** The CLI enters raw mode (`process.stdin.setRawMode(true)`) to capture individual keypresses. If an unhandled exception occurred while in raw mode, the terminal would be left in a corrupted state (no echo, no line buffering) after the process exited.

**Problem:** After a crash in raw mode, the user's terminal shell would not echo typed characters, making it appear broken. Users would have to manually run `reset` to fix it.

**Solution:** The entire interactive session is wrapped in a `try/finally` block that guarantees raw mode is always restored:

```javascript
// cli.js → startInteractiveMenu()
const originalEmit = process.stdin.emit;
try {
  process.stdout.write('\x1b[?1049h\x1b[?1007l\x1b[?25l'); // enter alt screen
  // ... entire session ...
} finally {
  process.stdin.emit = originalEmit;
  if (process.stdin.isTTY) process.stdin.setRawMode(false); // always restore
}
```

---

### 10. Kill Readline During Keypress Mode

**Why it existed:** The `readline` module internally listens on stdin and writes to stdout (prompt rendering, line editing). When the app switches to raw keypress mode for arrow-key navigation, readline's internal resize handler interferes with the custom render function.

**Problem:** With readline active during keypress mode, terminal resize events would cause readline to write its prompt to stdout, corrupting the menu frame.

**Solution:** Any existing readline interface on stdin is explicitly closed before entering keypress mode:

```javascript
// cli.js → keypressLoop()
if (process.stdin._readlineInterface) {
  process.stdin._readlineInterface.close();
}
readline.emitKeypressEvents(process.stdin);
if (process.stdin.isTTY) process.stdin.setRawMode(true);
```

---

### 11. Stdin Mouse Event Filter

**Why it existed:** Mouse tracking is enabled (`\x1b[?1000h`) to prevent terminal emulators (especially VS Code's integrated terminal) from translating mouse scroll events into ArrowUp/ArrowDown, which would cause phantom menu navigation. However, with mouse tracking on, actual mouse clicks emit escape sequences that reach readline and corrupt input.

**Problem:** Clicking inside the terminal would inject `\x1b[M...` sequences into stdin, which readline interpreted as garbage characters, breaking text input prompts.

**Solution:** `process.stdin.emit` is monkey-patched at session start to strip mouse reporting escape sequences before they reach any listener:

```javascript
// cli.js → startInteractiveMenu()
process.stdin.emit = function(event, ...args) {
  if (event === 'data') {
    let data = args[0];
    if (typeof data === 'string') {
      const filtered = data
        .replace(/\x1b\[M[\s\S]{3}/g, '')      // SGR mouse click
        .replace(/\x1b\[<[0-9;]+[Mm]/g, '');   // extended mouse
      if (filtered.length === 0) return;         // swallow pure mouse events
      args[0] = Buffer.from(filtered, 'utf8');
    }
  }
  return originalEmit.apply(this, [event, ...args]);
};
```

---

### 12. Keypress Crash Guards (Undefined Key Protection)

**Why it existed:** Node.js keypress events emit a `key` object, but certain terminal escape sequences (mouse clicks, terminal resize notifications, SGR sequences) emit events where `key` is `undefined`.

**Problem:** Accessing `key.name` when `key` is `undefined` throws `TypeError: Cannot read properties of undefined`, crashing the interactive menu.

**Solution:** Every keypress handler guards against undefined `key` before accessing properties:

```javascript
// cli.js → onKeypress(), onScrollKeypress()
if (!key) return;  // Ignore unrecognized sequences
const keyName = key.name || '';

// filemanager/index.js → onKey()
const keyName = key ? (key.name || '') : '';
```

---

### 13. Alternate Screen Buffer Management

**Why it existed:** The CLI uses the alternate screen buffer to render the menu without polluting the user's terminal scrollback history. Entering and exiting this buffer requires precise escape sequences.

**Problem:** If the app exited without restoring the normal screen buffer, the user's terminal would remain in the alternate buffer, making it appear blank.

**Solution:** Entry and exit sequences are paired, with the exit also handled in Ctrl+C and quit paths:

```javascript
// Entry: alternate screen + disable alt scroll + hide cursor
process.stdout.write('\x1b[?1049h\x1b[?1007l\x1b[?25l');

// Exit: restore alt scroll + show cursor + leave alternate screen
process.stdout.write('\x1b[?1007h\x1b[?25h\x1b[?1049l');
```

---

## Cross-Platform Compatibility

### 14. Cross-Platform Command Aliases with Flag Normalization

**Why it existed:** Windows users expect `dir`, `del`, `copy`, `move`, `type`, `md`, `ren` commands. Unix users expect `ls`, `rm`, `cp`, `mv`, `cat`, `mkdir`. The file manager needed to support both audiences seamlessly.

**Problem:** Implementing separate code paths for each command variant would double the codebase. Additionally, Windows uses `/flag` syntax (e.g., `dir /a`) while Unix uses `-flag` (e.g., `ls -a`).

**Solution:** A single alias map translates Windows command names to canonical Unix names, and a `normalizeFlag()` function converts Windows-style flags to Unix equivalents at dispatch time:

```javascript
// filemanager/index.js
const ALIASES = {
  dir: 'ls', type: 'cat', copy: 'cp', move: 'mv',
  del: 'rm', erase: 'rm', rd: 'rm', rmdir: 'rm',
  ren: 'mv', rename: 'mv', md: 'mkdir', clear: 'cls',
  quit: 'exit',
};

function normalizeFlag(flag) {
  if (flag === '/a') return '-a';
  if (flag === '/s') return '-rf';
  if (flag === '/q') return null;  // quiet — accepted, no-op
  if (flag === '/p') return '-p';
  if (flag === '/f') return '-f';
  return flag;
}
```

Command dispatch is case-insensitive (only the verb is lowercased, not paths), so `DIR`, `Dir`, and `dir` all work identically.

---

### 15. Cross-Platform File Open-in-Default-App

**Why it existed:** The visual directory browser lets users open files in their default application (text editor, image viewer, video player, archive extractor). Each OS has a different command for this.

**Problem:** Linux uses `xdg-open`, macOS uses `open`, and Windows uses `start ""`. Using the wrong command silently fails or throws an error.

**Solution:** The browser detects file type by extension, then dispatches the correct platform-specific command:

```javascript
// filemanager/index.js → startVisualBrowser()
if (isTextFile(item.name)) {
  // Text: open in EDITOR/VISUAL, fallback to nano (Linux) or notepad (Windows)
  const editor = process.env.EDITOR || process.env.VISUAL ||
    (process.platform === 'win32' ? 'notepad' : 'nano');
  spawnSync(editor, [fullPath], { stdio: 'inherit' });
} else if (isImageFile(item.name) || isVideoFile(item.name) || isArchiveFile(item.name)) {
  // Binary: open in default app via OS-level command
  let command = '';
  if (process.platform === 'win32')      command = `cmd.exe /c start "" "${fullPath}"`;
  else if (process.platform === 'darwin') command = `open "${fullPath}"`;
  else                                    command = `xdg-open "${fullPath}"`;
  exec(command, () => {});
}
```

---

### 16. Platform-Aware ASCII Logos

**Why it existed:** The neofetch-style views display an ASCII art logo representing the host OS. Showing a Linux penguin on Windows (or vice versa) would be confusing.

**Problem:** Static logos don't reflect the actual runtime platform.

**Solution:** `getOsLogo()` detects `os.platform()` and returns the appropriate logo (Tux for Linux, Windows emblem for win32, Apple for darwin). CPU logos also auto-detect Intel vs AMD vs Apple Silicon from the CPU model string:

```javascript
// cli.js → getOsLogo()
if (platform === 'win32')  { logo = [/* Windows emblem */]; }
else if (platform === 'darwin') { logo = [/* Apple logo */]; }
else if (platform === 'linux')  { logo = [/* Tux penguin */]; }
```

---

## File Manager Intelligence

### 17. Levenshtein Distance Command Suggestion

**Why it existed:** Users occasionally mistype commands (`lss` instead of `ls`, `mkdr` instead of `mkdir`). A bare "command not found" error is unhelpful when the typo is close to a valid command.

**Problem:** Without suggestions, users must retype the command from scratch.

**Solution:** When an unknown command is entered, the Levenshtein distance algorithm computes the edit distance against all known commands and suggests the closest match if within 2 edits:

```javascript
// filemanager/index.js → unknown command handler
let bestMatch = null;
let minDistance = 3;
for (const known of allCommands) {
  const dist = levenshtein(rawCmd, known);
  if (dist < minDistance) {
    minDistance = dist;
    bestMatch = known;
  }
}
if (bestMatch) {
  console.log(color.yellow(`  💡 Did you mean "${bestMatch}"?`));
}
```

---

### 18. Visual Directory Browser with Scrollable Viewport

**Why it existed:** The `ls` command dumps all files at once, which is unwieldy for directories with hundreds of entries. Users needed a navigable, visual file browser.

**Problem:** Directories with 100+ files overflow the terminal, making it impossible to see all entries without scrolling past them.

**Solution:** `startVisualBrowser()` implements an arrow-key navigable list with a scrolling viewport that only renders visible items, sorted with directories first and `..` always at the top:

```javascript
// filemanager/index.js → startVisualBrowser() → render()
const termHeight = process.stdout.rows || 24;
const visibleHeight = Math.max(5, termHeight - 9);
let start = 0;
if (selectedIndex >= visibleHeight) {
  start = selectedIndex - visibleHeight + 1;
}
const visibleItems = items.slice(start, start + visibleHeight);
```

The browser also supports folder-choice menus (browse deeper, open terminal here, or cancel) when selecting a directory.

---

### 19. Quote-Aware Command Argument Parser

**Why it existed:** File and directory names often contain spaces (e.g., `My Documents`, `Program Files`). Naive `split(' ')` breaks these paths into multiple arguments.

**Problem:** `cp My File.txt backup/` would be parsed as 4 arguments instead of 3, causing "file not found" errors.

**Solution:** `parseCommand()` implements a state-machine parser that respects both single and double quotes, and handles escaped quotes:

```javascript
// filemanager/index.js → parseCommand()
for (let i = 0; i < line.length; i++) {
  const char = line[i];
  if ((char === '"' || char === "'") && (i === 0 || line[i - 1] !== '\\')) {
    if (inQuotes && char === quoteChar) { inQuotes = false; }
    else if (!inQuotes) { inQuotes = true; quoteChar = char; }
  } else if (char === ' ' && !inQuotes) {
    if (current.length > 0) { args.push(current); current = ''; }
  } else { current += char; }
}
```

---

## Data Export & Logging

### 20. Shared HTML Export Module

**Why it existed:** Every diagnostic view (OS, CPU, Memory, Disk, Battery, Network) exports an HTML report. Initially, each view had its own HTML generation logic, leading to inconsistent styling and duplicated code.

**Problem:** 5+ copies of HTML boilerplate with slightly different styles, making maintenance difficult and reports visually inconsistent.

**Solution:** A single `htmlExport.js` module provides `renderInfoHtml(title, dataObject)` which recursively renders any data object as a self-contained, dark-themed HTML page:

```javascript
// htmlExport.js → renderSection()
function renderSection(obj) {
  let html = '<dl>';
  for (const [key, value] of Object.entries(obj)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      html += `<dt>${label}</dt><dd>${renderSection(value)}</dd>`;
    } else {
      html += `<dt>${label}</dt><dd>${escapeHtml(String(value))}</dd>`;
    }
  }
  return html + '</dl>';
}
```

All views now call this single function, ensuring consistent dark-mode Tokyo Night styling across all reports.

---

### 21. Session Changelog with Persistent File Logging

**Why it existed:** Users needed to review what actions were performed during a session (files created, directories navigated, views exported). An in-memory array is lost when the process exits.

**Problem:** Without persistence, there was no audit trail of session activity after closing the app.

**Solution:** `FileOps` maintains both an in-memory changelog array AND a persistent log file with a timestamped filename. Every action is dual-written:

```javascript
// fileOps.js → _log()
_log(action, target, detail) {
  const timeStr = new Date().toISOString();
  this.changelog.push({ action, target, detail, time: timeStr });

  if (this.logFile) {
    const logLine = `[${timeFmt}] [${action.toUpperCase().padEnd(8)}] ${target} — ${detail}\n`;
    fs.appendFileSync(this.logFile, logLine, 'utf8');
  }
}
```

Log files are stored in `logs/session_YYYY-MM-DD_HH-MM-SS.log`, creating a unique file per session start.

---

### 22. Safe Wrapper Pattern for OS Queries

**Why it existed:** Querying OS-level data (`os.cpus()`, `os.loadavg()`, `fs.readFileSync('/sys/class/...')`) can throw on unsupported platforms, restricted containers, or when hardware sensors are unavailable.

**Problem:** A single unhandled exception in any metrics gatherer would crash the entire application.

**Solution:** Every OS query is wrapped in `safe(fn, fallback)` which catches all errors and returns `'N/A'` as a graceful fallback:

```javascript
// sysinfo.js → safe()
function safe(fn, fallback = 'N/A') {
  try {
    const result = fn();
    return result !== undefined && result !== null ? result : fallback;
  } catch {
    return fallback;
  }
}
```

This pattern is used consistently across all gather functions — CPU, memory, disk, battery, network, uptime, and environment variables.

---

### 23. ANSI-Aware String Padding

**Why it existed:** Terminal colors use ANSI escape codes (e.g., `\x1b[36m...\x1b[0m`) which add invisible characters to strings. Standard `String.prototype.padEnd()` counts these invisible characters, resulting in misaligned columns.

**Problem:** `color.cyan('OS:').padEnd(20)` produces a string that *looks* 14 characters wide but is actually 20 characters including the ANSI codes, causing the layout to shift right.

**Solution:** `visibleLen()` strips ANSI codes before measuring, and `padVisible()` adds the correct number of spaces:

```javascript
// cli.js
function visibleLen(str) {
  return str.replace(/\x1b\[[0-9;]*m/g, '').length;
}
function padVisible(str, width) {
  const diff = width - visibleLen(str);
  return diff > 0 ? str + ' '.repeat(diff) : str;
}
```

This ensures perfect column alignment in the neofetch-style side-by-side layout and all rendered tables.
