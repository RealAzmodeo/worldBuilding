import {
  defineToolcraftPerformance,
  type ToolcraftPerformanceConfig,
} from "@/toolcraft/runtime";

const heavyText = ("a".repeat(50) + "\n").repeat(1005);
const heavyJson = "{\n" + Array.from({ length: 1005 }).map((_, i) => `  "node_${i}": "${"a".repeat(50)}"`).join(",\n") + "\n}";

export const appPerformance: ToolcraftPerformanceConfig = defineToolcraftPerformance({
  browserCheckPolicy: {
    fallbackRunner: "playwright",
    fallbackWhen: ["agent-browser-unavailable", "ci"],
    preferredRunner: "agent-browser",
  },
  rendererStrategy: "dom",
  rendererWorkload: "simple-composition",
  scenarios: [
    {
      id: "preview-render",
      interaction: "preview-render",
      workload: false,
      budget: { maxPreviewMs: 50, maxFrameGapMs: 16 },
      fixture: "Standard empty canvas preview render.",
      expectedObservable: "Main canvas viewport displays dark empty board background.",
      automated: true,
      automatedTestName: "schema: validates worldbuilder control targets",
      browser: true,
      browserTestName: "browser: verifies worldbuilder preview render",
      controlLabel: "Worldbuilder Panel"
    },
    {
      id: "viewport-stability",
      interaction: "viewport-stability",
      workload: false,
      budget: { maxInteractionMs: 16, maxFrameGapMs: 16 },
      fixture: "Canvas panning gesture.",
      expectedObservable: "Canvas drags smoothly at 60fps.",
      automated: true,
      automatedTestName: "schema: validates worldbuilder control targets",
      browser: true,
      browserTestName: "browser: verifies canvas panning stability",
      controlLabel: "Worldbuilder Panel"
    },
    {
      id: "control-drag",
      interaction: "control-drag",
      workload: false,
      budget: { maxInteractionMs: 30, maxFrameGapMs: 16 },
      fixture: "Clicking and dragging card nodes.",
      expectedObservable: "Cards snap to grid as they are dragged.",
      automated: true,
      automatedTestName: "schema: validates worldbuilder control targets",
      browser: true,
      browserTestName: "browser: verifies card dragging performance",
      controlLabel: "Worldbuilder Panel"
    },
    {
      id: "export-copy",
      interaction: "export-copy",
      workload: false,
      budget: { maxExportMs: 500, maxFrameGapMs: 16 },
      fixture: "PNG export execution.",
      expectedObservable: "Generates export image file.",
      automated: true,
      automatedTestName: "schema: validates worldbuilder control targets",
      browser: true,
      browserTestName: "browser: verifies board png export",
      controlLabel: "Export PNG"
    },
    {
      id: "scenario.snapToGrid",
      target: "workspace.snapToGrid",
      interaction: "control-change",
      workload: true,
      values: { min: false, default: true, max: true },
      stressFixture: {
        kind: "custom",
        reason: "Grid snap enable.",
        value: { "workspace.snapToGrid": true }
      },
      budget: { maxFrameGapMs: 16, maxInteractionMs: 16 },
      expectedObservable: "Enables snap to grid.",
      fixture: "Toggle snap to grid switch.",
      automated: true,
      automatedTestName: "schema: validates worldbuilder control targets",
      browser: true,
      browserTestName: "browser: verifies snap to grid behavior",
      controlLabel: "Snap to Grid"
    },
    {
      id: "scenario.gridSize",
      target: "workspace.gridSize",
      interaction: "control-drag",
      workload: true,
      values: { min: 5, default: 20, max: 100 },
      stressFixture: {
        kind: "max-value",
        reason: "Grid size max math.",
        value: { "workspace.gridSize": 100 },
        loadProfile: {
          target: "workspace.gridSize",
          metric: "custom",
          userFacingRange: "fully-guaranteed",
          smoothTarget: { "workspace.gridSize": 100 },
          hardLimit: { "workspace.gridSize": 100 },
          smoothTargetRatio: 1.0
        }
      },
      budget: { maxFrameGapMs: 16, maxInteractionMs: 16 },
      expectedObservable: "Grid snaps change.",
      fixture: "Drag grid size slider.",
      automated: true,
      automatedTestName: "schema: validates worldbuilder control targets",
      browser: true,
      browserTestName: "browser: verifies grid size slider",
      controlLabel: "Grid Size"
    },
    {
      id: "scenario.ollamaModel",
      target: "workspace.ollamaModel",
      interaction: "control-change",
      workload: false,
      budget: { maxFrameGapMs: 16, maxInteractionMs: 16 },
      expectedObservable: "Ollama local model name updates.",
      fixture: "Type local model name in settings.",
      automated: true,
      automatedTestName: "schema: validates worldbuilder control targets",
      browser: true,
      browserTestName: "browser: verifies ollama model input",
      controlLabel: "Local Model"
    },
    {
      id: "scenario.ollamaEndpoint",
      target: "workspace.ollamaEndpoint",
      interaction: "control-change",
      workload: false,
      budget: { maxFrameGapMs: 16, maxInteractionMs: 16 },
      expectedObservable: "Ollama endpoint URL updates.",
      fixture: "Type endpoint URL in settings.",
      automated: true,
      automatedTestName: "schema: validates worldbuilder control targets",
      browser: true,
      browserTestName: "browser: verifies ollama endpoint input",
      controlLabel: "API Endpoint"
    },
    {
      id: "scenario.ollamaTemperature",
      target: "workspace.ollamaTemperature",
      interaction: "control-drag",
      workload: true,
      values: { min: 0, default: 0.7, max: 1 },
      stressFixture: {
        kind: "max-value",
        reason: "Ollama temperature maximum.",
        value: { "workspace.ollamaTemperature": 1 },
        loadProfile: {
          target: "workspace.ollamaTemperature",
          metric: "custom",
          userFacingRange: "fully-guaranteed",
          smoothTarget: { "workspace.ollamaTemperature": 1 },
          hardLimit: { "workspace.ollamaTemperature": 1 },
          smoothTargetRatio: 1.0
        }
      },
      budget: { maxFrameGapMs: 16, maxInteractionMs: 16 },
      expectedObservable: "Ollama temperature setting updates.",
      fixture: "Slide temperature control in settings.",
      automated: true,
      automatedTestName: "schema: validates worldbuilder control targets",
      browser: true,
      browserTestName: "browser: verifies ollama temperature input",
      controlLabel: "Temperature"
    },
    {
      id: "scenario.ollamaSystemPrompt",
      target: "workspace.ollamaSystemPrompt",
      interaction: "control-change",
      workload: true,
      values: { min: "", default: "", max: heavyText },
      stressFixture: {
        kind: "large-text",
        reason: "Heaviest system prompt instructions.",
        value: heavyText
      },
      budget: { maxFrameGapMs: 16, maxInteractionMs: 16 },
      expectedObservable: "Ollama system prompt instructions update.",
      fixture: "Type custom system prompt instructions in settings.",
      automated: true,
      automatedTestName: "schema: validates worldbuilder control targets",
      browser: true,
      browserTestName: "browser: verifies ollama system prompt input",
      controlLabel: "System Prompt"
    },
    {
      id: "scenario.selectedCardId",
      target: "workspace.selectedCardId",
      interaction: "control-change",
      workload: false,
      budget: { maxFrameGapMs: 16, maxInteractionMs: 16 },
      expectedObservable: "Selected card ID updates.",
      fixture: "Click a card.",
      automated: true,
      automatedTestName: "schema: validates worldbuilder control targets",
      browser: true,
      browserTestName: "browser: verifies card selection",
      controlLabel: "Selected Card ID"
    },
    {
      id: "scenario.selectedCardType",
      target: "workspace.selectedCardType",
      interaction: "control-change",
      workload: false,
      budget: { maxFrameGapMs: 16, maxInteractionMs: 16 },
      expectedObservable: "Card category updates.",
      fixture: "Change card type dropdown.",
      automated: true,
      automatedTestName: "schema: validates worldbuilder control targets",
      browser: true,
      browserTestName: "browser: verifies card type dropdown",
      controlLabel: "Type"
    },
    {
      id: "scenario.selectedCardTitle",
      target: "workspace.selectedCardTitle",
      interaction: "control-change",
      workload: false,
      budget: { maxFrameGapMs: 16, maxInteractionMs: 16 },
      expectedObservable: "Card header title text updates.",
      fixture: "Type in card title.",
      automated: true,
      automatedTestName: "schema: validates worldbuilder control targets",
      browser: true,
      browserTestName: "browser: verifies card title changes",
      controlLabel: "Title"
    },
    {
      id: "scenario.selectedCardColor",
      target: "workspace.selectedCardColor",
      interaction: "control-change",
      workload: false,
      budget: { maxFrameGapMs: 16, maxInteractionMs: 16 },
      expectedObservable: "Card accent color updates.",
      fixture: "Pick a card color.",
      automated: true,
      automatedTestName: "schema: validates worldbuilder control targets",
      browser: true,
      browserTestName: "browser: verifies card color changes",
      controlLabel: "Color"
    },
    {
      id: "scenario.selectedCardText",
      target: "workspace.selectedCardText",
      interaction: "control-change",
      workload: true,
      values: { min: "", default: "", max: heavyText },
      stressFixture: {
        kind: "large-text",
        reason: "Heaviest markdown description text.",
        value: heavyText
      },
      budget: { maxFrameGapMs: 16, maxInteractionMs: 16 },
      expectedObservable: "Card body description markdown updates.",
      fixture: "Type markdown description.",
      automated: true,
      automatedTestName: "schema: validates worldbuilder control targets",
      browser: true,
      browserTestName: "browser: verifies markdown card description",
      controlLabel: "Description"
    },
    {
      id: "scenario.selectedConnectionId",
      target: "workspace.selectedConnectionId",
      interaction: "control-change",
      workload: false,
      budget: { maxFrameGapMs: 16, maxInteractionMs: 16 },
      expectedObservable: "Selected connection ID updates.",
      fixture: "Click a connection spline.",
      automated: true,
      automatedTestName: "schema: validates worldbuilder control targets",
      browser: true,
      browserTestName: "browser: verifies spline selection",
      controlLabel: "Connection ID"
    },
    {
      id: "scenario.selectedConnectionLabel",
      target: "workspace.selectedConnectionLabel",
      interaction: "control-change",
      workload: false,
      budget: { maxFrameGapMs: 16, maxInteractionMs: 16 },
      expectedObservable: "Connection relationship label updates.",
      fixture: "Type in relationship label.",
      automated: true,
      automatedTestName: "schema: validates worldbuilder control targets",
      browser: true,
      browserTestName: "browser: verifies spline relationship label changes",
      controlLabel: "Relation Label"
    },
    {
      id: "scenario.selectedConnectionStyle",
      target: "workspace.selectedConnectionStyle",
      interaction: "control-change",
      workload: false,
      budget: { maxFrameGapMs: 16, maxInteractionMs: 16 },
      expectedObservable: "Connection category style updates.",
      fixture: "Change connection category style dropdown.",
      automated: true,
      automatedTestName: "schema: validates worldbuilder control targets",
      browser: true,
      browserTestName: "browser: verifies connection style dropdown",
      controlLabel: "Category Style"
    },
    {
      id: "scenario.selectedConnectionColor",
      target: "workspace.selectedConnectionColor",
      interaction: "control-change",
      workload: false,
      budget: { maxFrameGapMs: 16, maxInteractionMs: 16 },
      expectedObservable: "Connection accent color updates.",
      fixture: "Change connection accent color dropdown.",
      automated: true,
      automatedTestName: "schema: validates worldbuilder control targets",
      browser: true,
      browserTestName: "browser: verifies connection color dropdown",
      controlLabel: "Accent Color"
    },
    {
      id: "scenario.selectedConnectionWeight",
      target: "workspace.selectedConnectionWeight",
      interaction: "control-drag",
      workload: true,
      values: { min: 1, default: 2, max: 5 },
      stressFixture: {
        kind: "max-value",
        reason: "Connection weight maximum width rendering.",
        value: { "workspace.selectedConnectionWeight": 5 },
        loadProfile: {
          target: "workspace.selectedConnectionWeight",
          metric: "custom",
          userFacingRange: "fully-guaranteed",
          smoothTarget: { "workspace.selectedConnectionWeight": 5 },
          hardLimit: { "workspace.selectedConnectionWeight": 5 },
          smoothTargetRatio: 1.0
        }
      },
      budget: { maxFrameGapMs: 16, maxInteractionMs: 16 },
      expectedObservable: "Connection line weight changes.",
      fixture: "Drag connection line weight slider.",
      automated: true,
      automatedTestName: "schema: validates worldbuilder control targets",
      browser: true,
      browserTestName: "browser: verifies connection weight slider",
      controlLabel: "Line Weight"
    },
    {
      id: "scenario.canvasData",
      target: "workspace.canvasData",
      interaction: "control-change",
      workload: true,
      values: {
        min: '{"nodes":[],"edges":[]}',
        default: '{"nodes":[],"edges":[]}',
        max: heavyJson
      },
      stressFixture: {
        kind: "large-text",
        reason: "Heaviest raw JSON canvas string.",
        value: heavyJson
      },
      budget: { maxFrameGapMs: 16, maxInteractionMs: 16 },
      expectedObservable: "Canvas redraws nodes and connections.",
      fixture: "Update JSON Canvas.",
      automated: true,
      automatedTestName: "schema: validates worldbuilder control targets",
      browser: true,
      browserTestName: "browser: verifies JSON canvas input",
      controlLabel: "JSON Canvas"
    },
    {
      id: "scenario.includeBackground",
      target: "export.includeBackground",
      interaction: "control-change",
      workload: false,
      budget: { maxFrameGapMs: 16, maxInteractionMs: 16 },
      expectedObservable: "Background inclusion state updates.",
      fixture: "Toggle Include Background switch.",
      automated: true,
      automatedTestName: "schema: validates worldbuilder control targets",
      browser: true,
      browserTestName: "browser: verifies include background toggle",
      controlLabel: "Include"
    },
    {
      id: "scenario.backgroundColor",
      target: "appearance.background",
      interaction: "control-change",
      workload: false,
      budget: { maxFrameGapMs: 16, maxInteractionMs: 16 },
      expectedObservable: "Canvas background changes.",
      fixture: "Pick background color.",
      automated: true,
      automatedTestName: "schema: validates worldbuilder control targets",
      browser: true,
      browserTestName: "browser: verifies background color selection",
      controlLabel: "Color"
    },
    {
      id: "scenario.imageFormat",
      target: "export.image.format",
      interaction: "control-change",
      workload: false,
      budget: { maxFrameGapMs: 16, maxInteractionMs: 16 },
      expectedObservable: "Export format updates.",
      fixture: "Select image format.",
      automated: true,
      automatedTestName: "schema: validates worldbuilder control targets",
      browser: true,
      browserTestName: "browser: verifies export format dropdown",
      controlLabel: "Format"
    },
    {
      id: "scenario.imageResolution",
      target: "export.image.resolution",
      interaction: "control-change",
      workload: true,
      values: {
        min: { width: 1920, height: 1080 },
        default: { width: 3840, height: 2160 },
        max: { width: 7680, height: 4320 }
      },
      stressFixture: {
        kind: "custom",
        reason: "Select high resolution 8k scaling.",
        value: { "export.image.resolution": { width: 7680, height: 4320 } },
        loadProfile: {
          target: "export.image.resolution",
          metric: "custom",
          userFacingRange: "fully-guaranteed",
          smoothTarget: { "export.image.resolution": { width: 7680, height: 4320 } },
          hardLimit: { "export.image.resolution": { width: 7680, height: 4320 } },
          smoothTargetRatio: 1.0
        }
      },
      budget: { maxFrameGapMs: 16, maxInteractionMs: 16 },
      expectedObservable: "Export scaling updates.",
      fixture: "Select resolution.",
      automated: true,
      automatedTestName: "schema: validates worldbuilder control targets",
      browser: true,
      browserTestName: "browser: verifies image resolution dropdown",
      controlLabel: "Resolution"
    },
    {
      id: "scenario.actions",
      target: "workspace.actions",
      interaction: "control-change",
      workload: false,
      budget: { maxFrameGapMs: 16, maxInteractionMs: 16 },
      expectedObservable: "Runs footer action.",
      fixture: "Click board actions.",
      automated: true,
      automatedTestName: "schema: validates worldbuilder control targets",
      browser: true,
      browserTestName: "browser: verifies panel actions click",
      controlLabel: "Actions"
    },
    {
      id: "scenario.theme",
      target: "workspace.theme",
      interaction: "control-change",
      workload: false,
      budget: { maxFrameGapMs: 16, maxInteractionMs: 16 },
      expectedObservable: "Board background and sidebar colors update to slate blue theme.",
      fixture: "Select theme dropdown value.",
      automated: true,
      automatedTestName: "schema: validates worldbuilder control targets",
      browser: true,
      browserTestName: "browser: verifies theme dropdown behavior",
      controlLabel: "Theme"
    },
    {
      id: "scenario.globalFontScale",
      target: "workspace.globalFontScale",
      interaction: "control-drag",
      workload: true,
      values: { min: 80, default: 100, max: 150 },
      stressFixture: {
        kind: "max-value",
        reason: "Font scale max math.",
        value: { "workspace.globalFontScale": 150 },
        loadProfile: {
          target: "workspace.globalFontScale",
          metric: "custom",
          userFacingRange: "fully-guaranteed",
          smoothTarget: { "workspace.globalFontScale": 150 },
          hardLimit: { "workspace.globalFontScale": 150 },
          smoothTargetRatio: 1.0
        }
      },
      budget: { maxFrameGapMs: 16, maxInteractionMs: 16 },
      expectedObservable: "Card titles, texts, and tag labels scale up proportionally.",
      fixture: "Drag font scale slider.",
      automated: true,
      automatedTestName: "schema: validates worldbuilder control targets",
      browser: true,
      browserTestName: "browser: verifies font scale slider behavior",
      controlLabel: "Global Font Size"
    }
  ],
  usesCustomRenderer: true,
  workloadTargets: [
    "workspace.snapToGrid",
    "workspace.gridSize",
    "workspace.selectedCardText",
    "workspace.canvasData",
    "export.image.resolution",
    "workspace.globalFontScale",
    "workspace.selectedConnectionWeight",
    "workspace.ollamaTemperature",
    "workspace.ollamaSystemPrompt"
  ],
  rendererTechnique: {
    sourceRepresentation: "json-canvas",
    productRepresentation: "mixed",
    previewRenderer: "react-dom-svg",
    exportRenderer: "react-dom-svg",
    rendererWorkload: "simple-composition",
    rendererStrategy: "dom",
    whyNotAlternativeStrategies: [
      "Custom react-dom-svg renderer was chosen over WebGL/WebGPU or Canvas2D to support native scaling of markdown cards and text-output content while retaining crisp SVG vector lines."
    ],
    fidelityRisks: [
      "To prevent blurriness and visual artifacts at high zoom scales, semantic cards are kept as HTML elements and connection lines are drawn as vector SVG elements."
    ],
    performanceRisks: [
      "Minimized render-blocking layout thrashing during drag-movement on the infinite canvas viewport by only syncing position coords locally before committing updates."
    ],
    layers: [
      {
        id: "backgroundLayer",
        kind: "background",
        renderer: "dom",
        content: ["geometry"],
      },
      {
        id: "productForegroundLayer",
        kind: "product-foreground",
        renderer: "dom",
        content: ["text", "geometry"],
        uiSelector: "[data-node-id]",
      },
      {
        id: "editingHandlesLayer",
        kind: "editing-handles",
        renderer: "dom",
        content: ["handles"],
        uiSelector: "[data-port-side]",
        exportMode: "excluded",
      }
    ],
  },
  rendererPipeline: {
    passes: [
      {
        id: "canvas-draw",
        kind: "composite",
        runsOn: "main",
        output: "preview",
        quality: "preview",
        inputs: ["workspace.canvasData"],
        invalidatedBy: ["workspace.canvasData"],
        cacheKey: ["workspace.canvasData"],
      }
    ],
    interactionInvalidation: [
      {
        interaction: "control-drag",
        invalidates: ["canvas-draw"],
        targets: [
          "workspace.snapToGrid",
          "workspace.gridSize",
          "workspace.selectedCardId",
          "workspace.selectedCardTitle",
          "workspace.selectedCardType",
          "workspace.selectedCardColor",
          "workspace.selectedCardText",
          "workspace.selectedConnectionId",
          "workspace.selectedConnectionLabel",
          "workspace.canvasData",
          "export.includeBackground",
          "appearance.background",
          "export.image.format",
          "export.image.resolution",
          "workspace.actions",
          "workspace.theme",
          "workspace.globalFontScale",
          "workspace.ollamaModel",
          "workspace.ollamaEndpoint",
          "workspace.ollamaTemperature",
          "workspace.ollamaSystemPrompt",
          "workspace.selectedConnectionStyle",
          "workspace.selectedConnectionColor",
          "workspace.selectedConnectionWeight"
        ],
      },
      {
        interaction: "control-change",
        invalidates: ["canvas-draw"],
        targets: [
          "workspace.snapToGrid",
          "workspace.selectedCardId",
          "workspace.selectedCardType",
          "workspace.selectedCardTitle",
          "workspace.selectedCardColor",
          "workspace.selectedCardText",
          "workspace.selectedConnectionId",
          "workspace.selectedConnectionLabel",
          "workspace.canvasData",
          "export.includeBackground",
          "appearance.background",
          "export.image.format",
          "export.image.resolution",
          "workspace.actions",
          "workspace.theme",
          "workspace.globalFontScale",
          "workspace.ollamaModel",
          "workspace.ollamaEndpoint",
          "workspace.ollamaTemperature",
          "workspace.ollamaSystemPrompt"
        ],
      },
      {
        interaction: "export",
        invalidates: ["canvas-draw"],
        targets: [
          "workspace.actions"
        ],
      },
      {
        interaction: "viewport-drag",
        invalidates: [],
        targets: [
          "canvas.size.width",
          "canvas.size.height"
        ],
      },
      {
        interaction: "viewport-zoom",
        invalidates: [],
        targets: [
          "canvas.renderScale"
        ],
      }
    ]
  }
});
