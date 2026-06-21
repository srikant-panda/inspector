# Inspector — System Architecture

This document describes the high-level system architecture of Inspector, its module relationships, the sandbox design boundary, and the patterns that ensure consistency and security.

- [High-Level Module Map](#high-level-module-map)
- [Module Dependency Graph](#module-dependency-graph)
- [Sandboxing Boundary (FileOps)](#sandboxing-boundary-fileops)
- [Gather-Display-Export Pattern](#gather-display-export-pattern)

---

## High-Level Module Map

Inspector is split into two primary components:
1. **`sysinspector/`**: Contains the core logic for system diagnostics, interactive CLI menus, configuration white-listing, and report exporting.
2. **`filemanager/`**: A standalone file management module providing Unix commands and Windows command-line aliases to browse and manipulate the host file system.

The orchestration of these components is managed by `sysinspector/src/cli.js`, which initiates the system info visual components and handles the handoff to the interactive file manager.

---

## Module Dependency Graph

The following dotted diagram visualizes the dependency relationships (`require()`) within the codebase:

```
                 ┌┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┐
                 ┊  sysinspector/   ┊
                 ┊   src/index.js   ┊ (Entry point)
                 └┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┘
                    │            │
                    ▼            ▼
         ┌┄┄┄┄┄┄┄┄┄┄┄┄┄┄┐    ┌┄┄┄┄┄┄┄┄┄┄┄┄┄┄┐
         ┊ sysinspector/┊    ┊ sysinspector/┊
         ┊ src/sysinfo.js┊    ┊  src/cli.js  ┊ (Orchestrator)
         └┄┄┄┄┄┄┄┄┄┄┄┄┄┄┘    └┄┄┄┄┄┄┄┄┄┄┄┄┄┄┘
                    │            │     │    │
                    │            │     │    │
                    └────────────┼─────┘    │
                                 ▼          ▼
                       ┌┄┄┄┄┄┄┄┄┄┄┄┄┄┄┐  ┌┄┄┄┄┄┄┄┄┄┄┄┄┄┄┐
                       ┊ sysinspector/┊  ┊ sysinspector/┊
                       ┊src/htmlExport┊  ┊src/fileOps.js┊
                       └┄┄┄┄┄┄┄┄┄┄┄┄┄┄┘  └┄┄┄┄┄┄┄┄┄┄┄┄┄┄┘
                                                ▲
                                                │
                                                │ (Logs session actions)
                                                │
                                         ┌┄┄┄┄┄┄┄┄┄┄┄┄┄┄┐
                                         ┊ filemanager/ ┊
                                         ┊   index.js   ┊
                                         └┄┄┄┄┄┄┄┄┄┄┄┄┄┄┘
```

*Note: Standard built-in Node.js modules (`os`, `fs`, `path`, `readline`, `child_process`) are required where needed but are omitted here for clarity.*

---

## Sandboxing Boundary (FileOps)

Programmatic operations inside the sandbox are strictly regulated by the `FileOps` class (`sysinspector/src/fileOps.js`). 

* **The Gatekeeper**: The private `_resolveSafe()` helper processes all incoming paths relative to the sandbox root.
* **Sandbox Verification**: It checks that the resolved absolute path starts with the sandbox root followed by the path separator (`path.sep`).
* **Breach Prevention**: If a path tries to escape the sandbox (e.g. `../../etc/passwd`), a `Sandbox escape blocked` error is thrown immediately, preventing any filesystem interaction.

---

## Gather-Display-Export Pattern

For architectural consistency, every diagnostics category follows a strict sequence:

```
  ┌┄┄┄┄┄┄┄┄┄┄┐     ┌┄┄┄┄┄┄┄┄┄┄┐     ┌┄┄┄┄┄┄┄┄┄┄┄┄┄┐
  ┊  Gather  ┊ ──► ┊  Display  ┊ ──► ┊   Export    ┊
  └┄┄┄┄┄┄┄┄┄┄┘     └┄┄┄┄┄┄┄┄┄┄─┘     └┄┄┄┄┄┄┄┄┄┄┄┄┄┘
   sysinfo.js       cli.js layout     JSON & htmlExport
```

1. **Gather**: Data is retrieved from the OS module or shell processes wrapped in `safe()` commands.
2. **Display**: The terminal view formats findings alongside ANSI colored branding and ASCII OS logos.
3. **Export**: Full detailed metrics are saved simultaneously to `.json` and self-contained `.html` reports under respective subdirectories.
