import * as React from "react";
import { createPortal } from "react-dom";
import { useToolcraft } from "@/toolcraft/runtime/react";
import { createToolcraftPngExportCanvas, shouldIncludeToolcraftPreviewBackground } from "@/toolcraft/runtime";
import { Plus, Trash2, X, Link, Circle, MapPin, User, Shield, Zap, BookOpen, Folder, ChevronRight, ChevronDown, CheckSquare, Square, Code, FileText, Image, Video, ExternalLink, Sparkles } from "lucide-react";

import {
  getCategoryIcon,
  getCategoryColor,
  getClosestConnectionSide,
  getBezierPath,
  Point,
  Rect
} from "./geometry-utils";

import {
  Block,
  generateBlockId,
  parseTextToBlocks,
  serializeBlocksToText,
  formatInlineMarkdown,
  renderMarkdown
} from "./markdown-utils";

import { TagInput } from "./tag-input";


export interface CardNode {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height?: number;
  color: string;
  title: string;
  cardType: string;
  text: string;
  tags?: string[];
  isResized?: boolean;
  coverImage?: string;
  icon?: string;
}

export function WorldCanvasRenderer(): React.JSX.Element {
  const { state, dispatch } = useToolcraft();
  const containerRef = React.useRef<HTMLDivElement>(null);

  // Ollama AI Assistant State & Handlers
  const ollamaModel = (state.values["workspace.ollamaModel"] as string) || "llama3";
  const ollamaEndpoint = (state.values["workspace.ollamaEndpoint"] as string) || "/api/ollama";
  const ollamaTemperature = Number(state.values["workspace.ollamaTemperature"] ?? 0.7);
  const ollamaSystemPrompt = (state.values["workspace.ollamaSystemPrompt"] as string) || "";

  // Story Analyzer State
  const [isStoryAnalyzerOpen, setIsStoryAnalyzerOpen] = React.useState(false);
  const [storyAnalyzerText, setStoryAnalyzerText] = React.useState("");
  const [storyAnalyzerIsAnalyzing, setStoryAnalyzerIsAnalyzing] = React.useState(false);
  const storyAnalyzerAbortControllerRef = React.useRef<AbortController | null>(null);

  const [aiCardId, setAiCardId] = React.useState<string | null>(null);
  const [aiPrompt, setAiPrompt] = React.useState("");
  const [aiTab, setAiTab] = React.useState<"rewrite" | "prompt">("rewrite");
  const [isGenerating, setIsGenerating] = React.useState(false);
  const abortControllerRef = React.useRef<AbortController | null>(null);
  const [focusedBlockId, setFocusedBlockId] = React.useState<string | null>(null);

  // Dynamic model list from Ollama
  const [availableModels, setAvailableModels] = React.useState<string[]>([]);
  const [selectedAiModel, setSelectedAiModel] = React.useState<string>(ollamaModel);
  const [modelsLoading, setModelsLoading] = React.useState(false);

  // Sync selectedAiModel when global setting changes
  React.useEffect(() => { setSelectedAiModel(ollamaModel); }, [ollamaModel]);

  const fetchAvailableModels = React.useCallback(async () => {
    setModelsLoading(true);
    try {
      const base = ollamaEndpoint.replace(/\/+$/, "");
      const res = await fetch(`${base}/api/tags`);
      if (res.ok) {
        const data = await res.json();
        const names: string[] = (data.models || []).map((m: any) => m.name as string);
        setAvailableModels(names);
        if (names.length > 0 && !names.includes(selectedAiModel)) {
          setSelectedAiModel(names[0]);
        }
      }
    } catch (e) {
      // Ollama might not be running yet
    } finally {
      setModelsLoading(false);
    }
  }, [ollamaEndpoint, selectedAiModel]);

  // Prompt file cache (in-memory per session, keyed by card type)
  const promptCacheRef = React.useRef<Record<string, { rewrite: string; prompt: string }>>({});

  const loadCardTypePrompt = React.useCallback(async (cardType: string): Promise<{ rewrite: string; prompt: string }> => {
    const type = cardType || "general";
    if (promptCacheRef.current[type]) return promptCacheRef.current[type];

    const tryLoad = async (t: string): Promise<string | null> => {
      try {
        const res = await fetch(`/prompts/${t}.md`);
        if (res.ok) return await res.text();
      } catch (_) {}
      return null;
    };

    // Parse ## REWRITE and ## PROMPT sections from the file text
    const parsePromptFile = (text: string): { rewrite: string; prompt: string } => {
      // Strip HTML comment lines (<!-- ... -->)
      const cleaned = text.replace(/<!--[\s\S]*?-->/g, "").trim();
      const rewriteMatch = cleaned.match(/##\s*REWRITE\s*([\s\S]*?)(?=##\s*PROMPT|$)/i);
      const promptMatch = cleaned.match(/##\s*PROMPT\s*([\s\S]*?)$/i);
      return {
        rewrite: rewriteMatch?.[1]?.trim() || "",
        prompt: promptMatch?.[1]?.trim() || "",
      };
    };

    let text = await tryLoad(type);
    if (!text && type !== "general") text = await tryLoad("general");

    if (text) {
      const parsed = parsePromptFile(text);
      promptCacheRef.current[type] = parsed;
      return parsed;
    }

    // Hardcoded fallback if no files are available at all
    const fallback = {
      rewrite: "Eres un escritor experto en worldbuilding y narrativa literaria. Mejora la redacción del siguiente texto para que suene más profesional e inmersivo. Mantén el formato Markdown y el idioma español.",
      prompt: "Eres un escritor experto en worldbuilding y narrativa literaria. Escribe un texto creativo en español basado en la consigna del usuario. Usa formato Markdown cuando sea apropiado.",
    };
    promptCacheRef.current[type] = fallback;
    return fallback;
  }, []);

  const middlePanRef = React.useRef<{
    startX: number;
    startY: number;
    origOffsetX: number;
    origOffsetY: number;
  } | null>(null);

  // Sync settings
  const snapToGrid = !!state.values["workspace.snapToGrid"];
  const gridSize = Number(state.values["workspace.gridSize"]) || 20;
  const selectedCardId = (state.values["workspace.selectedCardId"] as string) || "";
  const selectedConnectionId = (state.values["workspace.selectedConnectionId"] as string) || "";
  const selectedConnectionLabel = (state.values["workspace.selectedConnectionLabel"] as string) || "";
  const selectedConnectionStyle = (state.values["workspace.selectedConnectionStyle"] as string) || "solid";
  const selectedConnectionColor = (state.values["workspace.selectedConnectionColor"] as string) || "gray";
  const selectedConnectionWeight = Number(state.values["workspace.selectedConnectionWeight"]) || 2;

  const theme = (state.values["workspace.theme"] as string) || "dark";
  const globalFontScale = (Number(state.values["workspace.globalFontScale"]) || 100) / 100;
  const fallbackBg = (state.values["appearance.background"] as { hex: string })?.hex || "#121212";

  // Active inputs
  const cardTitle = (state.values["workspace.selectedCardTitle"] as string) || "";
  const cardType = (state.values["workspace.selectedCardType"] as string) || "";
  const cardColorObj = state.values["workspace.selectedCardColor"] as { hex: string } | undefined;
  const cardColor = cardColorObj?.hex || "#70b0fa";
  const cardText = (state.values["workspace.selectedCardText"] as string) || "";
  const cardCover = (state.values["workspace.selectedCardCover"] as string) || "";
  const cardIcon = (state.values["workspace.selectedCardIcon"] as string) || "";

  // Canvas size and zoom
  const { width, height } = state.canvas.size;
  const zoom = state.canvas.zoom;
  const scale = zoom / 100;

  // Local drag state for nodes
  const [dragNode, setDragNode] = React.useState<{
    id: string;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
  } | null>(null);

  // Connection drag state
  const [dragConnection, setDragConnection] = React.useState<{
    fromNodeId: string;
    fromSide: string;
    startX: number;
    startY: number;
    currentX: number;
    currentY: number;
  } | null>(null);

  // Resize state
  const [resizeNode, setResizeNode] = React.useState<{
    id: string;
    startX: number;
    startY: number;
    origWidth: number;
    origHeight: number;
  } | null>(null);

  // Deletion confirmation state
  const [deleteConfirmationCard, setDeleteConfirmationCard] = React.useState<any | null>(null);

  // Search & Directory filters
  const [searchTerm, setSearchTerm] = React.useState("");
  const [categoryFilter, setCategoryFilter] = React.useState("all");

  // Context Menu state
  const [dragBlockIndex, setDragBlockIndex] = React.useState<number | null>(null);
  const [dropTargetIndex, setDropTargetIndex] = React.useState<number | null>(null);
  const [formatMenu, setFormatMenu] = React.useState<{ x: number, y: number, text: string, blockId: string, index: number, inputEl: HTMLInputElement | HTMLTextAreaElement } | null>(null);
  const [slashMenu, setSlashMenu] = React.useState<{ blockId: string, index: number, x: number, y: number, query: string } | null>(null);
  const [contextMenu, setContextMenu] = React.useState<{
    x: number;
    y: number;
    type: "canvas" | "node" | "edge";
    target: any;
    selectedText?: string;
  } | null>(null);

  const [activeInserterIndex, setActiveInserterIndex] = React.useState<{ cardId: string, index: number, x: number, y: number } | null>(null);
  
  // Sidebar tab & tag states
  const [activeSidebarTab, setActiveSidebarTab] = React.useState<"cards" | "tags" | "snippets">("cards");
  const [selectedTagFilter, setSelectedTagFilter] = React.useState<string | null>(null);
  const [flashingCardId, setFlashingCardId] = React.useState<string | null>(null);

  const lastSelectionRef = React.useRef<{ text: string; cardId: string } | null>(null);

  React.useEffect(() => {
    const closeMenu = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target && target.closest && target.closest(".context-menu-container")) {
        return;
      }
      setContextMenu(null);
      setSlashMenu(null);
    };
    
    const handleSelection = () => {
      setTimeout(() => {
        const activeEl = document.activeElement;
        if (activeEl && (activeEl.tagName === "TEXTAREA" || activeEl.tagName === "INPUT")) {
          const inputEl = activeEl as HTMLInputElement | HTMLTextAreaElement;
          const start = inputEl.selectionStart ?? 0;
          const end = inputEl.selectionEnd ?? 0;
          if (start !== end) {
            const blockInputIdMatch = inputEl.id.match(/^block-input-(.*)$/);
            const text = inputEl.value.substring(start, end);

            if (text && blockInputIdMatch) {
              const rect = inputEl.getBoundingClientRect();

              // We approximate the position of the popup based on the input rect
              setFormatMenu({
                x: rect.left + rect.width / 2,
                y: rect.top - 40, // above the input
                text,
                blockId: blockInputIdMatch[1],
                index: 0, // we will derive index at apply time or we don't strictly need it if we mutate value directly
                inputEl
              });

              const cardEl = inputEl.closest("[data-node-id]");
              const cardId = cardEl?.getAttribute("data-node-id") || "";
              lastSelectionRef.current = { text: text.trim(), cardId };
              return;
            } else if (text) {
              const cardEl = inputEl.closest("[data-node-id]");
              const cardId = cardEl?.getAttribute("data-node-id") || "";
              lastSelectionRef.current = { text: text.trim(), cardId };
            }
          }
        }

        setFormatMenu(null);

        const sel = window.getSelection();
        const selText = sel?.toString().trim();
        if (selText) {
          const cardEl = sel?.anchorNode?.parentElement?.closest("[data-node-id]");
          const cardId = cardEl?.getAttribute("data-node-id") || "";
          lastSelectionRef.current = { text: selText, cardId };
        }
      }, 10);
    };

    window.addEventListener("click", closeMenu);
    document.addEventListener("selectionchange", handleSelection);
    return () => {
      window.removeEventListener("click", closeMenu);
      document.removeEventListener("selectionchange", handleSelection);
    };
  }, []);

  // Parse nodes & edges
  const rawCanvasData = (state.values["workspace.canvasData"] as string) || '{"nodes":[],"edges":[]}';
  let canvasData: { nodes: any[]; edges: any[]; snippets?: any[] } = { nodes: [], edges: [], snippets: [] };
  try {
    canvasData = JSON.parse(rawCanvasData);
    if (!Array.isArray(canvasData.nodes)) canvasData.nodes = [];
    if (!Array.isArray(canvasData.edges)) canvasData.edges = [];
    if (!Array.isArray(canvasData.snippets)) canvasData.snippets = [];
  } catch (e) {
    // Keep defaults
  }

  // Tags helper
  const updateCardTags = (cardId: string, tags: string[]) => {
    const nodes = canvasData.nodes.map((n) => {
      if (n.id === cardId) {
        return { ...n, tags };
      }
      return n;
    });
    const updatedData = { ...canvasData, nodes };
    dispatch({
      type: "controls.setValue",
      target: "workspace.canvasData",
      value: JSON.stringify(updatedData, null, 2),
      history: "record",
    });
  };

  // All existing tags from the canvas for suggestions
  const allExistingTags = React.useMemo(() => {
    const tagSet = new Set<string>();
    canvasData.nodes.forEach((n) => {
      (n.tags || []).forEach((t: string) => tagSet.add(t));
    });
    return Array.from(tagSet);
  }, [canvasData.nodes]);


  const applyFormat = (el: HTMLInputElement | HTMLTextAreaElement, markdownMarker: string) => {
    const start = el.selectionStart || 0;
    const end = el.selectionEnd || 0;
    if (start === end) return;

    const val = el.value;
    const selectedText = val.substring(start, end);
    const before = val.substring(0, start);
    const after = val.substring(end);

    // Check if it's already wrapped, if so unwrap
    const markerLen = markdownMarker.length;
    let newVal = "";
    let newStart = start;
    let newEnd = end;

    if (before.endsWith(markdownMarker) && after.startsWith(markdownMarker)) {
      newVal = before.slice(0, -markerLen) + selectedText + after.slice(markerLen);
      newStart -= markerLen;
      newEnd -= markerLen;
    } else {
      newVal = before + markdownMarker + selectedText + markdownMarker + after;
      newStart += markerLen;
      newEnd += markerLen; // only shift by the opening marker's length
    }

    // Trigger React's onChange using a native event setter
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set ||
                                   Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")?.set;
    nativeInputValueSetter?.call(el, newVal);
    el.dispatchEvent(new Event('input', { bubbles: true }));

    // Restore selection
    setTimeout(() => {
      el.focus();
      el.setSelectionRange(newStart, newEnd);
    }, 10);

    setFormatMenu(null);
  };


  const handleOllamaGenerate = async (actionType: "rewrite" | "prompt", card: any) => {
    if (isGenerating) return;
    setIsGenerating(true);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    const existingTagsHint = allExistingTags.length > 0
      ? `\n\nEtiquetas existentes en el proyecto (puedes reutilizar algunas o crear nuevas): ${allExistingTags.join(", ")}`
      : "";

    const structuredInstructions = `Responde usando EXACTAMENTE este formato de etiquetas (sin texto extra fuera de ellas):
[TITLE]Título corto y descriptivo[/TITLE]
[TAGS]etiqueta1, etiqueta2[/TAGS]
[CONTENT]
Contenido en formato Markdown (párrafos, listas con -, encabezados con ##, etc.).
[/CONTENT]`;

    // Load prompt instructions from the card type's file
    const cardTypeKey = (card.cardType || card.type || "general").toLowerCase();
    const promptInstructions = await loadCardTypePrompt(cardTypeKey);

    let finalPrompt = "";
    if (actionType === "rewrite") {
      const baseInstructions = promptInstructions.rewrite || "Mejora la redacción del siguiente texto.";
      finalPrompt = `${baseInstructions}

Tarjeta: "${card.title || 'Sin título'}" (tipo: ${card.cardType || card.type || 'general'})

Contenido actual:
${card.text || "(sin contenido)"}
${existingTagsHint}

${structuredInstructions}`;
    } else {
      const baseInstructions = promptInstructions.prompt || "Escribe contenido de worldbuilding según la consigna.";
      finalPrompt = `${baseInstructions}

Tarjeta: "${card.title || 'Sin título'}" (tipo: ${card.cardType || card.type || 'general'})
Consigna del usuario: ${aiPrompt}
${existingTagsHint}

${structuredInstructions}`;
    }

    const systemMsg = ollamaSystemPrompt.trim() ||
      "Eres un asistente experto en worldbuilding y narrativa literaria. Siempre respondes en español y usas formato Markdown en los textos.";

    const base = ollamaEndpoint.replace(/\/+$/, "");

    try {
      const response = await fetch(`${base}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: selectedAiModel,
          stream: true,
          options: { temperature: ollamaTemperature },
          messages: [
            { role: "system", content: systemMsg },
            { role: "user", content: finalPrompt },
          ],
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response body reader available");

      const decoder = new TextDecoder();
      let done = false;
      let rawResult = "";

      while (!done) {
        const { value, done: doneReading } = await reader.read();
        done = doneReading;
        if (value) {
          const chunk = decoder.decode(value, { stream: !done });
          const lines = chunk.split("\n").filter(Boolean);
          for (const line of lines) {
            try {
              const parsed = JSON.parse(line);
              const token = parsed?.message?.content ?? parsed?.response ?? "";
              rawResult += token;

              // Live preview: try to extract content inside [CONTENT] tags for display
              let previewText = rawResult;
              const contentMatch = rawResult.match(/\[CONTENT\]([\s\S]*?)(?:\[\/CONTENT\]|$)/);
              if (contentMatch) {
                previewText = contentMatch[1].trim();
              } else if (rawResult.includes("[CONTENT]")) {
                previewText = rawResult.split("[CONTENT]")[1].trim();
              } else if (rawResult.includes("[/TITLE]") || rawResult.includes("[/TAGS]")) {
                previewText = "Generando contenido...";
              }

              // Live preview: stream into card text while generating
              const updatedNodes = canvasData.nodes.map((n) =>
                n.id === card.id ? { ...n, text: previewText } : n
              );
              dispatch({
                type: "controls.setValue",
                target: "workspace.canvasData",
                value: JSON.stringify({ ...canvasData, nodes: updatedNodes }, null, 2),
                history: "skip",
              });
            } catch (e) {}
          }
        }
      }

      // Parse structured format from the LLM response
      let parsedTitle: string | null = null;
      let parsedText: string | null = null;
      let parsedTags: string[] | null = null;

      const titleMatch = rawResult.match(/\[TITLE\]([\s\S]*?)\[\/TITLE\]/i);
      if (titleMatch && titleMatch[1].trim()) parsedTitle = titleMatch[1].trim();

      const tagsMatch = rawResult.match(/\[TAGS\]([\s\S]*?)\[\/TAGS\]/i);
      if (tagsMatch && tagsMatch[1].trim()) {
        parsedTags = tagsMatch[1].split(",").map(t => t.trim()).filter(Boolean);
      }

      const contentMatch = rawResult.match(/\[CONTENT\]([\s\S]*?)\[\/CONTENT\]/i);
      if (contentMatch && contentMatch[1].trim()) {
        parsedText = contentMatch[1].trim();
      } else {
        // Fallback: if no tags found, just use the raw text
        if (!titleMatch && !tagsMatch && !contentMatch) {
          parsedText = rawResult.trim();
        } else {
          // If we found some tags but no closing CONTENT tag, try to get everything after [CONTENT]
          const openContentMatch = rawResult.match(/\[CONTENT\]([\s\S]*)$/i);
          if (openContentMatch && openContentMatch[1].trim()) {
            parsedText = openContentMatch[1].trim();
          }
        }
      }

      // Build updated node with everything the AI provided
      const updatedCard = {
        ...card,
        ...(parsedTitle ? { title: parsedTitle } : {}),
        ...(parsedText ? { text: parsedText } : { text: rawResult.trim() }),
        ...(parsedTags ? { tags: parsedTags } : {}),
      };

      const finalNodes = canvasData.nodes.map((n) => n.id === card.id ? updatedCard : n);
      const finalData = JSON.stringify({ ...canvasData, nodes: finalNodes }, null, 2);

      dispatch({ type: "controls.setValue", target: "workspace.canvasData", value: finalData, history: "record" });

      // Sync sidebar controls if this is the selected card
      if (card.id === selectedCardId) {
        if (parsedTitle) dispatch({ type: "controls.setValue", target: "workspace.selectedCardTitle", value: parsedTitle, history: "skip" });
        if (parsedText) dispatch({ type: "controls.setValue", target: "workspace.selectedCardText", value: parsedText, history: "skip" });
      }

    } catch (err: any) {
      if (err.name === "AbortError") {
        // Cancelled by user, no error needed
      } else {
        console.error("Ollama connection failed:", err);
        alert(`Ollama connection failed. Make sure Ollama is running and the model '${selectedAiModel}' is installed.`);
      }
    } finally {
      setIsGenerating(false);
      abortControllerRef.current = null;
      setAiCardId(null);
      setAiPrompt("");
    }
  };

  const analyzeStoryWithOllama = React.useCallback(async (storyText: string) => {
    if (!storyText.trim()) return;

    setStoryAnalyzerIsAnalyzing(true);
    const controller = new AbortController();
    storyAnalyzerAbortControllerRef.current = controller;

    const base = ollamaEndpoint.replace(/\/+$/, "");

    const prompt = `Analiza la siguiente historia y extrae las entidades clave (personajes, lugares, facciones, objetos, etc.) y sus relaciones.

Devuelve EXCLUSIVAMENTE un objeto JSON válido con la siguiente estructura, sin texto adicional antes ni después, y sin bloques de código (no uses \`\`\`json).

Estructura requerida:
{
  "nodes": [
    {
      "id": "node_1",
      "title": "Nombre de la entidad",
      "cardType": "character", // opciones: character, location, faction, magic_spell, general
      "text": "# Nombre\\n\\nBreve descripción de la entidad.",
      "color": "#70b0fa"
    }
  ],
  "edges": [
    {
      "id": "edge_1",
      "fromNode": "node_1",
      "toNode": "node_2",
      "label": "Relación (ej. Aliado de)",
      "relationshipType": "solid", // opciones: solid, dashed, dotted
      "color": "gray" // opciones: gray, green, red, purple, blue
    }
  ]
}

Historia:
"""
${storyText}
"""
`;

    const systemMsg = ollamaSystemPrompt.trim() ||
      "Eres un experto en extraer entidades de worldbuilding y generar JSON estructurado.";

    try {
      const response = await fetch(`${base}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: selectedAiModel,
          stream: false,
          options: { temperature: ollamaTemperature },
          messages: [
            { role: "system", content: systemMsg },
            { role: "user", content: prompt },
          ],
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}`);
      }

      const data = await response.json();
      let rawContent = data.message?.content || data.response || "";

      // Clean up potential markdown wrappers
      rawContent = rawContent.replace(/```json/g, "").replace(/```/g, "").trim();

      try {
        const parsedData = JSON.parse(rawContent);

        if (parsedData.nodes && Array.isArray(parsedData.nodes)) {
          // Calculate positions to spread them out
          const newNodes = parsedData.nodes.map((n: any, i: number) => ({
            ...n,
            id: `ai_node_${Date.now()}_${i}`,
            originalId: n.id, // Keep to map edges
            x: (width / 2) + (Math.cos(i) * 300) - 160,
            y: (height / 2) + (Math.sin(i) * 300) - 100,
            width: 320,
            height: 200,
            type: "text",
            cardType: n.cardType || "general",
            color: n.color || "#70b0fa"
          }));

          const newEdges = (parsedData.edges || []).map((e: any, i: number) => {
            const fromNode = newNodes.find((n: any) => n.originalId === e.fromNode);
            const toNode = newNodes.find((n: any) => n.originalId === e.toNode);
            if (fromNode && toNode) {
              return {
                id: `ai_edge_${Date.now()}_${i}`,
                fromNode: fromNode.id,
                toNode: toNode.id,
                label: e.label || "",
                relationshipType: e.relationshipType || "solid",
                color: e.color || "gray",
                weight: 2
              };
            }
            return null;
          }).filter(Boolean);

          const finalNodes = [...canvasData.nodes, ...newNodes.map((n: any) => { delete n.originalId; return n; })];
          const finalEdges = [...canvasData.edges, ...newEdges];

          dispatch({
            type: "controls.setValue",
            target: "workspace.canvasData",
            value: JSON.stringify({ nodes: finalNodes, edges: finalEdges }, null, 2),
            history: "record"
          });

          setIsStoryAnalyzerOpen(false);
          setStoryAnalyzerText("");
        } else {
          alert("La respuesta de la IA no incluyó nodos válidos.");
        }

      } catch (parseErr) {
        console.error("Failed to parse AI JSON response", rawContent, parseErr);
        alert("La IA devolvió un formato inválido. Intenta de nuevo.");
      }

    } catch (err: any) {
      if (err.name !== "AbortError") {
        console.error("Story Analysis failed:", err);
        alert(`Ollama connection failed: ${err.message}`);
      }
    } finally {
      setStoryAnalyzerIsAnalyzing(false);
      storyAnalyzerAbortControllerRef.current = null;
    }

  }, [ollamaEndpoint, ollamaTemperature, ollamaSystemPrompt, selectedAiModel, canvasData, dispatch, width, height]);

  const cancelOllamaGenerate = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  };

  // Delete connection helper
  const deleteConnection = (edgeId: string) => {
    const edges = canvasData.edges.filter((edge) => {
      const eId = edge.id || `edge_${edge.fromNode}_${edge.toNode}`;
      return eId !== edgeId;
    });
    const updatedData = { ...canvasData, edges };
    dispatch({
      type: "controls.setValue",
      target: "workspace.canvasData",
      value: JSON.stringify(updatedData, null, 2),
      history: "record",
    });
    if (selectedConnectionId === edgeId) {
      dispatch({
        type: "controls.setValue",
        target: "workspace.selectedConnectionId",
        value: "",
        history: "skip",
      });
    }
  };

  // Keyboard shortcut listener for deletion
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement;
      if (
        activeEl &&
        (activeEl.tagName === "INPUT" ||
          activeEl.tagName === "TEXTAREA" ||
          activeEl.getAttribute("contenteditable") === "true")
      ) {
        return;
      }

      if (e.key === "Delete" || e.key === "Backspace") {
        if (selectedCardId) {
          const card = canvasData.nodes.find((n) => n.id === selectedCardId);
          if (card) {
            e.preventDefault();
            setDeleteConfirmationCard(card);
          }
        } else if (selectedConnectionId) {
          e.preventDefault();
          deleteConnection(selectedConnectionId);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedCardId, selectedConnectionId, canvasData.nodes, canvasData.edges]);

  // Resize Handlers
  const startResizeNode = (e: React.PointerEvent, card: any) => {
    e.stopPropagation();
    e.preventDefault();
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch (err) {}

    const isGroup = card.cardType === "group";
    // If the card is auto-sized, read actual rendered height from the DOM
    let origHeight = card.height || (isGroup ? 400 : 200);
    if (!card.isResized && !isGroup) {
      const nodeEl = document.querySelector(`[data-node-id="${card.id}"]`);
      if (nodeEl) {
        origHeight = (nodeEl as HTMLElement).getBoundingClientRect().height / scale;
      }
    }
    setResizeNode({
      id: card.id,
      startX: e.clientX,
      startY: e.clientY,
      origWidth: card.width || (isGroup ? 600 : 320),
      origHeight,
    });
  };

  const onResizeNode = (e: React.PointerEvent) => {
    if (!resizeNode) return;
    e.stopPropagation();

    const dx = (e.clientX - resizeNode.startX) / scale;
    const dy = (e.clientY - resizeNode.startY) / scale;

    let targetWidth = Math.max(150, resizeNode.origWidth + dx);
    let targetHeight = Math.max(100, resizeNode.origHeight + dy);

    if (snapToGrid) {
      targetWidth = Math.round(targetWidth / gridSize) * gridSize;
      targetHeight = Math.round(targetHeight / gridSize) * gridSize;
    }

    const nodes = canvasData.nodes.map((n) => {
      if (n.id === resizeNode.id) {
        return { ...n, width: targetWidth, height: targetHeight, isResized: true };
      }
      return n;
    });

    const updatedData = { ...canvasData, nodes };
    dispatch({
      type: "controls.setValue",
      target: "workspace.canvasData",
      value: JSON.stringify(updatedData, null, 2),
      history: "skip",
    });
  };

  const endResizeNode = (e: React.PointerEvent) => {
    if (!resizeNode) return;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch (err) {}
    setResizeNode(null);

    dispatch({
      type: "controls.setValue",
      target: "workspace.canvasData",
      value: JSON.stringify(canvasData, null, 2),
      history: "record",
    });
  };


  // Context menu operations
  const createCardAtPos = (x: number, y: number, cardType: string) => {
    const snappedX = snapToGrid ? Math.round(x / gridSize) * gridSize : x;
    const snappedY = snapToGrid ? Math.round(y / gridSize) * gridSize : y;

    const newId = `node_${Date.now()}`;
    const newCard = {
      id: newId,
      type: "text",
      x: snappedX - 160,
      y: snappedY - 100,
      width: 320,
      height: 200,
      color: getCategoryColor(cardType),
      title: `New ${cardType.charAt(0).toUpperCase() + cardType.slice(1)}`,
      cardType: cardType,
      text: `# Title\n\nWrite some description...`,
    };

    const updatedData = {
      ...canvasData,
      nodes: [...canvasData.nodes, newCard],
    };

    dispatch({
      type: "controls.setValue",
      target: "workspace.canvasData",
      value: JSON.stringify(updatedData, null, 2),
      history: "record",
    });

    selectCard(newCard);
  };

  const duplicateCard = (card: any) => {
    const newCard = {
      ...card,
      id: `node_${Date.now()}`,
      title: `${card.title || "New Card"} (Copy)`,
      x: card.x + 40,
      y: card.y + 40,
    };

    const updatedData = {
      ...canvasData,
      nodes: [...canvasData.nodes, newCard],
    };

    dispatch({
      type: "controls.setValue",
      target: "workspace.canvasData",
      value: JSON.stringify(updatedData, null, 2),
      history: "record",
    });

    selectCard(newCard);
  };

  // Deselect on canvas click (unless dragging)
  const handleCanvasClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      deselectAll();
    }
  };

  // Double click to add a card
  const handleCanvasDoubleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;
    e.preventDefault();

    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / scale - 10000;
    const y = (e.clientY - rect.top) / scale - 10000;

    const snappedX = snapToGrid ? Math.round(x / gridSize) * gridSize : x;
    const snappedY = snapToGrid ? Math.round(y / gridSize) * gridSize : y;

    const newId = `node_${Date.now()}`;
    const newCard = {
      id: newId,
      type: "text",
      x: snappedX - 160, // center card width (320px)
      y: snappedY - 100, // center card height (200px)
      width: 320,
      height: 200,
      color: "#70b0fa",
      title: "New Card",
      cardType: "character",
      text: "# Title\n\nWrite some description...",
    };

    const updatedData = {
      ...canvasData,
      nodes: [...canvasData.nodes, newCard],
    };

    dispatch({
      type: "controls.setValue",
      target: "workspace.canvasData",
      value: JSON.stringify(updatedData, null, 2),
    });

    // Select the new card immediately
    selectCard(newCard);
  };

  // Selection trigger
  const selectCard = (card: any) => {
    dispatch({
      type: "controls.setValue",
      target: "workspace.selectedCardId",
      value: card.id,
      history: "skip",
    });
    dispatch({
      type: "controls.setValue",
      target: "workspace.selectedCardTitle",
      value: card.title || "New Card",
      history: "skip",
    });
    dispatch({
      type: "controls.setValue",
      target: "workspace.selectedCardType",
      value: card.cardType || "character",
      history: "skip",
    });
    dispatch({
      type: "controls.setValue",
      target: "workspace.selectedCardColor",
      value: { hex: card.color || "#70b0fa" },
      history: "skip",
    });
    dispatch({
      type: "controls.setValue",
      target: "workspace.selectedCardText",
      value: card.text || "",
      history: "skip",
    });
    dispatch({
      type: "controls.setValue",
      target: "workspace.selectedCardCover",
      value: card.coverImage || "",
      history: "skip",
    });
    dispatch({
      type: "controls.setValue",
      target: "workspace.selectedCardIcon",
      value: card.icon || "",
      history: "skip",
    });
    dispatch({
      type: "controls.setValue",
      target: "workspace.selectedConnectionId",
      value: "",
      history: "skip",
    });
  };

  const selectConnection = (edge: any) => {
    const edgeId = edge.id || `edge_${edge.fromNode}_${edge.toNode}`;
    dispatch({
      type: "controls.setValue",
      target: "workspace.selectedCardId",
      value: "",
      history: "skip",
    });
    dispatch({
      type: "controls.setValue",
      target: "workspace.selectedConnectionId",
      value: edgeId,
      history: "skip",
    });
    dispatch({
      type: "controls.setValue",
      target: "workspace.selectedConnectionLabel",
      value: edge.label || "allied with",
      history: "skip",
    });
    dispatch({
      type: "controls.setValue",
      target: "workspace.selectedConnectionStyle",
      value: edge.relationshipType || "solid",
      history: "skip",
    });
    dispatch({
      type: "controls.setValue",
      target: "workspace.selectedConnectionColor",
      value: edge.color || "gray",
      history: "skip",
    });
    dispatch({
      type: "controls.setValue",
      target: "workspace.selectedConnectionWeight",
      value: edge.weight || 2,
      history: "skip",
    });
  };

  const deselectAll = () => {
    dispatch({
      type: "controls.setValue",
      target: "workspace.selectedCardId",
      value: "",
      history: "skip",
    });
    dispatch({
      type: "controls.setValue",
      target: "workspace.selectedConnectionId",
      value: "",
      history: "skip",
    });
  };

  // Node Drag Handlers
  const startDragNode = (e: React.PointerEvent, card: any) => {
    e.stopPropagation();
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);

    setDragNode({
      id: card.id,
      startX: e.clientX,
      startY: e.clientY,
      origX: card.x,
      origY: card.y,
    });
    selectCard(card);
  };

  const onDragNode = (e: React.PointerEvent) => {
    if (!dragNode) return;
    e.stopPropagation();

    const dx = (e.clientX - dragNode.startX) / scale;
    const dy = (e.clientY - dragNode.startY) / scale;

    let targetX = dragNode.origX + dx;
    let targetY = dragNode.origY + dy;

    if (snapToGrid) {
      targetX = Math.round(targetX / gridSize) * gridSize;
      targetY = Math.round(targetY / gridSize) * gridSize;
    }

    // Update in-memory data
    const nodes = canvasData.nodes.map((n) => {
      if (n.id === dragNode.id) {
        return { ...n, x: targetX, y: targetY };
      }
      return n;
    });

    const updatedData = { ...canvasData, nodes };
    dispatch({
      type: "controls.setValue",
      target: "workspace.canvasData",
      value: JSON.stringify(updatedData, null, 2),
      history: "skip", // skip intermediate drag events in history
    });
  };

  const endDragNode = (e: React.PointerEvent) => {
    if (!dragNode) return;
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    setDragNode(null);

    // Save final state into history
    dispatch({
      type: "controls.setValue",
      target: "workspace.canvasData",
      value: JSON.stringify(canvasData, null, 2),
      history: "record",
    });
  };

  // Connection Drawing Handlers
  const startDragConnection = (e: React.PointerEvent, card: any, side: string) => {
    e.stopPropagation();
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);

    // Compute coordinate relative to the canvas workspace
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const cx = (e.clientX - rect.left) / scale;
    const cy = (e.clientY - rect.top) / scale;

    setDragConnection({
      fromNodeId: card.id,
      fromSide: side,
      startX: cx,
      startY: cy,
      currentX: cx,
      currentY: cy,
    });
  };

  const onDragConnection = (e: React.PointerEvent) => {
    if (!dragConnection) return;
    e.stopPropagation();

    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const cx = (e.clientX - rect.left) / scale;
    const cy = (e.clientY - rect.top) / scale;

    setDragConnection({
      ...dragConnection,
      currentX: cx,
      currentY: cy,
    });
  };

  const endDragConnection = (e: React.PointerEvent) => {
    if (!dragConnection) return;
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);

    // Find if released over a node's port/handle
    const elementAtPointer = document.elementFromPoint(e.clientX, e.clientY);
    const targetNodeElement = elementAtPointer?.closest("[data-node-id]");
    const targetNodeId = targetNodeElement?.getAttribute("data-node-id");

    if (targetNodeId && targetNodeId !== dragConnection.fromNodeId) {
      // Find connecting side
      const targetSide = elementAtPointer?.getAttribute("data-port-side") || "left";

      const newEdge = {
        id: `edge_${Date.now()}`,
        fromNode: dragConnection.fromNodeId,
        fromSide: dragConnection.fromSide,
        fromEnd: "none",
        toNode: targetNodeId,
        toSide: targetSide,
        toEnd: "arrow",
        color: "gray",
        label: "allied with",
      };

      const updatedData = {
        ...canvasData,
        edges: [...canvasData.edges, newEdge],
      };

      dispatch({
        type: "controls.setValue",
        target: "workspace.canvasData",
        value: JSON.stringify(updatedData, null, 2),
      });
    } else if (!targetNodeId) {
      // Released over the empty canvas! Automatically create card + connection
      const newCardId = `node_${Date.now()}`;
      // Calculate coordinates relative to canvas center (-10000)
      const rawX = dragConnection.currentX - 10000;
      const rawY = dragConnection.currentY - 10000;
      const snappedX = snapToGrid ? Math.round(rawX / gridSize) * gridSize : rawX;
      const snappedY = snapToGrid ? Math.round(rawY / gridSize) * gridSize : rawY;

      const newCard = {
        id: newCardId,
        type: "text",
        x: snappedX - 160,
        y: snappedY - 100,
        width: 320,
        height: 200,
        color: getCategoryColor("general"),
        title: "New Card",
        cardType: "general",
        text: `# New Card\n\nConnected from previous card.`,
      };

      const newEdge = {
        id: `edge_${Date.now()}`,
        fromNode: dragConnection.fromNodeId,
        fromSide: dragConnection.fromSide,
        fromEnd: "none",
        toNode: newCardId,
        toSide: "left",
        toEnd: "arrow",
        color: "gray",
        label: "allied with",
      };

      const updatedData = {
        ...canvasData,
        nodes: [...canvasData.nodes, newCard],
        edges: [...canvasData.edges, newEdge],
      };

      dispatch({
        type: "controls.setValue",
        target: "workspace.canvasData",
        value: JSON.stringify(updatedData, null, 2),
        history: "record",
      });

      // Select new card
      selectCard(newCard);
    }

    setDragConnection(null);
  };

  // Commands callback from panelActions
  React.useEffect(() => {
    const handleCommand = (e: Event) => {
      const customEvent = e as CustomEvent;
      const cmd = customEvent.detail?.command;
      if (!cmd) return;

      if (cmd === "export.png") {
        const includeBackground = !!state.values["export.includeBackground"];
        const format = state.values["export.image.format"] as string;
        createToolcraftPngExportCanvas({
          resolution: state.values["export.image.resolution"] as any,
          includeBackground: includeBackground,
          render: () => { /* no-op or default */ },
          state: state
        });
      } else if (cmd === "export.project") {
        const dataStr = JSON.stringify(canvasData, null, 2);
        const blob = new Blob([dataStr], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `world-project-${new Date().toISOString().slice(0,10)}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } else if (cmd === "import.project") {
        const confirmImport = window.confirm("¿Seguro que quieres importar un proyecto? Asegúrate de haber guardado tu progreso actual, ya que será reemplazado.");
        if (confirmImport) {
          const input = document.createElement("input");
          input.type = "file";
          input.accept = "application/json,.json,.txt";
          input.onchange = (ev) => {
            const file = (ev.target as HTMLInputElement).files?.[0];
            if (file) {
              const reader = new FileReader();
              reader.onload = (readEv) => {
                const content = readEv.target?.result as string;
                if (content) {
                  try {
                    const parsed = JSON.parse(content);
                    if (parsed.nodes && Array.isArray(parsed.nodes) && parsed.edges && Array.isArray(parsed.edges)) {
                      dispatch({
                        type: "controls.setValue",
                        target: "workspace.canvasData",
                        value: JSON.stringify(parsed, null, 2),
                      });
                      dispatch({
                        type: "controls.setValue",
                        target: "workspace.selectedCardId",
                        value: "",
                      });
                    } else {
                      alert("El archivo no tiene el formato correcto (faltan nodes o edges).");
                    }
                  } catch (e) {
                    alert("Error al analizar el archivo: " + String(e));
                  }
                }
              };
              reader.readAsText(file);
            }
          };
          input.click();
        }
      } else if (cmd === "workspace.analyzeStory") {
        setIsStoryAnalyzerOpen(true);
      } else if (cmd === "workspace.addCard") {
        // Add card at center of canvas view
        const newCard = {
          id: `node_${Date.now()}`,
          type: "text",
          x: width / 2 - 160,
          y: height / 2 - 100,
          width: 320,
          height: 200,
          color: "#70b0fa",
          title: "New Card",
          cardType: "character",
          text: "# Title\n\nWrite some description...",
        };
        const updatedData = {
          ...canvasData,
          nodes: [...canvasData.nodes, newCard],
        };
        dispatch({
          type: "controls.setValue",
          target: "workspace.canvasData",
          value: JSON.stringify(updatedData, null, 2),
        });
        selectCard(newCard);
      } else if (cmd === "workspace.deleteCard") {
        if (!selectedCardId) return;
        const card = canvasData.nodes.find((n) => n.id === selectedCardId);
        if (card) {
          setDeleteConfirmationCard(card);
        }
      } else if (cmd === "workspace.clearBoard") {
        dispatch({
          type: "controls.setValue",
          target: "workspace.canvasData",
          value: '{\n  "nodes": [],\n  "edges": []\n}',
        });
        dispatch({
          type: "controls.setValue",
          target: "workspace.selectedCardId",
          value: "",
        });
      }
    };

    window.addEventListener("toolcraft-panel-action", handleCommand);
    return () => {
      window.removeEventListener("toolcraft-panel-action", handleCommand);
    };
  }, [canvasData, width, height, selectedCardId]);

  const lastSelectedCardIdRef = React.useRef(selectedCardId);
  const lastSelectedConnectionIdRef = React.useRef(selectedConnectionId);

  // Sync edited card state back to nodes list
  React.useEffect(() => {
    if (lastSelectedCardIdRef.current !== selectedCardId) {
      lastSelectedCardIdRef.current = selectedCardId;
      return;
    }

    if (!selectedCardId) return;
    const nodes = [...canvasData.nodes];
    const nodeIndex = nodes.findIndex((n) => n.id === selectedCardId);
    if (nodeIndex === -1) return;

    const node = nodes[nodeIndex];
    let changed = false;

    if (node.title !== cardTitle) {
      node.title = cardTitle;
      changed = true;
    }
    if (node.cardType !== cardType) {
      node.cardType = cardType;
      changed = true;
    }
    if (node.color !== cardColor) {
      node.color = cardColor;
      changed = true;
    }
    if (node.text !== cardText) {
      node.text = cardText;
      changed = true;
    }
    if (node.coverImage !== cardCover) {
      node.coverImage = cardCover;
      changed = true;
    }
    if (node.icon !== cardIcon) {
      node.icon = cardIcon;
      changed = true;
    }

    if (changed) {
      const updatedData = { ...canvasData, nodes };
      dispatch({
        type: "controls.setValue",
        target: "workspace.canvasData",
        value: JSON.stringify(updatedData, null, 2),
        history: "merge",
      });
    }
  }, [cardTitle, cardType, cardColor, cardText, cardCover, cardIcon, selectedCardId]);

  // Sync edited connection state back to edges list
  React.useEffect(() => {
    if (lastSelectedConnectionIdRef.current !== selectedConnectionId) {
      lastSelectedConnectionIdRef.current = selectedConnectionId;
      return;
    }

    if (!selectedConnectionId) return;
    const edges = [...canvasData.edges];
    const edgeIndex = edges.findIndex((e) => {
      const eId = e.id || `edge_${e.fromNode}_${e.toNode}`;
      return eId === selectedConnectionId;
    });
    if (edgeIndex === -1) return;

    const edge = edges[edgeIndex];
    let changed = false;

    if (edge.label !== selectedConnectionLabel) {
      edge.label = selectedConnectionLabel;
      changed = true;
    }
    if (edge.relationshipType !== selectedConnectionStyle) {
      edge.relationshipType = selectedConnectionStyle;
      changed = true;
    }
    if (edge.color !== selectedConnectionColor) {
      edge.color = selectedConnectionColor;
      changed = true;
    }
    if (edge.weight !== selectedConnectionWeight) {
      edge.weight = selectedConnectionWeight;
      changed = true;
    }

    if (changed) {
      const updatedData = { ...canvasData, edges };
      dispatch({
        type: "controls.setValue",
        target: "workspace.canvasData",
        value: JSON.stringify(updatedData, null, 2),
        history: "merge",
      });
    }
  }, [selectedConnectionLabel, selectedConnectionStyle, selectedConnectionColor, selectedConnectionWeight, selectedConnectionId]);

  // Render variables
  const showDetailedZoom = scale >= 0.7;
  const showMediumZoom = scale >= 0.3 && scale < 0.7;
  const showAbstractZoom = scale < 0.3;

  const themeStyles = {
    dark: {
      bg: fallbackBg,
      border: "#262626",
      sidebarBg: "#171717",
      cardBg: "#1c1c1c",
      text: "#f5f5f5",
      textMuted: "#a3a3a3",
      gridColor: "#262626",
    },
    light: {
      bg: "#faf6ee",
      border: "#dcd4c4",
      sidebarBg: "#f5eee0",
      cardBg: "#ffffff",
      text: "#1c1917",
      textMuted: "#57534e",
      gridColor: "#d5cbb8",
    },
    slate: {
      bg: "#0f172a",
      border: "#1e293b",
      sidebarBg: "#0b1329",
      cardBg: "#1e293b",
      text: "#f8fafc",
      textMuted: "#94a3b8",
      gridColor: "#334155",
    }
  }[theme as "dark" | "light" | "slate"] || {
    bg: fallbackBg,
    border: "#262626",
    sidebarBg: "#171717",
    cardBg: "#1c1c1c",
    text: "#f5f5f5",
    textMuted: "#a3a3a3",
    gridColor: "#262626",
  };

  const previewBg = shouldIncludeToolcraftPreviewBackground({ state });
  const bgColor = previewBg ? themeStyles.bg : "transparent";

  return (
    <div
      ref={containerRef}
      className="absolute select-none"
      style={{
        left: -10000,
        top: -10000,
        width: 20000,
        height: 20000,
        backgroundImage: previewBg ? `radial-gradient(circle, ${themeStyles.gridColor} 1px, transparent 1px)` : "none",
        backgroundSize: `${gridSize}px ${gridSize}px`,
        backgroundColor: bgColor,
      }}
      onClick={handleCanvasClick}
      onDoubleClick={handleCanvasDoubleClick}
      onMouseDown={(e) => {
        if (e.button === 1) {
          e.preventDefault(); // Prevents autoscroll in browser
        }
      }}
      onPointerDown={(e) => {
        if (e.button === 1) {
          e.preventDefault();
          e.stopPropagation();
          e.currentTarget.setPointerCapture(e.pointerId);
          const currentOffset = state.canvas.offset || { x: 0, y: 0 };
          middlePanRef.current = {
            startX: e.clientX,
            startY: e.clientY,
            origOffsetX: currentOffset.x,
            origOffsetY: currentOffset.y,
          };
        }
      }}
      onPointerMove={(e) => {
        if (middlePanRef.current) {
          e.stopPropagation();
          const dx = e.clientX - middlePanRef.current.startX;
          const dy = e.clientY - middlePanRef.current.startY;
          dispatch({
            type: "canvas.setOffset",
            offset: {
              x: middlePanRef.current.origOffsetX + dx,
              y: middlePanRef.current.origOffsetY + dy,
            },
          });
        }
      }}
      onPointerUp={(e) => {
        if (middlePanRef.current) {
          e.stopPropagation();
          e.currentTarget.releasePointerCapture(e.pointerId);
          middlePanRef.current = null;
        }
      }}
      onPointerCancel={(e) => {
        if (middlePanRef.current) {
          middlePanRef.current = null;
        }
      }}
      onWheel={(e) => {
        e.preventDefault();
        
        const currentZoom = state.canvas.zoom;
        const currentOffset = state.canvas.offset || { x: 0, y: 0 };
        const currentScale = currentZoom / 100;
        
        // standard 10% zoom multiplier
        const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
        let newZoom = Math.round(currentZoom * zoomFactor);
        newZoom = Math.min(300, Math.max(10, newZoom));
        
        if (newZoom === currentZoom) return;
        
        const newScale = newZoom / 100;
        
        // Find container bounds to compute pointer relative coordinate
        if (!containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        
        // Absolute position of cursor relative to canvas zero coordinate
        const canvasX = (e.clientX - currentOffset.x) / currentScale;
        const canvasY = (e.clientY - currentOffset.y) / currentScale;
        
        const newOffsetX = e.clientX - canvasX * newScale;
        const newOffsetY = e.clientY - canvasY * newScale;
        
        dispatch({
          type: "canvas.setViewport",
          offset: { x: newOffsetX, y: newOffsetY },
          zoom: newZoom,
        });
      }}
      onContextMenu={(e) => {
        if (e.target !== e.currentTarget) return;
        e.preventDefault();
        const rect = e.currentTarget.getBoundingClientRect();
        const cx = (e.clientX - rect.left) / scale - 10000;
        const cy = (e.clientY - rect.top) / scale - 10000;
        setContextMenu({
          x: e.clientX,
          y: e.clientY,
          type: "canvas",
          target: { x: cx, y: cy },
        });
      }}
    >
      {/* Export Boundary Box */}
      <div
        className="absolute border-2 border-dashed border-neutral-600/40 pointer-events-none rounded"
        style={{
          left: 10000,
          top: 10000,
          width: width,
          height: height,
        }}
      >
        <div data-toolcraft-product-text="true" className="absolute -top-6 left-0 text-[10px] text-neutral-500 font-bold font-mono tracking-wider uppercase select-none">
          Export Frame Boundary ({width} x {height})
        </div>
      </div>

      {/* SVG Connections Layer */}
      <svg className="pointer-events-none absolute inset-0 z-0 size-full">
        <defs>
          <marker id="arrow-selected" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 1 L 10 5 L 0 9 z" fill="var(--link)" />
          </marker>
          <marker id="arrow-gray" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 1 L 10 5 L 0 9 z" fill={theme === "light" ? "#78716c" : "#737373"} />
          </marker>
          <marker id="arrow-green" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 1 L 10 5 L 0 9 z" fill="#10b981" />
          </marker>
          <marker id="arrow-red" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 1 L 10 5 L 0 9 z" fill="#ef4444" />
          </marker>
          <marker id="arrow-purple" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 1 L 10 5 L 0 9 z" fill="#8b5cf6" />
          </marker>
          <marker id="arrow-blue" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 1 L 10 5 L 0 9 z" fill="#3b82f6" />
          </marker>
        </defs>

        {/* Drawn edges */}
        {canvasData.edges.map((edge) => {
          const fromNode = canvasData.nodes.find((n) => n.id === edge.fromNode);
          const toNode = canvasData.nodes.find((n) => n.id === edge.toNode);

          if (!fromNode || !toNode) return null;

          const isFromGroup = fromNode.cardType === "group";
          const isToGroup = toNode.cardType === "group";

          const fromRect = {
            x: fromNode.x + 10000,
            y: fromNode.y + 10000,
            width: fromNode.width || (isFromGroup ? 600 : 320),
            height: fromNode.height || (isFromGroup ? 400 : 200),
          };
          const toRect = {
            x: toNode.x + 10000,
            y: toNode.y + 10000,
            width: toNode.width || (isToGroup ? 600 : 320),
            height: toNode.height || (isToGroup ? 400 : 200),
          };

          const connection = getClosestConnectionSide(fromRect, toRect);
          const path = getBezierPath(
            connection.from.x,
            connection.from.y,
            connection.from.side,
            connection.to.x,
            connection.to.y,
            connection.to.side
          );

          const edgeId = edge.id || `edge_${edge.fromNode}_${edge.toNode}`;
          const isEdgeSelected = edgeId === selectedConnectionId;

          return (
            <g key={edgeId}>
              {/* Click hitbox path */}
              <path
                d={path}
                fill="none"
                stroke="black"
                strokeOpacity="0"
                strokeWidth="20"
                style={{ pointerEvents: "auto", cursor: "pointer" }}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  selectConnection(edge);
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setContextMenu({
                    x: e.clientX,
                    y: e.clientY,
                    type: "edge",
                    target: edge,
                  });
                }}
              />
              {/* Visible path */}
              {(() => {
                const relType = edge.relationshipType || "solid";
                const colorAccent = edge.color || "gray";
                const weight = Number(edge.weight) || 2;

                // Color mapping
                let strokeColor = "color-mix(in oklab, var(--foreground) 30%, transparent)";
                if (isEdgeSelected) {
                  strokeColor = "var(--link)";
                } else {
                  if (colorAccent === "green") strokeColor = "#10b981";
                  else if (colorAccent === "red") strokeColor = "#ef4444";
                  else if (colorAccent === "purple") strokeColor = "#8b5cf6";
                  else if (colorAccent === "blue") strokeColor = "#3b82f6";
                  else if (colorAccent === "gray") strokeColor = theme === "light" ? "#78716c" : "#737373";
                }

                // Style stroke attributes
                const strokeWidth = isEdgeSelected ? weight + 1.5 : weight;
                let strokeDasharray: string | undefined = undefined;
                if (relType === "dashed") {
                  strokeDasharray = "6 4";
                } else if (relType === "dotted") {
                  strokeDasharray = "2 3";
                }

                // Arrow tip marker assignment
                let markerId = "arrow-gray";
                if (isEdgeSelected) {
                  markerId = "arrow-selected";
                } else {
                  markerId = `arrow-${colorAccent}`;
                }

                return (
                  <path
                    d={path}
                    fill="none"
                    stroke={strokeColor}
                    strokeWidth={strokeWidth}
                    strokeDasharray={strokeDasharray}
                    markerEnd={`url(#${markerId})`}
                    className="transition-all"
                  />
                );
              })()}
            </g>
          );
        })}

        {/* Active connection currently being dragged */}
        {dragConnection ? (
          <path
            d={getBezierPath(
              dragConnection.startX,
              dragConnection.startY,
              dragConnection.fromSide,
              dragConnection.currentX,
              dragConnection.currentY,
              "left"
            )}
            fill="none"
            stroke="var(--link)"
            strokeWidth="2.5"
            strokeDasharray="4 4"
          />
        ) : null}
      </svg>

      {/* Connection Labels Layer */}
      <div className="absolute inset-0 z-15 size-full pointer-events-none">
        {(showMediumZoom || showDetailedZoom) && canvasData.edges.map((edge) => {
          const fromNode = canvasData.nodes.find((n) => n.id === edge.fromNode);
          const toNode = canvasData.nodes.find((n) => n.id === edge.toNode);
          if (!fromNode || !toNode) return null;

          const isFromGroup = fromNode.cardType === "group";
          const isToGroup = toNode.cardType === "group";

          const fromRect = {
            x: fromNode.x + 10000,
            y: fromNode.y + 10000,
            width: fromNode.width || (isFromGroup ? 600 : 320),
            height: fromNode.height || (isFromGroup ? 400 : 200),
          };
          const toRect = {
            x: toNode.x + 10000,
            y: toNode.y + 10000,
            width: toNode.width || (isToGroup ? 600 : 320),
            height: toNode.height || (isToGroup ? 400 : 200),
          };
          const connection = getClosestConnectionSide(fromRect, toRect);

          const edgeId = edge.id || `edge_${edge.fromNode}_${edge.toNode}`;
          const isEdgeSelected = edgeId === selectedConnectionId;

          return (
            <div
              key={`label_${edgeId}`}
              className="absolute pointer-events-auto cursor-pointer select-none"
              style={{
                left: (connection.from.x + connection.to.x) / 2,
                top: (connection.from.y + connection.to.y) / 2,
                transform: "translate(-50%, -50%)",
              }}
              onPointerDown={(e) => {
                e.stopPropagation();
                selectConnection(edge);
              }}
            >
              <div className={`rounded px-1.5 py-0.5 text-center text-[10px] border shadow-sm whitespace-nowrap transition-all ${
                isEdgeSelected
                  ? "bg-neutral-800 text-neutral-100 border-[#70b0fa] shadow-[#70b0fa]/20 shadow-md scale-105"
                  : "bg-neutral-900/90 text-neutral-400 border-neutral-800 hover:border-neutral-700"
              }`}>
                {edge.label || "allied with"}
              </div>
            </div>
          );
        })}
      </div>

      {/* Cards Layer */}
      <div className="absolute inset-0 z-10 size-full pointer-events-none">
        {canvasData.nodes.map((card) => {
          const isSelected = card.id === selectedCardId;
          const isGroup = card.cardType === "group";
          const cardWidth = card.width || (isGroup ? 600 : 320);
          // For groups, always use explicit height. For regular cards, use auto unless manually resized.
          const isManuallyResized = isGroup || card.isResized;
          const cardHeight = isManuallyResized ? (card.height || (isGroup ? 400 : 200)) : undefined;

          // Compute style
          const cardAccent = card.color || getCategoryColor(card.cardType || "general");

          return (
            <div
              key={card.id}
              data-node-id={card.id}
              className={`absolute pointer-events-auto rounded-lg transition-all duration-300 flex flex-col ${
                isGroup
                  ? "border-2 border-dashed border-neutral-600/40 overflow-hidden"
                  : isManuallyResized ? "border shadow-xl overflow-hidden" : "border shadow-xl"
              } ${
                flashingCardId === card.id
                  ? "ring-4 ring-amber-500 shadow-2xl scale-105 z-30"
                  : isSelected
                  ? isGroup ? "ring-2 ring-link border-solid border-link" : "shadow-link/40 ring-1 ring-link"
                  : isGroup ? "hover:border-neutral-500/60" : "hover:shadow-black/60 shadow-black/40"
              } ${card.id === aiCardId && isGenerating ? "ai-generating" : ""}`}
              style={{
                left: card.x + 10000,
                top: card.y + 10000,
                width: cardWidth,
                ...(isManuallyResized
                  ? { height: cardHeight }
                  : { height: "auto", minHeight: 200, maxHeight: 600 }),
                backgroundColor: isGroup ? `${themeStyles.bg}60` : themeStyles.cardBg,
                borderColor: isSelected
                  ? "var(--link)"
                  : isGroup
                  ? "color-mix(in oklab, " + themeStyles.border + " 30%, transparent)"
                  : themeStyles.border,
                color: themeStyles.text,
                zIndex: isGroup ? 1 : 10,
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                let selText = "";
                if (lastSelectionRef.current && lastSelectionRef.current.cardId === card.id) {
                  selText = lastSelectionRef.current.text;
                }
                setContextMenu({
                  x: e.clientX,
                  y: e.clientY,
                  type: "node",
                  target: card,
                  selectedText: selText || undefined,
                });
              }}
            >
              {isGroup ? (
                // Group Node layout
                <div
                  className="size-full flex flex-col p-4 cursor-grab active:cursor-grabbing justify-between pointer-events-auto select-none"
                  onPointerDown={(e) => startDragNode(e, card)}
                  onPointerMove={onDragNode}
                  onPointerUp={endDragNode}
                >
                  <div className="flex items-center justify-between w-full gap-2">
                    {isSelected ? (
                      <input
                        type="text"
                        value={card.title || ""}
                        onChange={(e) => {
                          const nodes = canvasData.nodes.map(n => n.id === card.id ? { ...n, title: e.target.value } : n);
                          const updatedData = { ...canvasData, nodes };
                          dispatch({
                            type: "controls.setValue",
                            target: "workspace.canvasData",
                            value: JSON.stringify(updatedData, null, 2),
                            history: "skip",
                          });
                          dispatch({
                            type: "controls.setValue",
                            target: "workspace.selectedCardTitle",
                            value: e.target.value,
                            history: "skip",
                          });
                        }}
                        onBlur={() => {
                          dispatch({
                            type: "controls.setValue",
                            target: "workspace.canvasData",
                            value: JSON.stringify(canvasData, null, 2),
                            history: "record",
                          });
                        }}
                        onPointerDown={(e) => e.stopPropagation()}
                        style={{
                          fontSize: `${12 * globalFontScale}px`,
                          color: themeStyles.text,
                          borderColor: themeStyles.border,
                        }}
                        className="flex-1 bg-neutral-950/40 font-bold font-mono tracking-wide border rounded px-1.5 py-0.5 focus:outline-none focus:border-link"
                      />
                    ) : (
                      <span
                        style={{ fontSize: `${14 * globalFontScale}px`, color: themeStyles.textMuted }}
                        className="font-black font-mono tracking-wider uppercase"
                      >
                        {card.title || "Group Frame"}
                      </span>
                    )}
                    {isSelected ? (
                      <select
                        value={card.cardType || "group"}
                        onChange={(e) => {
                          const nodes = canvasData.nodes.map(n => n.id === card.id ? { ...n, cardType: e.target.value } : n);
                          const updatedData = { ...canvasData, nodes };
                          dispatch({
                            type: "controls.setValue",
                            target: "workspace.canvasData",
                            value: JSON.stringify(updatedData, null, 2),
                            history: "record",
                          });
                          dispatch({
                            type: "controls.setValue",
                            target: "workspace.selectedCardType",
                            value: e.target.value,
                            history: "skip",
                          });
                        }}
                        onPointerDown={(e) => e.stopPropagation()}
                        className="text-[9px] uppercase px-1 py-0.5 rounded font-bold tracking-wider bg-neutral-800 hover:bg-neutral-750 text-neutral-200 border border-neutral-700 pointer-events-auto cursor-pointer focus:outline-none focus:ring-1 focus:ring-link"
                      >
                        <option value="character">Character</option>
                        <option value="location">Location</option>
                        <option value="faction">Faction</option>
                        <option value="magic_spell">Magic Spell</option>
                        <option value="general">General</option>
                        <option value="group">Group</option>
                      </select>
                    ) : (
                      <span className="text-[9px] uppercase px-1.5 py-0.5 rounded font-bold tracking-wider bg-neutral-800 text-neutral-400">
                        Group
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] text-neutral-600 font-mono italic">
                    {cardWidth} x {cardHeight}
                  </div>
                </div>
              ) : (
                // Normal Card layout
                <>
                  {/* Detailed Zoom View */}
                  {showDetailedZoom ? (
                    <>

                      {/* Notion Style Card Header */}
                      <div
                        className="flex flex-col relative group/cardheader border-b cursor-grab active:cursor-grabbing"
                        style={{ borderTop: `4px solid ${cardAccent}`, borderColor: themeStyles.border }}
                        onPointerDown={(e) => startDragNode(e, card)}
                        onPointerMove={onDragNode}
                        onPointerUp={endDragNode}
                      >
                        {/* Cover Image */}
                        {(card.coverImage || isSelected) && (
                          <div className="relative w-full h-24 bg-neutral-800/50 flex items-center justify-center overflow-hidden">
                            {card.coverImage ? (
                              <img src={card.coverImage} className="w-full h-full object-cover pointer-events-none" alt="Cover" />
                            ) : (
                              <div className="text-[10px] text-neutral-500 font-medium">Add Cover Image</div>
                            )}

                            {/* Hover Controls for Cover */}
                            {isSelected && (
                              <div className="absolute top-2 right-2 opacity-0 group-hover/cardheader:opacity-100 transition-opacity pointer-events-auto flex gap-1">
                                <label className="px-2 py-1 bg-neutral-900/80 hover:bg-neutral-800 text-white text-[9px] rounded cursor-pointer backdrop-blur shadow-sm transition" onPointerDown={e=>e.stopPropagation()}>
                                  {card.coverImage ? "Change Cover" : "Add Cover"}
                                  <input type="file" accept="image/*" className="hidden" onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (file) {
                                      const reader = new FileReader();
                                      reader.onload = (event) => {
                                        const url = event.target?.result;
                                        const nodes = canvasData.nodes.map(n => n.id === card.id ? { ...n, coverImage: url } : n);
                                        dispatch({ type: "controls.setValue", target: "workspace.canvasData", value: JSON.stringify({ ...canvasData, nodes }, null, 2), history: "record" });
                                        if (card.id === selectedCardId) {
                                          dispatch({ type: "controls.setValue", target: "workspace.selectedCardCover", value: url, history: "skip" });
                                        }
                                      };
                                      reader.readAsDataURL(file);
                                    }
                                  }} />
                                </label>
                                {card.coverImage && (
                                  <button
                                    className="px-2 py-1 bg-neutral-900/80 hover:bg-rose-500/80 text-white text-[9px] rounded cursor-pointer backdrop-blur shadow-sm transition"
                                    onPointerDown={(e) => {
                                      e.stopPropagation();
                                      const nodes = canvasData.nodes.map(n => n.id === card.id ? { ...n, coverImage: "" } : n);
                                      dispatch({ type: "controls.setValue", target: "workspace.canvasData", value: JSON.stringify({ ...canvasData, nodes }, null, 2), history: "record" });
                                      if (card.id === selectedCardId) {
                                        dispatch({ type: "controls.setValue", target: "workspace.selectedCardCover", value: "", history: "skip" });
                                      }
                                    }}
                                  >Remove</button>
                                )}
                              </div>
                            )}
                          </div>
                        )}

                        {/* Title & Icon Area */}
                        <div className="px-5 pt-3 pb-4 relative z-10">
                          {/* Icon Profile */}
                          {(card.icon || isSelected) && (
                            <div className="${card.coverImage ? '-mt-10' : ''} mb-2 relative pointer-events-auto">
                              <div className="w-12 h-12 bg-neutral-800 rounded flex items-center justify-center text-2xl border-2 shadow-sm relative group/icon" style={{ borderColor: themeStyles.cardBg }}>
                                {card.icon ? card.icon : <span className="opacity-50 text-base" style={{color: cardAccent}}>{getCategoryIcon(card.cardType || "general", 20)}</span>}

                                {isSelected && (
                                  <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 opacity-0 group-hover/icon:opacity-100 transition-opacity bg-neutral-900 rounded border shadow p-0.5 flex gap-0.5 z-20">
                                    {['😀','🗺️','⚔️','🔮','📝'].map(emoji => (
                                      <button key={emoji} className="w-5 h-5 flex items-center justify-center hover:bg-neutral-800 rounded text-[10px]" onPointerDown={(e) => {
                                        e.stopPropagation();
                                        const nodes = canvasData.nodes.map(n => n.id === card.id ? { ...n, icon: emoji } : n);
                                        dispatch({ type: "controls.setValue", target: "workspace.canvasData", value: JSON.stringify({ ...canvasData, nodes }, null, 2), history: "record" });
                                        if (card.id === selectedCardId) dispatch({ type: "controls.setValue", target: "workspace.selectedCardIcon", value: emoji, history: "skip" });
                                      }}>{emoji}</button>
                                    ))}
                                    <button className="w-5 h-5 flex items-center justify-center hover:bg-rose-500/20 text-rose-500 rounded text-[10px]" onPointerDown={(e) => {
                                      e.stopPropagation();
                                      const nodes = canvasData.nodes.map(n => n.id === card.id ? { ...n, icon: "" } : n);
                                      dispatch({ type: "controls.setValue", target: "workspace.canvasData", value: JSON.stringify({ ...canvasData, nodes }, null, 2), history: "record" });
                                      if (card.id === selectedCardId) dispatch({ type: "controls.setValue", target: "workspace.selectedCardIcon", value: "", history: "skip" });
                                    }}>×</button>
                                  </div>
                                )}
                              </div>
                            </div>
                          )}

                          {/* Title Input */}
                          <div className="pointer-events-auto flex items-center justify-between">
                            {isSelected ? (
                              <input
                                aria-label="Title"
                                type="text"
                                value={card.title || ""}
                                onChange={(e) => {
                                  const nodes = canvasData.nodes.map(n => n.id === card.id ? { ...n, title: e.target.value } : n);
                                  dispatch({ type: "controls.setValue", target: "workspace.canvasData", value: JSON.stringify({ ...canvasData, nodes }, null, 2), history: "skip" });
                                  dispatch({ type: "controls.setValue", target: "workspace.selectedCardTitle", value: e.target.value, history: "skip" });
                                }}
                                onBlur={() => dispatch({ type: "controls.setValue", target: "workspace.canvasData", value: JSON.stringify(canvasData, null, 2), history: "record" })}
                                onPointerDown={(e) => e.stopPropagation()}
                                placeholder="Untitled"
                                className="w-full bg-transparent font-bold text-2xl border-none focus:outline-none placeholder-neutral-600 transition"
                                style={{ color: themeStyles.text }}
                              />
                            ) : (
                              <h1 className="font-bold text-2xl" style={{ color: themeStyles.text }}>{card.title || "Untitled"}</h1>
                            )}

                            {/* AI / Card Type Controls for Selected */}
                            {isSelected && (
                              <div className="flex items-center gap-1.5 pointer-events-auto shrink-0 ml-2">
                                <button
                                  onPointerDown={(e) => {
                                    e.stopPropagation();
                                    e.preventDefault();
                                    if (aiCardId === card.id) setAiCardId(null);
                                    else {
                                      setAiCardId(card.id);
                                      setAiPrompt("");
                                      setAiTab("rewrite");
                                      fetchAvailableModels();
                                      const typeKey = (card.cardType || card.type || "general").toLowerCase();
                                      delete promptCacheRef.current[typeKey];
                                    }
                                  }}
                                  className={`p-1.5 rounded transition cursor-pointer flex items-center justify-center ${
                                    aiCardId === card.id ? "bg-purple-600 text-white shadow-md shadow-purple-500/30" : "bg-neutral-800 hover:bg-neutral-750 text-neutral-400 hover:text-purple-400 border border-neutral-700"
                                  }`}
                                  title="Asistente de Redacción IA (Ollama)"
                                >
                                  <Sparkles size={14} className={isGenerating && aiCardId === card.id ? "animate-pulse" : ""} />
                                </button>
                              </div>
                            )}
                          </div>

                          {/* Meta properties (Notion style) */}
                          <div className="flex flex-col gap-2 mt-4 text-[11px] pointer-events-auto">
                            {/* Type Property */}
                            <div className="flex items-center gap-4">
                              <div className="w-16 text-neutral-500 font-medium flex items-center gap-1.5"><Folder size={12} /> Type</div>
                              {isSelected ? (
                                <select
                                  value={card.cardType || "general"}
                                  onChange={(e) => {
                                    const nodes = canvasData.nodes.map(n => n.id === card.id ? { ...n, cardType: e.target.value } : n);
                                    dispatch({ type: "controls.setValue", target: "workspace.canvasData", value: JSON.stringify({ ...canvasData, nodes }, null, 2), history: "record" });
                                    dispatch({ type: "controls.setValue", target: "workspace.selectedCardType", value: e.target.value, history: "skip" });
                                  }}
                                  onPointerDown={(e) => e.stopPropagation()}
                                  className="bg-neutral-800/50 hover:bg-neutral-800 text-neutral-300 rounded px-2 py-0.5 border border-transparent hover:border-neutral-700 focus:outline-none focus:ring-1 focus:ring-link transition cursor-pointer"
                                >
                                  <option value="character">Character</option>
                                  <option value="location">Location</option>
                                  <option value="faction">Faction</option>
                                  <option value="magic_spell">Magic Spell</option>
                                  <option value="general">General</option>
                                </select>
                              ) : (
                                <span className="bg-neutral-800/40 text-neutral-300 rounded px-2 py-0.5 border border-transparent capitalize">{card.cardType || "general"}</span>
                              )}
                            </div>

                            {/* Tags Property */}
                            <div className="flex items-start gap-4">
                              <div className="w-16 text-neutral-500 font-medium flex items-center gap-1.5 mt-0.5"><MapPin size={12} /> Tags</div>
                              <div className="flex-1">
                                {card.tags && card.tags.length > 0 ? (
                                  <div className="flex flex-wrap gap-1">
                                    {card.tags.map((t: string) => (
                                      <span key={t} className="bg-neutral-800/60 text-neutral-300 px-1.5 py-0.5 rounded border border-neutral-700/50 flex items-center gap-1">
                                        {t}
                                        {isSelected && (
                                          <button
                                            onPointerDown={(e) => {
                                              e.stopPropagation();
                                              const updatedTags = (card.tags || []).filter((tag: string) => tag !== t);
                                              updateCardTags(card.id, updatedTags);
                                            }}
                                            className="hover:text-rose-400 ml-0.5"
                                          >×</button>
                                        )}
                                      </span>
                                    ))}
                                  </div>
                                ) : (
                                  <span className="text-neutral-600 italic">Empty</span>
                                )}
                                {isSelected && (
                                  <div className="mt-1">
                                    <TagInput card={card} canvasData={canvasData} onUpdateTags={(newTags) => updateCardTags(card.id, newTags)} />
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Card Body */}
                      {(() => {
                          const blocks = parseTextToBlocks(card.text || "");
                          const updateBlock = (index: number, updatedFields: Partial<Block>) => {
                             const block = { ...blocks[index], ...updatedFields };
                                                      if (updatedFields.content !== undefined && (block.type === "paragraph" || block.type === "list-item")) {
                                const text = updatedFields.content;
                                let newType: Block["type"] = block.type;
                                let prefixLength = 0;
                                let checked = false;
                                
                                if (
                                  text.startsWith("- [ ] ") || text.startsWith("* [ ] ") || text.startsWith("- [ ]") || text.startsWith("* [ ]") ||
                                  text.startsWith("- [] ") || text.startsWith("* [] ") || text.startsWith("- []") || text.startsWith("* []") ||
                                  text.startsWith("[] ") || text.startsWith("[ ] ") || text.startsWith("[]") || text.startsWith("[ ]")
                                ) {
                                  newType = "todo";
                                  if (text.startsWith("- [ ]") || text.startsWith("* [ ]")) {
                                    prefixLength = text.startsWith("- [ ] ") || text.startsWith("* [ ] ") ? 6 : 5;
                                  } else if (text.startsWith("- []") || text.startsWith("* []")) {
                                    prefixLength = text.startsWith("- [] ") || text.startsWith("* [] ") ? 5 : 4;
                                  } else if (text.startsWith("[ ]")) {
                                    prefixLength = text.startsWith("[ ] ") ? 4 : 3;
                                  } else if (text.startsWith("[]")) {
                                    prefixLength = text.startsWith("[] ") ? 3 : 2;
                                  }
                                  checked = false;
                                } else if (
                                  text.startsWith("- [x] ") || text.startsWith("* [x] ") || text.startsWith("- [x]") || text.startsWith("* [x]") ||
                                  text.startsWith("[x] ") || text.startsWith("[x]")
                                ) {
                                  newType = "todo";
                                  if (text.startsWith("- [x]") || text.startsWith("* [x]")) {
                                    prefixLength = text.startsWith("- [x] ") || text.startsWith("* [x] ") ? 6 : 5;
                                  } else {
                                    prefixLength = text.startsWith("[x] ") ? 4 : 3;
                                  }
                                  checked = true;
                                } else if (text.startsWith("- >> ") || text.startsWith("* >> ") || text.startsWith(">> ") || text.startsWith(">>")) {
                                  newType = "toggle";
                                  prefixLength = text.startsWith("- >> ") || text.startsWith("* >> ") ? 5 : (text.startsWith(">> ") ? 3 : 2);
                                } else if (block.type === "paragraph" && (text.startsWith("- ") || text.startsWith("* "))) {
                                  newType = "list-item";
                                  prefixLength = 2;
                                } else if (block.type === "paragraph" && text.startsWith("1. ")) {
                                  newType = "numbered-list";
                                  prefixLength = 3;
                                } else if (text.startsWith("> ")) {
                                  newType = "callout";
                                  prefixLength = 2;
                                } else if (text.startsWith("---")) {
                                  newType = "divider";
                                  prefixLength = 3;
                                }
                                
                                if (prefixLength > 0 || newType !== block.type) {
                                  block.type = newType;
                                  if (prefixLength > 0) {
                                    block.content = text.slice(prefixLength);
                                  }
                                  if (newType === "todo") block.checked = checked;
                                  if (newType === "toggle") block.isCollapsed = false;
                                }
                              }

                             const newBlocks = [...blocks];
                             newBlocks[index] = block;
                             const newText = serializeBlocksToText(newBlocks);
                             const nodes = canvasData.nodes.map(n => n.id === card.id ? { ...n, text: newText } : n);
                             const updatedData = { ...canvasData, nodes };
                             dispatch({
                               type: "controls.setValue",
                               target: "workspace.canvasData",
                               value: JSON.stringify(updatedData, null, 2),
                               history: "skip",
                             });
                             dispatch({
                               type: "controls.setValue",
                               target: "workspace.selectedCardText",
                               value: newText,
                               history: "skip",
                             });
                           };

                          const updateTableCell = (blockIdx: number, cellType: "header" | "row", rIdx: number, cIdx: number, value: string) => {
                            const block = { ...blocks[blockIdx] };
                            if (cellType === "header") {
                              const headers = [...(block.headers || [])];
                              headers[cIdx] = value;
                              block.headers = headers;
                            } else {
                              const rows = (block.rows || []).map(row => [...row]);
                              rows[rIdx][cIdx] = value;
                              block.rows = rows;
                            }
                            updateBlock(blockIdx, block);
                          };

                          const addTableColumn = (blockIdx: number) => {
                            const block = { ...blocks[blockIdx] };
                            block.headers = [...(block.headers || []), `Col ${block.headers ? block.headers.length + 1 : 1}`];
                            block.rows = (block.rows || []).map(row => [...row, ""]);
                            updateBlock(blockIdx, block);
                          };

                          const addTableRow = (blockIdx: number) => {
                            const block = { ...blocks[blockIdx] };
                            const colCount = block.headers ? block.headers.length : 2;
                            block.rows = [...(block.rows || []), Array(colCount).fill("")];
                            updateBlock(blockIdx, block);
                          };

                          const deleteBlock = (index: number) => {
                            const newBlocks = blocks.filter((_, idx) => idx !== index);
                            const newText = serializeBlocksToText(newBlocks);
                            const nodes = canvasData.nodes.map(n => n.id === card.id ? { ...n, text: newText } : n);
                            const updatedData = { ...canvasData, nodes };
                            dispatch({
                              type: "controls.setValue",
                              target: "workspace.canvasData",
                              value: JSON.stringify(updatedData, null, 2),
                              history: "record",
                            });
                            dispatch({
                              type: "controls.setValue",
                              target: "workspace.selectedCardText",
                              value: newText,
                              history: "skip",
                            });
                          };

                          const addBlock = (type: Block["type"]) => {
                            let newBlock: Block;
                            if (type === "table") {
                              newBlock = {
                                id: generateBlockId(),
                                type: "table",
                                headers: ["Col 1", "Col 2"],
                                rows: [["Cell 1", "Cell 2"]]
                              };
                            } else if (type === "image") {
                              newBlock = {
                                id: generateBlockId(),
                                type: "image",
                                caption: "Image Description",
                                url: "https://images.unsplash.com/photo-1507842217343-583bb7270b66?w=600"
                              };
                            } else if (type === "embed") {
                              newBlock = {
                                id: generateBlockId(),
                                type: "embed",
                                url: "https://www.youtube.com/embed/dQw4w9WgXcQ"
                              };
                            } else {
                              newBlock = {
                                id: generateBlockId(),
                                type,
                                content: ""
                              };
                            }
                            const newBlocks = [...blocks, newBlock];
                            const newText = serializeBlocksToText(newBlocks);
                            const nodes = canvasData.nodes.map(n => n.id === card.id ? { ...n, text: newText } : n);
                            const updatedData = { ...canvasData, nodes };
                            dispatch({
                              type: "controls.setValue",
                              target: "workspace.canvasData",
                              value: JSON.stringify(updatedData, null, 2),
                              history: "record",
                            });
                            dispatch({
                              type: "controls.setValue",
                              target: "workspace.selectedCardText",
                              value: newText,
                              history: "skip",
                            });
                          };

                          const updateAllBlocks = (newBlocks: Block[]) => {
                            const newText = serializeBlocksToText(newBlocks);
                            const nodes = canvasData.nodes.map(n => n.id === card.id ? { ...n, text: newText } : n);
                            const updatedData = { ...canvasData, nodes };
                            dispatch({
                              type: "controls.setValue",
                              target: "workspace.canvasData",
                              value: JSON.stringify(updatedData, null, 2),
                              history: "record"
                            });
                            dispatch({
                              type: "controls.setValue",
                              target: "workspace.selectedCardText",
                              value: newText,
                              history: "skip"
                            });
                          };

                          const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>, blockIdx: number) => {
                             const block = blocks[blockIdx];
                             if (e.key === "/") {
                               // Do not prevent default so the slash is typed
                               setTimeout(() => {
                                 const el = e.target as HTMLInputElement | HTMLTextAreaElement;
                                 const val = el.value;
                                 const cursor = el.selectionStart || 0;

                                 // Check if we are at start or after a space/newline
                                 const beforeCursor = val.substring(0, cursor);
                                 const match = beforeCursor.match(/(?:^|\s)\/(.*)$/);

                                 if (match) {
                                   const rect = el.getBoundingClientRect();
                                   setSlashMenu({
                                     blockId: block.id,
                                     index: blockIdx,
                                     x: rect.left,
                                     y: rect.bottom + window.scrollY,
                                     query: match[1] || ""
                                   });
                                 }
                               }, 10);
                             } else if (e.key === "Escape") {
                               setSlashMenu(null);
                             } else if (e.key === "Tab") {
                               e.preventDefault();
                               const newBlocks = [...blocks];
                               const levelShift = e.shiftKey ? -1 : 1;
                               newBlocks[blockIdx] = {
                                 ...block,
                                 level: Math.max(0, (block.level || 0) + levelShift)
                               };
                               updateAllBlocks(newBlocks);
                             } else if (e.key === "Enter") {
                               e.preventDefault();
                               e.stopPropagation();
                               
                               // If current block is a list/todo/numbered list and is empty, Enter converts it to paragraph
                               if (block.type !== "paragraph" && !block.content) {
                                 const newBlocks = [...blocks];
                                 newBlocks[blockIdx] = { ...block, type: "paragraph", content: "" };
                                 updateAllBlocks(newBlocks);
                                 return;
                               }
                               
                               let nextType = block.type;
                               if (block.type.startsWith("heading") || block.type === "code" || block.type === "image" || block.type === "video" || block.type === "embed" || block.type === "divider" || block.type === "table") {
                                 nextType = "paragraph";
                               }
                               
                               const newBlock: Block = {
                                 id: `block_${blockIdx + 1}`,
                                 type: nextType,
                                 content: "",
                                 level: block.level || 0
                               };
                               
                               if (nextType === "todo") {
                                 newBlock.checked = false;
                               } else if (nextType === "numbered-list") {
                                 let prevIdx = 1;
                                 for (let j = blockIdx; j >= 0; j--) {
                                   if (blocks[j].type === "numbered-list") {
                                     prevIdx = (blocks[j].index || 0) + 1;
                                     break;
                                   }
                                 }
                                 newBlock.index = prevIdx;
                               }
                               
                               const newBlocks = [...blocks];
                               newBlocks.splice(blockIdx + 1, 0, newBlock);
                               updateAllBlocks(newBlocks);
                               
                               setTimeout(() => {
                                 const el = document.getElementById(`block-input-block_${blockIdx + 1}`);
                                 if (el) el.focus();
                               }, 50);
                             } else if (e.key === "Backspace") {
                               const isEmpty = !block.content;
                               if (isEmpty) {
                                 e.preventDefault();
                                 e.stopPropagation();
                                 if (block.type !== "paragraph") {
                                   const newBlocks = [...blocks];
                                   newBlocks[blockIdx] = { ...block, type: "paragraph", content: "" };
                                   updateAllBlocks(newBlocks);
                                 } else if (blockIdx > 0) {
                                   const newBlocks = blocks.filter((_, idx) => idx !== blockIdx);
                                   updateAllBlocks(newBlocks);
                                   
                                   setTimeout(() => {
                                     const el = document.getElementById(`block-input-block_${blockIdx - 1}`);
                                     if (el) {
                                       el.focus();
                                       if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
                                         el.selectionStart = el.selectionEnd = el.value.length;
                                       }
                                     }
                                   }, 50);
                                 }
                               }
                             }
                           };

                          const insertBlockAt = (insertIndex: number, type: Block["type"]) => {
                            let newBlock: Block;
                            if (type === "table") {
                              newBlock = {
                                id: generateBlockId(),
                                type: "table",
                                headers: ["Col 1", "Col 2"],
                                rows: [["Cell 1", "Cell 2"]],
                                level: 0
                              };
                            } else if (type === "image") {
                              newBlock = {
                                id: generateBlockId(),
                                type: "image",
                                caption: "",
                                url: "",
                                level: 0
                              };
                            } else if (type === "video") {
                              newBlock = {
                                id: generateBlockId(),
                                type: "video",
                                caption: "",
                                url: "",
                                level: 0
                              };
                            } else if (type === "embed") {
                              newBlock = {
                                id: generateBlockId(),
                                type: "embed",
                                url: "",
                                level: 0
                              };
                            } else if (type === "callout") {
                              newBlock = {
                                id: generateBlockId(),
                                type: "callout",
                                content: "",
                                emoji: "💡",
                                level: 0
                              };
                            } else if (type === "toggle") {
                              newBlock = {
                                id: generateBlockId(),
                                type: "toggle",
                                content: "",
                                isCollapsed: false,
                                level: 0
                              };
                            } else if (type === "todo") {
                              newBlock = {
                                id: generateBlockId(),
                                type: "todo",
                                content: "",
                                checked: false,
                                level: 0
                              };
                            } else if (type === "numbered-list") {
                              let prevIdx = 1;
                              for (let j = insertIndex - 1; j >= 0; j--) {
                                if (blocks[j] && blocks[j].type === "numbered-list") {
                                  prevIdx = (blocks[j].index || 0) + 1;
                                  break;
                                }
                              }
                              newBlock = {
                                id: generateBlockId(),
                                type: "numbered-list",
                                content: "",
                                index: prevIdx,
                                level: 0
                              };
                            } else {
                              newBlock = {
                                id: generateBlockId(),
                                type,
                                content: "",
                                level: 0
                              };
                            }
                            
                            const newBlocks = [...blocks];
                            newBlocks.splice(insertIndex, 0, newBlock);
                            updateAllBlocks(newBlocks);
                            setActiveInserterIndex(null);
                          };

                          const renderInserterZone = (insertIndex: number) => {
                            const isDropdownActive = activeInserterIndex?.cardId === card.id && activeInserterIndex?.index === insertIndex;
                            
                            return (
                              <div className="relative group/inserter w-full" onPointerDown={(e) => e.stopPropagation()}>
                                <div className="h-3 group-hover/inserter:h-7 transition-all duration-150 flex items-center justify-center relative cursor-pointer px-1">
                                  <button
                                    onPointerDown={(e) => {
                                      e.stopPropagation();
                                      e.preventDefault();
                                      if (isDropdownActive) {
                                        setActiveInserterIndex(null);
                                      } else {
                                        const rect = e.currentTarget.getBoundingClientRect();
                                        setActiveInserterIndex({
                                          cardId: card.id,
                                          index: insertIndex,
                                          x: rect.left + rect.width / 2,
                                          y: rect.bottom + window.scrollY,
                                        });
                                      }
                                    }}
                                    className="w-full h-1 group-hover/inserter:h-5 rounded bg-emerald-600/10 hover:bg-emerald-600/25 group-hover/inserter:opacity-100 opacity-0 border border-dashed border-emerald-500/30 hover:border-emerald-500 flex items-center justify-center gap-1 transition-all duration-150 cursor-pointer text-emerald-500 font-bold text-[10px]"
                                  >
                                    <span className="text-[12px] leading-none">+</span>
                                    <span className="opacity-0 group-hover/inserter:opacity-100 transition-opacity duration-150 font-semibold tracking-wider uppercase text-[8px]">Insert Block</span>
                                  </button>
                                </div>
                                
                                {isDropdownActive && createPortal(
                                  <div
                                    className="fixed z-[9999] min-w-[160px] rounded-lg border shadow-xl backdrop-blur-md p-1 flex flex-col text-[10px]"
                                    style={{
                                      left: `${activeInserterIndex.x}px`,
                                      top: `${activeInserterIndex.y}px`,
                                      transform: "translateX(-50%)",
                                      backgroundColor: theme === "light" ? "rgba(245, 238, 224, 0.98)" : "rgba(18, 18, 18, 0.98)",
                                      borderColor: themeStyles.border,
                                      color: themeStyles.text,
                                    }}
                                    onPointerDown={(e) => e.stopPropagation()}
                                  >
                                    <div className="px-2 py-1 text-[8px] uppercase tracking-wider text-neutral-500 font-bold border-b mb-1" style={{ borderColor: themeStyles.border }}>Insert Block</div>
                                    <div
                                      className="max-h-48 overflow-y-auto overscroll-y-contain space-y-0.5"
                                      onWheel={(e) => e.stopPropagation()}
                                    >
                                      {[
                                        { label: "Paragraph Text", type: "paragraph", desc: "Clean text block" },
                                        { label: "Heading 1", type: "heading1", desc: "Large header" },
                                        { label: "Heading 2", type: "heading2", desc: "Medium header" },
                                        { label: "Heading 3", type: "heading3", desc: "Small header" },
                                        { label: "Bullet List", type: "list-item", desc: "Bullet list item" },
                                        { label: "Numbered List", type: "numbered-list", desc: "Ordered list item" },
                                        { label: "Todo Checklist", type: "todo", desc: "Checkbox task item" },
                                        { label: "Info Callout", type: "callout", desc: "Highlight note box" },
                                        { label: "Toggle List", type: "toggle", desc: "Collapsible toggle list" },
                                        { label: "Divider Line", type: "divider", desc: "Horizontal rule" },
                                        { label: "Code Block", type: "code", desc: "Write syntax code" },
                                        { label: "Image Block", type: "image", desc: "Upload or load image" },
                                        { label: "Video Block", type: "video", desc: "Upload or load video" },
                                        { label: "Web Embed", type: "embed", desc: "Custom iframe URL" },
                                      ].map((opt) => (
                                        <button
                                          key={opt.type}
                                          onPointerDown={(e) => {
                                            e.stopPropagation();
                                            e.preventDefault();
                                            insertBlockAt(insertIndex, opt.type as any);
                                          }}
                                          className="w-full text-left px-2 py-1 hover:bg-link hover:text-white rounded transition flex flex-col cursor-pointer"
                                        >
                                          <span className="font-semibold">{opt.label}</span>
                                          <span className="text-[7.5px] opacity-60 font-normal leading-none">{opt.desc}</span>
                                        </button>
                                      ))}
                                    </div>
                                  </div>,
                                  document.body
                                )}
                              </div>
                            );
                          };


                          // ── Block Tree Builder ──────────────────────────────────────────────
                          interface TreeNode {
                            block: Block;
                            originalIndex: number;
                            children: TreeNode[];
                          }

                          const getHeadingRank = (type: string): number => {
                            if (type === "heading1") return 1;
                            if (type === "heading2") return 2;
                            if (type === "heading3") return 3;
                            return 99;
                          };

                          const getLastDescendantIndex = (node: TreeNode): number => {
                            if (node.children.length === 0) return node.originalIndex;
                            return getLastDescendantIndex(node.children[node.children.length - 1]);
                          };

                          // Build a tree from the flat blocks array
                          const treeNodes: TreeNode[] = blocks.map((block, idx) => ({
                            block,
                            originalIndex: idx,
                            children: [],
                          }));

                          const roots: TreeNode[] = [];
                          for (let i = 0; i < treeNodes.length; i++) {
                            const node = treeNodes[i];
                            const rank = getHeadingRank(node.block.type);
                            const level = node.block.level || 0;

                            let parentNode: TreeNode | null = null;

                            // Walk backwards looking for the closest heading or toggle parent
                            for (let j = i - 1; j >= 0; j--) {
                              const potential = treeNodes[j];
                              const pRank = getHeadingRank(potential.block.type);
                              const pLevel = potential.block.level || 0;

                              // Current block is a non-heading: attach to closest heading with lower rank
                              if (rank === 99 && pRank < 99) {
                                parentNode = potential;
                                break;
                              }
                              // Current block is a heading: attach to a heading with strictly lower rank
                              if (rank < 99 && pRank < rank) {
                                parentNode = potential;
                                break;
                              }
                              // Toggle nesting: attach to a toggle with lower indent level
                              if (potential.block.type === "toggle" && level > pLevel) {
                                parentNode = potential;
                                break;
                              }
                              // List/todo nesting: if current block is indented deeper than a list item, attach to it
                              if ((potential.block.type === "list-item" || potential.block.type === "todo" || potential.block.type === "numbered-list") && level > pLevel) {
                                parentNode = potential;
                                break;
                              }
                              // Stop searching once we hit a block of equal or lower heading rank
                              if (pRank <= rank && pRank < 99) break;
                              // Also stop searching if we hit a list item with same or lower indent level
                              if ((potential.block.type === "list-item" || potential.block.type === "todo" || potential.block.type === "numbered-list" || potential.block.type === "toggle") && pLevel <= level && rank === 99) break;
                            }

                            if (parentNode) {
                              parentNode.children.push(node);
                            } else {
                              roots.push(node);
                            }
                          }

                          // ── Recursive Block Renderer ─────────────────────────────────────────
                          const renderBlockContent = (block: Block, originalIndex: number): React.ReactNode => (
                            <>
                              {block.type === "paragraph" && (
                                <textarea
                                  id={`block-input-${block.id}`}
                                  value={block.content || ""}
                                  onChange={(e) => {
                                    updateBlock(originalIndex, { content: e.target.value });
                                    if (slashMenu && slashMenu.blockId === block.id) {
                                      const val = e.target.value;
                                      const cursor = e.target.selectionStart || 0;
                                      const beforeCursor = val.substring(0, cursor);
                                      const match = beforeCursor.match(/(?:^|\s)\/(.*)$/);
                                      if (match) {
                                        setSlashMenu({ ...slashMenu, query: match[1] });
                                      } else {
                                        setSlashMenu(null);
                                      }
                                    }
                                  }}
                                  onPointerDown={(e) => e.stopPropagation()}
                                  onKeyDown={(e) => handleKeyDown(e, originalIndex)}
                                  onFocus={() => setFocusedBlockId(block.id)}
                                  onBlur={() => setFocusedBlockId(null)}
                                  placeholder={focusedBlockId === block.id ? "Type text or use '+' to insert different block styles..." : ""}
                                  style={{ fontSize: `${12 * globalFontScale}px`, color: themeStyles.text }}
                                  className="w-full bg-transparent border-none p-1 focus:bg-neutral-850/50 focus:outline-none focus:ring-1 focus:ring-link/50 rounded resize-none min-h-[1.5em] leading-relaxed transition"
                                  rows={Math.max(3, (block.content || "").split("\n").length)}
                                />
                              )}
                              {block.type === "heading1" && (
                                <div className="flex items-center gap-1.5 w-full pl-0 text-left">
                                  <button
                                    onPointerDown={(e) => {
                                      e.stopPropagation();
                                      e.preventDefault();
                                      updateBlock(originalIndex, { isCollapsed: !block.isCollapsed });
                                    }}
                                    className="opacity-40 hover:opacity-100 p-0.5 rounded hover:bg-neutral-800 text-neutral-450 transition cursor-pointer flex items-center justify-center shrink-0 w-4 h-4"
                                    title={block.isCollapsed ? "Expand section" : "Collapse section"}
                                  >
                                    {block.isCollapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
                                  </button>
                                  <input
                                    id={`block-input-${block.id}`}
                                    type="text"
                                    value={block.content || ""}
                                    onChange={(e) => {
                                      updateBlock(originalIndex, { content: e.target.value });
                                      if (slashMenu && slashMenu.blockId === block.id) {
                                        const val = e.target.value;
                                        const cursor = e.target.selectionStart || 0;
                                        const beforeCursor = val.substring(0, cursor);
                                        const match = beforeCursor.match(/(?:^|\s)\/(.*)$/);
                                        if (match) {
                                          setSlashMenu({ ...slashMenu, query: match[1] });
                                        } else {
                                          setSlashMenu(null);
                                        }
                                      }
                                    }}
                                    onPointerDown={(e) => e.stopPropagation()}
                                    onKeyDown={(e) => handleKeyDown(e, originalIndex)}
                                    onFocus={() => setFocusedBlockId(block.id)}
                                    onBlur={() => {
                                      setFocusedBlockId(null);
                                      dispatch({ type: "controls.setValue", target: "workspace.canvasData", value: JSON.stringify(canvasData, null, 2), history: "record" });
                                    }}
                                    placeholder="Heading 1"
                                    style={{ fontSize: `${18 * globalFontScale}px`, color: themeStyles.text }}
                                    className="flex-1 bg-transparent font-bold border-none p-1 focus:bg-neutral-850/50 focus:outline-none focus:ring-1 focus:ring-link/50 rounded leading-tight transition"
                                  />
                                </div>
                              )}
                              {block.type === "heading2" && (
                                <div className="flex items-center gap-1.5 w-full pl-0 text-left">
                                  <button
                                    onPointerDown={(e) => {
                                      e.stopPropagation();
                                      e.preventDefault();
                                      updateBlock(originalIndex, { isCollapsed: !block.isCollapsed });
                                    }}
                                    className="opacity-40 hover:opacity-100 p-0.5 rounded hover:bg-neutral-800 text-neutral-450 transition cursor-pointer flex items-center justify-center shrink-0 w-4 h-4"
                                    title={block.isCollapsed ? "Expand section" : "Collapse section"}
                                  >
                                    {block.isCollapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
                                  </button>
                                  <input
                                    id={`block-input-${block.id}`}
                                    type="text"
                                    value={block.content || ""}
                                    onChange={(e) => {
                                      updateBlock(originalIndex, { content: e.target.value });
                                      if (slashMenu && slashMenu.blockId === block.id) {
                                        const val = e.target.value;
                                        const cursor = e.target.selectionStart || 0;
                                        const beforeCursor = val.substring(0, cursor);
                                        const match = beforeCursor.match(/(?:^|\s)\/(.*)$/);
                                        if (match) {
                                          setSlashMenu({ ...slashMenu, query: match[1] });
                                        } else {
                                          setSlashMenu(null);
                                        }
                                      }
                                    }}
                                    onPointerDown={(e) => e.stopPropagation()}
                                    onKeyDown={(e) => handleKeyDown(e, originalIndex)}
                                    onFocus={() => setFocusedBlockId(block.id)}
                                    onBlur={() => {
                                      setFocusedBlockId(null);
                                      dispatch({ type: "controls.setValue", target: "workspace.canvasData", value: JSON.stringify(canvasData, null, 2), history: "record" });
                                    }}
                                    placeholder="Heading 2"
                                    style={{ fontSize: `${15 * globalFontScale}px`, color: themeStyles.text }}
                                    className="flex-1 bg-transparent font-bold border-none p-1 focus:bg-neutral-850/50 focus:outline-none focus:ring-1 focus:ring-link/50 rounded leading-tight transition"
                                  />
                                </div>
                              )}
                              {block.type === "heading3" && (
                                <div className="flex items-center gap-1.5 w-full pl-0 text-left">
                                  <button
                                    onPointerDown={(e) => {
                                      e.stopPropagation();
                                      e.preventDefault();
                                      updateBlock(originalIndex, { isCollapsed: !block.isCollapsed });
                                    }}
                                    className="opacity-40 hover:opacity-100 p-0.5 rounded hover:bg-neutral-800 text-neutral-450 transition cursor-pointer flex items-center justify-center shrink-0 w-4 h-4"
                                    title={block.isCollapsed ? "Expand section" : "Collapse section"}
                                  >
                                    {block.isCollapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
                                  </button>
                                  <input
                                    id={`block-input-${block.id}`}
                                    type="text"
                                    value={block.content || ""}
                                    onChange={(e) => {
                                      updateBlock(originalIndex, { content: e.target.value });
                                      if (slashMenu && slashMenu.blockId === block.id) {
                                        const val = e.target.value;
                                        const cursor = e.target.selectionStart || 0;
                                        const beforeCursor = val.substring(0, cursor);
                                        const match = beforeCursor.match(/(?:^|\s)\/(.*)$/);
                                        if (match) {
                                          setSlashMenu({ ...slashMenu, query: match[1] });
                                        } else {
                                          setSlashMenu(null);
                                        }
                                      }
                                    }}
                                    onPointerDown={(e) => e.stopPropagation()}
                                    onKeyDown={(e) => handleKeyDown(e, originalIndex)}
                                    onFocus={() => setFocusedBlockId(block.id)}
                                    onBlur={() => {
                                      setFocusedBlockId(null);
                                      dispatch({ type: "controls.setValue", target: "workspace.canvasData", value: JSON.stringify(canvasData, null, 2), history: "record" });
                                    }}
                                    placeholder="Heading 3"
                                    style={{ fontSize: `${13 * globalFontScale}px`, color: themeStyles.text }}
                                    className="flex-1 bg-transparent font-bold border-none p-1 focus:bg-neutral-850/50 focus:outline-none focus:ring-1 focus:ring-link/50 rounded leading-tight transition"
                                  />
                                </div>
                              )}
                              {block.type === "list-item" && (
                                <div className="flex items-center gap-1.5 w-full pl-1 text-left">
                                  <span className="text-link font-bold text-sm select-none">•</span>
                                  <input
                                    id={`block-input-${block.id}`}
                                    type="text"
                                    value={block.content || ""}
                                    onChange={(e) => {
                                      updateBlock(originalIndex, { content: e.target.value });
                                      if (slashMenu && slashMenu.blockId === block.id) {
                                        const val = e.target.value;
                                        const cursor = e.target.selectionStart || 0;
                                        const beforeCursor = val.substring(0, cursor);
                                        const match = beforeCursor.match(/(?:^|\s)\/(.*)$/);
                                        if (match) {
                                          setSlashMenu({ ...slashMenu, query: match[1] });
                                        } else {
                                          setSlashMenu(null);
                                        }
                                      }
                                    }}
                                    onPointerDown={(e) => e.stopPropagation()}
                                    onKeyDown={(e) => handleKeyDown(e, originalIndex)}
                                    onFocus={() => setFocusedBlockId(block.id)}
                                    onBlur={() => setFocusedBlockId(null)}
                                    placeholder={focusedBlockId === block.id ? "List item..." : ""}
                                    style={{ fontSize: `${12 * globalFontScale}px`, color: themeStyles.text }}
                                    className="flex-1 bg-transparent border-none p-1 focus:bg-neutral-850/50 focus:outline-none focus:ring-1 focus:ring-link/50 rounded transition"
                                  />
                                </div>
                              )}
                              {block.type === "numbered-list" && (
                                <div className="flex items-center gap-1.5 w-full pl-1 text-left">
                                  <span className="text-neutral-500 font-bold text-xs select-none min-w-[15px]">{block.index || 1}.</span>
                                  <input
                                    id={`block-input-${block.id}`}
                                    type="text"
                                    value={block.content || ""}
                                    onChange={(e) => {
                                      updateBlock(originalIndex, { content: e.target.value });
                                      if (slashMenu && slashMenu.blockId === block.id) {
                                        const val = e.target.value;
                                        const cursor = e.target.selectionStart || 0;
                                        const beforeCursor = val.substring(0, cursor);
                                        const match = beforeCursor.match(/(?:^|\s)\/(.*)$/);
                                        if (match) {
                                          setSlashMenu({ ...slashMenu, query: match[1] });
                                        } else {
                                          setSlashMenu(null);
                                        }
                                      }
                                    }}
                                    onPointerDown={(e) => e.stopPropagation()}
                                    onKeyDown={(e) => handleKeyDown(e, originalIndex)}
                                    onFocus={() => setFocusedBlockId(block.id)}
                                    onBlur={() => setFocusedBlockId(null)}
                                    placeholder={focusedBlockId === block.id ? "List item..." : ""}
                                    style={{ fontSize: `${12 * globalFontScale}px`, color: themeStyles.text }}
                                    className="flex-1 bg-transparent border-none p-1 focus:bg-neutral-850/50 focus:outline-none focus:ring-1 focus:ring-link/50 rounded transition"
                                  />
                                </div>
                              )}
                              {block.type === "todo" && (
                                <div className="flex items-center gap-2 w-full pl-1 text-left">
                                  <input
                                    type="checkbox"
                                    checked={!!block.checked}
                                    onChange={(e) => updateBlock(originalIndex, { checked: e.target.checked })}
                                    onPointerDown={(e) => e.stopPropagation()}
                                    className="w-3.5 h-3.5 rounded border-neutral-600 bg-neutral-900 text-link focus:ring-0 focus:ring-offset-0 cursor-pointer"
                                  />
                                  <input
                                    id={`block-input-${block.id}`}
                                    type="text"
                                    value={block.content || ""}
                                    onChange={(e) => {
                                      updateBlock(originalIndex, { content: e.target.value });
                                      if (slashMenu && slashMenu.blockId === block.id) {
                                        const val = e.target.value;
                                        const cursor = e.target.selectionStart || 0;
                                        const beforeCursor = val.substring(0, cursor);
                                        const match = beforeCursor.match(/(?:^|\s)\/(.*)$/);
                                        if (match) {
                                          setSlashMenu({ ...slashMenu, query: match[1] });
                                        } else {
                                          setSlashMenu(null);
                                        }
                                      }
                                    }}
                                    onPointerDown={(e) => e.stopPropagation()}
                                    onKeyDown={(e) => handleKeyDown(e, originalIndex)}
                                    onFocus={() => setFocusedBlockId(block.id)}
                                    onBlur={() => setFocusedBlockId(null)}
                                    placeholder={focusedBlockId === block.id ? "To-do..." : ""}
                                    style={{
                                      fontSize: `${12 * globalFontScale}px`,
                                      color: block.checked ? themeStyles.textMuted : themeStyles.text,
                                      textDecoration: block.checked ? "line-through" : "none",
                                      opacity: block.checked ? 0.6 : 1,
                                    }}
                                    className="flex-1 bg-transparent border-none p-1 focus:bg-neutral-850/50 focus:outline-none focus:ring-1 focus:ring-link/50 rounded transition"
                                  />
                                </div>
                              )}
                              {block.type === "toggle" && (
                                <div className="flex items-center gap-1 w-full pl-1 text-left">
                                  <button
                                    onPointerDown={(e) => {
                                      e.stopPropagation();
                                      e.preventDefault();
                                      updateBlock(originalIndex, { isCollapsed: !block.isCollapsed });
                                    }}
                                    className="text-neutral-500 hover:text-neutral-300 flex items-center justify-center cursor-pointer select-none"
                                  >
                                    {block.isCollapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
                                  </button>
                                  <input
                                    id={`block-input-${block.id}`}
                                    type="text"
                                    value={block.content || ""}
                                    onChange={(e) => {
                                      updateBlock(originalIndex, { content: e.target.value });
                                      if (slashMenu && slashMenu.blockId === block.id) {
                                        const val = e.target.value;
                                        const cursor = e.target.selectionStart || 0;
                                        const beforeCursor = val.substring(0, cursor);
                                        const match = beforeCursor.match(/(?:^|\s)\/(.*)$/);
                                        if (match) {
                                          setSlashMenu({ ...slashMenu, query: match[1] });
                                        } else {
                                          setSlashMenu(null);
                                        }
                                      }
                                    }}
                                    onPointerDown={(e) => e.stopPropagation()}
                                    onKeyDown={(e) => handleKeyDown(e, originalIndex)}
                                    onFocus={() => setFocusedBlockId(block.id)}
                                    onBlur={() => setFocusedBlockId(null)}
                                    placeholder={focusedBlockId === block.id ? "Toggle list..." : ""}
                                    style={{ fontSize: `${12 * globalFontScale}px`, color: themeStyles.text }}
                                    className="flex-1 bg-transparent border-none p-1 focus:bg-neutral-850/50 focus:outline-none focus:ring-1 focus:ring-link/50 rounded font-semibold transition"
                                  />
                                </div>
                              )}
                              {block.type === "divider" && (
                                <div className="w-full py-2 cursor-default select-none pointer-events-none">
                                  <hr style={{ borderTop: `1px solid ${theme === "light" ? "rgba(0, 0, 0, 0.15)" : "rgba(255, 255, 255, 0.2)"}` }} className="w-full" />
                                </div>
                              )}
                              {block.type === "callout" && (
                                <div
                                  className="w-full flex gap-2 items-start p-2 rounded border shadow-sm my-0.5 text-left"
                                  style={{ backgroundColor: theme === "light" ? "#fbfbfa" : "#17171760", borderColor: themeStyles.border }}
                                >
                                  <input
                                    type="text"
                                    maxLength={2}
                                    value={block.emoji || "💡"}
                                    onChange={(e) => updateBlock(originalIndex, { emoji: e.target.value })}
                                    onPointerDown={(e) => e.stopPropagation()}
                                    className="w-5 text-center bg-transparent border-none p-0 text-xs focus:outline-none cursor-pointer"
                                    title="Edit Emoji"
                                  />
                                  <input
                                    id={`block-input-${block.id}`}
                                    type="text"
                                    value={block.content || ""}
                                    onChange={(e) => {
                                      updateBlock(originalIndex, { content: e.target.value });
                                      if (slashMenu && slashMenu.blockId === block.id) {
                                        const val = e.target.value;
                                        const cursor = e.target.selectionStart || 0;
                                        const beforeCursor = val.substring(0, cursor);
                                        const match = beforeCursor.match(/(?:^|\s)\/(.*)$/);
                                        if (match) {
                                          setSlashMenu({ ...slashMenu, query: match[1] });
                                        } else {
                                          setSlashMenu(null);
                                        }
                                      }
                                    }}
                                    onPointerDown={(e) => e.stopPropagation()}
                                    onKeyDown={(e) => handleKeyDown(e, originalIndex)}
                                    placeholder="Callout note..."
                                    style={{ fontSize: `${11 * globalFontScale}px`, color: themeStyles.text }}
                                    className="flex-1 bg-transparent border-none p-0.5 focus:outline-none focus:ring-1 focus:ring-link/50 rounded transition"
                                  />
                                </div>
                              )}
                              {block.type === "code" && (
                                <div
                                  className="w-full rounded border flex flex-col overflow-hidden my-1 shadow-sm font-mono text-[9px] text-left"
                                  style={{ backgroundColor: "#0d0d0d80", borderColor: themeStyles.border }}
                                >
                                  <div className="flex items-center justify-between px-2 py-1 border-b border-neutral-800 text-[8px] uppercase tracking-wider text-neutral-500 font-bold">
                                    <span>Code Block</span>
                                    <select
                                      value={block.language || "javascript"}
                                      onChange={(e) => updateBlock(originalIndex, { language: e.target.value })}
                                      onPointerDown={(e) => e.stopPropagation()}
                                      className="bg-transparent border-none text-[8px] text-neutral-400 font-bold focus:outline-none cursor-pointer"
                                    >
                                      <option value="javascript">JS</option>
                                      <option value="typescript">TS</option>
                                      <option value="css">CSS</option>
                                      <option value="html">HTML</option>
                                      <option value="markdown">MD</option>
                                      <option value="python">PY</option>
                                    </select>
                                  </div>
                                  <textarea
                                    id={`block-input-${block.id}`}
                                    value={block.content || ""}
                                    onChange={(e) => {
                                      updateBlock(originalIndex, { content: e.target.value });
                                      if (slashMenu && slashMenu.blockId === block.id) {
                                        const val = e.target.value;
                                        const cursor = e.target.selectionStart || 0;
                                        const beforeCursor = val.substring(0, cursor);
                                        const match = beforeCursor.match(/(?:^|\s)\/(.*)$/);
                                        if (match) {
                                          setSlashMenu({ ...slashMenu, query: match[1] });
                                        } else {
                                          setSlashMenu(null);
                                        }
                                      }
                                    }}
                                    onPointerDown={(e) => e.stopPropagation()}
                                    onKeyDown={(e) => handleKeyDown(e, originalIndex)}
                                    placeholder="// Write code here..."
                                    className="w-full min-h-[50px] bg-transparent border-none p-2 focus:outline-none font-mono text-neutral-250 resize-y"
                                    style={{ color: "#a3e635" }}
                                  />
                                </div>
                              )}
                              {block.type === "image" && (
                                <div className="group/media relative w-full flex flex-col gap-1 my-1 text-left">
                                  {block.url ? (
                                    <div className="relative overflow-hidden rounded border max-w-full" style={{ borderColor: themeStyles.border }}>
                                      <img src={block.url} alt={block.caption || ""} className="w-full object-contain max-h-40" />
                                      <button
                                        onPointerDown={(e) => { e.stopPropagation(); e.preventDefault(); updateBlock(originalIndex, { url: "", caption: "" }); }}
                                        className="absolute top-2 right-2 px-2 py-0.5 rounded bg-neutral-900/85 hover:bg-rose-500 text-white text-[8px] font-bold shadow opacity-0 group-hover/media:opacity-100 transition cursor-pointer"
                                      >Change Image</button>
                                    </div>
                                  ) : (
                                    <div className="border border-dashed rounded-lg p-3 flex flex-col items-center justify-center gap-2 text-center" style={{ borderColor: themeStyles.border, backgroundColor: theme === "light" ? "#fbfbfa" : "#0d0d0d20" }}>
                                      <div className="text-[10px] text-neutral-500 font-medium flex items-center gap-1.5"><Image size={12} /> Add Image Block</div>
                                      <div className="flex gap-2 items-center w-full justify-center flex-wrap">
                                        <label onPointerDown={(e) => e.stopPropagation()} className="px-2.5 py-1 rounded bg-link hover:bg-link/90 text-white font-bold text-[9px] cursor-pointer text-center select-none shadow">
                                          Upload Image
                                          <input type="file" accept="image/*" className="hidden" onChange={(e) => {
                                            const file = e.target.files?.[0];
                                            if (file) { const reader = new FileReader(); reader.onload = (event) => updateBlock(originalIndex, { url: event.target?.result as string, caption: file.name }); reader.readAsDataURL(file); }
                                          }} />
                                        </label>
                                        <span className="text-neutral-500 text-[9px] italic">or</span>
                                        <input type="text" placeholder="Paste URL..." className="border rounded px-2 py-0.5 text-[10px] focus:outline-none focus:ring-1 focus:ring-link w-32" style={{ backgroundColor: themeStyles.cardBg, borderColor: themeStyles.border, color: themeStyles.text }} onPointerDown={(e) => e.stopPropagation()} onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter") updateBlock(originalIndex, { url: e.currentTarget.value }); }} />
                                      </div>
                                    </div>
                                  )}
                                  {block.url && (
                                    <input type="text" placeholder="Write Caption..." value={block.caption || ""} onChange={(e) => updateBlock(originalIndex, { caption: e.target.value })} onPointerDown={(e) => e.stopPropagation()} className="w-full bg-transparent text-center text-[9px] text-neutral-500 focus:outline-none focus:text-neutral-300 transition italic" />
                                  )}
                                </div>
                              )}
                              {block.type === "video" && (
                                <div className="group/media relative w-full flex flex-col gap-1 my-1 text-left">
                                  {block.url ? (
                                    <div className="relative overflow-hidden rounded border max-w-full" style={{ borderColor: themeStyles.border }}>
                                      <video controls src={block.url} className="w-full max-h-40 rounded" />
                                      <button onPointerDown={(e) => { e.stopPropagation(); e.preventDefault(); updateBlock(originalIndex, { url: "", caption: "" }); }} className="absolute top-2 right-2 px-2 py-0.5 rounded bg-neutral-900/85 hover:bg-rose-500 text-white text-[8px] font-bold shadow opacity-0 group-hover/media:opacity-100 transition cursor-pointer">Change Video</button>
                                    </div>
                                  ) : (
                                    <div className="border border-dashed rounded-lg p-3 flex flex-col items-center justify-center gap-2 text-center" style={{ borderColor: themeStyles.border, backgroundColor: theme === "light" ? "#fbfbfa" : "#0d0d0d20" }}>
                                      <div className="text-[10px] text-neutral-500 font-medium flex items-center gap-1.5"><Video size={12} /> Add Video Block</div>
                                      <div className="flex gap-2 items-center w-full justify-center flex-wrap">
                                        <label onPointerDown={(e) => e.stopPropagation()} className="px-2.5 py-1 rounded bg-link hover:bg-link/90 text-white font-bold text-[9px] cursor-pointer text-center select-none shadow">
                                          Upload Video
                                          <input type="file" accept="video/*" className="hidden" onChange={(e) => {
                                            const file = e.target.files?.[0];
                                            if (file) { const reader = new FileReader(); reader.onload = (event) => updateBlock(originalIndex, { url: event.target?.result as string, caption: file.name }); reader.readAsDataURL(file); }
                                          }} />
                                        </label>
                                        <span className="text-neutral-500 text-[9px] italic">or</span>
                                        <input type="text" placeholder="Paste URL..." className="border rounded px-2 py-0.5 text-[10px] focus:outline-none focus:ring-1 focus:ring-link w-32" style={{ backgroundColor: themeStyles.cardBg, borderColor: themeStyles.border, color: themeStyles.text }} onPointerDown={(e) => e.stopPropagation()} onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter") updateBlock(originalIndex, { url: e.currentTarget.value }); }} />
                                      </div>
                                    </div>
                                  )}
                                  {block.url && (
                                    <input type="text" placeholder="Write Caption..." value={block.caption || ""} onChange={(e) => updateBlock(originalIndex, { caption: e.target.value })} onPointerDown={(e) => e.stopPropagation()} className="w-full bg-transparent text-center text-[9px] text-neutral-500 focus:outline-none focus:text-neutral-300 transition italic" />
                                  )}
                                </div>
                              )}
                              {block.type === "embed" && (
                                <div className="group/media relative w-full flex flex-col gap-1 my-1 text-left">
                                  {block.url ? (
                                    <div className="relative overflow-hidden rounded border h-40 w-full" style={{ borderColor: themeStyles.border }}>
                                      <iframe src={block.url} className="w-full h-full border-none rounded" />
                                      <button onPointerDown={(e) => { e.stopPropagation(); e.preventDefault(); updateBlock(originalIndex, { url: "" }); }} className="absolute top-2 right-2 px-2 py-0.5 rounded bg-neutral-900/85 hover:bg-rose-500 text-white text-[8px] font-bold shadow opacity-0 group-hover/media:opacity-100 transition cursor-pointer">Remove Embed</button>
                                    </div>
                                  ) : (
                                    <div className="border border-dashed rounded-lg p-3 flex flex-col items-center justify-center gap-2 text-center" style={{ borderColor: themeStyles.border, backgroundColor: theme === "light" ? "#fbfbfa" : "#0d0d0d20" }}>
                                      <div className="text-[10px] text-neutral-500 font-medium flex items-center gap-1.5"><ExternalLink size={12} /> Add Web Embed</div>
                                      <div className="w-full max-w-xs">
                                        <input type="text" placeholder="Paste Embed URL..." className="w-full border rounded px-2.5 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-link" style={{ backgroundColor: themeStyles.cardBg, borderColor: themeStyles.border, color: themeStyles.text }} onPointerDown={(e) => e.stopPropagation()} onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter") updateBlock(originalIndex, { url: e.currentTarget.value }); }} />
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )}
                              {block.type === "table" && (
                                <div className="border rounded overflow-hidden my-1 shadow-sm text-left" style={{ backgroundColor: theme === "light" ? "#fdfbf7" : "#0d0d0d60", borderColor: themeStyles.border }}>
                                  <table className="w-full border-collapse text-[10px]">
                                    <thead>
                                      <tr className="border-b" style={{ backgroundColor: theme === "light" ? "#f4eedf" : "#17171780", borderColor: themeStyles.border }}>
                                        {(block.headers || []).map((h, cidx) => (
                                          <th key={cidx} className="p-1 border-r" style={{ borderColor: themeStyles.border }}>
                                            <input value={h} onChange={(e) => updateTableCell(originalIndex, "header", 0, cidx, e.target.value)} onPointerDown={(e) => e.stopPropagation()} style={{ color: themeStyles.text }} className="w-full bg-transparent font-bold text-center border-none p-1 focus:bg-neutral-800/10 focus:outline-none focus:ring-1 focus:ring-link rounded transition" />
                                          </th>
                                        ))}
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {(block.rows || []).map((row, ridx) => (
                                        <tr key={ridx} className="border-b" style={{ borderColor: themeStyles.border }}>
                                          {row.map((cell, cidx) => (
                                            <td key={cidx} className="p-1 border-r" style={{ borderColor: themeStyles.border }}>
                                              <input value={cell} onChange={(e) => updateTableCell(originalIndex, "row", ridx, cidx, e.target.value)} onPointerDown={(e) => e.stopPropagation()} style={{ color: themeStyles.text }} className="w-full bg-transparent border-none p-1 focus:bg-neutral-800/10 focus:outline-none focus:ring-1 focus:ring-link rounded text-center transition" />
                                            </td>
                                          ))}
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                  <div className="flex gap-2 p-1 text-[8px] justify-end border-t" style={{ backgroundColor: theme === "light" ? "#f4eedf80" : "#17171740", borderColor: themeStyles.border }}>
                                    <button onPointerDown={(e) => { e.stopPropagation(); addTableRow(originalIndex); }} className="px-1.5 py-0.5 bg-neutral-800/60 hover:bg-link hover:text-white rounded border text-neutral-300 font-bold transition cursor-pointer" style={{ borderColor: themeStyles.border }}>+ Row</button>
                                    <button onPointerDown={(e) => { e.stopPropagation(); addTableColumn(originalIndex); }} className="px-1.5 py-0.5 bg-neutral-800/60 hover:bg-link hover:text-white rounded border text-neutral-300 font-bold transition cursor-pointer" style={{ borderColor: themeStyles.border }}>+ Col</button>
                                  </div>
                                </div>
                              )}
                            </>
                          );

                          const renderTreeNode = (node: TreeNode): React.ReactNode => {
                            const { block, originalIndex, children } = node;
                            const hasChildren = children.length > 0;
                            const isCollapsible = block.type === "heading1" || block.type === "heading2" || block.type === "heading3" || block.type === "toggle";
                            const isCollapsed = !!block.isCollapsed;

                            // Determine inserter zone target: if collapsed, insert after all children; otherwise after this block
                            const inserterAfterIndex = isCollapsed && hasChildren
                              ? getLastDescendantIndex(node) + 1
                              : originalIndex + 1;

                            return (
                              <div key={block.id} className="flex flex-col w-full text-left">
                                {/* Block row */}
                                <div
                                  className={`group/block relative flex items-start gap-1 p-1 rounded hover:bg-neutral-500/5 transition duration-100 w-full ${dropTargetIndex === originalIndex ? "border-t-2 border-link mt-1 pt-0" : ""}`}
                                  data-block-id={block.id}
                                  onDragOver={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    if (dragBlockIndex !== null && dragBlockIndex !== originalIndex) {
                                      setDropTargetIndex(originalIndex);
                                    }
                                  }}
                                  onDragLeave={(e) => {
                                    if (dropTargetIndex === originalIndex) {
                                      setDropTargetIndex(null);
                                    }
                                  }}
                                  onDrop={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    setDropTargetIndex(null);
                                    setDragBlockIndex(null);
                                    const fromIdxStr = e.dataTransfer.getData("text/plain");
                                    const fromIdx = parseInt(fromIdxStr);
                                    const toIdx = originalIndex;
                                    if (!isNaN(fromIdx) && fromIdx !== toIdx) {
                                      const newBlocks = [...blocks];
                                      const [moved] = newBlocks.splice(fromIdx, 1);
                                      newBlocks.splice(toIdx, 0, moved);
                                      const newText = serializeBlocksToText(newBlocks);
                                      const nodes = canvasData.nodes.map(n => n.id === card.id ? { ...n, text: newText } : n);
                                      dispatch({ type: "controls.setValue", target: "workspace.canvasData", value: JSON.stringify({ ...canvasData, nodes }, null, 2), history: "record" });
                                    }
                                  }}
                                >
                                  {/* Drag handle */}
                                  <div
                                    draggable={true}
                                    onDragStart={(e) => {
                                      e.stopPropagation();
                                      e.dataTransfer.setData("text/plain", originalIndex.toString());
                                      setDragBlockIndex(originalIndex);
                                      const blockEl = document.querySelector(`[data-block-id="${block.id}"]`);
                                      if (blockEl) e.dataTransfer.setDragImage(blockEl, 10, 10);
                                    }}
                                    onDragEnd={() => {
                                      setDragBlockIndex(null);
                                      setDropTargetIndex(null);
                                    }}
                                    onPointerDown={(e) => e.stopPropagation()}
                                    className="opacity-0 group-hover/block:opacity-100 flex items-center justify-center cursor-grab active:cursor-grabbing p-1 rounded text-neutral-500 hover:bg-neutral-500/10 transition self-center mr-1 h-5 w-4"
                                    title="Drag to reorder block"
                                  >
                                    <div className="grid grid-cols-2 gap-0.5 w-2">
                                      <div className="w-0.5 h-0.5 bg-current rounded-full" />
                                      <div className="w-0.5 h-0.5 bg-current rounded-full" />
                                      <div className="w-0.5 h-0.5 bg-current rounded-full" />
                                      <div className="w-0.5 h-0.5 bg-current rounded-full" />
                                      <div className="w-0.5 h-0.5 bg-current rounded-full" />
                                      <div className="w-0.5 h-0.5 bg-current rounded-full" />
                                    </div>
                                  </div>
                                  {/* Block editor */}
                                  <div className="flex-1 min-w-0">
                                    {renderBlockContent(block, originalIndex)}
                                  </div>
                                  {/* Delete button */}
                                  <div className="opacity-0 group-hover/block:opacity-100 flex items-center justify-center p-0.5 rounded text-neutral-500 hover:bg-rose-500/10 hover:text-rose-500 transition cursor-pointer self-center ml-1">
                                    <button
                                      onPointerDown={(e) => { e.stopPropagation(); deleteBlock(originalIndex); }}
                                      title="Delete Block"
                                      className="text-neutral-500 hover:text-rose-500 transition cursor-pointer"
                                    >
                                      <Trash2 size={12} />
                                    </button>
                                  </div>
                                </div>

                                {/* Inserter zone after this block (or after all children if collapsed) */}
                                {renderInserterZone(inserterAfterIndex)}

                                {/* Children container - only shown when expanded */}
                                {hasChildren && (!isCollapsible || !isCollapsed) && (
                                  <div className="border-l-2 pl-3 ml-3 mt-0.5 flex flex-col gap-0" style={{ borderColor: `${themeStyles.border}` }}>
                                    {children.map((childNode) => renderTreeNode(childNode))}
                                  </div>
                                )}
                              </div>
                            );
                          };

                          return (
                            <div className="flex-1 p-3 flex flex-col pointer-events-auto overflow-hidden">
                              <div
                                className="flex-1 overflow-y-auto overscroll-y-contain space-y-1.5 pr-1 scrollbar-thin"
                                onWheel={(e) => e.stopPropagation()}
                                onPointerDown={(e) => {
                                  e.stopPropagation();
                                  selectCard(card);
                                }}
                              >
                                {renderInserterZone(0)}
                                {roots.map((rootNode) => renderTreeNode(rootNode))}
                              </div>
                            </div>
                          );

                        })()
                      }

                      {/* AI Assistant Popover */}
                      {aiCardId === card.id && (
                        <div
                          className="absolute inset-x-0 bottom-0 bg-neutral-900 border-t border-neutral-800 p-2.5 text-xs flex flex-col gap-2 z-[30] pointer-events-auto shadow-2xl"
                          onPointerDown={(e) => e.stopPropagation()}
                        >
                          <div className="flex items-center justify-between border-b border-neutral-800 pb-1.5 mb-0.5">
                            <span className="font-bold text-purple-400 flex items-center gap-1">
                              <Sparkles size={11} className={isGenerating ? "animate-spin" : ""} />
                              Asistente IA
                            </span>
                            <button
                              onPointerDown={(e) => {
                                e.stopPropagation();
                                e.preventDefault();
                                cancelOllamaGenerate();
                                setAiCardId(null);
                              }}
                              className="text-neutral-500 hover:text-neutral-350 transition p-0.5 rounded cursor-pointer"
                            >
                              <X size={12} />
                            </button>
                          </div>

                          {/* Model selector row */}
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] text-neutral-500 font-bold uppercase tracking-wider shrink-0">Modelo:</span>
                            {availableModels.length > 0 ? (
                              <select
                                value={selectedAiModel}
                                onChange={(e) => setSelectedAiModel(e.target.value)}
                                onPointerDown={(e) => e.stopPropagation()}
                                className="flex-1 bg-neutral-950 border border-neutral-800 rounded px-1.5 py-0.5 text-[10.5px] text-neutral-200 focus:outline-none focus:border-purple-500 cursor-pointer"
                              >
                                {availableModels.map((m) => (
                                  <option key={m} value={m}>{m}</option>
                                ))}
                              </select>
                            ) : (
                              <span className="flex-1 text-[10.5px] text-neutral-500 truncate">
                                {modelsLoading ? "Cargando..." : selectedAiModel}
                              </span>
                            )}
                            <button
                              onPointerDown={(e) => {
                                e.stopPropagation();
                                e.preventDefault();
                                fetchAvailableModels();
                              }}
                              title="Actualizar lista de modelos"
                              className="shrink-0 text-neutral-500 hover:text-purple-400 transition p-0.5 rounded cursor-pointer text-[10px] font-bold"
                            >
                              ↺
                            </button>
                          </div>

                          {!isGenerating ? (
                            <>
                              <div className="flex border-b border-neutral-850 text-[10px] pb-1 gap-3">
                                <button
                                  onPointerDown={(e) => {
                                    e.stopPropagation();
                                    e.preventDefault();
                                    setAiTab("rewrite");
                                  }}
                                  className={`pb-1 font-bold transition uppercase tracking-wider ${
                                    aiTab === "rewrite"
                                      ? "text-purple-400 border-b-2 border-purple-500"
                                      : "text-neutral-500 hover:text-neutral-400"
                                  }`}
                                >
                                  Mejorar Redacción
                                </button>
                                <button
                                  onPointerDown={(e) => {
                                    e.stopPropagation();
                                    e.preventDefault();
                                    setAiTab("prompt");
                                  }}
                                  className={`pb-1 font-bold transition uppercase tracking-wider ${
                                    aiTab === "prompt"
                                      ? "text-purple-400 border-b-2 border-purple-500"
                                      : "text-neutral-500 hover:text-neutral-400"
                                  }`}
                                >
                                  Redactar por Consigna
                                </button>
                              </div>

                              {aiTab === "rewrite" ? (
                                <div className="flex flex-col gap-1.5">
                                  <div className="text-[10px] text-neutral-400">
                                    Mejora la redacción y propone un título y etiquetas nuevas para esta tarjeta.
                                  </div>
                                  <button
                                    onPointerDown={(e) => {
                                      e.stopPropagation();
                                      e.preventDefault();
                                      handleOllamaGenerate("rewrite", card);
                                    }}
                                    className="w-full py-1.5 rounded bg-purple-700 hover:bg-purple-650 text-white font-bold transition shadow-md shadow-purple-500/25 flex items-center justify-center gap-1.5 cursor-pointer text-[10.5px]"
                                  >
                                    <Sparkles size={11} /> Mejorar y Rellenar Tarjeta
                                  </button>
                                </div>
                              ) : (
                                <div className="flex flex-col gap-1.5">
                                  <textarea
                                    value={aiPrompt}
                                    onChange={(e) => setAiPrompt(e.target.value)}
                                    onPointerDown={(e) => e.stopPropagation()}
                                    placeholder="Escribe la consigna (ej. Escribe una biografía breve...)"
                                    className="w-full h-12 bg-neutral-950 border border-neutral-800 rounded p-1.5 text-[11px] text-neutral-250 focus:outline-none focus:border-purple-500 resize-none font-sans"
                                  />
                                  <button
                                    disabled={!aiPrompt.trim()}
                                    onPointerDown={(e) => {
                                      if (!aiPrompt.trim()) return;
                                      e.stopPropagation();
                                      e.preventDefault();
                                      handleOllamaGenerate("prompt", card);
                                    }}
                                    className={`w-full py-1.5 rounded text-white font-bold transition flex items-center justify-center gap-1.5 text-[10.5px] cursor-pointer ${
                                      aiPrompt.trim()
                                        ? "bg-purple-700 hover:bg-purple-650 shadow-md shadow-purple-500/25"
                                        : "bg-neutral-850 text-neutral-500 border border-neutral-800 cursor-not-allowed"
                                    }`}
                                  >
                                    <Sparkles size={11} /> Generar y Rellenar Tarjeta
                                  </button>
                                </div>
                              )}
                            </>
                          ) : (
                            <div className="flex flex-col items-center justify-center py-3 gap-2.5">
                              <span className="text-[10.5px] text-neutral-355 font-medium animate-pulse flex items-center gap-1.5">
                                Generando contenido con Ollama...
                              </span>
                              <div className="w-full h-1 bg-neutral-950 rounded-full overflow-hidden">
                                <div className="h-full ai-progress-bar w-full" />
                              </div>
                              <button
                                onPointerDown={(e) => {
                                  e.stopPropagation();
                                  e.preventDefault();
                                  cancelOllamaGenerate();
                                }}
                                className="px-3 py-1 rounded bg-neutral-800 hover:bg-neutral-750 hover:text-rose-450 text-neutral-400 border border-neutral-700 text-[10px] font-bold transition cursor-pointer"
                              >
                                Cancelar Generación
                              </button>
                            </div>
                          )}
                        </div>
                      )}

                                          </>
                  ) : null}

                  {/* Medium Zoom View */}
                  {showMediumZoom ? (
                    <div
                      className="size-full flex flex-col p-3 cursor-grab active:cursor-grabbing"
                      style={{ borderLeft: `6px solid ${cardAccent}` }}
                      onPointerDown={(e) => startDragNode(e, card)}
                      onPointerMove={onDragNode}
                      onPointerUp={endDragNode}
                    >
                      <div className="flex items-start justify-between">
                        <span style={{ fontSize: `${14 * globalFontScale}px` }} className="font-bold text-neutral-100">{card.title || "Untitled Card"}</span>
                        <span className="opacity-70 text-neutral-300" style={{ color: cardAccent }}>
                          {getCategoryIcon(card.cardType || "general", 16)}
                        </span>
                      </div>
                      <div style={{ fontSize: `${11 * globalFontScale}px` }} className="text-neutral-400 mt-2 line-clamp-3 overflow-hidden">
                        {card.text ? renderMarkdown(card.text.slice(0, 300)) : "No description."}
                      </div>
                      {/* Tags Badges row at medium zoom */}
                      {card.tags && card.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-auto pt-2">
                          {card.tags.slice(0, 3).map((t: string) => (
                            <span key={t} style={{ fontSize: `${8 * globalFontScale}px` }} className="bg-neutral-800 text-neutral-450 px-1 rounded">
                              {t}
                            </span>
                          ))}
                          {card.tags.length > 3 && <span style={{ fontSize: `${8 * globalFontScale}px` }} className="text-neutral-500">+{card.tags.length - 3}</span>}
                        </div>
                      )}
                    </div>
                  ) : null}

                  {/* Abstract Zoom View */}
                  {showAbstractZoom ? (
                    <div
                      className="size-full flex items-center justify-center cursor-grab active:cursor-grabbing text-neutral-200 border-2"
                      style={{
                        backgroundColor: cardAccent,
                        borderColor: isSelected ? "var(--link)" : "transparent",
                      }}
                      onPointerDown={(e) => startDragNode(e, card)}
                      onPointerMove={onDragNode}
                      onPointerUp={endDragNode}
                    >
                      <div className="scale-[2] opacity-90 text-neutral-900">
                        {getCategoryIcon(card.cardType || "general", 24)}
                      </div>
                    </div>
                  ) : null}
                </>
              )}

              {/* Resize Handle - only visible for selected non-group nodes */}
              {isSelected && !isGroup && (
                <div
                  className="absolute bottom-0 right-0 size-4 cursor-se-resize flex items-end justify-end p-0.5 pointer-events-auto z-20 group"
                  onPointerDown={(e) => startResizeNode(e, card)}
                  onPointerMove={onResizeNode}
                  onPointerUp={endResizeNode}
                >
                  <svg width="8" height="8" viewBox="0 0 8 8" className="text-neutral-500 group-hover:text-link transition-colors">
                    <line x1="6" y1="0" x2="0" y2="6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    <line x1="6" y1="3" x2="3" y2="6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </div>
              )}

              {/* Ports (Handles for creating edges) - only visible at medium/high zoom on non-group cards */}
              {!showAbstractZoom && !isGroup ? (
                <>
                  {["left", "right", "top", "bottom"].map((side) => {
                    const sideClass =
                      side === "left"
                        ? "top-1/2 -left-1.5 -translate-y-1/2 cursor-w-resize"
                        : side === "right"
                        ? "top-1/2 -right-1.5 -translate-y-1/2 cursor-e-resize"
                        : side === "top"
                        ? "left-1/2 -top-1.5 -translate-x-1/2 cursor-n-resize"
                        : "left-1/2 -bottom-1.5 -translate-x-1/2 cursor-s-resize";

                    return (
                      <div
                        key={side}
                        data-port-side={side}
                        className={`absolute size-3 rounded-full border border-neutral-800 bg-neutral-700 hover:bg-link hover:scale-125 transition-transform duration-100 pointer-events-auto z-30 ${sideClass}`}
                        onPointerDown={(e) => startDragConnection(e, card, side)}
                        onPointerMove={onDragConnection}
                        onPointerUp={endDragConnection}
                      />
                    );
                  })}
                </>
              ) : null}
            </div>
          );
        })}
      </div>

      {/* Delete Confirmation Modal */}
      {deleteConfirmationCard ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm pointer-events-auto"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-6 max-w-sm w-full shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <h3 className="text-sm font-bold text-neutral-200 mb-2">Delete Card?</h3>
            <p className="text-xs text-neutral-400 mb-6">
              Are you sure you want to delete <strong>"{deleteConfirmationCard.title || "Untitled Card"}"</strong>? This will also remove any of its connections.
            </p>
            <div className="flex justify-end gap-3 text-xs">
              <button
                className="px-3 py-1.5 rounded bg-neutral-800 text-neutral-300 hover:bg-neutral-700 transition cursor-pointer"
                onPointerDown={(e) => {
                  e.stopPropagation();
                  setDeleteConfirmationCard(null);
                }}
              >
                Cancel
              </button>
              <button
                className="px-3 py-1.5 rounded bg-rose-600 hover:bg-rose-500 text-neutral-100 font-bold transition cursor-pointer"
                onPointerDown={(e) => {
                  e.stopPropagation();
                  const targetId = deleteConfirmationCard.id;
                  const nodes = canvasData.nodes.filter((n) => n.id !== targetId);
                  const edges = canvasData.edges.filter((e) => e.fromNode !== targetId && e.toNode !== targetId);
                  const updatedData = { ...canvasData, nodes, edges };
                  
                  dispatch({
                    type: "controls.setValue",
                    target: "workspace.canvasData",
                    value: JSON.stringify(updatedData, null, 2),
                    history: "record",
                  });
                  dispatch({
                    type: "controls.setValue",
                    target: "workspace.selectedCardId",
                    value: "",
                    history: "skip",
                  });
                  setDeleteConfirmationCard(null);
                }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Left Directory Sidebar Panel */}
      {createPortal(
        <div
          className="fixed left-0 top-12 bottom-0 w-64 z-30 flex flex-col border-r pointer-events-auto shadow-2xl animate-in slide-in-from-left duration-200"
          style={{
            backgroundColor: themeStyles.sidebarBg,
            borderColor: themeStyles.border,
            color: themeStyles.text,
          }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <div
            className="flex items-center justify-between mb-2 pb-2 border-b px-3 pt-3"
            style={{ borderColor: themeStyles.border }}
          >
            <div className="flex items-center gap-2">
              <Folder className="text-link" size={16} />
              <h2 className="text-xs font-bold font-mono tracking-wider uppercase" style={{ color: themeStyles.text }}>
                World Board
              </h2>
            </div>
            {selectedTagFilter && (
              <span className="text-[8px] bg-link/25 text-link border border-link/20 px-1 py-0.5 rounded font-mono">
                #{selectedTagFilter}
              </span>
            )}
          </div>

          {/* Tab Switcher */}
          <div className="flex border-b text-[10px] font-bold font-mono tracking-wider uppercase mb-3" style={{ borderColor: themeStyles.border }}>
            {[
              { id: "cards", label: "Cards" },
              { id: "tags", label: "Tags" },
              { id: "snippets", label: "Snippets" }
            ].map(tab => (
              <button
                key={tab.id}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  setActiveSidebarTab(tab.id as any);
                }}
                className={`flex-1 py-2 text-center border-b-2 transition cursor-pointer ${
                  activeSidebarTab === tab.id
                    ? "border-link text-link bg-link/5"
                    : "border-transparent text-neutral-500 hover:text-neutral-300"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* TAB 1: CARDS DIRECTORY */}
          {activeSidebarTab === "cards" && (
            <div className="flex-1 flex flex-col min-h-0">
              {/* Active Tag Filter Status */}
              {selectedTagFilter && (
                <div className="mx-3 mb-2 px-2 py-1 rounded bg-link/10 border border-link/20 text-[10px] text-link flex items-center justify-between font-medium">
                  <span>Filtered by tag: #{selectedTagFilter}</span>
                  <button
                    onClick={() => setSelectedTagFilter(null)}
                    className="hover:bg-link/25 px-1.5 py-0.5 rounded font-bold cursor-pointer transition text-[9px]"
                  >
                    Clear ×
                  </button>
                </div>
              )}

              {/* Search Input */}
              <div className="mb-3 px-3">
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search cards..."
                  className="w-full border rounded px-2 py-1 text-xs focus:outline-none focus:border-link"
                  style={{
                    backgroundColor: theme === "light" ? "#fbfbfa" : "#0d0d0d",
                    borderColor: themeStyles.border,
                    color: themeStyles.text,
                  }}
                />
              </div>

              {/* Category Filters Grid */}
              <div className="grid grid-cols-3 gap-1 mb-3 px-3 text-[9px] font-bold font-mono uppercase">
                {[
                  { id: "all", label: "All" },
                  { id: "character", label: "Char" },
                  { id: "location", label: "Loc" },
                  { id: "faction", label: "Fact" },
                  { id: "magic_spell", label: "Spell" },
                  { id: "group", label: "Group" },
                ].map((f) => (
                  <button
                    key={f.id}
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      setCategoryFilter(f.id);
                    }}
                    className={`py-1 rounded border text-center transition cursor-pointer ${
                      categoryFilter === f.id
                        ? "bg-link/10 border-link text-link"
                        : "hover:border-neutral-500"
                    }`}
                    style={{
                      backgroundColor: categoryFilter === f.id ? undefined : (theme === "light" ? "#fbfbfa" : "#0d0d0d"),
                      borderColor: categoryFilter === f.id ? undefined : themeStyles.border,
                      color: categoryFilter === f.id ? undefined : themeStyles.textMuted,
                    }}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              {/* Scrollable Card List */}
              <div
                className="flex-1 overflow-y-auto overscroll-y-contain space-y-1 pr-1 pl-3 pb-3"
                onWheel={(e) => e.stopPropagation()}
              >
                {canvasData.nodes
                  .filter((node) => {
                    const matchesSearch = (node.title || "").toLowerCase().includes(searchTerm.toLowerCase());
                    const matchesCategory = categoryFilter === "all" || node.cardType === categoryFilter;
                    const matchesTag = !selectedTagFilter || (Array.isArray(node.tags) && node.tags.includes(selectedTagFilter));
                    return matchesSearch && matchesCategory && matchesTag;
                  })
                  .map((node) => {
                    const isNodeSelected = node.id === selectedCardId;
                    const nodeColor = getCategoryColor(node.cardType || "general");
                    const isNodeGroup = node.cardType === "group";
                    const w = node.width || (isNodeGroup ? 600 : 320);
                    const h = node.height || (isNodeGroup ? 400 : 200);

                    return (
                      <button
                        key={node.id}
                        onPointerDown={(e) => {
                          e.stopPropagation();
                          selectCard(node);
                          dispatch({
                            type: "canvas.setOffset",
                            offset: {
                              x: -node.x - w / 2,
                              y: -node.y - h / 2,
                            },
                          });
                        }}
                        className={`w-full text-left px-2 py-1.5 rounded text-xs border transition flex items-center gap-2 cursor-pointer ${
                          isNodeSelected
                            ? "bg-neutral-800/80 border-link text-neutral-100 font-semibold"
                            : "hover:bg-neutral-850/40"
                        }`}
                        style={{
                          borderColor: isNodeSelected ? undefined : themeStyles.border,
                          color: isNodeSelected ? themeStyles.text : themeStyles.textMuted,
                          backgroundColor: isNodeSelected ? undefined : "transparent",
                        }}
                      >
                        <span className="opacity-85" style={{ color: nodeColor }}>
                          {getCategoryIcon(node.cardType || "general", 12)}
                        </span>
                        <span className="truncate flex-1">{node.title || "Untitled Card"}</span>
                      </button>
                    );
                  })}
                {canvasData.nodes.length === 0 && (
                  <div className="text-center py-6 text-xs text-neutral-600 italic">
                    No cards on the board.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: GLOBAL TAGS PANEL */}
          {activeSidebarTab === "tags" && (
            <div
              className="flex-1 overflow-y-auto overscroll-y-contain px-3 pb-3 flex flex-col gap-2 min-h-0"
              onWheel={(e) => e.stopPropagation()}
            >
              <div className="text-[10px] text-neutral-500 font-medium mb-1">Click a tag to filter the directory. Delete action removes the tag from all cards globally.</div>
              {(() => {
                const uniqueTags = new Set<string>();
                canvasData.nodes.forEach((n: any) => {
                  if (Array.isArray(n.tags)) {
                    n.tags.forEach((t: string) => uniqueTags.add(t));
                  }
                });
                const tagsList = Array.from(uniqueTags);
                
                if (tagsList.length === 0) {
                  return (
                    <div className="text-center py-6 text-xs text-neutral-600 italic">
                      No tags created yet.
                    </div>
                  );
                }

                return tagsList.map((tag) => {
                  const cardCount = canvasData.nodes.filter(n => Array.isArray(n.tags) && n.tags.includes(tag)).length;
                  const isCurrentFilter = selectedTagFilter === tag;
                  
                  return (
                    <div
                      key={tag}
                      className={`flex items-center justify-between p-2 rounded-lg border text-xs transition duration-150 ${
                        isCurrentFilter ? "bg-link/10 border-link text-link" : "hover:bg-neutral-800/20"
                      }`}
                      style={{ borderColor: isCurrentFilter ? undefined : themeStyles.border }}
                    >
                      <button
                        onClick={() => {
                          setSelectedTagFilter(isCurrentFilter ? null : tag);
                          setActiveSidebarTab("cards");
                        }}
                        className="flex-1 text-left font-mono font-semibold truncate hover:underline cursor-pointer"
                      >
                        #{tag} <span className="text-[9px] opacity-60 font-normal">({cardCount})</span>
                      </button>
                      
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          const nodes = canvasData.nodes.map(n => {
                            if (Array.isArray(n.tags)) {
                              return { ...n, tags: n.tags.filter((t: any) => t !== tag) };
                            }
                            return n;
                          });
                          dispatch({
                            type: "controls.setValue",
                            target: "workspace.canvasData",
                            value: JSON.stringify({ ...canvasData, nodes }, null, 2),
                            history: "record"
                          });
                          if (selectedTagFilter === tag) {
                            setSelectedTagFilter(null);
                          }
                        }}
                        className="text-neutral-500 hover:text-rose-500 p-1 rounded hover:bg-rose-500/10 transition cursor-pointer"
                        title="Delete Globally"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  );
                });
              })()}
            </div>
          )}

          {/* TAB 3: SAVED SNIPPETS PANEL */}
          {activeSidebarTab === "snippets" && (
            <div
              className="flex-1 overflow-y-auto overscroll-y-contain px-3 pb-3 flex flex-col gap-2 min-h-0"
              onWheel={(e) => e.stopPropagation()}
            >
              <div className="text-[10px] text-neutral-500 font-medium mb-1">Click a snippet to center and flash focus on its containing card.</div>
              {(() => {
                const snippets = canvasData.snippets || [];
                if (snippets.length === 0) {
                  return (
                    <div className="text-center py-6 text-xs text-neutral-600 italic">
                      No saved snippets. Highlight text in a card and right click to save.
                    </div>
                  );
                }

                return snippets.map((snippet: any) => {
                  return (
                    <div
                      key={snippet.id}
                      className="group/snippet flex flex-col gap-1 p-2 rounded-lg border text-xs bg-neutral-950/20 hover:bg-neutral-800/30 transition duration-150 text-left"
                      style={{ borderColor: themeStyles.border }}
                    >
                      <div className="flex items-start justify-between gap-1">
                        <button
                          onClick={() => {
                            const node = canvasData.nodes.find(n => n.id === snippet.cardId);
                            if (node) {
                              selectCard(node);
                              const isNodeGroup = node.cardType === "group";
                              const w = node.width || (isNodeGroup ? 600 : 320);
                              const h = node.height || (isNodeGroup ? 400 : 200);
                              dispatch({
                                type: "canvas.setOffset",
                                offset: {
                                  x: -node.x - w / 2,
                                  y: -node.y - h / 2,
                                },
                              });
                              setFlashingCardId(node.id);
                              setTimeout(() => setFlashingCardId(null), 1500);
                            }
                          }}
                          className="flex-1 text-left font-semibold truncate hover:underline hover:text-link text-neutral-250 cursor-pointer"
                        >
                          "{snippet.text}"
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            const updatedSnippets = (canvasData.snippets || []).filter((s: any) => s.id !== snippet.id);
                            dispatch({
                              type: "controls.setValue",
                              target: "workspace.canvasData",
                              value: JSON.stringify({ ...canvasData, snippets: updatedSnippets }, null, 2),
                              history: "record"
                            });
                          }}
                          className="text-neutral-500 hover:text-rose-500 p-0.5 rounded transition opacity-0 group-hover/snippet:opacity-100 cursor-pointer"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                      <div className="text-[9px] text-neutral-500 font-mono flex items-center gap-1">
                        <span>Card:</span>
                        <span className="truncate max-w-[120px] font-semibold">{snippet.cardTitle || "Untitled"}</span>
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          )}
        </div>,
        document.body
      )}



      {formatMenu && createPortal(
        <div
          className="fixed z-[10000] rounded-md border shadow-xl backdrop-blur-md flex items-center p-1 text-[11px] pointer-events-auto gap-1"
          style={{
            left: `${formatMenu.x}px`,
            top: `${formatMenu.y}px`,
            transform: "translateX(-50%)",
            backgroundColor: theme === "light" ? "rgba(245, 238, 224, 0.98)" : "rgba(18, 18, 18, 0.98)",
            borderColor: themeStyles.border,
            color: themeStyles.text,
          }}
          onMouseDown={(e) => {
            // keep focus on the input when we click the menu
            e.preventDefault();
          }}
        >
          <button
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              applyFormat(formatMenu.inputEl, "**");
            }}
            className="w-7 h-7 flex items-center justify-center font-bold hover:bg-neutral-800/20 rounded cursor-pointer transition"
            title="Bold"
          >
            B
          </button>
          <button
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              applyFormat(formatMenu.inputEl, "*");
            }}
            className="w-7 h-7 flex items-center justify-center italic font-serif hover:bg-neutral-800/20 rounded cursor-pointer transition"
            title="Italic"
          >
            I
          </button>
          <button
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              applyFormat(formatMenu.inputEl, "`");
            }}
            className="w-7 h-7 flex items-center justify-center font-mono hover:bg-neutral-800/20 rounded cursor-pointer transition"
            title="Code"
          >
            &lt;/&gt;
          </button>
        </div>,
        document.body
      )}

      {slashMenu && createPortal(
        <div
          className="fixed z-[10000] min-w-[200px] rounded-lg border shadow-xl backdrop-blur-md p-1 flex flex-col text-[10px] pointer-events-auto"
          style={{
            left: `${slashMenu.x}px`,
            top: `${slashMenu.y}px`,
            backgroundColor: theme === "light" ? "rgba(245, 238, 224, 0.98)" : "rgba(18, 18, 18, 0.98)",
            borderColor: themeStyles.border,
            color: themeStyles.text,
          }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <div className="px-2 py-1 text-[8px] uppercase tracking-wider text-neutral-500 font-bold border-b mb-1" style={{ borderColor: themeStyles.border }}>
            Basic Blocks
          </div>
          <div
            className="max-h-64 overflow-y-auto overscroll-y-contain space-y-0.5"
            onWheel={(e) => e.stopPropagation()}
          >
            {[
              { label: "Text", type: "paragraph", desc: "Just start typing with plain text.", icon: "T" },
              { label: "Heading 1", type: "heading1", desc: "Large section heading.", icon: "H1" },
              { label: "Heading 2", type: "heading2", desc: "Medium section heading.", icon: "H2" },
              { label: "Heading 3", type: "heading3", desc: "Small section heading.", icon: "H3" },
              { label: "To-do list", type: "todo", desc: "Track tasks with a to-do list.", icon: "☑" },
              { label: "Bulleted list", type: "list-item", desc: "Create a simple bulleted list.", icon: "•" },
              { label: "Numbered list", type: "numbered-list", desc: "Create a list with numbering.", icon: "1." },
              { label: "Toggle list", type: "toggle", desc: "Toggles can hide and show content inside.", icon: "▶" },
              { label: "Divider", type: "divider", desc: "Visually divide blocks.", icon: "—" },
              { label: "Callout", type: "callout", desc: "Make writing stand out.", icon: "💡" },
              { label: "Code", type: "code", desc: "Capture a code snippet.", icon: "</>" },
              { label: "Image", type: "image", desc: "Upload or embed an image.", icon: "🖼️" },
              { label: "Table", type: "table", desc: "Add a simple tabular data.", icon: "▦" },
            ]
              .filter(opt => opt.label.toLowerCase().includes(slashMenu.query.toLowerCase()) || opt.type.toLowerCase().includes(slashMenu.query.toLowerCase()))
              .map((opt) => (
              <button
                key={opt.type}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  e.preventDefault();

                  // Update block to remove the slash query and set new type
                  const blockNode = canvasData.nodes.find(n => n.id === selectedCardId);
                  if (blockNode) {
                    const blocks = parseTextToBlocks(blockNode.text || "");
                    const b = blocks[slashMenu.index];
                    if (b) {
                      // replace the slash query with empty
                      const val = b.content || "";
                      const newVal = val.replace(/(^|\s)\/(.*)$/, "$1");

                      let newType: Block["type"] = opt.type as any;
                      b.type = newType;
                      b.content = newVal;

                      // Handle initializations
                      if (newType === "todo") b.checked = false;
                      if (newType === "table") { b.headers = ["Col 1", "Col 2"]; b.rows = [["Cell 1", "Cell 2"]]; }
                      if (newType === "image") { b.caption = ""; b.url = ""; }
                      if (newType === "callout") { b.emoji = "💡"; }

                      const newText = serializeBlocksToText(blocks);
                      const nodes = canvasData.nodes.map(n => n.id === blockNode.id ? { ...n, text: newText } : n);
                      dispatch({
                        type: "controls.setValue",
                        target: "workspace.canvasData",
                        value: JSON.stringify({ ...canvasData, nodes }, null, 2),
                        history: "record"
                      });
                      dispatch({
                        type: "controls.setValue",
                        target: "workspace.selectedCardText",
                        value: newText,
                        history: "skip"
                      });
                    }
                  }

                  setSlashMenu(null);
                }}
                className="w-full text-left px-2 py-1.5 hover:bg-neutral-800/20 rounded transition flex items-center gap-2 cursor-pointer"
              >
                <div className="w-8 h-8 rounded border bg-neutral-900/50 flex items-center justify-center font-bold text-xs" style={{ borderColor: themeStyles.border }}>
                  {opt.icon}
                </div>
                <div className="flex flex-col">
                  <span className="font-semibold text-xs text-neutral-200">{opt.label}</span>
                  <span className="text-[9px] text-neutral-500 font-normal leading-none mt-0.5">{opt.desc}</span>
                </div>
              </button>
            ))}
          </div>
        </div>,
        document.body
      )}

      {contextMenu && createPortal(
        <div
          className="context-menu-container fixed z-50 min-w-40 rounded-lg border shadow-xl backdrop-blur-md p-1 flex flex-col text-xs pointer-events-auto"
          style={{
            left: `${contextMenu.x}px`,
            top: `${contextMenu.y}px`,
            backgroundColor: theme === "light" ? "rgba(245, 238, 224, 0.95)" : "rgba(23, 23, 23, 0.95)",
            borderColor: themeStyles.border,
            color: themeStyles.text,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {contextMenu.type === "canvas" && (
            <>
              <div className="px-2.5 py-1 text-[9px] uppercase tracking-wider text-neutral-500 font-bold border-b mb-1" style={{ borderColor: themeStyles.border }}>Canvas Actions</div>
              
              <div className="relative group">
                <button
                  className="w-full text-left px-2.5 py-1.5 hover:bg-link hover:text-white rounded-md transition font-medium flex justify-between items-center cursor-pointer"
                >
                  <span>+ Create Card</span>
                  <span className="text-[9px] opacity-60">▶</span>
                </button>
                <div
                  className="absolute left-full top-0 min-w-32 rounded-lg border shadow-lg backdrop-blur-md p-1 flex flex-col hidden group-hover:flex"
                  style={{
                    backgroundColor: theme === "light" ? "rgba(245, 238, 224, 0.95)" : "rgba(23, 23, 23, 0.95)",
                    borderColor: themeStyles.border,
                    color: themeStyles.text,
                  }}
                >
                  {[
                    { label: "Character", value: "character" },
                    { label: "Location", value: "location" },
                    { label: "Faction", value: "faction" },
                    { label: "Magic Spell", value: "magic_spell" },
                    { label: "Group / Frame", value: "group" },
                    { label: "General", value: "general" },
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => {
                        createCardAtPos(contextMenu.target.x, contextMenu.target.y, opt.value);
                        setContextMenu(null);
                      }}
                      className="w-full text-left px-2.5 py-1 hover:bg-link hover:text-white rounded transition cursor-pointer"
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <button
                onClick={() => {
                  const canvasEl = document.querySelector(".toolcraft-canvas") || containerRef.current;
                  if (canvasEl) {
                    canvasEl.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
                  }
                  setContextMenu(null);
                }}
                className="w-full text-left px-2.5 py-1.5 hover:bg-link hover:text-white rounded-md transition font-medium cursor-pointer"
              >
                Center Camera
              </button>

              <button
                onClick={() => {
                  dispatch({
                    type: "controls.setValue",
                    target: "workspace.snapToGrid",
                    value: !snapToGrid,
                  });
                  setContextMenu(null);
                }}
                className="w-full text-left px-2.5 py-1.5 hover:bg-link hover:text-white rounded-md transition font-medium cursor-pointer"
              >
                {snapToGrid ? "Disable Snap to Grid" : "Enable Snap to Grid"}
              </button>
            </>
          )}

          {contextMenu.type === "node" && (
            <>
              <div className="px-2.5 py-1 text-[9px] uppercase tracking-wider text-neutral-500 font-bold border-b mb-1" style={{ borderColor: themeStyles.border }}>Card Actions</div>
              
              {contextMenu.selectedText && (
                <button
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    const snippets = [...(canvasData.snippets || [])];
                    const newSnippet = {
                      id: `snippet_${Date.now()}`,
                      text: contextMenu.selectedText || "",
                      cardId: contextMenu.target.id,
                      cardTitle: contextMenu.target.title || "New Card",
                    };
                    snippets.push(newSnippet);
                    const updatedData = { ...canvasData, snippets };
                    dispatch({
                      type: "controls.setValue",
                      target: "workspace.canvasData",
                      value: JSON.stringify(updatedData, null, 2),
                      history: "record",
                    });
                    setContextMenu(null);
                  }}
                  className="w-[calc(100%-8px)] mx-1 text-left px-2 py-1.5 hover:bg-link hover:text-white rounded transition font-medium cursor-pointer text-link bg-link/10 border border-link/20 mb-1 block"
                >
                  Save Snippet: "{contextMenu.selectedText.length > 18 ? contextMenu.selectedText.slice(0, 18) + "..." : contextMenu.selectedText}"
                </button>
              )}

              <div className="relative group">
                <button
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                  }}
                  className="w-full text-left px-2.5 py-1.5 hover:bg-link hover:text-white rounded-md transition font-medium flex justify-between items-center cursor-pointer"
                >
                  <span>Change Type</span>
                  <span className="text-[9px] opacity-60">▶</span>
                </button>
                <div
                  className="absolute left-full top-0 min-w-32 rounded-lg border shadow-lg backdrop-blur-md p-1 flex flex-col hidden group-hover:flex"
                  style={{
                    backgroundColor: theme === "light" ? "rgba(245, 238, 224, 0.95)" : "rgba(23, 23, 23, 0.95)",
                    borderColor: themeStyles.border,
                    color: themeStyles.text,
                  }}
                >
                  {[
                    { label: "Character", value: "character" },
                    { label: "Location", value: "location" },
                    { label: "Faction", value: "faction" },
                    { label: "Magic Spell", value: "magic_spell" },
                    { label: "Group / Frame", value: "group" },
                    { label: "General", value: "general" },
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        if (contextMenu.target.id === selectedCardId) {
                          dispatch({
                            type: "controls.setValue",
                            target: "workspace.selectedCardType",
                            value: opt.value,
                            history: "record",
                          });
                        } else {
                          const nodes = canvasData.nodes.map((n) =>
                            n.id === contextMenu.target.id ? { ...n, cardType: opt.value, color: getCategoryColor(opt.value) } : n
                          );
                          dispatch({
                            type: "controls.setValue",
                            target: "workspace.canvasData",
                            value: JSON.stringify({ ...canvasData, nodes }, null, 2),
                            history: "record",
                          });
                        }
                        setContextMenu(null);
                      }}
                      className="w-full text-left px-2.5 py-1 hover:bg-link hover:text-white rounded transition cursor-pointer"
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="relative group">
                <button
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                  }}
                  className="w-full text-left px-2.5 py-1.5 hover:bg-link hover:text-white rounded-md transition font-medium flex justify-between items-center cursor-pointer"
                >
                  <span>Set Card Color</span>
                  <span className="text-[9px] opacity-60">▶</span>
                </button>
                <div
                  className="absolute left-full top-0 min-w-32 rounded-lg border shadow-lg backdrop-blur-md p-1 flex flex-col hidden group-hover:flex"
                  style={{
                    backgroundColor: theme === "light" ? "rgba(245, 238, 224, 0.95)" : "rgba(23, 23, 23, 0.95)",
                    borderColor: themeStyles.border,
                    color: themeStyles.text,
                  }}
                >
                  {[
                    { label: "Default Blue", value: "#70b0fa" },
                    { label: "Emerald Green", value: "#10b981" },
                    { label: "Crimson Red", value: "#ef4444" },
                    { label: "Royal Purple", value: "#8b5cf6" },
                    { label: "Amber Orange", value: "#f59e0b" },
                    { label: "Slate Gray", value: "#64748b" },
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        if (contextMenu.target.id === selectedCardId) {
                          dispatch({
                            type: "controls.setValue",
                            target: "workspace.selectedCardColor",
                            value: { hex: opt.value },
                            history: "record",
                          });
                        } else {
                          const nodes = canvasData.nodes.map((n) =>
                            n.id === contextMenu.target.id ? { ...n, color: opt.value } : n
                          );
                          dispatch({
                            type: "controls.setValue",
                            target: "workspace.canvasData",
                            value: JSON.stringify({ ...canvasData, nodes }, null, 2),
                            history: "record",
                          });
                        }
                        setContextMenu(null);
                      }}
                      className="w-full text-left px-2.5 py-1 hover:bg-link hover:text-white rounded transition flex items-center gap-2 cursor-pointer"
                    >
                      <div className="w-2.5 h-2.5 rounded-full border border-neutral-600/30" style={{ backgroundColor: opt.value }} />
                      <span>{opt.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <button
                onPointerDown={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  duplicateCard(contextMenu.target);
                  setContextMenu(null);
                }}
                className="w-full text-left px-2.5 py-1.5 hover:bg-link hover:text-white rounded-md transition font-medium cursor-pointer"
              >
                Duplicate Card
              </button>

              <button
                onPointerDown={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  setDeleteConfirmationCard(contextMenu.target);
                  setContextMenu(null);
                }}
                className="w-full text-left px-2.5 py-1.5 hover:bg-rose-500/20 hover:text-rose-500 rounded-md transition font-medium cursor-pointer"
              >
                Delete Card
              </button>
            </>
          )}

          {contextMenu.type === "edge" && (
            <>
              <div className="px-2.5 py-1 text-[9px] uppercase tracking-wider text-neutral-500 font-bold border-b mb-1" style={{ borderColor: themeStyles.border }}>Connection Actions</div>
              
              <div className="relative group">
                <button
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                  }}
                  className="w-full text-left px-2.5 py-1.5 hover:bg-link hover:text-white rounded-md transition font-medium flex justify-between items-center cursor-pointer"
                >
                  <span>Change Style</span>
                  <span className="text-[9px] opacity-60">▶</span>
                </button>
                <div
                  className="absolute left-full top-0 min-w-36 rounded-lg border shadow-lg backdrop-blur-md p-1 flex flex-col hidden group-hover:flex"
                  style={{
                    backgroundColor: theme === "light" ? "rgba(245, 238, 224, 0.95)" : "rgba(23, 23, 23, 0.95)",
                    borderColor: themeStyles.border,
                    color: themeStyles.text,
                  }}
                >
                  {[
                    { label: "Relational (Solid)", value: "solid" },
                    { label: "Flow Line (Dashed)", value: "dashed" },
                    { label: "Influence (Dotted)", value: "dotted" },
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        const targetId = contextMenu.target.id || `edge_${contextMenu.target.fromNode}_${contextMenu.target.toNode}`;
                        const edges = canvasData.edges.map((e) => {
                          const eId = e.id || `edge_${e.fromNode}_${e.toNode}`;
                          return eId === targetId ? { ...e, relationshipType: opt.value } : e;
                        });
                        dispatch({
                          type: "controls.setValue",
                          target: "workspace.canvasData",
                          value: JSON.stringify({ ...canvasData, edges }, null, 2),
                          history: "record",
                        });
                        if (targetId === selectedConnectionId) {
                          dispatch({
                            type: "controls.setValue",
                            target: "workspace.selectedConnectionStyle",
                            value: opt.value,
                            history: "skip",
                          });
                        }
                        setContextMenu(null);
                      }}
                      className="w-full text-left px-2.5 py-1 hover:bg-link hover:text-white rounded transition cursor-pointer"
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="relative group">
                <button
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                  }}
                  className="w-full text-left px-2.5 py-1.5 hover:bg-link hover:text-white rounded-md transition font-medium flex justify-between items-center cursor-pointer"
                >
                  <span>Change Color</span>
                  <span className="text-[9px] opacity-60">▶</span>
                </button>
                <div
                  className="absolute left-full top-0 min-w-32 rounded-lg border shadow-lg backdrop-blur-md p-1 flex flex-col hidden group-hover:flex"
                  style={{
                    backgroundColor: theme === "light" ? "rgba(245, 238, 224, 0.95)" : "rgba(23, 23, 23, 0.95)",
                    borderColor: themeStyles.border,
                    color: themeStyles.text,
                  }}
                >
                  {[
                    { label: "Neutral (Gray)", value: "gray", hex: "#737373" },
                    { label: "Positive (Green)", value: "green", hex: "#10b981" },
                    { label: "Conflict (Red)", value: "red", hex: "#ef4444" },
                    { label: "Magic (Purple)", value: "purple", hex: "#8b5cf6" },
                    { label: "Lore (Blue)", value: "blue", hex: "#3b82f6" },
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        const targetId = contextMenu.target.id || `edge_${contextMenu.target.fromNode}_${contextMenu.target.toNode}`;
                        const edges = canvasData.edges.map((e) => {
                          const eId = e.id || `edge_${e.fromNode}_${e.toNode}`;
                          return eId === targetId ? { ...e, color: opt.value } : e;
                        });
                        dispatch({
                          type: "controls.setValue",
                          target: "workspace.canvasData",
                          value: JSON.stringify({ ...canvasData, edges }, null, 2),
                          history: "record",
                        });
                        if (targetId === selectedConnectionId) {
                          dispatch({
                            type: "controls.setValue",
                            target: "workspace.selectedConnectionColor",
                            value: opt.value,
                            history: "skip",
                          });
                        }
                        setContextMenu(null);
                      }}
                      className="w-full text-left px-2.5 py-1 hover:bg-link hover:text-white rounded transition flex items-center gap-2 cursor-pointer"
                    >
                      <div className="w-2.5 h-2.5 rounded-full border border-neutral-600/30" style={{ backgroundColor: opt.hex }} />
                      <span>{opt.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <button
                onPointerDown={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  const targetId = contextMenu.target.id || `edge_${contextMenu.target.fromNode}_${contextMenu.target.toNode}`;
                  deleteConnection(targetId);
                  setContextMenu(null);
                }}
                className="w-full text-left px-2.5 py-1.5 hover:bg-rose-500/20 hover:text-rose-500 rounded-md transition font-medium cursor-pointer"
              >
                Delete Connection
              </button>
            </>
          )}
        </div>,
        document.body
      )}

      {/* Story Analyzer Overlay */}
      {isStoryAnalyzerOpen && createPortal(
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-2xl rounded-xl border shadow-2xl flex flex-col"
               style={{ backgroundColor: themeStyles.cardBg, borderColor: themeStyles.border, color: themeStyles.text }}>

            <div className="flex items-center justify-between p-4 border-b" style={{ borderColor: themeStyles.border }}>
              <div className="flex items-center gap-2">
                <Sparkles size={18} className="text-link" />
                <h3 className="font-bold text-sm">Analyze Story (AI)</h3>
              </div>
              <button
                onClick={() => setIsStoryAnalyzerOpen(false)}
                className="p-1 hover:bg-black/10 rounded transition"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-4 flex-1 overflow-auto flex flex-col gap-4">
              <p className="text-xs opacity-70">
                Paste your story text here, or upload a .txt file. The AI will dissect it to identify entities (characters, locations, etc.) and their relationships, automatically generating connected cards on your canvas.
              </p>

              <div className="flex gap-2">
                <input
                  type="file"
                  accept=".txt"
                  className="hidden"
                  id="story-txt-upload"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      const reader = new FileReader();
                      reader.onload = (re) => {
                        setStoryAnalyzerText(re.target?.result as string);
                      };
                      reader.readAsText(file);
                    }
                  }}
                />
                <button
                  onClick={() => document.getElementById("story-txt-upload")?.click()}
                  className="px-3 py-1.5 text-xs font-medium rounded border hover:bg-black/5 transition flex items-center gap-2"
                  style={{ borderColor: themeStyles.border }}
                >
                  <FileText size={14} />
                  Upload .txt
                </button>
              </div>

              <textarea
                value={storyAnalyzerText}
                onChange={(e) => setStoryAnalyzerText(e.target.value)}
                placeholder="Once upon a time in the kingdom of..."
                className="w-full h-64 p-3 text-sm rounded border resize-none focus:outline-none focus:ring-1 focus:ring-link bg-transparent"
                style={{ borderColor: themeStyles.border }}
                disabled={storyAnalyzerIsAnalyzing}
              />
            </div>

            <div className="p-4 border-t flex justify-end gap-2" style={{ borderColor: themeStyles.border }}>
              <button
                onClick={() => setIsStoryAnalyzerOpen(false)}
                className="px-4 py-2 text-xs font-medium rounded hover:bg-black/5 transition"
                disabled={storyAnalyzerIsAnalyzing}
              >
                Cancel
              </button>
              <button
                onClick={() => analyzeStoryWithOllama(storyAnalyzerText)}
                disabled={!storyAnalyzerText.trim() || storyAnalyzerIsAnalyzing}
                className="px-4 py-2 text-xs font-medium rounded bg-link text-white hover:bg-blue-600 transition flex items-center gap-2 disabled:opacity-50"
              >
                {storyAnalyzerIsAnalyzing ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Analyzing...
                  </>
                ) : (
                  <>
                    <Sparkles size={14} />
                    Analyze & Generate
                  </>
                )}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

    </div>
  );
}


