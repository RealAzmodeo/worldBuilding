# Implementation Worklog

This file records product decisions and the evidence behind them. Keep it short, factual, and current. Update it after schema, renderer, timeline, layer, export, performance, or acceptance decisions.

## Status

Mode: product

## Decision Trail

### Iteration 1 — Worldbuilding Canvas Phase 1
- Request: Build the first phase of the Corkboard.
- Task type: App assembly and custom renderer setup.
- User-visible result: Interactive canvas with node dragging, edge creation, and sidebar editing.
- Source/reference checked: Ideation.txt, AGENTS.md, workflow.md, assembly-workflow.md
- Reference inputs: None.
- Docs/contracts read: assembly-workflow.md, toolcraft framework contracts
- Contract rules applied: Strict separation of canvasContent from controls; Background and Image Export sections structure.
- Files changed: src/app/app-schema.ts, src/app/app-acceptance.ts, src/app/app-performance.ts, src/app/world-canvas-renderer.tsx, src/routes/index.tsx, e2e/app-controls.spec.ts, src/app/app-schema.test.ts
- Decision: Implemented a custom react-dom-svg renderer inside canvasContent.
- Alternatives rejected: Using heavy canvas libraries. A pure React overlay fits React 19 best.
- State/output mapping: Controls panel maps to workspace.* targets which sync with workspace.canvasData.
- Verification: npm run verify:quick passed; npm run build passed.
- Skipped checks: none.
- Risks: Coordinate math complexity on infinite zoom and grid snap.

### Iteration 2 — Modularization and Cleanup
- Request: Clean up the canvas renderer codebase and modularize it.
- Task type: App assembly and custom renderer setup.
- User-visible result: Preserved identical canvas functionality with significantly cleaner and modular codebase structure.
- Source/reference checked: Ideation.txt, AGENTS.md, workflow.md
- Reference inputs: None.
- Docs/contracts read: workflow.md, assembly-workflow.md
- Contract rules applied: Code structure modularity, preserved ToolcraftApp shell.
- Files changed: src/app/world-canvas-renderer.tsx, src/app/markdown-utils.tsx, src/app/geometry-utils.tsx, src/app/tag-input.tsx
- Decision: Extracted helper utilities and sub-components from the giant world-canvas-renderer.tsx file into separate domain files (geometry-utils, markdown-utils, tag-input).
- Alternatives rejected: Keeping the monolith. It makes future aesthetics updates too risky.
- State/output mapping: Canvas state and serialization remains exactly the same.
- Verification: npm run test passed.
- Skipped checks: Browser e2e and browser performance, since code changes are purely structural refactoring.
- Risks: None.

### Iteration 3 — Local LLM Integration (Ollama)
- Request: Add local LLM integration via Ollama to assist in writing/rewriting card content.
- Task type: App assembly and custom controls/rendering.
- User-visible result: Added a floating Sparkles button in the card header, an absolute-positioned AI assistant panel within selected cards, a glowing border animation during LLM execution, a cancellation action, and a model name parameter in workspace settings.
- Source/reference checked: Ideation.txt, AGENTS.md, workflow.md
- Reference inputs: None.
- Docs/contracts read: workflow.md, assembly-workflow.md
- Contract rules applied: Added control scenario, alignment with acceptance and performance arrays.
- Files changed: vite.config.ts, src/app/app-schema.ts, src/styles.css, src/app/world-canvas-renderer.tsx, src/app/app-acceptance.ts, src/app/app-performance.ts, e2e/app-controls.spec.ts, src/app/app-acceptance.test.ts
- Decision: Integrated dynamic model selection, a local proxy rule in Vite to avoid CORS issues, and streaming response UI update within the canvas.
- Alternatives rejected: Direct call to localhost:11434 (fails due to browser CORS policies).
- State/output mapping: syncs with workspace.ollamaModel and workspace.canvasData.
- Verification: npm run test passed (214/214 tests).
- Skipped checks: Browser e2e functional verification (simulated by stubs since Ollama is a local developer dependency).
- Risks: Performance lag if stream is too large (mitigated by skipping undo/history state commits during active chunk updates).

