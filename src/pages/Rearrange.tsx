import { useState, useEffect } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  rectSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, RotateCw, RotateCcw, Trash2, FileOutput, Eye } from "lucide-react";
import { usePdfThumbnails } from "../components/PageThumbnailGrid";
import Layout from "../components/Layout";
import FileDropZone from "../components/FileDropZone";
import ProcessButton from "../components/ProcessButton";
import { organisePdf } from "../api/client";
import { downloadBlob } from "../lib/utils";
import { cn } from "../lib/utils";
import { useTabContext } from "../lib/tabs";

/** A page in the working plan: original (1-indexed) source page + added rotation. */
interface PageItem { id: string; src: number; rotate: number }

function SortablePage({
  item, index, thumb, selected, onSelect,
}: {
  item: PageItem;
  index: number;
  thumb?: string;
  selected: boolean;
  onSelect: (id: string, shift: boolean) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      onClick={(e) => onSelect(item.id, e.shiftKey)}
      className={cn(
        "relative flex flex-col items-center gap-1 rounded-lg p-1 bg-white app-dark:bg-stone-900 cursor-pointer select-none transition",
        isDragging ? "opacity-50 scale-105 shadow-lg z-10" : "",
        selected ? "ring-2 ring-brand-500 bg-amber-50/40 app-dark:bg-brand-950/40" : "border border-stone-200 hover:border-stone-300 app-dark:border-stone-800 app-dark:hover:border-stone-700",
      )}
    >
      {/* Drag handle */}
      <button
        {...attributes}
        {...listeners}
        onClick={(e) => e.stopPropagation()}
        aria-label={`Reorder page ${item.src}`}
        className="absolute top-1 left-1 z-10 rounded bg-white/85 app-dark:bg-stone-800/85 text-stone-400 hover:text-stone-600 app-dark:text-stone-500 app-dark:hover:text-stone-300 cursor-grab active:cursor-grabbing touch-none p-0.5 shadow-sm"
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>

      {/* Selection tick */}
      {selected && (
        <span className="absolute top-1 right-1 z-10 h-4 w-4 rounded-full bg-brand-500 text-white text-[9px] font-bold flex items-center justify-center shadow">✓</span>
      )}

      {thumb ? (
        <img
          src={thumb}
          alt={`Page ${item.src}`}
          style={{ transform: item.rotate ? `rotate(${item.rotate}deg)` : undefined }}
          className="w-full rounded shadow-sm transition-transform"
        />
      ) : (
        <div className="w-full aspect-[3/4] bg-stone-100 rounded animate-pulse" />
      )}

      <span className="text-[10px] text-stone-500 app-dark:text-stone-400">
        {index + 1}
        {item.src !== index + 1 && <span className="text-stone-400 app-dark:text-stone-500"> · p.{item.src}</span>}
        {item.rotate !== 0 && <span className="text-brand-600"> · {item.rotate}°</span>}
      </span>
    </div>
  );
}

interface RearrangeProps {
  initialFile?: File;
}

