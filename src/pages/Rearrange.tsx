import { useState, useEffect } from "react";
import { useLocation } from "react-router-dom";
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

function SortablePage({ id, thumb, label }: { id: string; thumb?: string; label: string }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      {...attributes}
      {...listeners}
      className={`flex flex-col items-center gap-1 rounded-lg border-2 p-1 bg-white cursor-grab active:cursor-grabbing select-none transition ${
        isDragging ? "border-brand-500 opacity-50 scale-105 shadow-lg" : "border-stone-200 hover:border-stone-300"
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

export default function Rearrange() {
  const location = useLocation();
  const [file, setFile] = useState<File | null>((location.state as { file?: File } | null)?.file ?? null);
  const [order, setOrder] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);
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
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Layout title="Rearrange Pages" description="Drag pages into the order you want">
      <div className="space-y-6">
        <FileDropZone
          files={file ? [file] : []}
          onFiles={([f]) => { setFile(f); setOrder([]); }}
          accept={{ "application/pdf": [".pdf"] }}
        />

        {file && order.length > 0 && (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={order.map(String)} strategy={rectSortingStrategy}>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(100px,1fr))] gap-3">
                {order.map((pageNum, idx) => (
                  <SortablePage
                    key={pageNum}
                    id={String(pageNum)}
                    thumb={thumbnails[pageNum - 1]}
                    label={`p.${pageNum} → ${idx + 1}`}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}

        {error && (
          <p className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
            {error}
          </p>
        )}

        <ProcessButton onClick={handleApply} loading={loading} disabled={!file || order.length === 0} label="Save reordered PDF" />
      </div>
    </Layout>
  );
}
