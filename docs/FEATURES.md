# Inspector — Features Catalog

This document details all capabilities built into Inspector, organized by category, alongside cross-platform support levels.

- [Features Breakdown](#features-breakdown)
- [Platform Support Matrix](#platform-support-matrix)

---

## Features Breakdown

### 📊 System Information
* **OS Details**: Gathers OS type, release version, architecture, uptime, and host.
  * *Why it matters*: Provides immediate diagnostic context for platform-dependent issues.
* **CPU Profile**: Queries model names, physical/logical core counts, speed (MHz), and load percentage.
  * *Why it matters*: Pinpoints performance bottlenecks and hardware limitations.
* **Memory & Storage**: Evaluates total/available physical memory and mounted disk usages.
  * *Why it matters*: Identifies out-of-disk/memory situations before running applications.
* **Power & Network**: Tracks battery level/charging status and details active network interfaces (IP, MAC, CIDR).
  * *Why it matters*: Essential when debugging laptop batteries or network connectivity/latency.

### 📁 File Manager
* **Dual Operation Modes**: Offers command-line shell interface and interactive arrow-key list browsing.
  * *Why it matters*: Provides keyboard flexibility for both terminal-heavy users and visual browsing.
* **Unified Command System**: Normalizes Windows CMD commands (like `dir`, `md`, `del`, `ren`) into Unix equivalents (`ls`, `mkdir`, `rm`, `mv`).
  * *Why it matters*: Developers can navigate seamlessly regardless of their native operating system shell.
* **File Space Preservation**: Standardizes UNIX flag parameters (like `rm -rf`) alongside Windows `/` arguments (like `rmdir /s`).
  * *Why it matters*: Prevents manual translation overhead and syntax failures during command execution.

### 🛡️ Safety & Security
* **Double-Pass Env Redaction**: Limits printed env variables to safe defaults while redacting sensitive naming patterns (e.g. `*SECRET*`, `*TOKEN*`, `*API_KEY*`).
  * *Why it matters*: Prevents developer credentials, passwords, and tokens from leaking into exported reports.
* **CRUD Confirmation Gating**: Requires programmatic `confirm = true` for `update` and `delete` file operations.
  * *Why it matters*: Protects critical system files from accidental scripts overwriting or deleting contents.
* **Path Traversal Shield**: Resolves relative path scopes inside the sandbox directory.
  * *Why it matters*: Thwarts directory escape attacks (e.g., passing `../../etc/shadow`).

### 💾 Export
* **JSON + Interactive HTML Reports**: Generates JSON files alongside styling-packed, dark-themed HTML documents.
  * *Why it matters*: Allows diagnostic logs to be ingested by other tools or opened directly as styled web pages.

---

## Platform Support Matrix

| Feature | Windows | Linux | macOS | Implementation Details |
| :--- | :---: | :---: | :---: | :--- |
| **OS Core Details** | ✅ | ✅ | ✅ | Standard Node `os` module methods. |
| **CPU Model & Cores** | ✅ | ✅ | ✅ | Standard Node `os.cpus()` checks. |
| **CPU Load/Load Avg** | ✅ (Load%) | ✅ (LoadAvg) | ✅ (LoadAvg)| Win32 measures load using `powershell`; Unix relies on `os.loadavg()`. |
| **Disk Info** | ✅ | ✅ | ✅ | Win32 uses PowerShell `Get-CimInstance`; Unix runs shell utility `df -h`. |
| **Battery Level** | ✅ | ✅ | ✅ | Win32: powershell query; Linux: reads `/sys`; Darwin: runs `pmset`. |
| **Network Interfaces** | ✅ | ✅ | ✅ | Standard Node `os.networkInterfaces()` parsing. |
| **File Manager Shell**| ✅ | ✅ | ✅ | Custom Javascript shell leveraging Node `fs` and `process.chdir()`. |
| **Command Aliases** | ✅ | ✅ | ✅ | Map table defined in `filemanager/index.js`. |
| **Report Exporting** | ✅ | ✅ | ✅ | Synchronous writing to workspace directories. |
