# Inspector

Inspector is a modular, zero-dependency diagnostics and file management suite built for Node.js. Developed as a dev-utility package, it aggregates low-level system metrics (OS, CPU, memory, network, battery, storage) and routes them into terminal views, JSON data payloads, and styled dark-mode HTML reports. It includes an interactive file manager supporting cross-platform command scripts and folder tree-browsing.

- [Documentation Index](#documentation-index)
- [System Architecture](#system-architecture)
- [Quickstart](#quickstart)

---

## Documentation Index

The complete documentation set is organized into modular files inside the `docs/` folder:

* **[System Architecture](docs/ARCHITECTURE.md)** — Explains components relationship, module dependency maps, and sandbox boundaries.
* **[Code Flow](docs/CODE_FLOW.md)** — Dotted workflow diagrams showing application startup, diagnostic query, and file operations.
* **[Features Catalog](docs/FEATURES.md)** — Highlights individual capabilities (System Info, File Manager, Safety) and platform support.
* **[Error & Safety Handling](docs/ERROR_HANDLING.md)** — Documents crash-prevention guidelines (`safe()`), path resolutions, and error matrices.
* **[Architectural Issue Solver](docs/ARCHITECTURAL_ISSUE_SOLVER.md)** — Catalogs significant architectural problems encountered and solved: loading screens, dynamic timeouts, atomic rendering, scrollable viewers, raw-mode safety, cross-platform aliases, and more.
* **[Codebase Mapping](docs/CODEBASE.md)** — A directory structural reference outlining file responsibilities and outputs.

---

## System Architecture

Below is a condensed representation of Inspector's core architecture and control boundaries:

```
  ┌┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┐
  ┊  index.js (CLI) ┊
  └┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┘
           │
           ├──────────────────────────────┐
           ▼                              ▼
  ┌┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┐            ┌┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┐
  ┊ sysinfo.js      ┊ ◄────────  ┊ cli.js (Menu)   ┊
  ┊ (OS Queries)    ┊            └┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┘
  └┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┘                     │
                                          ▼
                                 ┌┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┐
                                 ┊ filemanager/    ┊
                                 ┊ (Visual Shell)  ┊
                                 └┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┘
                                          │ (Audit logs)
                                          ▼
                                 ┌┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┐
                                 ┊ fileOps.js      ┊
                                 ┊ (Sandbox log)   ┊
                                 └┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┘
```

---

## Quickstart
`please prefer CMD over powershell in windows to skip the permission issue in npm install.`

Clone the project 
```bash
git clone https://github.com/srikant-panda/inspector.git
cd inspector
npm install # dont worry no external module use only pre build module it is just for safer side.
Start the interactive CLI menu from the project root:
```bash
npm start # or node sysinspector/src/index.js
```

### Direct CLI One-Shots

Gather system info and output in a formatted, human-readable terminal view:
```bash
npm run info
```

Query system info and output raw JSON data:
```bash
npm run info:json
```

Override the default sandbox directory (applicable in all modes):
```bash
node sysinspector/src/index.js --dir /path/to/custom/sandbox
```

---

## Cross-Platform Notes

### Environment Variables on Windows
When running Inspector, the **Captured Environment Variables** table is dynamically tailored to the host platform (Windows vs. Linux/macOS). It displays only the standard and relevant variables for the running OS, ensuring that variables that do not exist natively on a platform (such as Unix `USER` or `SHELL` on Windows) are not shown.

If a genuine environment variable for the host platform is indeed missing or not set, it will show as `N/A`.

See [docs/ERROR_HANDLING.md — Cross-Platform Environment Variable Behavior](docs/ERROR_HANDLING.md#cross-platform-environment-variable-behavior) for the full variable-by-variable breakdown per platform.
