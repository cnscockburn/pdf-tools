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
import { usePdfThumbnails } from "../components/PageThumbnailGrid";
import Layout from "../components/Layout";
import FileDropZone from "../components/FileDropZone";
import ProcessButton from "../components/ProcessButton";
import { reorderPages } from "../api/client";
import { downloadBlob } from "../lib/utils";
import { useTabContext } from "../lib/tabs";

function SortablePage({ id, thumb, label }: { id: string; thumb?: string; label: string }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      {...attributes}
      {...listeners}
      className={`flex flex-col items-center gap-1 rounded-lg p-1 bg-white cursor-grab active:cursor-grabbing select-none transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50 ${
        isDragging ? "border-2 border-brand-500 opacity-50 scale-105 shadow-lg" : "border border-stone-200 hover:border-stone-300"
      }`}
    >
      {thumb ? (
        <img src={thumb} alt={label} className="w-full rounded shadow-sm" />
      ) : (
        <div className="w-full aspect-[3/4] bg-stone-100 rounded animate-pulse" />
      )}
      <span className="text-[10px] text-stone-500">{label}</span>
    </div>
  );
}

interface RearrangeProps {
  initialFile?: File;
}

export default function Rearrange({ initialFile }: RearrangeProps = {}) {
  const { openTab } = useTabContext();
  const [file, setFile] = useState<File | null>(initialFile ?? null);
  const [order, setOrder] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);
  const [openingViewer, setOpeningViewer] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { thumbnails, pageCount } = usePdfThumbnails(file);
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  useEffect(() => {
    if (pageCount > 0) setOrder(Array.from({ length: pageCount }, (_, i) => i + 1));
  }, [pageCount]);

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setOrder((items) => {
        const oldIdx = items.indexOf(Number(active.id));
        const newIdx = items.indexOf(Number(over.id));
        return arrayMove(items, oldIdx, newIdx);
      });
    }
  }

  async function handleApply() {
    if (!file) return;
    setLoading(true);
    setError(null);
    try {
      const blob = await reorderPages(file, order);
      downloadBlob(blob, `reordered_${file.name}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Reorder failed. Check that the PDF is valid.");
    } finally {
      setLoading(false);
    }
  }

  // UX-17: apply the new order and open the result straight in a Viewer tab,
  // so you can review/annotate without a download → re-open round trip.
  async function handleOpenInViewer() {
    if (!file) return;
    setOpeningViewer(true);
    setError(null);
    try {
      const blob = await reorderPages(file, order);
      const name = `reordered_${file.name}`;
      const reordered = new File([blob], name, { type: "application/pdf" });
      openTab("viewer", { file: reordered, title: name });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Reorder failed. Check that the PDF is valid.");
    } finally {
      setOpeningViewer(false);
    }
  }

  return (
    <Layout title="Rearrange Pages" description="Drag pages into the order you want">
      <div className="space-y-6">
        <FileDropZone
          files={file ? [file] : []}
          onFiles={([f]) => { setFile(f); setOrder([]); }}
          accept={{ "application/pdf": [".pdf"] }}
          hint="PDF files only"
        />

        {file && order.length > 0 && (
          <>
            {/* Status bar */}
            <div className="flex items-center justify-between text-[10px] text-stone-400">
              <span>
                {pageCount} page{pageCount !== 1 ? "s" : ""} — drag to rearrange
                <span className="text-stone-300"> · keyboard: Tab to a page, Space to lift, arrows to move, Space to drop</span>
              </span>
              {order.some((p, i) => p !== i + 1) && (
                <button
                  onClick={() => setOrder(Array.from({ length: pageCount }, (_, i) => i + 1))}
                  className="text-brand-600 hover:text-brand-500 transition-colors"
                >
                  Reset to original order
                </button>
              )}
            </div>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={order.map(String)} strategy={rectSortingStrategy}>
                <div className="grid grid-cols-[repeat(auto-fill,minmax(100px,1fr))] gap-3">
                  {order.map((pageNum, idx) => (
                    <SortablePage
                      key={pageNum}
                      id={String(pageNum)}
                      thumb={thumbnails[pageNum - 1]}
                      label={pageNum === idx + 1 ? `${pageNum}` : `p.${pageNum} → ${idx + 1}`}
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
            disabled={!file || order.length === 0 || order.every((p, i) => p === i + 1)}
            label={order.every((p, i) => p === i + 1) ? "Rearrange pages to enable save" : "Save reordered PDF"}
          />
          {file && order.length > 0 && !order.every((p, i) => p === i + 1) && (
            <button
              onClick={handleOpenInViewer}
              disabled={openingViewer}
              className="text-xs text-brand-600 hover:text-brand-500 disabled:opacity-50 transition-colors"
            >
              {openingViewer ? "Opening…" : "Or open the reordered PDF in the viewer"}
            </button>
          )}
        </div>
      </div>
    </Layout>
  );
}
