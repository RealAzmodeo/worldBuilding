import * as React from "react";
import { User, MapPin, Shield, Zap, Folder, BookOpen } from "lucide-react";

export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function getCategoryIcon(type: string, size = 16) {
  switch (type) {
    case "character":
      return <User size={size} />;
    case "location":
      return <MapPin size={size} />;
    case "faction":
      return <Shield size={size} />;
    case "magic_spell":
      return <Zap size={size} />;
    case "group":
      return <Folder size={size} />;
    default:
      return <BookOpen size={size} />;
  }
}

export function getCategoryColor(type: string): string {
  switch (type) {
    case "character": return "#ec4899"; // pink
    case "location": return "#10b981";  // green
    case "faction": return "#f59e0b";   // orange/gold
    case "magic_spell": return "#8b5cf6"; // purple
    case "group": return "#737373";      // gray
    default: return "#3b82f6";          // blue (general)
  }
}

// Find closest connection side between two rectangles
export function getClosestConnectionSide(src: Rect, dst: Rect) {
  const srcCenter = { x: src.x + src.width / 2, y: src.y + src.height / 2 };
  const dstCenter = { x: dst.x + dst.width / 2, y: dst.y + dst.height / 2 };

  // Ports options
  const srcPorts = {
    top: { x: src.x + src.width / 2, y: src.y, side: "top" },
    bottom: { x: src.x + src.width / 2, y: src.y + src.height, side: "bottom" },
    left: { x: src.x, y: src.y + src.height / 2, side: "left" },
    right: { x: src.x + src.width, y: src.y + src.height / 2, side: "right" },
  };

  const dstPorts = {
    top: { x: dst.x + dst.width / 2, y: dst.y, side: "top" },
    bottom: { x: dst.x + dst.width / 2, y: dst.y + dst.height, side: "bottom" },
    left: { x: dst.x, y: dst.y + dst.height / 2, side: "left" },
    right: { x: dst.x + dst.width, y: dst.y + dst.height / 2, side: "right" },
  };

  let minDistance = Infinity;
  let bestSrcPort = srcPorts.right;
  let bestDstPort = dstPorts.left;

  for (const sKey of ["top", "bottom", "left", "right"] as const) {
    for (const dKey of ["top", "bottom", "left", "right"] as const) {
      const sp = srcPorts[sKey];
      const dp = dstPorts[dKey];
      const dist = Math.hypot(sp.x - dp.x, sp.y - dp.y);
      if (dist < minDistance) {
        minDistance = dist;
        bestSrcPort = sp;
        bestDstPort = dp;
      }
    }
  }

  return { from: bestSrcPort, to: bestDstPort };
}

// Generate bezier curve path
export function getBezierPath(x1: number, y1: number, side1: string, x2: number, y2: number, side2: string) {
  let cx1 = x1;
  let cy1 = y1;
  let cx2 = x2;
  let cy2 = y2;

  const offset = Math.min(100, Math.max(30, Math.abs(x1 - x2) / 2));

  if (side1 === "right") cx1 += offset;
  else if (side1 === "left") cx1 -= offset;
  else if (side1 === "bottom") cy1 += offset;
  else if (side1 === "top") cy1 -= offset;

  if (side2 === "right") cx2 += offset;
  else if (side2 === "left") cx2 -= offset;
  else if (side2 === "bottom") cy2 += offset;
  else if (side2 === "top") cy2 -= offset;

  return `M ${x1} ${y1} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${x2} ${y2}`;
}