export default function Rearrange({ initialFile }: RearrangeProps = {}) {
  const { openTab } = useTabContext();
  const [file, setFile] = useState<File | null>(initialFile ?? null);
  const [plan, setPlan] = useState<PageItem[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [lastClicked, setLastClicked] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [openingViewer, setOpeningViewer] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { thumbnails, pageCount } = usePdfThumbnails(file);
  const sensors = useSensors(
    // Small activation distance so a click selects but a press-drag reorders.
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // (Re)initialise the plan when a new document loads.
  useEffect(() => {
    if (pageCount > 0) {
      setPlan(Array.from({ length: pageCount }, (_, i) => ({ id: `p${i + 1}`, src: i + 1, rotate: 0 })));
      setSelected(new Set());
      setLastClicked(null);
    }
  }, [pageCount]);

  const dirty = plan.length !== pageCount || plan.some((it, i) => it.src !== i + 1 || it.rotate !== 0);
  const planPayload = plan.map(({ src, rotate }) => ({ src, rotate }));

  function selectPage(id: string, shift: boolean) {
    setSelected(prev => {
      const next = new Set(prev);
      if (shift && lastClicked) {
        const a = plan.findIndex(p => p.id === lastClicked);
        const b = plan.findIndex(p => p.id === id);
        if (a >= 0 && b >= 0) {
          for (let i = Math.min(a, b); i <= Math.max(a, b); i++) next.add(plan[i].id);
          return next;
        }
      }
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
    setLastClicked(id);
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setPlan(items => {
        const oldIdx = items.findIndex(t => t.id === active.id);
        const newIdx = items.findIndex(t => t.id === String(over.id));
        return arrayMove(items, oldIdx, newIdx);
      });
    }
  }

  function rotateSelected(dir: 1 | -1) {
    if (selected.size === 0) return;
    setPlan(items => items.map(it =>
      selected.has(it.id) ? { ...it, rotate: (((it.rotate + dir * 90) % 360) + 360) % 360 } : it,
    ));
  }

  function deleteSelected() {
    if (selected.size === 0) return;
    setPlan(items => items.filter(it => !selected.has(it.id)));
    setSelected(new Set());
    setLastClicked(null);
  }

  function selectAll()  { setSelected(new Set(plan.map(p => p.id))); }
  function clearSel()   { setSelected(new Set()); }

  async function runOrganise(): Promise<Blob | null> {
    if (!file || plan.length === 0) return null;
    const blob = await organisePdf(file, planPayload);
    return blob;
  }

  async function handleApply() {
    if (!file) return;
    setLoading(true); setError(null);
    try {
      const blob = await runOrganise();
      if (blob) downloadBlob(blob, `organised_${file.name}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Operation failed. Check that the PDF is valid.");
    } finally { setLoading(false); }
  }

  async function handleOpenInViewer() {
    if (!file) return;
    setOpeningViewer(true); setError(null);
    try {
      const blob = await runOrganise();
      if (blob) {
        const name = `organised_${file.name}`;
        openTab("viewer", { file: new File([blob], name, { type: "application/pdf" }), title: name });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Operation failed. Check that the PDF is valid.");
    } finally { setOpeningViewer(false); }
  }

  async function handleExtract() {
    if (!file || selected.size === 0) return;
    setLoading(true); setError(null);
    try {
      const pick = plan.filter(p => selected.has(p.id)).map(({ src, rotate }) => ({ src, rotate }));
      const blob = await organisePdf(file, pick);
      downloadBlob(blob, `extracted_${file.name}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Extract failed.");
    } finally { setLoading(false); }
  }

  const hasSel = selected.size > 0;

  return (
    <Layout title="Organise Pages" description="Reorder, rotate, delete, or extract pages">
      <div className="space-y-6">
        <FileDropZone
          files={file ? [file] : []}
          onFiles={([f]) => { setFile(f); setPlan([]); setSelected(new Set()); }}
          accept={{ "application/pdf": [".pdf"] }}
          hint="PDF files only"
        />

        {file && plan.length > 0 && (
          <>
            {/* Toolbar */}
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-stone-200 bg-white app-dark:border-stone-800 app-dark:bg-stone-900 px-3 py-2">
              <span className="text-[11px] text-stone-500 app-dark:text-stone-400">
                {selected.size > 0 ? `${selected.size} selected` : `${plan.length} page${plan.length !== 1 ? "s" : ""}`}
              </span>
              <div className="w-px h-5 bg-stone-200 app-dark:bg-stone-700" />
              <button onClick={() => rotateSelected(-1)} disabled={!hasSel}
                className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-stone-600 hover:bg-stone-100 app-dark:text-stone-300 app-dark:hover:bg-stone-800 disabled:opacity-40 transition" title="Rotate left">
                <RotateCcw className="h-3.5 w-3.5" /> Left
              </button>
              <button onClick={() => rotateSelected(1)} disabled={!hasSel}
                className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-stone-600 hover:bg-stone-100 app-dark:text-stone-300 app-dark:hover:bg-stone-800 disabled:opacity-40 transition" title="Rotate right">
                <RotateCw className="h-3.5 w-3.5" /> Right
              </button>
              <button onClick={deleteSelected} disabled={!hasSel}
                className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-red-500 hover:bg-red-50 app-dark:hover:bg-red-950/40 disabled:opacity-40 transition" title="Delete selected pages">
                <Trash2 className="h-3.5 w-3.5" /> Delete
              </button>
              <button onClick={handleExtract} disabled={!hasSel || loading}
                className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-stone-600 hover:bg-stone-100 app-dark:text-stone-300 app-dark:hover:bg-stone-800 disabled:opacity-40 transition" title="Extract selected pages to a new PDF">
                <FileOutput className="h-3.5 w-3.5" /> Extract
              </button>
              <div className="ml-auto flex items-center gap-1.5">
                {hasSel
                  ? <button onClick={clearSel} className="text-[11px] text-stone-400 hover:text-stone-600 app-dark:hover:text-stone-200 transition">Clear</button>
                  : <button onClick={selectAll} className="text-[11px] text-stone-400 hover:text-stone-600 app-dark:hover:text-stone-200 transition">Select all</button>}
                {dirty && (
                  <button
                    onClick={() => setPlan(Array.from({ length: pageCount }, (_, i) => ({ id: `p${i + 1}`, src: i + 1, rotate: 0 })))}
                    className="text-[11px] text-brand-600 hover:text-brand-500 transition"
                  >
                    Reset
                  </button>
                )}
              </div>
            </div>

            <p className="text-[10px] text-stone-400 app-dark:text-stone-500 -mt-3">
              Click a page to select · Shift-click for a range · drag the grip to reorder · keyboard: Tab, Space to lift, arrows, Space to drop.
            </p>

            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={plan.map(p => p.id)} strategy={rectSortingStrategy}>
                <div className="grid grid-cols-[repeat(auto-fill,minmax(100px,1fr))] gap-3">
                  {plan.map((item, idx) => (
                    <SortablePage
                      key={item.id}
                      item={item}
                      index={idx}
                      thumb={thumbnails[item.src - 1]}
                      selected={selected.has(item.id)}
                      onSelect={selectPage}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          </>
        )}

        {error && (
          <p className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
            {error}
          </p>
        )}

        <div className="flex flex-col gap-2">
          <ProcessButton
            onClick={handleApply}
            loading={loading}
            disabled={!file || plan.length === 0 || !dirty}
            label={!dirty ? "Make a change to enable save" : "Save organised PDF"}
          />
          {file && plan.length > 0 && dirty && (
            <button
              onClick={handleOpenInViewer}
              disabled={openingViewer}
              className="flex items-center justify-center gap-1.5 text-xs text-brand-600 hover:text-brand-500 disabled:opacity-50 transition-colors"
            >
              {openingViewer ? "Opening…" : <><Eye className="h-3.5 w-3.5" /> Save &amp; open in viewer</>}
            </button>
          )}
        </div>
      </div>
    </Layout>
  );
}
