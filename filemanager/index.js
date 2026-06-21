const readline = require('readline');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync, exec } = require('child_process');

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
  dim: (str) => `\x1b[2m${str}\x1b[22m`,
  inverse: (str) => `\x1b[7m${str}\x1b[27m`,
};

/**
 * Checks if a given filename represents a text file based on its extension.
 */
function isTextFile(filename) {
  const ext = path.extname(filename).toLowerCase();
  const textExtensions = [
    '', '.txt', '.md', '.js', '.json', '.css', '.html', '.xml', '.sh', '.bat', 
    '.py', '.c', '.cpp', '.h', '.hpp', '.cs', '.java', '.ts', '.tsx', '.jsx', 
    '.yml', '.yaml', '.ini', '.conf', '.cfg', '.log', '.env', '.gitignore'
  ];
  return textExtensions.includes(ext);
}

/**
 * Checks if a given filename represents an image file based on its extension.
 */
function isImageFile(filename) {
  const ext = path.extname(filename).toLowerCase();
  const imageExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp', '.svg', '.tiff', '.ico'];
  return imageExtensions.includes(ext);
}

/**
 * Checks if a given filename represents a video file based on its extension.
 */
function isVideoFile(filename) {
  const ext = path.extname(filename).toLowerCase();
  const videoExtensions = ['.mp4', '.mkv', '.avi', '.mov', '.wmv', '.flv', '.webm', '.mpeg', '.mpg'];
  return videoExtensions.includes(ext);
}

/**
 * Checks if a given filename represents an archive file based on its extension.
 */
function isArchiveFile(filename) {
  const ext = path.extname(filename).toLowerCase();
  const archiveExtensions = [
    '.zip', '.tar', '.gz', '.tgz', '.rar', '.7z', '.bz2', '.xz', 
    '.zipx', '.cab', '.iso', '.jar', '.war'
  ];
  return archiveExtensions.includes(ext);
}

/**
 * Standard shell argument parser that handles quotes correctly, 
 * allowing files or directories with spaces in their names.
 */
function parseCommand(line) {
  const args = [];
  let current = '';
  let inQuotes = false;
  let quoteChar = null;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if ((char === '"' || char === "'") && (i === 0 || line[i - 1] !== '\\')) {
      if (inQuotes && char === quoteChar) {
        inQuotes = false;
        quoteChar = null;
      } else if (!inQuotes) {
        inQuotes = true;
        quoteChar = char;
      } else {
        current += char;
      }
    } else if (char === ' ' && !inQuotes) {
      if (current.length > 0) {
        args.push(current);
        current = '';
      }
    } else {
      current += char;
    }
  }
  if (current.length > 0) {
    args.push(current);
  }
  return args;
}

/**
 * Resolves process.cwd() against the default home path to generate a clean,
 * cross-platform path indicator (e.g. '~' or '~/Documents' or full path).
 */
function getPathIndicator(defaultPath) {
  const cwd = process.cwd();
  const relative = path.relative(defaultPath, cwd);
  if (cwd === defaultPath) {
    return '~';
  } else if (!relative.startsWith('..') && !path.isAbsolute(relative)) {
    return '~' + path.sep + relative;
  } else {
    return cwd;
  }
}

// ── Command aliases: Windows-style names map to canonical Unix commands ───
const ALIASES = {
  dir: 'ls', type: 'cat', copy: 'cp', move: 'mv',
  del: 'rm', erase: 'rm', rd: 'rm', rmdir: 'rm',
  ren: 'mv', rename: 'mv', md: 'mkdir', clear: 'cls',
  quit: 'exit',
};

// ── Command Help Database ────────────────────────────────────────────────
const COMMAND_HELP = {
  cd: {
    desc: 'Change the current working directory.',
    usage: 'cd [directory | ~]',
    example: 'cd Documents  or  cd ~  (to go home)',
    crud: 'Read (Navigation)'
  },
  ls: {
    desc: 'List directory contents.',
    usage: 'ls [-a] [directory]  (or Windows: dir [/a] [directory])',
    options: {
      '-a': 'Show hidden files starting with "." (Windows equivalent: /a)'
    },
    crud: 'Read (Directory contents)'
  },
  pwd: {
    desc: 'Print name of current working directory.',
    usage: 'pwd',
    crud: 'Read (Current directory path)'
  },
  cat: {
    desc: 'Concatenate and display file content.',
    usage: 'cat [file...]  (or Windows: type [file...])',
    crud: 'Read (File content)'
  },
  mkdir: {
    desc: 'Create directory or directories.',
    usage: 'mkdir [-p] [directory...]  (or Windows: md [directory...])',
    options: {
      '-p': 'Create parent directories recursively if they do not exist'
    },
    crud: 'Create (Directory)'
  },
  touch: {
    desc: 'Create an empty file or update file timestamps.',
    usage: 'touch [-f] [file...]',
    options: {
      '-f': 'Force create/replace existing file'
    },
    crud: 'Create (File)'
  },
  rm: {
    desc: 'Remove file or directory.',
    usage: 'rm [-r] [-rf] [target...]  (or Windows: del [file...] / rmdir [/s] [directory...])',
    options: {
      '-r, -rf': 'Remove directories and their contents recursively (Windows equivalent: /s)'
    },
    crud: 'Delete (File or Directory)'
  },
  cp: {
    desc: 'Copy files or directories.',
    usage: 'cp [src] [dst]  (or Windows: copy [src] [dst])',
    crud: 'Update (Duplicate/Copy)'
  },
  mv: {
    desc: 'Move or rename files or directories.',
    usage: 'mv [src] [dst]  (or Windows: move [src] [dst] / ren [src] [dst])',
    crud: 'Update (Rename/Relocate)'
  },
  cls: {
    desc: 'Clear the terminal screen.',
    usage: 'cls  (or Windows: clear)',
    crud: 'Readability utility'
  },
  exit: {
    desc: 'Exit the file manager and return to main menu.',
    usage: 'exit  (or quit)',
    crud: 'Navigation utility'
  },
  browse: {
    desc: 'Open the interactive visual arrow-key directory browser.',
    usage: 'browse [directory]',
    crud: 'Read (Interactive Navigation)'
  }
};

