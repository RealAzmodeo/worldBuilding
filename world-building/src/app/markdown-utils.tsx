import * as React from "react";

export interface Block {
  id: string;
  type: "heading1" | "heading2" | "heading3" | "list-item" | "table" | "image" | "embed" | "paragraph" | "todo" | "callout" | "divider" | "numbered-list" | "code" | "video" | "toggle";
  content?: string;
  headers?: string[];
  rows?: string[][];
  url?: string;
  caption?: string;
  checked?: boolean; // For todo checkboxes
  emoji?: string;    // For callouts
  index?: number;    // For numbered lists
  language?: string; // For code blocks
  level?: number;    // For indentation levels
  isCollapsed?: boolean; // For toggles
}

export const generateBlockId = () => Math.random().toString(36).substring(2, 9);

export function parseTextToBlocks(text: string): Block[] {
  const lines = (text || "").split("\n");
  const blocks: Block[] = [];
  
  let i = 0;
  let blockIndex = 0;
  while (i < lines.length) {
    const line = lines[i];
    const blockId = `block_${blockIndex++}`;
    
    // Calculate indentation level (4 spaces = 1 level)
    const leadingSpaces = line.match(/^(\s*)/)?.[0].length || 0;
    const level = Math.floor(leadingSpaces / 4);
    const cleanLine = line.trim();
    
    if (!cleanLine) {
      i++;
      continue;
    }
    
    // Helper to check for collapsed marker
    const checkCollapsed = (text) => {
      const match = text.match(/(.*?)\s*<!--c-->$/);
      if (match) return { text: match[1], isCollapsed: true };
      return { text, isCollapsed: false };
    };

    // Parse Headings
    if (cleanLine.startsWith("# ")) {
      const { text, isCollapsed } = checkCollapsed(cleanLine.slice(2));
      blocks.push({ id: blockId, type: "heading1", content: text, level, isCollapsed });
      i++;
      continue;
    }
    if (cleanLine.startsWith("## ")) {
      const { text, isCollapsed } = checkCollapsed(cleanLine.slice(3));
      blocks.push({ id: blockId, type: "heading2", content: text, level, isCollapsed });
      i++;
      continue;
    }
    if (cleanLine.startsWith("### ")) {
      const { text, isCollapsed } = checkCollapsed(cleanLine.slice(4));
      blocks.push({ id: blockId, type: "heading3", content: text, level, isCollapsed });
      i++;
      continue;
    }
    
    // Parse Toggle List item (- >> Title or * >> Title)
    if (cleanLine.startsWith("- >> ") || cleanLine.startsWith("* >> ")) {
      const { text, isCollapsed } = checkCollapsed(cleanLine.slice(5));
      blocks.push({ id: blockId, type: "toggle", content: text, level, isCollapsed });
      i++;
      continue;
    }
    
    // Parse Todo list (Checkbox)
    if (cleanLine.startsWith("- [ ] ") || cleanLine.startsWith("* [ ] ") || cleanLine.startsWith("[ ] ") || cleanLine.startsWith("[] ")) {
      const sliceLen = cleanLine.startsWith("- [ ] ") || cleanLine.startsWith("* [ ] ") ? 6 : (cleanLine.startsWith("[] ") ? 3 : 4);
      blocks.push({ id: blockId, type: "todo", content: cleanLine.slice(sliceLen), checked: false, level });
      i++;
      continue;
    }
    if (cleanLine.startsWith("- [x] ") || cleanLine.startsWith("* [x] ") || cleanLine.startsWith("[x] ")) {
      const sliceLen = cleanLine.startsWith("- [x] ") || cleanLine.startsWith("* [x] ") ? 6 : 4;
      blocks.push({ id: blockId, type: "todo", content: cleanLine.slice(sliceLen), checked: true, level });
      i++;
      continue;
    }
    
    // Parse Bullet List Items
    if (cleanLine.startsWith("- ") || cleanLine.startsWith("* ")) {
      blocks.push({ id: blockId, type: "list-item", content: cleanLine.slice(2), level });
      i++;
      continue;
    }
    
    // Parse Numbered List Items
    const numMatch = cleanLine.match(/^(\d+)\.\s(.*)$/);
    if (numMatch) {
      blocks.push({ id: blockId, type: "numbered-list", content: numMatch[2], index: parseInt(numMatch[1]), level });
      i++;
      continue;
    }
    
    // Parse Image
    const imgMatch = cleanLine.match(/^!\[(.*?)\]\((.*?)\)$/);
    if (imgMatch) {
      blocks.push({ id: blockId, type: "image", caption: imgMatch[1], url: imgMatch[2], level });
      i++;
      continue;
    }
    
    // Parse Video
    const videoMatch = cleanLine.match(/^!video\[(.*?)\]\((.*?)\)$/);
    if (videoMatch) {
      blocks.push({ id: blockId, type: "video", caption: videoMatch[1], url: videoMatch[2], level });
      i++;
      continue;
    }
    
    // Parse Embed (iframe)
    const iframeMatch = cleanLine.match(/<iframe\s+src=["'](.*?)["']/);
    if (iframeMatch) {
      blocks.push({ id: blockId, type: "embed", url: iframeMatch[1], level });
      i++;
      continue;
    }
    
    // Parse Divider
    if (cleanLine === "---" || cleanLine === "***" || cleanLine === "___") {
      blocks.push({ id: blockId, type: "divider", level });
      i++;
      continue;
    }
    
    // Parse Callout
    if (cleanLine.startsWith("> ")) {
      let content = cleanLine.slice(2);
      let emoji = "💡";
      // Match emoji at the beginning of the callout
      const emojiMatch = content.match(/^([\p{Emoji}\u200d\uFE0F])\s*(.*)$/u);
      if (emojiMatch) {
        emoji = emojiMatch[1];
        content = emojiMatch[2];
      }
      blocks.push({ id: blockId, type: "callout", content, emoji, level });
      i++;
      continue;
    }
    
    // Parse Code Block
    if (cleanLine.startsWith("```")) {
      const lang = cleanLine.slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith("```")) {
        const rawLine = lines[i];
        const indentedCode = rawLine.startsWith(" ".repeat(level * 4)) ? rawLine.slice(level * 4) : rawLine;
        codeLines.push(indentedCode);
        i++;
      }
      if (i < lines.length) i++; // skip closing ```
      blocks.push({ id: blockId, type: "code", content: codeLines.join("\n"), language: lang, level });
      continue;
    }
    
    // Parse Tables
    if (cleanLine.startsWith("|")) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        tableLines.push(lines[i].trim());
        i++;
      }
      
      if (tableLines.length > 0) {
        const headerRow = tableLines[0]
          .split("|")
          .map(c => c.trim())
          .filter((_, idx, arr) => idx > 0 && idx < arr.length - 1);
          
        const bodyLines = tableLines.slice(2);
        const rows = bodyLines
          .map(rowLine => 
            rowLine
              .split("|")
              .map(c => c.trim())
              .filter((_, idx, arr) => idx > 0 && idx < arr.length - 1)
          )
          .filter(row => row.length > 0 && !row.every(c => c.includes("---")));
          
        blocks.push({ id: blockId, type: "table", headers: headerRow, rows: rows, level });
      }
      continue;
    }
    
    // Default: Paragraph
    blocks.push({ id: blockId, type: "paragraph", content: cleanLine, level });
    i++;
  }
  
  return blocks.length > 0 ? blocks : [{ id: `block_0`, type: "paragraph", content: "", level: 0 }];
}

