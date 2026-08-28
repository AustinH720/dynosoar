import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Bold, Italic, List, ListOrdered, Heading2 } from "lucide-react";
import { cn } from "@/lib/utils";

// Strips anything that could execute script content while keeping the small
// set of formatting tags our toolbar produces (b/strong, i/em, h2, ul/ol/li,
// div, br, p). Good enough for a single-user notes app where the only author
// is the person reading it back.
function sanitizeHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const ALLOWED = new Set(["B", "STRONG", "I", "EM", "H2", "UL", "OL", "LI", "DIV", "BR", "P", "SPAN"]);
  const walk = (node: Element) => {
    Array.from(node.children).forEach((child) => {
      // Remove all attributes (drops onerror=, style=, etc.) then recurse.
      Array.from(child.attributes).forEach((attr) => child.removeAttribute(attr.name));
      if (!ALLOWED.has(child.tagName)) {
        // Unwrap disallowed tags (e.g. stray <script>) but keep their text.
        const parent = child.parentNode;
        if (parent) {
          while (child.firstChild) parent.insertBefore(child.firstChild, child);
          parent.removeChild(child);
        }
        return;
      }
      walk(child);
    });
  };
  walk(doc.body);
  return doc.body.innerHTML;
}

// Existing notes were saved as plain text before rich formatting existed. If
// the stored value has no HTML tags at all, treat newlines as paragraph
// breaks so old notes still read correctly inside the new editor.
export function plainTextToHtml(value: string): string {
  if (/<[a-z][\s\S]*>/i.test(value)) return value;
  const escaped = value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return escaped
    .split(/\n{2,}/)
    .map((para) => `<div>${para.replace(/\n/g, "<br>")}</div>`)
    .join("");
}

interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  testId?: string;
  className?: string;
  minHeight?: string;
}

export function RichTextEditor({
  value,
  onChange,
  placeholder,
  testId,
  className,
  minHeight = "40vh",
}: RichTextEditorProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const lastExternalValue = useRef<string>(value);
  const initializedRef = useRef(false);

  // Always populate the DOM on first mount (a fresh RichTextEditor instance
  // is created each time a note is opened), then only re-sync `value` into
  // the DOM when it changed for a reason other than our own onInput —
  // re-syncing on every keystroke would reset the caret position.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!initializedRef.current) {
      el.innerHTML = plainTextToHtml(value);
      initializedRef.current = true;
      lastExternalValue.current = value;
      return;
    }
    if (value !== lastExternalValue.current && value !== el.innerHTML) {
      el.innerHTML = plainTextToHtml(value);
    }
    lastExternalValue.current = value;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const emit = () => {
    const el = ref.current;
    if (!el) return;
    const clean = sanitizeHtml(el.innerHTML);
    lastExternalValue.current = clean;
    onChange(clean);
  };

  const exec = (command: string, arg?: string) => {
    ref.current?.focus();
    document.execCommand(command, false, arg);
    emit();
  };

  const toggleHeading = () => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    // Find the top-level block the caret is in (a direct child of the
    // editor). Chromium's `formatBlock` demote path is unreliable on an
    // empty heading line (it can leave later content trapped inside the
    // old <h2>), so demotion is done with a direct DOM swap instead;
    // promotion still uses execCommand since that direction works fine.
    const sel = window.getSelection();
    let node: Node | null = sel?.anchorNode ?? null;
    let block: HTMLElement | null = null;
    while (node && node !== el) {
      if (node instanceof HTMLElement && node.parentElement === el) {
        block = node;
        break;
      }
      node = node.parentNode;
    }
    if (block && block.tagName === "H2") {
      const div = document.createElement("div");
      div.innerHTML = block.innerHTML || "<br>";
      block.replaceWith(div);
      const range = document.createRange();
      range.selectNodeContents(div);
      range.collapse(false);
      sel?.removeAllRanges();
      sel?.addRange(range);
    } else {
      document.execCommand("formatBlock", false, "h2");
    }
    emit();
  };

  const isEmpty = !value || value === "<div><br></div>";

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <div className="flex items-center gap-0.5 border-b border-border pb-1.5 mb-1" data-testid={`toolbar-${testId ?? "richtext"}`}>
        <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onMouseDown={(e) => e.preventDefault()} onClick={() => exec("bold")} data-testid={`button-format-bold-${testId ?? ""}`} aria-label="Bold">
          <Bold className="h-3.5 w-3.5" />
        </Button>
        <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onMouseDown={(e) => e.preventDefault()} onClick={() => exec("italic")} data-testid={`button-format-italic-${testId ?? ""}`} aria-label="Italic">
          <Italic className="h-3.5 w-3.5" />
        </Button>
        <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onMouseDown={(e) => e.preventDefault()} onClick={toggleHeading} data-testid={`button-format-heading-${testId ?? ""}`} aria-label="Heading">
          <Heading2 className="h-3.5 w-3.5" />
        </Button>
        <div className="w-px h-4 bg-border mx-1" />
        <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onMouseDown={(e) => e.preventDefault()} onClick={() => exec("insertUnorderedList")} data-testid={`button-format-bullet-${testId ?? ""}`} aria-label="Bulleted list">
          <List className="h-3.5 w-3.5" />
        </Button>
        <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onMouseDown={(e) => e.preventDefault()} onClick={() => exec("insertOrderedList")} data-testid={`button-format-numbered-${testId ?? ""}`} aria-label="Numbered list">
          <ListOrdered className="h-3.5 w-3.5" />
        </Button>
      </div>
      <div className="relative flex-1">
        {isEmpty && placeholder && (
          <p className="absolute top-0 left-0 text-base text-muted-foreground pointer-events-none select-none">
            {placeholder}
          </p>
        )}
        <div
          ref={ref}
          contentEditable
          suppressContentEditableWarning
          onInput={emit}
          onBlur={emit}
          className={cn(
            "prose prose-sm dark:prose-invert max-w-none focus-visible:outline-none text-base leading-relaxed",
            "prose-headings:font-display prose-headings:font-semibold prose-h2:text-lg prose-h2:mt-0 prose-h2:mb-1.5",
            "prose-ul:my-1.5 prose-ol:my-1.5 prose-li:my-0.5 prose-p:my-1.5 prose-strong:text-foreground",
          )}
          style={{ minHeight }}
          data-testid={testId}
        />
      </div>
    </div>
  );
}
