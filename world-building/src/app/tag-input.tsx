import * as React from "react";

export function TagInput({ card, canvasData, onUpdateTags }: { card: any; canvasData: any; onUpdateTags: (tags: string[]) => void }) {
  const [inputValue, setInputValue] = React.useState("");
  const [showSuggestions, setShowSuggestions] = React.useState(false);

  // Collect all unique tags on the board
  const allUniqueTags = React.useMemo(() => {
    const tags = new Set<string>();
    canvasData.nodes.forEach((n: any) => {
      if (Array.isArray(n.tags)) {
        n.tags.forEach((t: string) => tags.add(t));
      }
    });
    return Array.from(tags);
  }, [canvasData]);

  // Suggestions that are NOT already on this card, matching search query
  const suggestions = React.useMemo(() => {
    const cardTags = card.tags || [];
    return allUniqueTags.filter(
      (t) => !cardTags.includes(t) && t.toLowerCase().includes(inputValue.toLowerCase())
    );
  }, [allUniqueTags, card.tags, inputValue]);

  const handleAddTag = (tag: string) => {
    const trimmed = tag.trim();
    if (!trimmed) return;
    const cardTags = card.tags || [];
    if (!cardTags.includes(trimmed)) {
      onUpdateTags([...cardTags, trimmed]);
    }
    setInputValue("");
    setShowSuggestions(false);
  };

  return (
    <div className="relative mt-1" onPointerDown={(e) => e.stopPropagation()}>
      <div className="flex gap-1">
        <input
          type="text"
          value={inputValue}
          onChange={(e) => {
            setInputValue(e.target.value);
            setShowSuggestions(true);
          }}
          onFocus={() => setShowSuggestions(true)}
          onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleAddTag(inputValue);
            }
          }}
          placeholder="New tag..."
          className="flex-1 bg-neutral-900 border border-neutral-800 rounded px-1.5 py-0.5 text-[10px] text-neutral-200 focus:outline-none focus:border-link"
        />
        <button
          onPointerDown={(e) => {
            e.preventDefault();
            handleAddTag(inputValue);
          }}
          className="px-2 py-0.5 bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-[10px] rounded text-neutral-350 font-bold"
        >
          + Add
        </button>
      </div>
      {showSuggestions && suggestions.length > 0 && (
        <div
          className="absolute bottom-full mb-1 left-0 right-0 max-h-24 overflow-y-auto overscroll-y-contain bg-neutral-900 border border-neutral-800 rounded shadow-xl z-30 pointer-events-auto"
          onWheel={(e) => e.stopPropagation()}
        >
          {suggestions.map((s) => (
            <button
              key={s}
              onPointerDown={(e) => {
                e.preventDefault();
                handleAddTag(s);
              }}
              className="w-full text-left px-2 py-1 text-[10px] text-neutral-350 hover:bg-neutral-800 hover:text-neutral-100 transition-colors"
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