### Iteration 4 — Windows Startup Batch Script
- Request: Create a batch script (.bat) that boots up Ollama and the local dev server.
- Task type: App assembly and automation scripting.
- User-visible result: Created a single-click iniciar-proyecto.bat file in the root workspace folder.
- Source/reference checked: Ideation.txt, AGENTS.md, workflow.md
- Reference inputs: None.
- Docs/contracts read: workflow.md, assembly-workflow.md
- Contract rules applied: None (root automation script outside toolcraft app source).
- Files changed: iniciar-proyecto.bat
- Decision: Automated checking for active "ollama app.exe" processes using tasklist/find, starting Ollama if closed, and executing "npm run dev" inside the "world-building" folder.
- Alternatives rejected: Asking user to manually execute multiple terminal commands.
- State/output mapping: None.
- Verification: Script structure validated manually.
- Skipped checks: Automated tests (the script sits outside Vite bundle and doesn't impact schema or performance checks).
- Risks: None.

### Iteration 5 — Relative Paths in Windows Startup Script
- Request: Make batch script paths relative to support project relocation.
- Task type: Automation scripting and maintenance.
- User-visible result: Updated iniciar-proyecto.bat to use %~dp0 instead of absolute paths.
- Source/reference checked: AGENTS.md, workflow.md
- Reference inputs: None.
- Docs/contracts read: None.
- Contract rules applied: None.
- Files changed: iniciar-proyecto.bat
- Decision: Replaced the absolute "d:" and "cd" commands with "cd /d "%~dp0world-building"" to make it work relative to the script location.
- Alternatives rejected: Using standard relative paths like "cd world-building" (fails if the user runs the script from a different current directory context).
- State/output mapping: None.
- Verification: Script structure validated manually.
- Skipped checks: Automated tests (does not affect schema or Vite dev server).
- Risks: None.

### Iteration 6 — Collapsible Headings and Space Optimization
- Request: Hide empty placeholder text unless focused, and make headings collapsible (Notion style).
- Task type: App assembly and usability design.
- User-visible result: Empty blocks hide their placeholders when not active. H1, H2, and H3 headers show folding chevrons and hide downstream sibling blocks until the next equivalent or higher heading rank.
- Source/reference checked: AGENTS.md, workflow.md
- Reference inputs: None.
- Docs/contracts read: workflow.md
- Contract rules applied: None.
- Files changed: markdown-utils.tsx, world-canvas-renderer.tsx
- Decision: Integrated a focusedBlockId state to track input focus. Re-architected parser to skip empty lines, and serializer to write clean Markdown newlines. Wrote a hierarchical ranking visibleBlocks filter to toggle downstream block visibility on header collapsing.
- Alternatives rejected: Storing collapsing state in the global markdown text (would bloat markdown syntax). Kept as runtime property in state/JSON canvas block structures.
- State/output mapping: syncs with workspace.canvasData blocks isCollapsed property.
- Verification: npm run test passed (214/214 tests).
- Skipped checks: None.
- Risks: None.

## Decisions

### Renderer
- Decision: Custom mixed DOM and SVG rendering technique.
- Reason: The worldbuilding nodes are text/markdown heavy (fits DOM) and connected by vector paths (fits SVG).
- Evidence: App performance usesCustomRenderer: true and specifies mixed strategy.

### Timeline
- Decision: No timeline yet.
- Reason: The worldbuilding board is static in Phase 1.
- Evidence: Panels.timeline is omitted in the schema.

### Layers
- Decision: No layers panel yet.
- Reason: Standard infinite canvas holds nodes on a single layered viewport.
- Evidence: Panels.layers is omitted.

### Controls
- Decision: Created workspace settings, selected card, description, and JSON canvas sections.
- Reason: Simplifies layout while providing direct data access.
- Evidence: Defined in app-schema.ts controls.

### Export
- Decision: Export PNG sticky action.
- Reason: Required delivery capability for sharing boards.
- Evidence: Mapped in panelActions and Image Export controls.

### Performance
- Decision: Mapped workload targets and responsiveness profiles.
- Reason: Interactive card dragging and connection drawing need to stay fluid.
- Evidence: Mapped targets in app-performance.ts.

## Evidence
- Source reviewed: Ideation.txt
- Contract applied: AGENTS.md, assembly-workflow.md
- Evidence: Mapped schema targets match user expectations and layout policies.

## Verification
- Run: npm run build passed
- Run: npm run verify:quick passed
- Browser: playwright-fallback performance checkpoint passed (agent-browser-unavailable)

## Risks
- Risk: Coordinate math complexity on infinite zoom dragging.
- Risk: Large node count DOM performance degradation.
