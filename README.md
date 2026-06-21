# GlassBox

> **Thunder Hackathon 3.0** — A modular Node.js dev-utility suite. GlassBox is the main project, with **SysInspector** as its first feature.

---

## Project Structure

```
GlassBox/
├── package.json            # GlassBox root — entry point & npm scripts
├── README.md               # This file
└── sysinspector/           # Feature: SysInspector
    ├── package.json        # SysInspector package manifest
    ├── project.md          # Visual guide with diagrams
    └── src/
        ├── index.js        # Entry point — argv parsing & routing
        ├── cli.js          # Interactive readline menu loop
        ├── sysinfo.js      # Read-only system/env information gathering
        └── fileOps.js      # Sandboxed CRUD operations + session changelog
```

---

## Code Flow

**`src/index.js`** is the single entry point. It performs lightweight argument parsing on `process.argv`, identifies the requested command (`info`, `info --json`, or interactive mode), and delegates to the appropriate module. Any uncaught promise rejection is captured by a top-level `.catch()` that prints the error and exits with code 1, preventing silent crashes.

**`src/sysinfo.js`** exports a single `gatherSystemInfo()` function that builds a complete snapshot object. Every OS/process API call is wrapped in a `safe(fn, fallback)` helper that returns `'N/A'` on any thrown error, ensuring the program never crashes when an OS value is unavailable. Environment variables are filtered through a strict whitelist — only `USER`, `HOME`, `SHELL`, `PATH`, etc. are included; sensitive variables like API keys or tokens are silently dropped.

**`src/fileOps.js`** exports the `FileOps` class. Its constructor receives a `rootDir` (the sandbox boundary) and stores it as an absolute path. Every public method (`create`, `read`, `update`, `delete`, `list`) first routes through the private `_resolveSafe(relativePath)` method, which resolves the target path and throws an error if it escapes the sandbox root — blocking `../../etc/passwd`-style traversal attacks. `update()` and `delete()` additionally require a `confirm === true` flag to prevent silent data loss. Every successful operation is recorded in an in-memory changelog array with an ISO timestamp.

**`src/cli.js`** implements the interactive readline menu. It is the **only** file permitted to pass `confirm=true` into `FileOps`, and only after prompting the user to type the exact string `YES`. Each menu action is wrapped in a `try/catch` block so that errors (bad paths, missing files, sandbox violations) are surfaced as `Error: <message>` messages and the user is returned to the menu rather than the process crashing.

---

## Safety Design

| Risk | Mitigation |
|---|---|
| **Sandbox escape** (`../../etc/passwd`) | `_resolveSafe()` resolves the absolute path and verifies it starts with the sandbox root + `path.sep`. Any escape throws before any filesystem call. |
| **Silent overwrite** (accidental data loss) | `FileOps.update()` requires `confirm === true`. The CLI prompts the user to type `YES` before forwarding the flag. Without it, the call throws. |
| **Silent delete** (accidental file removal) | `FileOps.delete()` requires `confirm === true` with the same `YES` prompt flow as update. |
| **Environment variable leakage** (API keys, secrets in `process.env`) | `gatherSystemInfo()` filters `process.env` through a 10-key whitelist (`USER`, `HOME`, `SHELL`, `PATH`, `LANG`, `TERM`, `PWD`, `EDITOR`, `USERNAME`, `NODE_ENV`). All other keys are silently excluded. |
| **Untraceable changes** (no audit trail) | Every successful CRUD operation pushes `{action, target, detail, time}` to the in-memory changelog, accessible via menu option 8 or `fileOps.getChangelog()`. |
| **Crash on missing OS data** (rare platform edge cases) | The `safe(fn, fallback='N/A')` helper wraps every OS/process call; unavailable values appear as `'N/A'` instead of crashing. |
| **Uncaught errors crashing the process** | All menu actions in `cli.js` are inside `try/catch`. The entry point `index.js` ends with `.catch()` + `process.exit(1)`. |

---

## Usage

### Run from the GlassBox root

```bash
# Interactive menu
npm start

# One-shot system info
npm run info

# JSON output
npm run info:json

# Override the sandbox root:
node sysinspector/src/index.js --dir /tmp/my-sandbox
```

### Run directly from sysinspector/

```bash
cd sysinspector
npm start          # interactive menu
npm run info       # print system info
npm run info:json  # print system info as JSON
```

---

## Sample `info` Output

```
╔══════════════════════════════════════════════════════════╗
║  SysInspector — System Snapshot                         ║
╚══════════════════════════════════════════════════════════╝

  Timestamp    : 2026-06-20T14:22:31.123Z
  Hostname     : devbox
  OS           : Linux 6.8.0-50-generic (linux/x64)
  Node.js      : v22.3.0
  Uptime (s)   : 184320
  Home Dir     : /home/dev
  CWD          : /home/dev/GlassBox

  CPU
    Model      : Intel(R) Core(TM) i7-12700K
    Cores      : 20
    Speed (MHz): 3600

  Memory
    Total (MB) : 32768
    Free  (MB) : 12288
    Used  (%)  : 62.5

  Environment (whitelisted)
    USER       : dev
    HOME       : /home/dev
    SHELL      : /usr/bin/bash
    LANG       : en_US.UTF-8
    NODE_ENV   : development
```

---

## Error Handling Summary

| Layer | Mechanism | Behaviour |
|---|---|---|
| `sysinfo.js` | `safe(fn, 'N/A')` wrapper | Returns `'N/A'` for any OS call that throws; never propagates errors |
| `fileOps.js` | `_resolveSafe()` | Throws a descriptive `Sandbox escape blocked` error before touching the filesystem |
| `fileOps.js` | `existsSync` guards | Throws `File not found` / `File already exists` before read/write/delete |
| `fileOps.js` | `confirm` flag check | Throws `Update blocked` / `Delete blocked` when `confirm !== true` |
| `cli.js` | `try/catch` per menu action | Prints `Error: <message>` and returns to the menu; process stays alive |
| `index.js` | `.catch()` on `main()` | Prints `Fatal: <message>` and exits with code 1 for truly unrecoverable errors |

---

## License

MIT