export function serializeBlocksToText(blocks: Block[]): string {
  const serializeSingleBlock = (block: Block): string => {
    const indent = " ".repeat((block.level || 0) * 4);
    const collapsedSuffix = block.isCollapsed ? " <!--c-->" : "";
    if (block.type === "heading1") return `${indent}# ${block.content || ""}${collapsedSuffix}`;
    if (block.type === "heading2") return `${indent}## ${block.content || ""}${collapsedSuffix}`;
    if (block.type === "heading3") return `${indent}### ${block.content || ""}${collapsedSuffix}`;
    if (block.type === "toggle") return `${indent}- >> ${block.content || ""}${collapsedSuffix}`;
    if (block.type === "todo") return `${indent}- [${block.checked ? "x" : " "}] ${block.content || ""}`;
    if (block.type === "list-item") return `${indent}- ${block.content || ""}`;
    if (block.type === "numbered-list") return `${indent}${block.index || 1}. ${block.content || ""}`;
    if (block.type === "image") return `${indent}![${block.caption || ""}](${block.url || ""})`;
    if (block.type === "video") return `${indent}!video[${block.caption || ""}](${block.url || ""})`;
    if (block.type === "embed") return `${indent}<iframe src="${block.url || ""}" className="w-full h-40 rounded" />`;
    if (block.type === "divider") return `${indent}---`;
    if (block.type === "callout") return `${indent}> ${block.emoji || "💡"} ${block.content || ""}`;
    if (block.type === "code") {
      const codeLines = (block.content || "").split("\n").map(line => `${indent}${line}`).join("\n");
      return `${indent}\`\`\`${block.language || ""}\n${codeLines}\n${indent}\`\`\``;
    }
    if (block.type === "table") {
      const headers = block.headers || ["Col 1", "Col 2"];
      const rows = block.rows || [["Cell 1", "Cell 2"]];
      const headerStr = `${indent}| ${headers.join(" | ")} |`;
      const sepStr = `${indent}| ${headers.map(() => "---").join(" | ")} |`;
      const rowsStr = rows.map((row: any) => `${indent}| ${row.join(" | ")} |`).join("\n");
      return `${headerStr}\n${sepStr}\n${rowsStr}`;
    }
    return `${indent}${block.content || ""}`;
  };

  let text = "";
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    const blockText = serializeSingleBlock(block);
    if (i > 0) {
      const prev = blocks[i - 1];
      const isList = (type: string) => type === "list-item" || type === "todo" || type === "numbered-list" || type === "toggle";
      if (isList(prev.type) && isList(block.type)) {
        text += "\n" + blockText;
      } else {
        text += "\n\n" + blockText;
      }
    } else {
      text += blockText;
    }
  }
  return text;
}