function showCommandHelp(cmd) {
  const info = COMMAND_HELP[cmd];
  if (!info) {
    console.log(color.red(`  No help entry found for command "${cmd}".`));
    return;
  }
  console.log(color.bold(color.cyan(`\n  HELP: ${cmd.toUpperCase()}`)));
  console.log(color.dim('  ' + '─'.repeat(40)));
  console.log(`  ${color.bold('CRUD Category:')} ${color.yellow(info.crud)}`);
  console.log(`  ${color.bold('Description:')}   ${info.desc}`);
  console.log(`  ${color.bold('Usage:')}         ${info.usage}`);
  if (info.options) {
    console.log(`  ${color.bold('Options:')}`);
    for (const [opt, optDesc] of Object.entries(info.options)) {
      console.log(`    ${color.green(opt.padEnd(8))} ${optDesc}`);
    }
  }
  if (info.example) {
    console.log(`  ${color.bold('Example:')}       ${color.green(info.example)}`);
  }
  console.log();
}

// ── Levenshtein Distance for Command Suggestion ─────────────────────────
function levenshtein(a, b) {
  const matrix = [];
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }
  return matrix[b.length][a.length];
}

// ── File Manager Choice Menu ─────────────────────────────────────────────
function showFileManagerMenu() {
  return new Promise((resolve) => {
    let selected = 0;
    const items = [
      { label: 'Visual Directory Browser (Browse)', action: 'browse' },
      { label: 'Command Line Terminal (Terminal)', action: 'terminal' },
      { label: 'Back to Main Menu', action: 'back' }
    ];

    const originalRawMode = process.stdin.isRawMode;
    readline.emitKeypressEvents(process.stdin);
    if (process.stdin.isTTY) process.stdin.setRawMode(true);
    process.stdin.resume();

    function render() {
      process.stdout.write('\x1b[2J\x1b[H');
      console.log(color.bold(color.green(' ────────────────────────────────────────────────────────')));
      console.log(color.bold(color.green(' │                    FILE MANAGER                      │')));
      console.log(color.bold(color.green(' ────────────────────────────────────────────────────────')));
      console.log(color.cyan('  [↑/↓ or j/k to select · Enter to confirm · Esc/q to exit]\n'));

      items.forEach((item, idx) => {
        const isSelected = idx === selected;
        const prefix = isSelected ? ' ➤ ' : '   ';
        if (isSelected) {
          console.log(prefix + color.inverse(color.green(` ${item.label} `)));
        } else {
          console.log(prefix + color.white(item.label));
        }
      });
      console.log();
    }

    render();

    function onKey(str, key) {
      const keyName = key ? (key.name || '') : '';
      if (keyName === 'up' || str === 'k') {
        if (selected > 0) {
          selected--;
          render();
        }
      } else if (keyName === 'down' || str === 'j') {
        if (selected < items.length - 1) {
          selected++;
          render();
        }
      } else if (keyName === 'return' || keyName === 'enter' || keyName === 'linefeed' || str === '\n' || str === '\r') {
        cleanup();
        resolve(items[selected].action);
      } else if (keyName === 'escape' || str === 'q') {
        cleanup();
        resolve('back');
      }
    }

    function cleanup() {
      process.stdin.removeListener('keypress', onKey);
      if (process.stdin.isTTY) process.stdin.setRawMode(originalRawMode);
    }

    process.stdin.on('keypress', onKey);
  });
}

