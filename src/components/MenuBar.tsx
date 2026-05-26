import { useState, useRef, useEffect } from "react";
import { cn } from "../lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

export type MenuSeparator = { type: "separator" };

export interface MenuItem {
  label: string;
  shortcut?: string;
  action?: () => void;
  disabled?: boolean;
  checked?: boolean;
}

export type MenuEntry = MenuItem | MenuSeparator;

export interface MenuDef {
  label: string;
  items: MenuEntry[];
}

interface Props {
  menus: MenuDef[];
  className?: string;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function MenuBar({ menus, className }: Props) {
  const [open, setOpen] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function onOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(null);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(null);
    }

    document.addEventListener("mousedown", onOutside);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onOutside);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className={cn("flex items-center gap-0.5", className)}>
      {menus.map(menu => (
        <div key={menu.label} className="relative">

          {/* Trigger */}
          <button
            onClick={() => setOpen(prev => prev === menu.label ? null : menu.label)}
            className={cn(
              "px-2.5 py-1 rounded text-xs font-medium transition select-none",
              open === menu.label
                ? "bg-stone-700 text-white"
                : "text-stone-400 hover:text-white hover:bg-stone-700"
            )}
          >
            {menu.label}
          </button>

          {/* Dropdown */}
          {open === menu.label && (
            <div
              role="menu"
              className="absolute top-full left-0 mt-0.5 z-50 min-w-[210px] bg-stone-900 border border-stone-700 rounded-lg shadow-2xl py-1 overflow-hidden"
            >
              {menu.items.map((item, i) => {
                if ("type" in item && item.type === "separator") {
                  return <div key={i} className="my-1 border-t border-stone-700/60 mx-1" />;
                }

                const mi = item as MenuItem;
                return (
                  <button
                    key={i}
                    role="menuitem"
                    disabled={mi.disabled}
                    onClick={() => {
                      if (!mi.disabled && mi.action) {
                        mi.action();
                        setOpen(null);
                      }
                    }}
                    className={cn(
                      "w-full flex items-center justify-between gap-6 px-3 py-1.5 text-xs transition text-left",
                      mi.disabled
                        ? "text-stone-600 cursor-not-allowed"
                        : "text-stone-200 hover:bg-stone-700 hover:text-white cursor-pointer"
                    )}
                  >
                    {/* Label + optional checkmark */}
                    <span className="flex items-center gap-2 min-w-0">
                      {mi.checked !== undefined ? (
                        <span className="w-3 shrink-0 text-brand-400 text-[10px] font-bold">
                          {mi.checked ? "✓" : ""}
                        </span>
                      ) : null}
                      <span className="truncate">{mi.label}</span>
                    </span>

                    {/* Keyboard shortcut hint */}
                    {mi.shortcut && (
                      <kbd className="shrink-0 text-[10px] text-stone-500 font-mono tracking-tight">
                        {mi.shortcut}
                      </kbd>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
