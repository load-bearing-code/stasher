import { BracesIcon, CheckIcon, XIcon } from "lucide-react";
import { useEffect, useLayoutEffect, useReducer, useRef, useState } from "react";
import {
  FORMATS,
  formatValue,
  matchToken,
  SAMPLE,
  splitTemplate,
  TOKEN_BY_KEY,
  TOKENS,
  type TokenKey,
} from "@/features/settings/storage/file-layout/tokens";

// Autocomplete either floats under a text segment the user is typing into
// ("text" mode) or under a chip the user clicked to re-format ("chip" mode).
type Autocomplete =
  | { mode: "text"; seg: number; query: string; caret: number; highlight: number }
  | { mode: "chip"; seg: number; highlight: number };

function filterTokens(query: string) {
  const q = query.toLowerCase();
  return TOKENS.filter(
    (token) => !q || token.key.includes(q) || token.label.toLowerCase().includes(q),
  );
}

export function TemplateBuilder({
  value,
  onChange,
}: {
  value: string;
  onChange: (template: string) => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  // A focus request to apply after the next render, since editing the
  // template rebuilds the segment inputs from scratch.
  const pendingFocus = useRef<{ seg: number; pos: number } | null>(null);
  const [ac, setAc] = useState<Autocomplete | null>(null);
  // Moving the caret across a chip boundary doesn't change the template, so a
  // bump is needed to re-run the focus effect.
  const [, bumpFocus] = useReducer((n: number) => n + 1, 0);

  const parts = splitTemplate(value);

  useLayoutEffect(() => {
    const focus = pendingFocus.current;
    if (!focus || !wrapRef.current) return;
    pendingFocus.current = null;
    const input = wrapRef.current.querySelector<HTMLInputElement>(`input[data-seg="${focus.seg}"]`);
    if (input) {
      input.focus();
      input.setSelectionRange(focus.pos, focus.pos);
    }
  });

  // Close the autocomplete when clicking outside the builder.
  useEffect(() => {
    if (!ac) return;
    const onPointerDown = (event: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) setAc(null);
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [ac]);

  function setPart(index: number, next: string, focus: { seg: number; pos: number } | null) {
    const updated = [...parts];
    updated[index] = next;
    pendingFocus.current = focus;
    onChange(updated.join(""));
  }

  function autocompleteFor(seg: number, input: HTMLInputElement): Autocomplete {
    const caret = input.selectionStart ?? input.value.length;
    const query = /[A-Za-z]*$/.exec(input.value.slice(0, caret))?.[0] ?? "";
    return { mode: "text", seg, query, caret, highlight: 0 };
  }

  // The token (and its current format) a chip-mode autocomplete is editing.
  const chipSeg = ac?.mode === "chip" ? ac.seg : -1;
  const chipToken = ac?.mode === "chip" ? matchToken(parts[ac.seg] ?? "") : null;
  const chipFormats = chipToken ? (FORMATS[TOKEN_BY_KEY[chipToken.key]?.kind ?? "text"] ?? []) : [];

  const query = ac?.mode === "text" ? ac.query : "";
  const tokenItems = ac ? filterTokens(query) : [];
  const acOpen = Boolean(ac) && (tokenItems.length > 0 || chipFormats.length > 0);

  function insertToken(key: TokenKey) {
    if (!ac) return;
    if (ac.mode === "chip") {
      setPart(ac.seg, `{${key}}`, { seg: ac.seg + 1, pos: 0 });
    } else {
      const text = parts[ac.seg];
      const inserted = `${text.slice(0, ac.caret - ac.query.length)}{${key}}${text.slice(ac.caret)}`;
      // Inserting a token splits one text segment into three, so the caret
      // lands on the new trailing text segment two indices along.
      setPart(ac.seg, inserted, { seg: ac.seg + 2, pos: 0 });
    }
    setAc(null);
  }

  function handleKeyDown(seg: number, event: React.KeyboardEvent<HTMLInputElement>) {
    if (ac && tokenItems.length && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
      event.preventDefault();
      const delta = event.key === "ArrowDown" ? 1 : -1;
      const highlight =
        (Math.min(ac.highlight, tokenItems.length - 1) + delta + tokenItems.length) %
        tokenItems.length;
      setAc({ ...ac, highlight });
      return;
    }
    if (ac && tokenItems.length && (event.key === "Enter" || event.key === "Tab")) {
      event.preventDefault();
      insertToken(tokenItems[Math.min(ac.highlight, tokenItems.length - 1)].key);
      return;
    }
    if (event.key === "Escape") {
      setAc(null);
      return;
    }
    const input = event.currentTarget;
    const atStart = input.selectionStart === 0 && input.selectionEnd === 0;
    const atEnd =
      input.selectionStart === input.value.length && input.selectionEnd === input.value.length;
    // Backspace at the start of a text segment removes the chip before it by
    // merging the text segments on either side.
    if (event.key === "Backspace" && atStart && seg > 0) {
      event.preventDefault();
      const pos = parts[seg - 2].length;
      const merged = [
        ...parts.slice(0, seg - 2),
        parts[seg - 2] + parts[seg],
        ...parts.slice(seg + 1),
      ];
      pendingFocus.current = { seg: seg - 2, pos };
      onChange(merged.join(""));
      setAc(null);
      return;
    }
    // Arrow across a chip boundary: hop to the neighbouring text segment so the
    // caret steps over a chip the way it would step over a character.
    if (event.key === "ArrowLeft" && atStart && seg > 0) {
      event.preventDefault();
      pendingFocus.current = { seg: seg - 2, pos: parts[seg - 2].length };
      setAc(null);
      bumpFocus();
      return;
    }
    if (event.key === "ArrowRight" && atEnd && seg < parts.length - 1) {
      event.preventDefault();
      pendingFocus.current = { seg: seg + 2, pos: 0 };
      setAc(null);
      bumpFocus();
    }
  }

  return (
    <div ref={wrapRef} className="relative flex flex-col gap-1.5">
      {/* The trailing text segment is flex-1, so clicks on the empty area land there. */}
      <div className="flex min-h-[30px] cursor-text flex-wrap items-center gap-x-0.5 gap-y-1 rounded-md border bg-black/30 px-2.5 py-1">
        <BracesIcon className="mr-1 size-3.5 shrink-0 text-muted-foreground" />
        {parts.map((part, seg) => {
          const token = matchToken(part);
          if (token) {
            const def = TOKEN_BY_KEY[token.key];
            const formatLabel =
              token.fmt &&
              (FORMATS[def?.kind ?? "text"] ?? []).find((option) => option.value === token.fmt)
                ?.label;
            const active = ac?.mode === "chip" && ac.seg === seg;
            return (
              <button
                // biome-ignore lint/suspicious/noArrayIndexKey: segment position is the identity
                key={`chip-${seg}`}
                type="button"
                onClick={() => setAc({ mode: "chip", seg, highlight: 0 })}
                className={`inline-flex h-5 items-center gap-1 whitespace-nowrap rounded-sm border bg-tint-soft py-0 pr-1 pl-1.5 text-[11px] font-medium text-tint-text ${
                  active ? "border-tint-text" : "border-tint-border"
                }`}
              >
                {(def?.label ?? token.key) + (formatLabel ? ` · ${formatLabel}` : "")}
                <XIcon
                  className="size-2.5 opacity-70 hover:opacity-100"
                  onClick={(event) => {
                    event.stopPropagation();
                    setPart(seg, "", { seg: seg - 1, pos: parts[seg - 1].length });
                    setAc(null);
                  }}
                />
              </button>
            );
          }
          const last = seg === parts.length - 1;
          return (
            <input
              // biome-ignore lint/suspicious/noArrayIndexKey: segment position is the identity
              key={`seg-${seg}`}
              data-seg={seg}
              value={part}
              style={{ width: last ? undefined : `${part.length + 0.5}ch` }}
              className={`min-w-[6px] bg-transparent p-0 font-mono text-xs text-foreground outline-none ${last ? "flex-1" : "flex-none"}`}
              onChange={(event) => {
                const next = [...parts];
                next[seg] = event.target.value;
                onChange(next.join(""));
                setAc(autocompleteFor(seg, event.target));
              }}
              onFocus={(event) => setAc(autocompleteFor(seg, event.currentTarget))}
              onKeyDown={(event) => handleKeyDown(seg, event)}
            />
          );
        })}
      </div>

      {acOpen && (
        <div className="glass-thick absolute top-full right-0 left-0 z-20 max-h-80 overflow-auto rounded-lg p-1">
          {chipFormats.length > 0 && chipToken && (
            <>
              <div className="px-2 pt-1 pb-1.5 text-[11px] text-muted-foreground">Format</div>
              {chipFormats.map((option) => {
                const isActive = option.value === chipToken.fmt;
                return (
                  <button
                    key={option.value || "default"}
                    type="button"
                    className="flex w-full items-center gap-2.5 rounded-sm px-2 py-1 text-left hover:bg-accent"
                    onMouseDown={(event) => {
                      event.preventDefault();
                      const suffix = option.value ? `|${option.value}` : "";
                      setPart(chipSeg, `{${chipToken.key}${suffix}}`, null);
                      setAc(null);
                    }}
                  >
                    <CheckIcon
                      className="size-3 text-tint-text"
                      style={{ opacity: isActive ? 1 : 0 }}
                    />
                    <span
                      className={`flex-1 text-xs font-medium ${isActive ? "text-tint-text" : ""}`}
                    >
                      {option.label}
                    </span>
                    <span className="whitespace-nowrap font-mono text-[11px] text-muted-foreground">
                      {formatValue(SAMPLE[chipToken.key as TokenKey], option.value)}
                    </span>
                  </button>
                );
              })}
              <div className="my-1 h-px bg-border" />
            </>
          )}
          <div className="px-2 pt-1 pb-1.5 text-[11px] text-muted-foreground">
            {ac?.mode === "chip" ? "Replace with" : query ? `Fields matching “${query}”` : "Fields"}
          </div>
          {tokenItems.map((token, index) => {
            const highlighted = index === Math.min(ac?.highlight ?? 0, tokenItems.length - 1);
            return (
              <button
                key={token.key}
                type="button"
                className={`flex w-full items-center gap-2.5 rounded-sm px-2 py-1 text-left ${highlighted ? "bg-primary text-white" : ""}`}
                onMouseDown={(event) => {
                  event.preventDefault();
                  insertToken(token.key);
                }}
                onMouseEnter={() =>
                  setAc((current) => (current ? { ...current, highlight: index } : current))
                }
              >
                <span className="w-20 flex-none text-xs font-medium">{token.label}</span>
                <span
                  className={`min-w-0 flex-1 truncate text-xs ${highlighted ? "text-white/75" : "text-muted-foreground"}`}
                >
                  {token.description}
                </span>
                <span
                  className={`whitespace-nowrap font-mono text-[11px] ${highlighted ? "text-white/75" : "text-muted-foreground"}`}
                >
                  {SAMPLE[token.key]}
                </span>
              </button>
            );
          })}
        </div>
      )}

      <span className="px-0.5 text-[11px] text-muted-foreground">
        Type to add a field · ↑↓ choose · ↩ insert · ⌫ removes the field before the cursor
      </span>
    </div>
  );
}
