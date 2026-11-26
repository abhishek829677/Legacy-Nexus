import { useId, useRef, useState } from "react";
import { LuCheck, LuChevronDown } from "react-icons/lu";

/**
 * A text input with a dropdown of suggestions that the user can pick from or ignore and type their own value.
 *
 * Unlike a native <datalist>, opening it shows every suggestion when the field holds one of them (or is
 * empty); typing something else filters the list. Keyboard: ↓/↑ to move, Enter to pick, Esc to close.
 */
export function ComboInput({ id, value, onChange, options, className = "input", placeholder }: {
  id: string; value: string; onChange: (v: string) => void; options: string[]; className?: string; placeholder?: string;
}) {
  const listId = useId();
  const input = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const picking = useRef(false); // focus returns to the field after a pick; that must not reopen the list
  // After picking, or opening the list with the arrow, the field keeps focus but the user is choosing, not
  // typing, so the blinking text cursor is hidden until they click into the text or type.
  const [hideCaret, setHideCaret] = useState(false);

  const q = value.trim().toLowerCase();
  const showAll = !q || options.some((o) => o.toLowerCase() === q);
  const shown = showAll ? options : options.filter((o) => o.toLowerCase().includes(q));
  const visible = open && shown.length > 0;

  const openList = () => {
    setOpen(true);
    setActive(Math.max(0, shown.indexOf(value)));
  };
  const pick = (v: string) => {
    onChange(v);
    setOpen(false);
    setHideCaret(true);
    picking.current = true;
    input.current?.focus();
    picking.current = false;
  };
  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!["ArrowDown", "ArrowUp", "Enter", "Escape", "Tab", "Shift"].includes(e.key)) setHideCaret(false); // editing
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!visible) return openList();
      const step = e.key === "ArrowDown" ? 1 : -1;
      setActive((i) => (i + step + shown.length) % shown.length);
    } else if (e.key === "Enter" && visible && active >= 0) {
      e.preventDefault();
      pick(shown[active]);
    } else if (e.key === "Escape" && visible) {
      e.preventDefault();
      e.stopPropagation(); // close the list, not the dialog around it
      setOpen(false);
    }
  };

  return (
    <div className="combo input-affix">
      <input ref={input} id={id} className={className} value={value} placeholder={placeholder} autoComplete="off"
        style={hideCaret ? { caretColor: "transparent" } : undefined}
        role="combobox" aria-expanded={visible} aria-controls={listId} aria-autocomplete="list"
        aria-activedescendant={visible && active >= 0 ? `${listId}-${active}` : undefined}
        onChange={(e) => { onChange(e.target.value); setOpen(true); setActive(0); setHideCaret(false); }}
        onFocus={() => !picking.current && openList()} onClick={() => { setHideCaret(false); if (!open) openList(); }} onBlur={() => { setOpen(false); setHideCaret(false); }} onKeyDown={onKeyDown} />
      <button type="button" className="affix" tabIndex={-1} aria-label="Show suggestions"
        onMouseDown={(e) => e.preventDefault()} onClick={() => { setHideCaret(true); if (visible) setOpen(false); else { input.current?.focus(); openList(); } }}>
        <LuChevronDown size={16} style={{ transform: visible ? "rotate(180deg)" : undefined, transition: "transform 0.15s" }} />
      </button>
      {visible && (
        <ul id={listId} role="listbox" className="combo-list">
          {shown.map((o, i) => (
            <li key={o} id={`${listId}-${i}`} role="option" aria-selected={o === value}
              className={`combo-opt ${i === active ? "active" : ""}`}
              onMouseDown={(e) => e.preventDefault()} onMouseEnter={() => setActive(i)} onClick={() => pick(o)}>
              <span>{o}</span>
              {o === value && <LuCheck size={14} aria-hidden="true" />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