export function formatInlineMarkdown(text: string): string {
  let formatted = text;

  // 1. Images: ![alt](url)
  formatted = formatted.replace(
    /!\[(.*?)\]\((.*?)\)/g,
    '<img src="$2" alt="$1" class="max-w-full h-auto rounded border border-neutral-800 my-1 inline-block" />'
  );

  // 2. Links: [label](url)
  formatted = formatted.replace(
    /\[(.*?)\]\((.*?)\)/g,
    '<a href="$2" target="_blank" class="text-link hover:underline">$1</a>'
  );

  // 3. Bold: **text**
  formatted = formatted.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");

  // 4. Italic: *text*
  formatted = formatted.replace(/\*(.*?)\*/g, "<em>$1</em>");

  return formatted || "&nbsp;";
}

export function renderMarkdown(text: string): React.ReactNode[] {
  if (!text) return [];
  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];
  let currentList: React.ReactNode[] = [];
  let currentTableRows: React.ReactNode[][] = [];

  const flushList = (key: string | number) => {
    if (currentList.length > 0) {
      elements.push(
        <ul key={`ul-${key}`} className="list-disc pl-5 mb-2 text-xs space-y-1 text-neutral-350">
          {currentList}
        </ul>
      );
      currentList = [];
    }
  };

  const flushTable = (key: string | number) => {
    if (currentTableRows.length > 0) {
      const hasHeaders = currentTableRows.length > 1 && currentTableRows[1].every((cell: any) => typeof cell === "string" && cell.includes("---"));
      const headerRow = hasHeaders ? currentTableRows[0] : null;
      const bodyRows = hasHeaders ? currentTableRows.slice(2) : currentTableRows;

      elements.push(
        <div key={`table-wrapper-${key}`} className="overflow-x-auto my-2 border border-neutral-800 rounded">
          <table className="w-full text-left text-[11px] border-collapse">
            {headerRow && (
              <thead>
                <tr className="bg-neutral-900 border-b border-neutral-850">
                  {headerRow.map((cell, cidx) => (
                    <th key={cidx} className="p-1.5 font-bold text-neutral-200">{cell}</th>
                  ))}
                </tr>
              </thead>
            )}
            <tbody>
              {bodyRows.map((row, ridx) => (
                <tr key={ridx} className="border-b border-neutral-850 hover:bg-neutral-850/20">
                  {row.map((cell, cidx) => (
                    <td key={cidx} className="p-1.5 text-neutral-300">{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      currentTableRows = [];
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Handle lists
    if (line.startsWith("- ") || line.startsWith("* ")) {
      flushTable(i);
      const itemText = line.slice(2);
      const html = formatInlineMarkdown(itemText);
      currentList.push(
        <li key={`li-${i}`} dangerouslySetInnerHTML={{ __html: html }} className="text-neutral-300" />
      );
      continue;
    } else {
      flushList(i);
    }

    // Handle tables
    if (line.startsWith("|")) {
      const cells = line.split("|").map(c => c.trim()).filter((c, idx, arr) => idx > 0 && idx < arr.length - 1);
      currentTableRows.push(cells);
      continue;
    } else {
      flushTable(i);
    }

    // Handle raw embeds (iframes and videos)
    if (line.startsWith("<iframe") || line.startsWith("<video")) {
      elements.push(
        <div
          key={i}
          className="my-2 rounded overflow-hidden border border-neutral-800 pointer-events-auto"
          dangerouslySetInnerHTML={{ __html: line }}
        />
      );
      continue;
    }

    // Headings
    if (line.startsWith("# ")) {
      elements.push(
        <h1 key={i} className="text-sm font-bold border-b border-neutral-800 pb-1 mb-2 mt-2 text-neutral-100">
          {line.slice(2)}
        </h1>
      );
    } else if (line.startsWith("## ")) {
      elements.push(
        <h2 key={i} className="text-xs font-bold mt-3 mb-1 text-neutral-200">
          {line.slice(3)}
        </h2>
      );
    } else if (line.startsWith("### ")) {
      elements.push(
        <h3 key={i} className="text-[11px] font-bold mt-2 mb-1 text-neutral-350">
          {line.slice(4)}
        </h3>
      );
    } else if (line) {
      // Regular paragraph
      const html = formatInlineMarkdown(line);
      elements.push(
        <p
          key={i}
          className="text-xs text-neutral-300 my-1 min-h-[1em]"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      );
    } else {
      // Empty line
      elements.push(<div key={i} className="h-2" />);
    }
  }

  // Flush remaining buffers
  flushList("end");
  flushTable("end");

  return elements;
}