// ── Folder Selection Action Choice Menu ──────────────────────────────────
function showFolderChoiceMenu(folderName) {
  return new Promise((resolve) => {
    let selected = 0;
    const items = [
      { label: 'Enter folder (Browse)', action: 'browse' },
      { label: 'Open CRUD Terminal here', action: 'terminal' },
      { label: 'Cancel', action: 'cancel' }
    ];

    const originalRawMode = process.stdin.isRawMode;
    readline.emitKeypressEvents(process.stdin);
    if (process.stdin.isTTY) process.stdin.setRawMode(true);
    process.stdin.resume();

    function render() {
      process.stdout.write('\x1b[2J\x1b[H');
      console.log(color.bold(color.green(' ────────────────────────────────────────────────────────')));
      console.log(color.bold(color.green(` │  Folder Option: ${folderName.slice(0, 36).padEnd(36)} │`)));
      console.log(color.bold(color.green(' ────────────────────────────────────────────────────────')));
      console.log(color.cyan('  [↑/↓ or j/k to select · Enter to confirm · Esc/q to exit]\n'));

      items.forEach((item, idx) => {
        const isSelected = idx === selected;
        const prefix = isSelected ? ' ➤ ' : '   ';
        if (isSelected) {
          console.log(prefix + color.inverse(color.cyan(` ${item.label} `)));
        } else {
          console.log(prefix + color.white(item.label));
        }
      });
      console.log();
    }

    render();

    function onKey(str, key) {
      const keyName = key ? (key.name || '') : '';
      if (keyName === 'up' || str === 'k') {
        if (selected > 0) {
          selected--;
          render();
        }
      } else if (keyName === 'down' || str === 'j') {
        if (selected < items.length - 1) {
          selected++;
          render();
        }
      } else if (keyName === 'return' || keyName === 'enter' || keyName === 'linefeed' || str === '\n' || str === '\r') {
        cleanup();
        resolve(items[selected].action);
      } else if (keyName === 'escape' || str === 'q') {
        cleanup();
        resolve('cancel');
      }
    }

    function cleanup() {
      process.stdin.removeListener('keypress', onKey);
      if (process.stdin.isTTY) process.stdin.setRawMode(originalRawMode);
    }

    process.stdin.on('keypress', onKey);
  });
}

