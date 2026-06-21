# GlassBox

> **Thunder Hackathon 3.0** — A modular Node.js CLI dev-utility suite.
> Zero dependencies. Pure built-in modules. Safety-first design.

```
┌─────────────────────────────────────────────────────────────┐
│                   inspector (npm start)                     │
│                                                             │
│  ┌──────────────────────┐    ┌───────────────────────────┐  │
│  │   📊 SysInspector    │    │   📁 File Manager         │  │
│  │                      │    │                           │  │
│  │  • System snapshots  │    │  • cd, ls, mkdir, cp      │  │
│  │  • Sandboxed CRUD    │    │  • rm, mv, touch, pwd     │  │
│  │  • Session changelog │    │  • Full filesystem shell  │  │
│  └──────────────────────┘    └───────────────────────────┘  │
│                                                             │
│  Tech: Node.js · os · fs · path · readline · util           │
│  Deps: 0                                                    │
└─────────────────────────────────────────────────────────────┘
```

---

## Quick Start

```bash
git clone <repo-url> && cd inspector
npm start              # interactive menu
npm run info           # one-shot system snapshot
npm run info:json      # JSON output (pipe-friendly)
```

Override the sandbox root:

```bash
node sysinspector/src/index.js --dir /tmp/my-sandbox
```

---

## Architecture

```mermaid
graph TD
    PKG["package.json<br/>3 npm scripts"] --> IDX["index.js<br/>argv parser & router"]

    IDX -->|"info"| SYS["sysinfo.js<br/>safe OS snapshot"]
    IDX -->|"info --json"| JSON["JSON.stringify"]
    IDX -->|"no args"| CLI["cli.js<br/>interactive menu"]

    CLI -->|"options 1,2"| SYS
    CLI -->|"options 3-8"| FOP["fileOps.js<br/>sandboxed CRUD"]
    CLI -->|"option 9"| FM["filemanager/index.js<br/>shell emulator"]

    FOP --> RS["_resolveSafe()<br/>path escape guard"]
    FOP --> CL["changelog[]<br/>audit trail"]
    FM --> SHELL["cd · ls · mkdir · cp<br/>rm · mv · touch · pwd"]
```

---

## Interactive Menu

When you run `npm start`, you get an arrow-key selector menu:

```
  Sandbox root: /home/user/project
  ↑/↓ or j/k to navigate · Enter to select · q to quit

  ➤ Show system info (console)          ← highlighted (selected)
    Export system info as JSON file
    List files in sandbox directory
    Show session changelog
    Open Cross-Platform File Manager
    Exit
```

Navigate with `↑`/`↓` or `j`/`k`, confirm with `Enter`. Press `q` to quit.

### Walkthrough

```
[Enter on "Show system info"]    → prints OS/CPU/RAM snapshot
[Enter on "List files"]          → prompts for sub-directory, shows entries
[Enter on "Export as JSON"]      → writes sysinfo-<timestamp>.json
[Enter on "Show changelog"]      → lists all session file operations
[Enter on "File Manager"]        → opens embedded shell (see below)
[Enter on "Exit"] or press q     → goodbye!
```

---

## System Snapshot

`npm run info` produces:

```
╔══════════════════════════════════════════════════════════╗
║  SysInspector — System Snapshot                          ║
╚══════════════════════════════════════════════════════════╝

  Timestamp    : 2026-06-21T07:27:13.088Z
  Hostname     : fedora
  OS           : Linux 7.0.12 (linux/x64)
  Node.js      : v24.16.0
  Uptime (s)   : 10077

  CPU
    Model      : AMD Ryzen 5 7530U with Radeon Graphics
    Cores      : 12
    Speed (MHz): 4141

  Memory
    Total (MB) : 15352
    Free  (MB) : 10105
    Used  (%)  : 34.18

  Environment (whitelisted)
    USER       : hariomm
    HOME       : /home/hariomm
    SHELL      : /bin/bash
```

---

## File Manager (Option 9)

A mini shell embedded inside the menu. Starts in your home directory.

| Command | Example | Notes |
|---|---|---|
| `cd` | `cd ~/Projects` | `cd` or `cd ~` → home |
| `ls` / `dir` | `ls -a ~/Documents` | `-a` or `/a` shows hidden |
| `pwd` | `pwd` | Current directory |
| `cat` / `type` | `cat readme.md` | UTF-8 text only |
| `mkdir` / `md` | `mkdir -p a/b/c` | `-p` or `/p` creates parents |
| `touch` | `touch -f file.txt` | `-f` or `/f` overwrites existing |
| `rm` / `del` | `rm -rf folder/` | `-r` required for dirs |
| `rmdir /s` / `rd /s` | `rmdir /s folder/` | Recursive delete |
| `cp` / `copy` | `cp src/ dest/` | Recursive for directories |
| `mv` / `move` / `ren` | `mv old.txt new.txt` | Cross-device fallback |
| `cls` / `clear` | `cls` | Clear terminal screen |
| `exit` | `exit` | Returns to GlassBox menu |

