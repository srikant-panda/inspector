# Inspector — Code Flow Diagrams

This file illustrates the execution sequence of Inspector's main workflows, including CLI startup, system diagnostics rendering, and file manager command processing.

- [Main Menu Interaction Loop](#main-menu-interaction-loop)
- [System Diagnostics Pipeline](#system-diagnostics-pipeline)
- [File Manager Command Flow](#file-manager-command-flow)
- [The Single-Render-Function Pattern](#the-single-render-function-pattern)

---

## Main Menu Interaction Loop

```
  ┌┄┄┄┄┄┄┄┄┄┄┄┄┄┐
  ┊ App Startup ┊ (index.js main())
  └┄┄┄┄┄┄┄┄┄┄┄┄┄┘
         │
         ▼
  ┌┄┄┄┄┄┄┄┄┄┄┄┄┄┐
  ┊ Render Menu ┊◄──────────────────────┐
  ┊(renderMenu) ┊                       │
  └┄┄┄┄┄┄┄┄┄┄┄┄┄┘                       │
         │                              │
         ▼                              │
  ┌┄┄┄┄┄┄┄┄┄┄┄┄┄┐                       │
  ┊ Wait Key    ┊                       │
  ┊ (keypress)  ┊                       │
  └┄┄┄┄┄┄┄┄┄┄┄┄┄┘                       │
     │        │                         │
     ▼        ▼                         │
   Arrow    Enter                       │
    Move   (Select)                     │
     │        │                         │
     ▼        ▼                         │
   Update   Execute Action ─────────────┘
  Selected  (executeAction())
   Index
```

---

## System Diagnostics Pipeline

```
  ┌┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┐
  ┊ Select OS Info ┊ (Or other category)
  └┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┘
          │
          ▼
  ┌┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┐
  ┊Query sysinfo.js┊ ──► Calls gatherSystemInfo()
  └┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┘     Wrapped in safe() errors
          │
          ▼
  ┌┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┐
  ┊ Format Output  ┊ ──► Formats ANSI layout & OS logo
  └┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┘
          │
          ▼
  ┌┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┐
  ┊ Write Exports  ┊ ──► Writes to disk: <name>/<name>.json
  └┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┘     Writes HTML report using renderInfoHtml()
          │
          ▼
  ┌┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┐
  ┊ Display Scroll ┊ ──► Opens scrollable output viewer
  └┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┘
```

---

## File Manager Command Flow

```
  ┌┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┐
  ┊ Enter FileManager┊ (startFileManager())
  └┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┘
           │
           ▼
  ┌┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┐
  ┊   Read Prompt    ┊◄─────────────────┐
  └┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┘                  │
           │                            │
           ▼                            │
  ┌┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┐                  │
  ┊  Parse Command   ┊ ──► parseCommand() preserves quoted spaces
  └┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┘
           │
           ▼
  ┌┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┐
  ┊ Normalize Args   ┊ ──► Map Windows aliases (dir -> ls, /s -> -rf)
  └┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┘
           │
           ▼
  ┌┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┐
  ┊    Dispatch      ┊
  └┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┘
     │            │
     ▼            ▼
   Read/Exit   Destructive (rm)
     │            │
     │            ▼
     │         Recursive Flag Guard? (Needs -r/-rf for folders)
     │            │
     ▼            ▼
   Execute ──► Execute on host system (relative to current directory)
     │            │
     └─────┬──────┘
           ▼
  ┌┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┐
  ┊ Log Action & Out ┊ ──► Pushes audit action to fileOps.logAction()
  └┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┘
```

---

## The Single-Render-Function Pattern

In the main menu interface (`sysinspector/src/cli.js`), every redraw request is routed to a single, central function: `renderMenu()`. 

* **Why it's built this way**: Early iterations of the tool had console output scattered throughout choice-handling handlers, causing menu flickering, overlapping text lines, and layout breakage when resizing terminal windows.
* **How it works**: Event handlers only mutate state (like the `selected` menu index). They then request an update from `renderMenu()`, which constructs the entire frame string (header, layout pane, details box) in memory and prints it atomically using `process.stdout.write('\x1b[H\x1b[J' + frame)`.
* **State Isolation**: Because state changes and terminal writes are separated, adding new menu categories or terminal-width checks requires zero modification to screen-clear or redrawing handlers.
