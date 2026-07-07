const fs = require('fs');
const file = 'world-building/src/app/world-canvas-renderer.tsx';
let content = fs.readFileSync(file, 'utf8');

// Use the newly parsed actual markdown blocks to render medium zoom instead of regex hacking text
const oldMediumZoomDesc = /<p style=\{\{ fontSize: \`\$\{11 \* globalFontScale\}px\` \}\} className="text-neutral-400 mt-2 line-clamp-3">\n\s*\{card\.text \? card\.text\.replace\(\/\[#\\\-\*`\]\/g, ""\)\.slice\(0, 120\) : "No description\."\}\n\s*<\/p>/;
const newMediumZoomDesc = `<div style={{ fontSize: \`\${11 * globalFontScale}px\` }} className="text-neutral-400 mt-2 line-clamp-3 overflow-hidden">
                        {card.text ? renderMarkdown(card.text.slice(0, 300)) : "No description."}
                      </div>`;

content = content.replace(oldMediumZoomDesc, newMediumZoomDesc);

// The user mentioned splines are slow. Let's look at getBezierPath and consider wrapping connection lines with React.memo or optimizing rendering.
// A simple optimization is simplifying the connection lines SVG path component rendering or minimizing updates. For now, let's fix the medium zoom Markdown.

fs.writeFileSync(file, content);
