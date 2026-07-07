import { defineToolcraft } from "@/toolcraft/runtime";

export const appSchema = defineToolcraft({
  canvas: {
    enabled: true,
    sizing: { mode: "editable-output" },
    upload: false,
    draggable: true,
  },
  persistence: {
    storage: "localStorage",
    key: "worldbuilder-canvas-settings",
    version: 1,
    include: ["values", "canvas", "panels"],
  },
  toolbar: {
    history: true,
    radar: true,
    zoom: true,
  },
  panels: {
    controls: {
      title: "Worldbuilder Panel",
      sections: [
        {
          title: "Workspace Settings",
          controls: {
            snapToGrid: {
              defaultValue: true,
              label: "Snap to Grid",
              target: "workspace.snapToGrid",
              type: "switch",
              performanceRole: "workload"
            },
            selectedCardId: {
              defaultValue: "",
              label: "Selected Card ID",
              target: "workspace.selectedCardId",
              type: "text",
              performanceRole: "responsiveness"
            },
            selectedConnectionId: {
              defaultValue: "",
              label: "Connection ID",
              target: "workspace.selectedConnectionId",
              type: "text",
              performanceRole: "responsiveness"
            },
             theme: {
              defaultValue: "dark",
              label: "Theme",
              target: "workspace.theme",
              type: "select",
              options: [
                { label: "Deep Obsidian (Dark)", value: "dark" },
                { label: "Parchment Sepia (Light)", value: "light" },
                { label: "Slate Horizon (Slate Blue)", value: "slate" }
              ],
              performanceRole: "responsiveness"
            },
            globalFontScale: {
              defaultValue: 100,
              label: "Global Font Size",
              target: "workspace.globalFontScale",
              type: "slider",
              min: 80,
              max: 150,
              step: 5,
              unit: "%",
              performanceRole: "workload"
            },
            gridSize: {
              defaultValue: 20,
              label: "Grid Size",
              target: "workspace.gridSize",
              type: "slider",
              min: 5,
              max: 100,
              step: 5,
              unit: "px",
              performanceRole: "workload"
            }
          }
        },
        {
          title: "AI Assistant (Ollama)",
          controls: {
            ollamaModel: {
              defaultValue: "llama3",
              label: "Local Model",
              target: "workspace.ollamaModel",
              type: "text",
              performanceRole: "responsiveness",
              description: "Model to call in Ollama (e.g. llama3, mistral, gemma, etc.)"
            },
            ollamaEndpoint: {
              defaultValue: "/api/ollama",
              label: "API Endpoint",
              target: "workspace.ollamaEndpoint",
              type: "text",
              performanceRole: "responsiveness",
              description: "URL base del servidor local de Ollama."
            },
            ollamaSystemPrompt: {
              defaultValue: "",
              label: "System Prompt",
              target: "workspace.ollamaSystemPrompt",
              type: "text",
              performanceRole: "workload",
              description: "Instrucciones de comportamiento globales para la IA."
            },
            ollamaTemperature: {
              defaultValue: 0.7,
              label: "Temperature",
              target: "workspace.ollamaTemperature",
              type: "slider",
              min: 0,
              max: 1,
              step: 0.1,
              performanceRole: "responsiveness",
              description: "Grado de creatividad de la IA."
            }
          }
        },
        {
          title: "Selected Card",
          visibleWhen: {
            target: "workspace.selectedCardId",
            notEquals: "",
          },
          controls: {
            cardType: {
              defaultValue: "character",
              label: "Type",
              target: "workspace.selectedCardType",
              type: "select",
              options: [
                { label: "Character", value: "character" },
                { label: "Location", value: "location" },
                { label: "Faction", value: "faction" },
                { label: "Magic Spell", value: "magic_spell" },
                { label: "General", value: "general" },
                { label: "Group (Frame)", value: "group" }
              ],
              performanceRole: "responsiveness"
            },
            cardTitle: {
              defaultValue: "New Card",
              label: "Title",
              target: "workspace.selectedCardTitle",
              type: "text",
              commitMode: "content",
              performanceRole: "responsiveness"
            },
            cardColor: {
              defaultValue: { hex: "#70b0fa" },
              label: "Color",
              target: "workspace.selectedCardColor",
              type: "color",
              performanceRole: "responsiveness"
            },
            cardText: {
              defaultValue: "",
              label: "Description",
              target: "workspace.selectedCardText",
              type: "code",
              performanceRole: "workload"
            }
          }
        },
        {
          title: "Selected Connection",
          visibleWhen: {
            target: "workspace.selectedConnectionId",
            notEquals: "",
          },
          controls: {
            connectionStyle: {
              defaultValue: "solid",
              label: "Category Style",
              target: "workspace.selectedConnectionStyle",
              type: "select",
              options: [
                { label: "Relational (Solid)", value: "solid" },
                { label: "Flow / Story Line (Dashed)", value: "dashed" },
                { label: "Association / Influence (Dotted)", value: "dotted" }
              ],
              performanceRole: "responsiveness"
            },
            connectionColor: {
              defaultValue: "gray",
              label: "Accent Color",
              target: "workspace.selectedConnectionColor",
              type: "select",
              options: [
                { label: "Neutral (Gray)", value: "gray" },
                { label: "Positive / Alliance (Green)", value: "green" },
                { label: "Conflict / Hostile (Red)", value: "red" },
                { label: "Magic / Connection (Purple)", value: "purple" },
                { label: "Lore / History (Blue)", value: "blue" }
              ],
              performanceRole: "responsiveness"
            },
            connectionLabel: {
              defaultValue: "Allied with",
              label: "Relation Label",
              target: "workspace.selectedConnectionLabel",
              type: "text",
              commitMode: "content",
              performanceRole: "responsiveness"
            },
            connectionWeight: {
              defaultValue: 2,
              label: "Line Weight",
              target: "workspace.selectedConnectionWeight",
              type: "slider",
              min: 1,
              max: 5,
              step: 1,
              unit: "px",
              performanceRole: "workload"
            }
          }
        },
        {
          title: "Canvas Code",
          controls: {
            canvasData: {
              defaultValue: '{\n  "nodes": [],\n  "edges": []\n}',
              label: "JSON Canvas",
              target: "workspace.canvasData",
              type: "code",
              performanceRole: "workload"
            }
          }
        },
        {
          title: "Background",
          controls: {
            includeBackground: {
              defaultValue: true,
              label: "Include",
              target: "export.includeBackground",
              type: "switch",
              performanceRole: "responsiveness"
            },
            backgroundColor: {
              defaultValue: { hex: "#121212" },
              label: false,
              target: "appearance.background",
              type: "color",
              performanceRole: "responsiveness"
            }
          },
          layoutGroups: [
            {
              layout: "inline",
              columns: 2,
              controls: ["includeBackground", "backgroundColor"],
            }
          ]
        },
        {
          title: "Image Export",
          controls: {
            imageFormat: {
              defaultValue: "png",
              label: "Format",
              options: [
                { label: "PNG", value: "png" },
                { label: "JPG", value: "jpg" },
              ],
              target: "export.image.format",
              type: "select",
              performanceRole: "responsiveness"
            },
            imageResolution: {
              defaultValue: "4k",
              label: "Resolution",
              options: [
                { label: "2K", value: "2k" },
                { label: "4K", value: "4k" },
                { label: "8K", value: "8k" },
              ],
              target: "export.image.resolution",
              type: "select",
              performanceRole: "workload"
            },
          },
          layoutGroups: [
            {
              layout: "inline",
              columns: 2,
              controls: ["imageFormat", "imageResolution"],
            },
          ],
        },
        {
          title: "Actions",
          controls: {
            boardActions: {
              target: "workspace.actions",
              type: "panelActions",
              variant: "primary",
              actions: [
                {
                  label: "Export PNG",
                  value: "export.png",
                  icon: "upload-simple"
                },
                {
                  label: "Add Card",
                  value: "workspace.addCard"
                },
                {
                  label: "Delete Card",
                  value: "workspace.deleteCard"
                },
                {
                  label: "Clear Board",
                  value: "workspace.clearBoard"
                }
              ]
            }
          }
        }
      ]
    }
  }
});
