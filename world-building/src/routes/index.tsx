import * as React from "react";
import { ToolcraftApp } from "@/toolcraft/runtime/react";
import { ToolcraftContext } from "@/toolcraft/runtime/react/toolcraft-root";

import { appSchema } from "../app/app-schema";
import { WorldCanvasRenderer } from "../app/world-canvas-renderer";

export function AppHome(): React.JSX.Element {
  const handlePanelAction = React.useCallback((options: { action: { value: string } }) => {
    const event = new CustomEvent("toolcraft-panel-action", {
      detail: { command: options.action.value },
    });
    window.dispatchEvent(event);
  }, []);

  return (
    <ToolcraftApp
      className="h-dvh min-h-dvh"
      schema={appSchema}
      canvasContent={<WorldCanvasRenderer />}
      renderDefaultCanvasMedia={false}
      onPanelAction={handlePanelAction}
    />
  );
}
