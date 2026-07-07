# Renderer Decisions spec

## Renderer Technique Decision Matrix

We evaluate the rendering strategy for the Visual Worldbuilder to ensure high performance and premium design.

| Parameter | Value |
| --- | --- |
| sourceRepresentation | json-canvas |
| productRepresentation | mixed |
| previewRenderer | react-dom-svg |
| exportRenderer | react-dom-svg |
| rendererWorkload | none |
| rendererStrategy | mixed |

### whyNotAlternativeStrategies
- Alternative Strategy (WebGL/WebGPU): WebGL/WebGPU is suitable for pixel-output and dense shaders, but inappropriate for text-heavy UI cards. Rasterizing character bio text would degrade accessibility and text-output scaling.
- Alternative Strategy (Canvas 2D): Canvas 2D is better for medium raster rendering, but does not allow rich HTML/CSS styling for cards (e.g. Markdown content, custom color pickers, forms).
- Therefore, we chose a `mixed` strategy: DOM for rich HTML card overlays and SVG for crisp connection paths.

### fidelityRisks
- Text/Vector Output Scaling: When zooming in and out, DOM text and SVG lines scale natively. Using a rasterized canvas would introduce blurriness and pixelation.
- Product-Quality Export: The export composite is rendered at native canvas resolution to ensure clean vector lines and readable typography in export/copy deliverables.

### performanceRisks
- Heavy Viewport Interactions: Dragging cards or panning a massive canvas with hundreds of nodes could cause layout thrashing. We minimize React re-renders by only updating the affected node's coordinates in local state during drag-movement, then committing on drag-release.

---

## Renderer Layer Inventory

The rendering output is structured into three distinct layers, mapped through `rendererTechnique.layers`:

1. **backgroundLayer:** Renders a CSS/SVG repeating grid pattern representing the canvas workspace.
2. **productForegroundLayer:** Renders the actual worldbuilder cards as absolute-positioned DOM nodes. Accessible via `uiSelector: "[data-node-id]"`.
3. **editingHandlesLayer:** Renders the interactive connection ports and active connection paths for drawing arrows between cards. Accessible via `uiSelector: "[data-port-side]"` and excluded from exports.
4. **exportComposite:** Combines the background and foreground layers for PNG export.

---

## Render Pipeline Inventory

We define the following render pipeline and passes:

1. **canvas-draw pass:**
   - **id:** canvas-draw
   - **kind:** composite
   - **runsOn:** cpu
   - **output:** dom
   - **cacheKey:** none (DOM-driven)
   - **invalidat:** Invalidated by changes to `workspace.canvasData`.

### Interaction Invalidation
We trace the following interactions:
- **control-drag:** Dragging a slider or input updates the card data.
- **viewport-drag:** Panning the canvas shifts the viewport offset.
- **viewport-zoom:** Zooming changes the scale.
- **media-import:** Standard media actions (unused in Phase 1).
- **animation-frame:** Timeline animation loops (unused in Phase 1).
- **timeline-playback:** Playback updates (unused in Phase 1).
