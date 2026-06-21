const readline = require('readline');
const fs = require('fs');
const path = require('path');
const os = require('os');

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
};

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
async function startFileManager() {
  console.log(color.bold(color.green('\n ────────────────────────────────────────────────────────')));
  console.log(color.bold(color.green(' │            Cross-Platform File Manager (JS)          │')));
  console.log(color.bold(color.green(' ────────────────────────────────────────────────────────')));
  console.log(color.cyan('  Unix:  cd, ls, pwd, mkdir, touch, cat, rm, cp, mv, cls, exit'));
  console.log(color.cyan('  Win:   dir, md, type, del, copy, move, ren, rmdir /s, clear\n'));

  // Get cross-platform homedir (supports Linux, Windows, macOS)
  const default_path = os.homedir();
  const initialDir = process.cwd();
  
  try {
    process.chdir(default_path);
  } catch (err) {
    console.log(color.yellow(`  Warning: Could not access home folder. Staying in current directory.`));
  }

  const rl = readline.createInterface({
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

    // exit command to return to main menu
    if (cmd === 'exit' || cmd === 'quit') {
      console.log(color.green('\n  Exiting File Manager. Returning to GlassBox menu...\n'));
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
      } else if (args.length === 1 || args[1] === '~') {
        try {
          process.chdir(default_path);
        } catch (err) {
          console.log(color.red(`cd: ${err.message}`));
        }
      } else {
        let target = args[1];
        if (target.startsWith('~/') || target.startsWith('~\\')) {
          target = path.join(default_path, target.slice(2));
        }
        try {
          process.chdir(target);
        } catch (err) {
          if (err.code === 'ENOENT') {
            console.log(color.red(`cd: ${args[1]}: No such file or directory`));
          } else if (err.code === 'EACCES') {
            console.log(color.red('Permission denied. This directory requires administrator/root access.'));
          } else {
            console.log(color.red(`cd: ${err.message}`));
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
      } catch (err) {
        if (err.code === 'ENOENT') {
          console.log(color.red(`ls: ${targetPath}: No such file or directory`));
        } else if (err.code === 'EACCES') {
          console.log(color.red('Permission denied. This directory requires administrator/root access.'));
        } else {
          console.log(color.red(`ls: ${err.message}`));
        }
      }
    } 
    // 3. pwd
    else if (cmd === 'pwd') {
      console.log(color.cyan(process.cwd()));
    } 
    // 4. cat <file>  /  type <file>
    else if (cmd === 'cat') {
      const targets = normalizedArgs.slice(1);
      if (targets.length === 0) {
        console.log(color.red('cat: missing operand'));
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
              continue;
            }
            const stat = fs.statSync(target);
            if (stat.isDirectory()) {
              console.log(color.red(`cat: ${origTarget}: Is a directory`));
              continue;
            }
            const content = fs.readFileSync(target, 'utf8');
            process.stdout.write(content);
            // Ensure trailing newline for clean prompt return
            if (content.length > 0 && !content.endsWith('\n')) {
              process.stdout.write('\n');
            }
          } catch (err) {
            if (err.code === 'EACCES') {
              console.log(color.red('Permission denied. This file requires administrator/root access.'));
            } else {
              console.log(color.red(`cat: ${err.message}`));
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
      } else {
        for (let target of targets) {
          if (target.startsWith('~/') || target.startsWith('~\\')) {
            target = path.join(default_path, target.slice(2));
          } else if (target === '~') {
            target = default_path;
          }
          try {
            fs.mkdirSync(target, { recursive: hasP });
          } catch (err) {
            if (err.code === 'EEXIST') {
              console.log(color.red(`mkdir: cannot create directory '${target}': File exists`));
            } else if (err.code === 'ENOENT') {
              console.log(color.red(`mkdir: cannot create directory '${target}': No such file or directory (use -p to create recursively)`));
            } else if (err.code === 'EACCES') {
              console.log(color.red('Permission denied. Requires administrator/root privileges.'));
            } else {
              console.log(color.red(`mkdir: ${err.message}`));
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
              continue;
            }

            const exists = fs.existsSync(target);
            if (exists && !hasF) {
              console.log(color.yellow(`File exists: '${target}'. To replace, use -f`));
            } else {
              fs.writeFileSync(target, '', 'utf8');
            }
          } catch (err) {
            if (err.code === 'EACCES') {
              console.log(color.red('Permission denied. Requires administrator/root privileges.'));
            } else {
              console.log(color.red(`touch: ${err.message}`));
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
              continue;
            }

            const stat = fs.statSync(target);
            if (stat.isDirectory()) {
              if (isRecursive) {
                fs.rmSync(target, { recursive: true, force: true });
              } else {
                console.log(color.red(`rm: cannot remove '${target}': Is a directory (use -r to delete)`));
              }
            } else {
              fs.unlinkSync(target);
            }
          } catch (err) {
            if (err.code === 'EACCES') {
              console.log(color.red('Permission denied. Requires administrator/root privileges.'));
            } else {
              console.log(color.red(`rm: ${err.message}`));
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
      } else {
        let src = targets[targets.length - 2];
        let dst = targets[targets.length - 1];

        if (src.startsWith('~/') || src.startsWith('~\\')) src = path.join(default_path, src.slice(2));
        if (dst.startsWith('~/') || dst.startsWith('~\\')) dst = path.join(default_path, dst.slice(2));

        try {
          if (!fs.existsSync(src)) {
            console.log(color.red(`cp: cannot copy '${src}': No such file or directory`));
          } else {
            const stat = fs.statSync(src);
            if (stat.isDirectory()) {
              fs.cpSync(src, dst, { recursive: true });
            } else {
              fs.copyFileSync(src, dst);
            }
          }
        } catch (err) {
          console.log(color.red(`cp: ${err.message}`));
        }
      }
    } 
    // 9. mv [src] [dst]  /  move, ren, rename
    else if (cmd === 'mv') {
      const targets = normalizedArgs.slice(1);
      if (targets.length < 2) {
        console.log(color.red('mv: missing source or destination operand'));
      } else {
        let src = targets[targets.length - 2];
        let dst = targets[targets.length - 1];

        if (src.startsWith('~/') || src.startsWith('~\\')) src = path.join(default_path, src.slice(2));
        if (dst.startsWith('~/') || dst.startsWith('~\\')) dst = path.join(default_path, dst.slice(2));

        try {
          if (!fs.existsSync(src)) {
            console.log(color.red(`mv: cannot move '${src}': No such file or directory`));
          } else {
            fs.renameSync(src, dst);
          }
        } catch (err) {
          if (err.code === 'EXDEV') {
            // Handle cross-device move fallback (copy + delete)
            try {
              fs.cpSync(src, dst, { recursive: true });
              fs.rmSync(src, { recursive: true, force: true });
            } catch (copyErr) {
              console.log(color.red(`mv: ${copyErr.message}`));
            }
          } else {
            console.log(color.red(`mv: ${err.message}`));
          }
        }
      }
    } 
    // 10. cls / clear — clear terminal screen
    else if (cmd === 'cls') {
      process.stdout.write('\x1b[2J\x1b[H');
    } else {
      console.log(color.red(`filemanager: ${rawCmd}: command not found`));
    }
  }
}

module.exports = { startFileManager };