// ── Visual Directory Browser ─────────────────────────────────────────────
async function startVisualBrowser(initialDir, fileOps) {
  let currentDir = path.resolve(initialDir);
  let selectedIndex = 0;
  let items = [];

  function readDirectory() {
    try {
      const files = fs.readdirSync(currentDir);
      const dirs = [];
      const ordinaryFiles = [];
      
      const parent = path.dirname(currentDir);
      if (parent !== currentDir) {
        dirs.push({ name: '..', isDirectory: true });
      }

      for (const file of files) {
        const fullPath = path.join(currentDir, file);
        try {
          const stat = fs.statSync(fullPath);
          if (stat.isDirectory()) {
            dirs.push({ name: file, isDirectory: true });
          } else {
            ordinaryFiles.push({ name: file, isDirectory: false });
          }
        } catch {
          ordinaryFiles.push({ name: file, isDirectory: false });
        }
      }
      
      const sortedDirs = dirs.filter(d => d.name === '..');
      const otherDirs = dirs.filter(d => d.name !== '..').sort((a, b) => a.name.localeCompare(b.name));
      const sortedFiles = ordinaryFiles.sort((a, b) => a.name.localeCompare(b.name));

      items = [...sortedDirs, ...otherDirs, ...sortedFiles];
    } catch (err) {
      items = [{ name: `Error: ${err.message}`, isDirectory: false, error: true }];
    }
  }

  return new Promise((resolve) => {
    const originalRawMode = process.stdin.isRawMode;
    if (process.stdin.isTTY) process.stdin.setRawMode(true);
    process.stdin.resume();

    function render() {
      if (items.length > 0) {
        if (selectedIndex >= items.length) selectedIndex = items.length - 1;
        if (selectedIndex < 0) selectedIndex = 0;
      }

      process.stdout.write('\x1b[2J\x1b[H');
      console.log(color.bold(color.green(' ────────────────────────────────────────────────────────')));
      console.log(color.bold(color.green(` │  Browse: ${currentDir.slice(0, 43).padEnd(43)} │`)));
      console.log(color.bold(color.green(' ────────────────────────────────────────────────────────')));
      
      const selectedItem = items[selectedIndex];
      if (selectedItem && !selectedItem.isDirectory && !selectedItem.error) {
        if (isTextFile(selectedItem.name)) {
          console.log(color.yellow('  [Enter to open in default editor · Esc/q to exit]'));
          console.log(color.dim(`  ℹ️  Press Enter to open '${selectedItem.name}' in the default editor.\n`));
        } else if (isImageFile(selectedItem.name)) {
          console.log(color.magenta('  [Enter to open in default image viewer · Esc/q to exit]'));
          console.log(color.dim(`  ℹ️  Press Enter to open '${selectedItem.name}' in the default image viewer.\n`));
        } else if (isVideoFile(selectedItem.name)) {
          console.log(color.blue('  [Enter to play in default video player · Esc/q to exit]'));
          console.log(color.dim(`  ℹ️  Press Enter to play '${selectedItem.name}' in the default video player.\n`));
        } else if (isArchiveFile(selectedItem.name)) {
          console.log(color.green('  [Enter to open in default extractor · Esc/q to exit]'));
          console.log(color.dim(`  ℹ️  Press Enter to open '${selectedItem.name}' in the default archive extractor.\n`));
        } else {
          console.log(color.cyan('  [↑/↓ or j/k to select · Enter to open · Esc/q to exit]\n'));
        }
      } else {
        console.log(color.cyan('  [↑/↓ or j/k to select · Enter to open · Esc/q to exit]\n'));
      }

      if (items.length === 0) {
        console.log('  (empty directory)');
      } else {
        const termHeight = process.stdout.rows || 24;
        const visibleHeight = Math.max(5, termHeight - 9);

        let start = 0;
        if (selectedIndex >= visibleHeight) {
          start = selectedIndex - visibleHeight + 1;
        }

        const visibleItems = items.slice(start, start + visibleHeight);
        visibleItems.forEach((item, idx) => {
          const absoluteIdx = start + idx;
          const isSelected = absoluteIdx === selectedIndex;
          
          let prefix = isSelected ? ' ➤ ' : '   ';
          let lineText = '';
          if (item.error) {
            lineText = color.red(item.name);
          } else if (item.isDirectory) {
            lineText = color.cyan(`📁 ${item.name}`);
          } else {
            lineText = color.green(`📄 ${item.name}`);
          }

          if (isSelected) {
            console.log(prefix + color.inverse(lineText));
          } else {
            console.log(prefix + lineText);
          }
        });
      }
    }

    readDirectory();
    render();

    function onKey(str, key) {
      if (key && key.ctrl && key.name === 'c') {
        cleanup();
        resolve({ action: 'exit', dir: currentDir });
        return;
      }

      const keyName = key ? (key.name || '') : '';
      if (keyName === 'up' || str === 'k') {
        if (selectedIndex > 0) {
          selectedIndex--;
          render();
        }
      } else if (keyName === 'down' || str === 'j') {
        if (selectedIndex < items.length - 1) {
          selectedIndex++;
          render();
        }
      } else if (keyName === 'return' || keyName === 'enter' || keyName === 'linefeed' || str === '\n' || str === '\r') {
        const item = items[selectedIndex];
        if (item && !item.error) {
          if (item.name === '..') {
            currentDir = path.dirname(currentDir);
            selectedIndex = 0;
            readDirectory();
            render();
          } else if (item.isDirectory) {
            cleanup();
            const targetFolder = path.join(currentDir, item.name);
            showFolderChoiceMenu(item.name).then((choice) => {
              if (choice === 'browse') {
                if (process.stdin.isTTY) process.stdin.setRawMode(true);
                process.stdin.resume();
                process.stdin.on('keypress', onKey);
                currentDir = targetFolder;
                selectedIndex = 0;
                readDirectory();
                render();
              } else if (choice === 'terminal') {
                resolve({ action: 'terminal', dir: targetFolder });
              } else {
                // cancel
                if (process.stdin.isTTY) process.stdin.setRawMode(true);
                process.stdin.resume();
                process.stdin.on('keypress', onKey);
                render();
              }
            });
          } else {
            const fullPath = path.join(currentDir, item.name);
            if (isTextFile(item.name)) {
              cleanup();

              let editor = process.env.EDITOR || process.env.VISUAL;
              if (!editor) {
                if (process.platform === 'win32') {
                  editor = 'notepad';
                } else {
                  editor = 'nano';
                }
              }

              process.stdout.write('\x1b[2J\x1b[H');
              const result = spawnSync(editor, [fullPath], { stdio: 'inherit' });
              if (result.error && process.platform !== 'win32' && result.error.code === 'ENOENT' && editor === 'nano') {
                spawnSync('vi', [fullPath], { stdio: 'inherit' });
              }

              if (process.stdin.isTTY) process.stdin.setRawMode(true);
              process.stdin.resume();
              process.stdin.on('keypress', onKey);
              readDirectory();
              render();
            } else if (isImageFile(item.name) || isVideoFile(item.name) || isArchiveFile(item.name)) {
              let command = '';
              if (process.platform === 'win32') {
                command = `cmd.exe /c start "" "${fullPath}"`;
              } else if (process.platform === 'darwin') {
                command = `open "${fullPath}"`;
              } else {
                command = `xdg-open "${fullPath}"`;
              }

              exec(command, (err) => {
                // Background execution, handles error silently
              });

              let typeLabel = 'extractor';
              if (isImageFile(item.name)) typeLabel = 'image viewer';
              else if (isVideoFile(item.name)) typeLabel = 'video player';

              console.log(color.green(`\n  Opening '${item.name}' in default ${typeLabel}...`));
              setTimeout(() => {
                render();
              }, 1000);
            } else {
              cleanup();
              console.log(color.bold(color.cyan(`\n  Content of ${item.name}:`)));
              console.log(color.dim('  ' + '─'.repeat(40)));
              try {
                const content = fs.readFileSync(fullPath, 'utf8');
                console.log(content);
              } catch (err) {
                console.log(color.red(`  Error reading file: ${err.message}`));
              }
              console.log(color.dim('  ' + '─'.repeat(40)));
              
              console.log(color.cyan('  Press any key to return to browser...'));
              setTimeout(() => {
                process.stdin.once('data', () => {
                  if (process.stdin.isTTY) process.stdin.setRawMode(true);
                  process.stdin.on('keypress', onKey);
                  readDirectory();
                  render();
                });
              }, 100);
            }
          }
        }
      } else if (keyName === 'escape' || str === 'q') {
        cleanup();
        resolve({ action: 'exit', dir: currentDir });
      }
    }

    function cleanup() {
      process.stdin.removeListener('keypress', onKey);
      if (process.stdin.isTTY) process.stdin.setRawMode(originalRawMode);
    }

    readline.emitKeypressEvents(process.stdin);
    process.stdin.on('keypress', onKey);
  });
}

/**
 * Normalizes a single flag token so both Unix (`-a`) and Windows (`/a`)
 * styles resolve to the same internal form.
 */
function normalizeFlag(flag) {
  if (flag === '/a') return '-a';
  if (flag === '/s') return '-rf';
  if (flag === '/q') return null; // quiet — accepted, no-op
  if (flag === '/p') return '-p';
  if (flag === '/f') return '-f';
  return flag;
}

/**
 * Main interactive shell loop for the File Manager.
 */
