const fs = require('fs');
const file = 'world-building/src/app/markdown-utils.tsx';
let content = fs.readFileSync(file, 'utf8');

const regexOld = /if \\(line\\.startsWith\\("- \\\[ \\] "\\) \\|\\| line\\.startsWith\\("\\* \\\[ \\] "\\) \\|\\| line\\.startsWith\\("\\\[ \\] "\\)\\) \\{\\n\\s*flushTable\\(i\\);\\n\\s*const itemText = line\\.startsWith\\("- \\\[ \\] "\\) \\|\\| line\\.startsWith\\("\\* \\\[ \\] "\\) \\? line\\.slice\\(6\\) : line\\.slice\\(4\\);\\n\\s*const html = formatInlineMarkdown\\(itemText\\);\\n\\s*currentList\\.push\\(\\n\\s*<li key=\{\\\`li-\\$\\{i\\}\\\`\} className="flex items-start gap-2 text-neutral-300">\\n\\s*<input type="checkbox" disabled className="mt-1" \/>\\n\\s*<span dangerouslySetInnerHTML=\{\{ __html: html \}\} \/>\\n\\s*<\/li>\\n\\s*\\);\\n\\s*continue;\\n\\s*\\} else if \\(line\\.startsWith\\("- \\\[x\\] "\\) \\|\\| line\\.startsWith\\("\\* \\\[x\\] "\\) \\|\\| line\\.startsWith\\("\\\[x\\] "\\)\\) \\{\\n\\s*flushTable\\(i\\);\\n\\s*const itemText = line\\.startsWith\\("- \\\[x\\] "\\) \\|\\| line\\.startsWith\\("\\* \\\[x\\] "\\) \\? line\\.slice\\(6\\) : line\\.slice\\(4\\);\\n\\s*const html = formatInlineMarkdown\\(itemText\\);\\n\\s*currentList\\.push\\(\\n\\s*<li key=\{\\\`li-\\$\\{i\\}\\\`\} className="flex items-start gap-2 text-neutral-500 line-through">\\n\\s*<input type="checkbox" disabled checked className="mt-1" \/>\\n\\s*<span dangerouslySetInnerHTML=\{\{ __html: html \}\} \/>\\n\\s*<\/li>\\n\\s*\\);\\n\\s*continue;\\n\\s*\\} else if \\(line\\.startsWith\\("- "\\) \\|\\| line\\.startsWith\\("\\* "\\)\\) \\{/s;

// We need to use indexOf and slice to be safer.
const idx = content.indexOf('if (line.startsWith("- [ ] ") || line.startsWith("* [ ] ") || line.startsWith("[ ] ")) {');

const endIdx = content.indexOf('if (line.startsWith("- ") || line.startsWith("* ")) {', idx);

if (idx > -1 && endIdx > -1) {
  content = content.slice(0, idx) + `
    // Check if it matches a todo list format, but maybe without trailing spaces:
    const todoUncheckedMatch = line.match(/^(?:- |\\* )?\\[ \\](?: (.*))?$/);
    const todoCheckedMatch = line.match(/^(?:- |\\* )?\\[x\\](?: (.*))?$/i);

    if (todoUncheckedMatch) {
      flushTable(i);
      const itemText = todoUncheckedMatch[1] || "";
      const html = formatInlineMarkdown(itemText);
      currentList.push(
        <li key={\`li-\${i}\`} className="flex items-start gap-2 text-neutral-300 list-none -ml-4">
          <input type="checkbox" disabled className="mt-1 translate-y-[2px]" />
          <span dangerouslySetInnerHTML={{ __html: html }} />
        </li>
      );
      continue;
    } else if (todoCheckedMatch) {
      flushTable(i);
      const itemText = todoCheckedMatch[1] || "";
      const html = formatInlineMarkdown(itemText);
      currentList.push(
        <li key={\`li-\${i}\`} className="flex items-start gap-2 text-neutral-500 line-through list-none -ml-4">
          <input type="checkbox" disabled checked className="mt-1 translate-y-[2px]" />
          <span dangerouslySetInnerHTML={{ __html: html }} />
        </li>
      );
      continue;
    } else ` + content.slice(endIdx);
  fs.writeFileSync(file, content);
} else {
  console.log("Not found");
}
