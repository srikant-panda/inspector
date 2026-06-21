# Inspector — Codebase Mapping

This document provides a complete directory map of the codebase, describing the roles of source files, internal modules, and generated artifacts.

- [Directory Structure](#directory-structure)
- [Module Descriptions](#module-descriptions)
- [Classification of Files](#classification-of-files)

---

## Directory Structure

```
.
├── package.json
├── README.md
├── TASKS.md
├── filemanager/
│   └── index.js
├── sysinspector/
│   ├── project.md
│   └── src/
│       ├── cli.js
│       ├── fileOps.js
│       ├── htmlExport.js
│       ├── index.js
│       └── sysinfo.js
└── docs/
    ├── ARCHITECTURE.md
    ├── CODE_FLOW.md
    ├── CODEBASE.md
    ├── ERROR_HANDLING.md
    └── FEATURES.md
```

---

## Module Descriptions

### Root Files
* **`package.json`**: Root project configuration metadata. Defines CLI shortcuts (`npm start`, `npm run info`, `npm run info:json`) and targets the entry point.
* **`TASKS.md`**: Checklist tracing hackathon tasks, features, enhancements, bug fixes, and documentation milestones.

### `sysinspector/`
* **`project.md`**: Guide explaining sysinspector module connections, layout designs, and security policies.
* **`src/index.js`**: Command-line parser and router. Evaluates arguments (like `--json` and `--dir`), runs one-shot system reports, and starts the menu loop.
* **`src/cli.js`**: Interactive menu interface. Captures arrow-key inputs, queries real-time diagnostics, runs the Scrollable Output viewer, and links with the exporting/file manager subsystems.
* **`src/sysinfo.js`**: System reporter. Runs processes dynamically under baselined process timeouts to gather platform properties. Implements allow-list filter `SAFE_ENV_KEYS` and the `looksSecret()` pattern redaction.
* **`src/fileOps.js`**: Sandboxed File CRUD interface. Verifies relative pathways, handles path traversal verification, and records programmatic logs to the session.
* **`src/htmlExport.js`**: HTML exporter. Houses templating utilities that build styling-rich, responsive dark-themed HTML report pages from query data objects.

### `filemanager/`
* **`index.js`**: Standalone shell utility. Supports Unix command scripts (like `cd`, `cat`, `ls`) alongside Windows CMD command-line aliases, visual directory browsers, and command helper guidelines.

---

## Classification of Files

To help navigate the codebase, files are classified into three roles:

### 1. Entry Points
* **`sysinspector/src/index.js`**: The main executable file that resolves commands and flags.

### 2. Internal Modules
* **`sysinspector/src/cli.js`**: Controls the keypress loops and interface render cycle.
* **`sysinspector/src/sysinfo.js`**: Implements safe OS queries and env filtering.
* **`sysinspector/src/fileOps.js`**: Enforces path traversal and confirm gates.
* **`sysinspector/src/htmlExport.js`**: Exposes the HTML template rendering function.
* **`filemanager/index.js`**: Provides the interactive file shell manager when launched from CLI.

### 3. Generated Outputs (Excluded from source tree)
* **`logs/session_*.log`**: Session log trace of audited user/system file operations.
* **`os-info/`, `cpu-info/`, `memory-info/`, `disk-info/`, `battery-info/`, `network-info/`**: Subfolders created inside the sandbox directory containing raw `.json` and parsed `.html` diagnostic snapshots.
