const fs = require('fs');

// 2. Fix world-canvas-renderer.tsx any type and missing arguments
let rendererContent = fs.readFileSync('world-building/src/app/world-canvas-renderer.tsx', 'utf8');

// Fix the array map type
rendererContent = rendererContent.replace(/\{card\.tags\.slice\(0, 3\)\.map\(\(t\) => \(/, '{card.tags.slice(0, 3).map((t: string) => (');
fs.writeFileSync('world-building/src/app/world-canvas-renderer.tsx', rendererContent);
