# Inspector — Task Log

## Core Features

- [x] Build sysinspector system info gathering module
- [x] Add sandboxed FileOps CRUD with confirm-gating
- [x] Port py-file-manager to JS (cd/ls/pwd/mkdir/touch/rm/cp/mv)
- [x] Add interactive readline menu with 10 options
- [x] Add session changelog tracking
- [x] Add env variable whitelist for secret protection
- [x] Add sandbox escape prevention in fileOps

## CLI Enhancements

- [x] Remove redundant Create/Read/Update/Delete menu options (4-7)
- [x] Replace numbered CLI menu with arrow-key selector
- [x] Handle raw mode toggling for sub-prompts and file manager handoff
- [x] Add safety guards for undefined str and terminal cleanup on exit
- [x] Add neofetch-style OS Info view with JSON + HTML export
- [x] Add neofetch-style CPU Info view with JSON + HTML export
- [x] Add Network view with tree of interface names + flat detail blocks
- [x] Add responsive preview pane to arrow-key menu (side-by-side vs stacked)
- [x] Create shared htmlExport.js module for HTML report generation
- [x] Rebrand terminal headers from GlassBox to Inspector
- [x] Add platform-aware File Manager intro line

## Bug Fixes

- [x] Fix menu redraw: use clear-screen (\x1b[2J\x1b[H) instead of cursor-back for true in-place updates
- [x] Fix view functions to return strings composed into single frame write (no scattered console.log)
- [x] Fix Network tree to use proper ├─/└─ branch characters within the frame write cycle
- [x] Add wait-for-key after action output before menu redraw
- [x] Consolidate ALL output into single renderMenu() — eliminate scattered writes entirely
- [x] Kill readline during keypress mode to prevent stdout resize interference

## File Manager

- [x] Add cat command to filemanager for viewing file contents
- [x] Add Windows-style command aliases (dir, del, copy, move, type, ren, md, rmdir, cls)
- [x] Add Windows-style /flag syntax support alongside Unix -flag
- [x] Add case-insensitive command name dispatch
- [x] Update file manager welcome banner with alias info

## Documentation

- [x] Create visual-first README with diagrams and walkthroughs
- [x] Update README with file manager alias reference table and command docs
