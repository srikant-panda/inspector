# Inspector — Error & Safety Handling

This document details the defensive programming practices, security bounds, and recovery mechanisms implemented across the codebase.

- [Defensive Coding Patterns](#defensive-coding-patterns)
- [Security Boundaries](#security-boundaries)
- [Keypress Crash Guards](#keypress-crash-guards)
- [Failure Scenario Log Matrix](#failure-scenario-log-matrix)

---

## Defensive Coding Patterns

### Gracious Fallbacks via `safe()`
Querying low-level OS structures can throw unexpected errors on unsupported platforms or under restricted permissions. The utility helper `safe(fn, fallback)` in `sysinspector/src/sysinfo.js` prevents crashes:

```javascript
function safe(fn, fallback = 'N/A') {
  try {
    const result = fn();
    return result !== undefined && result !== null ? result : fallback;
  } catch {
    return fallback;
  }
}
```
Any metrics gathering function is wrapped inside this helper. If it throws, the CLI displays `N/A` rather than terminating the process.

---

## Security Boundaries

### Path Traversal Protection
The core CRUD operations inside `sysinspector/src/fileOps.js` evaluate path destinations prior to execution via the `_resolveSafe()` helper.

* **Path Escapes**: It resolves paths using `path.resolve()` and checks if they reside outside the sandbox root.
* **Result**: Throws a descriptive error: `Sandbox escape blocked: "<path>" resolves to "<absolute>", which is outside the sandbox root "<root>".`
* **Coverage**: Implemented on `create()`, `read()`, `update()`, `delete()`, and `list()`.

### Programmatic Confirm Gating
Accidental file overrides are blocked inside `FileOps`'s update and delete operations:
* Functions throw a `Confirm flag not set` error unless the parameter `confirm === true` is passed.

---

## Keypress Crash Guards

### Handling Raw Keypress Streams Safely
In Node.js CLI keypress listeners, users pressing hotkeys or clicking/scrolling mouse buttons (if mouse-tracking is on) emit key objects with undefined fields.

* **The Guard**: In `sysinspector/src/cli.js` (`onKeypress`, `onScrollKeypress`) and `filemanager/index.js` (`onKey`), checks verify that `key` is present:
  ```javascript
  const keyName = key ? (key.name || '') : '';
  if (!key) return; // Ignores raw mouse escape codes
  ```
* **Why it matters**: Accessing properties on undefined variables (e.g. calling `key.name` when `key` is undefined) throws unhandled exceptions, crashing terminal menus.

---

## Failure Scenario Log Matrix

The following table indexes typical failures, their behavior, and the handler location:

| Failure Scenario | Code Behavior | Handler Location |
| :--- | :--- | :--- |
| **OS CPU/Memory Query Fails** | Returns `'N/A'` gracefully | `sysinfo.js` -> `safe()` |
| **Sandbox Path Escape** | Throws `Sandbox escape blocked` | `fileOps.js` -> `_resolveSafe()` |
| **Update without Confirm** | Throws `Update blocked` exception | `fileOps.js` -> `update()` |
| **Delete without Confirm** | Throws `Delete blocked` exception | `fileOps.js` -> `delete()` |
| **Command Timeout** | Throws dynamic timeout exception | `sysinfo.js` -> `execWithTimeout()` |
| **Visual Feature Load Error** | Displays error panel in Scroll View | `cli.js` -> `executeAction().catch()` |
| **Ctrl+C Force Quit** | Restores Terminal mode, exits with 0 | `cli.js` -> `keypressLoop() onKeypress` |
| **Fatal Process Error** | Logs error to stderr, exits with 1 | `index.js` -> `main().catch()` |
| **Invalid Directory Listing** | Throws `Not a directory` or `Directory not found` | `fileOps.js` -> `list()` |
