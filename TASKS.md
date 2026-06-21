# GlassBox — Task Log

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
- [ ] Add neofetch-style OS Info view with JSON + HTML export
- [ ] Add neofetch-style CPU Info view with JSON + HTML export
- [ ] Add Network view with tree of interface names + flat detail blocks
- [ ] Add responsive preview pane to arrow-key menu (side-by-side vs stacked)
- [ ] Create shared htmlExport.js module for HTML report generation
- [ ] Rebrand terminal headers from GlassBox to Inspector
- [ ] Add platform-aware File Manager intro line

## File Manager

- [x] Add cat command to filemanager for viewing file contents
- [x] Add Windows-style command aliases (dir, del, copy, move, type, ren, md, rmdir, cls)
- [x] Add Windows-style /flag syntax support alongside Unix -flag
- [x] Add case-insensitive command name dispatch
- [x] Update file manager welcome banner with alias info

## Documentation

- [x] Create visual-first README with diagrams and walkthroughs
- [x] Update README with file manager alias reference table and command docs
