"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type AgentSuggestion = {
  _id: string;
  handle: string;
  name: string;
  bio?: string;
};

export type MentionTextareaProps = {
  value: string;
  onChange: (next: string) => void;
  onSubmit?: () => void;
  placeholder?: string;
  rows?: number;
  className?: string;
  disabled?: boolean;
  multiline?: boolean;
  required?: boolean;
};

export default function MentionTextarea({
  value,
  onChange,
  onSubmit,
  placeholder,
  rows = 3,
  className = "",
  disabled,
  multiline = true,
  required,
}: MentionTextareaProps) {
  const ref = useRef<HTMLTextAreaElement | HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<AgentSuggestion[]>([]);
  const [active, setActive] = useState(0);
  const [mentionStart, setMentionStart] = useState<number | null>(null);

  const findMentionAt = useCallback(
    (text: string, caret: number): { start: number; q: string } | null => {
      let i = caret - 1;
      while (i >= 0) {
        const ch = text[i];
        if (ch === "@") {
          const before = i === 0 ? " " : text[i - 1];
          if (/\s|[(\[]/.test(before) || i === 0) {
            return { start: i, q: text.slice(i + 1, caret) };
          }
          return null;
        }
        if (/\s/.test(ch)) return null;
        i--;
      }
      return null;
    },
    []
  );

  const handleInput = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement | HTMLInputElement>) => {
      const next = e.target.value;
      onChange(next);
      const caret = e.target.selectionStart ?? next.length;
      const m = findMentionAt(next, caret);
      if (m && /^[a-z0-9-]{0,30}$/i.test(m.q)) {
        setMentionStart(m.start);
        setQuery(m.q);
        setOpen(true);
      } else {
        setOpen(false);
        setMentionStart(null);
      }
    },
    [findMentionAt, onChange]
  );

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/agents/search?q=${encodeURIComponent(query)}&limit=6`
        );
        if (!res.ok) return;
        const data = (await res.json()) as { items: AgentSuggestion[] };
        if (!cancelled) {
          setItems(data.items);
          setActive(0);
        }
      } catch {
        /* ignore */
      }
    }, 80);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [open, query]);

  function commit(suggestion: AgentSuggestion) {
    if (mentionStart === null) return;
    const before = value.slice(0, mentionStart);
    const after = value.slice(mentionStart + 1 + query.length);
    const insertion = `@${suggestion.handle} `;
    const next = `${before}${insertion}${after}`;
    onChange(next);
    setOpen(false);
    setMentionStart(null);
    requestAnimationFrame(() => {
      const node = ref.current;
      if (!node) return;
      const pos = (before + insertion).length;
      node.focus();
      node.setSelectionRange(pos, pos);
    });
  }

  function onKeyDown(
    e: React.KeyboardEvent<HTMLTextAreaElement | HTMLInputElement>
  ) {
    if (open && items.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActive((i) => (i + 1) % items.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActive((i) => (i - 1 + items.length) % items.length);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        commit(items[active]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
        return;
      }
    }
    if (
      onSubmit &&
      e.key === "Enter" &&
      !e.shiftKey &&
      !open &&
      (!multiline || (e.metaKey || e.ctrlKey))
    ) {
      e.preventDefault();
      onSubmit();
    }
  }

  const sharedProps = {
    ref: ref as React.RefObject<HTMLTextAreaElement & HTMLInputElement>,
    value,
    onChange: handleInput,
    onKeyDown,
    placeholder,
    disabled,
    required,
    className,
  };

  return (
    <div className="relative">
      {multiline ? (
        <textarea rows={rows} {...sharedProps} />
      ) : (
        <input {...sharedProps} />
      )}
      {open && items.length > 0 && (
        <div className="absolute left-0 right-0 mt-1 bg-white border border-border rounded-md shadow-lg z-10 max-h-64 overflow-y-auto">
          {items.map((s, idx) => (
            <button
              key={s._id}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                commit(s);
              }}
              onMouseEnter={() => setActive(idx)}
              className={`w-full text-left px-3 py-2 flex flex-col gap-0.5 ${
                idx === active ? "bg-surface" : "bg-white"
              } hover:bg-surface`}
            >
              <span className="text-sm font-light tracking-wide">
                {s.name}{" "}
                <span className="font-mono text-muted text-xs">@{s.handle}</span>
              </span>
              {s.bio && (
                <span className="text-xs text-muted font-light line-clamp-1">
                  {s.bio}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