async function runCommandTerminal(fileOps, targetDir = null) {
  if (fileOps) fileOps.logAction('navigate', 'File Manager', 'Opened interactive File Manager');

  console.log(color.bold(color.green('\n ────────────────────────────────────────────────────────')));
  console.log(color.bold(color.green(' │            Cross-Platform File Manager (JS)          │')));
  console.log(color.bold(color.green(' ────────────────────────────────────────────────────────')));
  console.log(color.yellow('  🛡️  CRUD capabilities supported:'));
  console.log(`     ${color.bold('Create:')} mkdir/md (dirs), touch (files)`);
  console.log(`     ${color.bold('Read:')}   ls/dir (list), cat/type (view content), pwd`);
  console.log(`     ${color.bold('Update:')} cp/copy (duplicate), mv/move/ren/rename (move/rename)`);
  console.log(`     ${color.bold('Delete:')} rm/del/rmdir/rd (remove files/folders)\n`);
  console.log(color.cyan('  Unix Commands: cd, ls, pwd, mkdir, touch, cat, rm, cp, mv, cls, exit'));
  console.log(color.cyan('  Win Commands:  dir, md, type, del, copy, move, ren, rmdir /s, clear\n'));
  console.log(color.dim('  💡 Type "help <command>" or "<command> -h" for Linux/Mac, or "<command> /?" for Windows.'));
  console.log(color.dim('  💡 Type "browse" for arrow-key interactive directory navigation.\n'));

  // Get cross-platform homedir (supports Linux, Windows, macOS)
  const default_path = os.homedir();
  const initialDir = process.cwd();
  
  try {
    process.chdir(targetDir || default_path);
  } catch (err) {
    console.log(color.yellow(`  Warning: Could not access home folder. Staying in current directory.`));
  }

  let rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const ask = (promptText) => new Promise((resolve) => rl.question(promptText, resolve));

  while (true) {
    const indicator = getPathIndicator(default_path);
    const promptText = `${color.bold(color.magenta(indicator))}${color.bold(color.white('$ '))}`;
    const line = await ask(promptText);
    
    if (line.trim() === '') {
      continue;
    }

    const args = parseCommand(line.trim());
    if (args.length === 0) continue;

    // Case-insensitive command dispatch — only the verb is lowercased, not paths
    const rawCmd = args[0].toLowerCase();
    const cmd = ALIASES[rawCmd] || rawCmd;

    // Normalize flags in-place so /a → -a, /s → -rf, /q → stripped
    const normalizedArgs = [args[0]];
    for (let i = 1; i < args.length; i++) {
      const f = normalizeFlag(args[i]);
      if (f !== null) normalizedArgs.push(f);
    }

    // Check for help flags (-h, --help, /?)
    const isHelpRequest = args.includes('-h') || args.includes('--help') || args.includes('/?');
    if (isHelpRequest) {
      showCommandHelp(cmd);
      continue;
    }

    // help command
    if (cmd === 'help' || cmd === '?') {
      const target = args[1] ? (ALIASES[args[1].toLowerCase()] || args[1].toLowerCase()) : null;
      if (target) {
        showCommandHelp(target);
      } else {
        console.log(color.bold(color.green('\n ────────────────────────────────────────────────────────')));
        console.log(color.bold(color.green(' │                    FILE MANAGER HELP                 │')));
        console.log(color.bold(color.green(' ────────────────────────────────────────────────────────')));
        console.log(color.yellow('  Command Manual:'));
        for (const [c, info] of Object.entries(COMMAND_HELP)) {
          console.log(`    ${color.bold(color.cyan(c.padEnd(8)))} ${info.desc} (${color.dim(info.crud)})`);
        }
        console.log(color.dim('\n  💡 Type "help <command>" or "<command> -h" to see options for specific commands.\n'));
      }
      continue;
    }

    // browse command (visual browser)
    if (cmd === 'browse') {
      let target = args[1] || '.';
      if (target.startsWith('~/') || target.startsWith('~\\')) {
        target = path.join(default_path, target.slice(2));
      } else if (target === '~') {
        target = default_path;
      }

      rl.close();

      const result = await startVisualBrowser(target, fileOps);
      const newDir = (result && result.dir) ? result.dir : target;
      try {
        process.chdir(newDir);
      } catch {}

      rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });

      if (fileOps) fileOps.logAction('navigate', 'File Manager', `Navigated via visual browser to: ${getPathIndicator(default_path)}`);
      continue;
    }

    // exit command to return to main menu
    if (cmd === 'exit' || cmd === 'quit') {
      if (fileOps) fileOps.logAction('navigate', 'File Manager', 'Exited interactive File Manager');
      console.log(color.green('\n  Exiting File Manager. Returning to Inspector menu...\n'));
      rl.close();
      // Restore previous directory before exiting
      try {
        process.chdir(initialDir);
      } catch {}
      return;
    }

    // 1. cd [directory]
    if (cmd === 'cd') {
      if (args.length > 2) {
        console.log(color.red('cd: too many arguments'));
        if (fileOps) fileOps.logAction('cd', 'cd', 'Failed: too many arguments');
      } else if (args.length === 1 || args[1] === '~') {
        try {
          process.chdir(default_path);
          if (fileOps) fileOps.logAction('cd', '~', `Changed directory to: ${getPathIndicator(default_path)}`);
        } catch (err) {
          console.log(color.red(`cd: ${err.message}`));
          if (fileOps) fileOps.logAction('cd', '~', `Failed: ${err.message}`);
        }
      } else {
        let target = args[1];
        if (target.startsWith('~/') || target.startsWith('~\\')) {
          target = path.join(default_path, target.slice(2));
        }
        try {
          process.chdir(target);
          if (fileOps) fileOps.logAction('cd', args[1], `Changed directory to: ${getPathIndicator(default_path)}`);
        } catch (err) {
          if (err.code === 'ENOENT') {
            console.log(color.red(`cd: ${args[1]}: No such file or directory`));
            if (fileOps) fileOps.logAction('cd', args[1], 'Failed: directory not found');
          } else if (err.code === 'EACCES') {
            console.log(color.red('Permission denied. This directory requires administrator/root access.'));
            if (fileOps) fileOps.logAction('cd', args[1], 'Failed: permission denied');
          } else {
            console.log(color.red(`cd: ${err.message}`));
            if (fileOps) fileOps.logAction('cd', args[1], `Failed: ${err.message}`);
          }
        }
      }
    } 
    // 2. ls [-a] [directory]
    else if (cmd === 'ls') {
      let showHidden = false;
      let targetPath = '.';

      const options = [];
      const positional = [];
      for (let i = 1; i < normalizedArgs.length; i++) {
        if (normalizedArgs[i].startsWith('-')) {
          options.push(normalizedArgs[i]);
        } else {
          positional.push(normalizedArgs[i]);
        }
      }

      if (options.includes('-a')) {
        showHidden = true;
      }

      if (positional.length > 0) {
        targetPath = positional[0];
        if (targetPath.startsWith('~/') || targetPath.startsWith('~\\')) {
          targetPath = path.join(default_path, targetPath.slice(2));
        } else if (targetPath === '~') {
          targetPath = default_path;
        }
      }

      try {
        const files = fs.readdirSync(targetPath);
        const dirs = [];
        const ordinaryFiles = [];

        for (const file of files) {
          if (showHidden || !file.startsWith('.')) {
            const fullPath = path.join(targetPath, file);
            try {
              const stat = fs.statSync(fullPath);
              if (stat.isDirectory()) {
                dirs.push(file);
              } else {
                ordinaryFiles.push(file);
              }
            } catch {
              ordinaryFiles.push(file); // fallback
            }
          }
        }

        dirs.sort();
        ordinaryFiles.sort();

        // Stylized colored print: directories in cyan, files in green
        for (const dir of dirs) {
          console.log(color.cyan(`📁 ${dir}`));
        }
        for (const file of ordinaryFiles) {
          console.log(color.green(`📄 ${file}`));
        }
        if (fileOps) fileOps.logAction('ls', targetPath, `Listed ${files.length} items`);
      } catch (err) {
        if (err.code === 'ENOENT') {
          console.log(color.red(`ls: ${targetPath}: No such file or directory`));
          if (fileOps) fileOps.logAction('ls', targetPath, 'Failed: directory not found');
        } else if (err.code === 'EACCES') {
          console.log(color.red('Permission denied. This directory requires administrator/root access.'));
          if (fileOps) fileOps.logAction('ls', targetPath, 'Failed: permission denied');
        } else {
          console.log(color.red(`ls: ${err.message}`));
          if (fileOps) fileOps.logAction('ls', targetPath, `Failed: ${err.message}`);
        }
      }
    } 
    // 3. pwd
    else if (cmd === 'pwd') {
      console.log(color.cyan(process.cwd()));
      if (fileOps) fileOps.logAction('pwd', process.cwd(), 'Printed current working directory');
    } 
    // 4. cat <file>  /  type <file>
    else if (cmd === 'cat') {
      const targets = normalizedArgs.slice(1);
      if (targets.length === 0) {
        console.log(color.red('cat: missing operand'));
        if (fileOps) fileOps.logAction('read', 'cat', 'Failed: missing operand');
      } else {
        for (const origTarget of targets) {
          let target = origTarget;
          if (target.startsWith('~/') || target.startsWith('~\\')) {
            target = path.join(default_path, target.slice(2));
          } else if (target === '~') {
            target = default_path;
          }
          try {
            if (!fs.existsSync(target)) {
              console.log(color.red(`cat: ${origTarget}: No such file or directory`));
              if (fileOps) fileOps.logAction('read', origTarget, 'Failed: file not found');
              continue;
            }
            const stat = fs.statSync(target);
            if (stat.isDirectory()) {
              console.log(color.red(`cat: ${origTarget}: Is a directory`));
              if (fileOps) fileOps.logAction('read', origTarget, 'Failed: is a directory');
              continue;
            }
            const content = fs.readFileSync(target, 'utf8');
            process.stdout.write(content);
            // Ensure trailing newline for clean prompt return
            if (content.length > 0 && !content.endsWith('\n')) {
              process.stdout.write('\n');
            }
            if (fileOps) fileOps.logAction('read', origTarget, `Read file contents (${Buffer.byteLength(content)} bytes)`);
          } catch (err) {
            if (err.code === 'EACCES') {
              console.log(color.red('Permission denied. This file requires administrator/root access.'));
              if (fileOps) fileOps.logAction('read', origTarget, 'Failed: permission denied');
            } else {
              console.log(color.red(`cat: ${err.message}`));
              if (fileOps) fileOps.logAction('read', origTarget, `Failed: ${err.message}`);
            }
          }
        }
      }
    } 
    // 5. mkdir [-p] [directories...]  /  md
    else if (cmd === 'mkdir') {
      const hasP = normalizedArgs.includes('-p');
      const targets = normalizedArgs.slice(1).filter(a => a !== '-p');

      if (targets.length === 0) {
        console.log(color.red('mkdir: missing operand'));
        if (fileOps) fileOps.logAction('create', 'mkdir', 'Failed: missing operand');
      } else {
        for (let target of targets) {
          if (target.startsWith('~/') || target.startsWith('~\\')) {
            target = path.join(default_path, target.slice(2));
          } else if (target === '~') {
            target = default_path;
          }
          try {
            fs.mkdirSync(target, { recursive: hasP });
            if (fileOps) fileOps.logAction('create', target, 'Created directory');
          } catch (err) {
            if (err.code === 'EEXIST') {
              console.log(color.red(`mkdir: cannot create directory '${target}': File exists`));
              if (fileOps) fileOps.logAction('create', target, 'Failed: directory already exists');
            } else if (err.code === 'ENOENT') {
              console.log(color.red(`mkdir: cannot create directory '${target}': No such file or directory (use -p to create recursively)`));
              if (fileOps) fileOps.logAction('create', target, 'Failed: parent directory not found');
            } else if (err.code === 'EACCES') {
              console.log(color.red('Permission denied. Requires administrator/root privileges.'));
              if (fileOps) fileOps.logAction('create', target, 'Failed: permission denied');
            } else {
              console.log(color.red(`mkdir: ${err.message}`));
              if (fileOps) fileOps.logAction('create', target, `Failed: ${err.message}`);
            }
          }
        }
      }
    } 
    // 6. touch [-f] [files...]
    else if (cmd === 'touch') {
      const hasF = normalizedArgs.includes('-f');
      const targets = normalizedArgs.slice(1).filter(a => a !== '-f');

      if (targets.length === 0) {
        console.log(color.red('touch: missing operand'));
        if (fileOps) fileOps.logAction('create', 'touch', 'Failed: missing operand');
      } else {
        for (let target of targets) {
          if (target.startsWith('~/') || target.startsWith('~\\')) {
            target = path.join(default_path, target.slice(2));
          } else if (target === '~') {
            target = default_path;
          }
          try {
            const dir = path.dirname(target);
            if (dir !== '.' && !fs.existsSync(dir)) {
              console.log(color.red(`touch: cannot touch '${target}': No such file or directory`));
              if (fileOps) fileOps.logAction('create', target, 'Failed: parent directory not found');
              continue;
            }

            const exists = fs.existsSync(target);
            if (exists && !hasF) {
              console.log(color.yellow(`File exists: '${target}'. To replace, use -f`));
              if (fileOps) fileOps.logAction('create', target, 'Failed: file exists (needs -f)');
            } else {
              fs.writeFileSync(target, '', 'utf8');
              if (fileOps) fileOps.logAction('create', target, 'Created empty file');
            }
          } catch (err) {
            if (err.code === 'EACCES') {
              console.log(color.red('Permission denied. Requires administrator/root privileges.'));
              if (fileOps) fileOps.logAction('create', target, 'Failed: permission denied');
            } else {
              console.log(color.red(`touch: ${err.message}`));
              if (fileOps) fileOps.logAction('create', target, `Failed: ${err.message}`);
            }
          }
        }
      }
    } 
    // 7. rm [-r] [-rf] [targets...]  /  del, erase, rmdir, rd
    else if (cmd === 'rm') {
      const hasR = normalizedArgs.includes('-r');
      const hasRF = normalizedArgs.includes('-rf');
      const isRecursive = hasR || hasRF;
      const targets = normalizedArgs.slice(1).filter(a => a !== '-r' && a !== '-rf' && a !== '-f');

      if (targets.length === 0) {
        console.log(color.red('rm: missing operand'));
        if (fileOps) fileOps.logAction('delete', 'rm', 'Failed: missing operand');
      } else {
        for (let target of targets) {
          if (target.startsWith('~/') || target.startsWith('~\\')) {
            target = path.join(default_path, target.slice(2));
          } else if (target === '~') {
            target = default_path;
          }
          try {
            if (!fs.existsSync(target)) {
              console.log(color.red(`rm: cannot remove '${target}': No such file or directory`));
              if (fileOps) fileOps.logAction('delete', target, 'Failed: file/directory not found');
              continue;
            }

            const stat = fs.statSync(target);
            if (stat.isDirectory()) {
              if (isRecursive) {
                fs.rmSync(target, { recursive: true, force: true });
                if (fileOps) fileOps.logAction('delete', target, 'Deleted directory recursively');
              } else {
                console.log(color.red(`rm: cannot remove '${target}': Is a directory (use -r to delete)`));
                if (fileOps) fileOps.logAction('delete', target, 'Failed: is a directory (needs -r)');
              }
            } else {
              fs.unlinkSync(target);
              if (fileOps) fileOps.logAction('delete', target, 'Deleted file');
            }
          } catch (err) {
            if (err.code === 'EACCES') {
              console.log(color.red('Permission denied. Requires administrator/root privileges.'));
              if (fileOps) fileOps.logAction('delete', target, 'Failed: permission denied');
            } else {
              console.log(color.red(`rm: ${err.message}`));
              if (fileOps) fileOps.logAction('delete', target, `Failed: ${err.message}`);
            }
          }
        }
      }
    } 
    // 8. cp [src] [dst]  /  copy
    else if (cmd === 'cp') {
      const targets = normalizedArgs.slice(1);
      if (targets.length < 2) {
        console.log(color.red('cp: missing source or destination operand'));
        if (fileOps) fileOps.logAction('copy', 'cp', 'Failed: missing source or destination');
      } else {
        let src = targets[targets.length - 2];
        let dst = targets[targets.length - 1];

        if (src.startsWith('~/') || src.startsWith('~\\')) src = path.join(default_path, src.slice(2));
        if (dst.startsWith('~/') || dst.startsWith('~\\')) dst = path.join(default_path, dst.slice(2));

        try {
          if (!fs.existsSync(src)) {
            console.log(color.red(`cp: cannot copy '${src}': No such file or directory`));
            if (fileOps) fileOps.logAction('copy', src, `Failed: source not found`);
          } else {
            const stat = fs.statSync(src);
            if (stat.isDirectory()) {
              fs.cpSync(src, dst, { recursive: true });
              if (fileOps) fileOps.logAction('copy', src, `Copied directory to ${dst}`);
            } else {
              fs.copyFileSync(src, dst);
              if (fileOps) fileOps.logAction('copy', src, `Copied file to ${dst}`);
            }
          }
        } catch (err) {
          console.log(color.red(`cp: ${err.message}`));
          if (fileOps) fileOps.logAction('copy', src, `Failed: ${err.message}`);
        }
      }
    } 
    // 9. mv [src] [dst]  /  move, ren, rename
    else if (cmd === 'mv') {
      const targets = normalizedArgs.slice(1);
      if (targets.length < 2) {
        console.log(color.red('mv: missing source or destination operand'));
        if (fileOps) fileOps.logAction('move', 'mv', 'Failed: missing source or destination');
      } else {
        let src = targets[targets.length - 2];
        let dst = targets[targets.length - 1];

        if (src.startsWith('~/') || src.startsWith('~\\')) src = path.join(default_path, src.slice(2));
        if (dst.startsWith('~/') || dst.startsWith('~\\')) dst = path.join(default_path, dst.slice(2));

        try {
          if (!fs.existsSync(src)) {
            console.log(color.red(`mv: cannot move '${src}': No such file or directory`));
            if (fileOps) fileOps.logAction('move', src, `Failed: source not found`);
          } else {
            fs.renameSync(src, dst);
            if (fileOps) fileOps.logAction('move', src, `Moved/renamed to ${dst}`);
          }
        } catch (err) {
          if (err.code === 'EXDEV') {
            // Handle cross-device move fallback (copy + delete)
            try {
              fs.cpSync(src, dst, { recursive: true });
              fs.rmSync(src, { recursive: true, force: true });
              if (fileOps) fileOps.logAction('move', src, `Moved to ${dst} (cross-device)`);
            } catch (copyErr) {
              console.log(color.red(`mv: ${copyErr.message}`));
              if (fileOps) fileOps.logAction('move', src, `Failed cross-device move: ${copyErr.message}`);
            }
          } else {
            console.log(color.red(`mv: ${err.message}`));
            if (fileOps) fileOps.logAction('move', src, `Failed: ${err.message}`);
          }
        }
      }
    } 
    // 10. cls / clear — clear terminal screen
    else if (cmd === 'cls') {
      process.stdout.write('\x1b[2J\x1b[H');
      if (fileOps) fileOps.logAction('clear', 'screen', 'Cleared screen');
    } else {
      const allCommands = [
        ...Object.keys(COMMAND_HELP),
        ...Object.keys(ALIASES),
        'quit'
      ];
      let bestMatch = null;
      let minDistance = 3; // only suggest if distance is <= 2
      for (const known of allCommands) {
        const dist = levenshtein(rawCmd, known);
        if (dist < minDistance) {
          minDistance = dist;
          bestMatch = known;
        }
      }

      console.log(color.red(`filemanager: ${rawCmd}: command not found`));
      if (bestMatch) {
        console.log(color.yellow(`  💡 Did you mean "${bestMatch}"?`));
      }
      if (fileOps) fileOps.logAction('error', rawCmd, 'Command execution failed (not found)');
    }
  }
}

/**
 * Main coordinator function that displays the File Manager mode selection menu (Browse or Terminal)
 * and orchestrates navigation between visual browsing and command line terminal execution.
 */
async function startFileManager(fileOps) {
  const initialDir = process.cwd();
  try {
    while (true) {
      const mode = await showFileManagerMenu();
      if (mode === 'browse') {
        let currentDir = os.homedir();
        while (currentDir) {
          const result = await startVisualBrowser(currentDir, fileOps);
          if (result && result.action === 'terminal') {
            await runCommandTerminal(fileOps, result.dir);
            // Loop back in the exact folder path
            currentDir = result.dir;
          } else if (result && result.action === 'browse') {
            currentDir = result.dir;
          } else {
            // Esc or q exits back to file manager choice menu
            break;
          }
        }
      } else if (mode === 'terminal') {
        await runCommandTerminal(fileOps, os.homedir());
      } else {
        // Back to main menu
        break;
      }
    }
  } finally {
    try {
      process.chdir(initialDir);
    } catch {}
  }
}

module.exports = { startFileManager };
