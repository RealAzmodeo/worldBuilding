import { describe, expect, it } from "vitest";

import { appPerformance } from "./app-performance";
import { appSchema } from "./app-schema";

describe("appSchema", () => {
  it("schema: validates worldbuilder control targets", () => {
    // Assert canvas configuration
    expect(appSchema.canvas.enabled).toBe(true);
    expect(appSchema.canvas.sizing).toEqual({ mode: "editable-output" });

    // Assert workspace sections exist
    const sections = appSchema.panels.controls?.sections || [];
    const titles = sections.map((s) => s.title);
    expect(titles).toContain("Workspace Settings");
    expect(titles).toContain("Selected Card");
    expect(titles).toContain("Canvas Code");
    expect(titles).toContain("Background");
    expect(titles).toContain("Image Export");

    // Verify presence of required targets
    const allTargets = sections.flatMap((s) =>
      Object.values(s.controls).map((c) => c.target)
    );
    expect(allTargets).toContain("workspace.snapToGrid");
    expect(allTargets).toContain("workspace.gridSize");
    expect(allTargets).toContain("workspace.selectedCardId");
    expect(allTargets).toContain("workspace.selectedCardTitle");
    expect(allTargets).toContain("workspace.selectedCardType");
    expect(allTargets).toContain("workspace.selectedCardColor");
    expect(allTargets).toContain("workspace.selectedCardText");
    expect(allTargets).toContain("workspace.canvasData");
    expect(allTargets).toContain("export.includeBackground");
    expect(allTargets).toContain("appearance.background");
    expect(allTargets).toContain("export.image.format");
    expect(allTargets).toContain("export.image.resolution");
  });
});