All commands are **case-insensitive** (`DIR`, `Dir`, `dir` all work).  
Both Unix-style (`-a`) and Windows-style (`/a`) flags are supported.  
All commands support `~/` path expansion and quoted paths with spaces.

### Command Alias Reference

| Windows-style | Unix equivalent | Notes |
|---|---|---|
| `dir` | `ls` | `dir /a` = `ls -a` |
| `type` | `cat` | UTF-8 text only |
| `copy` | `cp` | |
| `move` | `mv` | |
| `ren` / `rename` | `mv` | Rename-in-place |
| `del` / `erase` | `rm` | Files only |
| `rmdir` / `rd` | `rm -r` | `rmdir /s` = `rm -rf` |
| `md` | `mkdir` | |
| `cls` / `clear` | — | Clear screen |

---

## Safety Design

```mermaid
graph LR
    subgraph "6 Safety Layers"
        A["🛡️ Sandbox<br/>_resolveSafe()<br/>blocks ../../  escapes"]
        B["🔒 Confirm Guard<br/>update/delete need<br/>confirm=true + YES"]
        C["🤫 Secret Filter<br/>10-key env whitelist<br/>drops API keys/tokens"]
        D["🛡️ Crash Shield<br/>safe(fn, 'N/A') wraps<br/>every OS call"]
        E["📝 Audit Trail<br/>changelog records<br/>every CRUD action"]
        F["🧯 Error Isolation<br/>try/catch per action<br/>.catch() on main()"]
    end
```

### What each layer prevents

| Risk | Layer | How |
|---|---|---|
| Path traversal (`../../etc/passwd`) | Sandbox | Resolves absolute path, verifies prefix match with root + `path.sep` |
| Accidental overwrite/delete | Confirm | `FileOps` throws without `confirm=true`; CLI requires typing `YES` exactly |
| Secret leakage in output | Secret Filter | Only `USER, HOME, SHELL, PATH, LANG, TERM, PWD, EDITOR, USERNAME, NODE_ENV` pass through |
| OS call failure on rare platforms | Crash Shield | `safe()` returns `'N/A'` instead of throwing |
| Untraceable changes | Audit Trail | Every success pushes `{action, target, detail, time}` to changelog |
| Unexpected errors killing the process | Error Isolation | Each menu action is `try/catch`; fatal errors caught by `main().catch()` |

---

## Project Structure

```
inspector/
├── package.json                  # GlassBox root — npm scripts
├── README.md                     # This file
├── sysinspector/
│   ├── project.md                # Detailed visual guide
│   └── src/
│       ├── index.js              # 🚪 Entry — argv parsing & routing
│       ├── cli.js                # 🎮 Interactive readline menu
│       ├── sysinfo.js            # 📊 Safe system data gathering
│       └── fileOps.js            # 📁 Sandboxed CRUD + changelog
└── filemanager/
    └── index.js                  # 🖥️  Cross-platform shell emulator
```

---

## Module Dependency Map

```mermaid
graph TD
    IDX["index.js"] -->|"require"| SYS["sysinfo.js"]
    IDX -->|"require"| CLI["cli.js"]
    CLI -->|"require"| SYS
    CLI -->|"require"| FOP["fileOps.js"]
    CLI -->|"lazy require"| FM["filemanager/index.js"]

    SYS -->|"uses"| OS["os"]
    FOP -->|"uses"| FS["fs"]
    FOP -->|"uses"| PATH["path"]
    CLI -->|"uses"| RL["readline"]
    FM -->|"uses"| FS
    FM -->|"uses"| PATH
    FM -->|"uses"| OS
    FM -->|"uses"| RL
```

---

## Error Flow

```mermaid
graph TD
    A["Error occurs"] --> B{Where?}
    B -->|"sysinfo.js"| C["safe() catches it<br/>→ returns 'N/A'"]
    B -->|"fileOps.js<br/>sandbox"| D["_resolveSafe() throws<br/>→ 'Sandbox escape blocked'"]
    B -->|"fileOps.js<br/>no confirm"| E["throws<br/>→ 'Update/Delete blocked'"]
    B -->|"fileOps.js<br/>missing file"| F["throws<br/>→ 'File not found'"]
    B -->|"cli.js menu"| G["try/catch prints<br/>→ 'Error: msg' + back to menu"]
    B -->|"uncaught"| H["main().catch()<br/>→ 'Fatal:' + exit(1)"]
```

---

## License

MIT

