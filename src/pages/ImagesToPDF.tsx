import { useState, useMemo, useEffect, useRef } from "react";
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
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import Layout from "../components/Layout";
import FileDropZone from "../components/FileDropZone";
import ProcessButton from "../components/ProcessButton";
import { imagesToPDF } from "../api/client";
import { downloadBlob, formatBytes } from "../lib/utils";
import { cn } from "../lib/utils";

type TaggedImage = { id: string; file: File };
let _imgId = 0;
const tagImage = (f: File): TaggedImage => ({ id: `img_${++_imgId}`, file: f });

// ── Sortable image row ─────────────────────────────────────────────────────────

function SortableImageRow({ item, thumb, onRemove }: { item: TaggedImage; thumb: string; onRemove: (id: string) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "flex items-center gap-3 px-4 py-3 transition-colors",
        isDragging ? "bg-amber-50/50 shadow-sm z-10 relative" : "bg-white",
      )}
    >
      <button
        {...attributes}
        {...listeners}
        className="shrink-0 text-stone-300 hover:text-stone-500 cursor-grab active:cursor-grabbing transition-colors touch-none"
        aria-label={`Reorder ${item.file.name}`}
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <img
        src={thumb}
        alt={item.file.name}
        className="h-12 w-10 object-cover rounded border border-stone-200"
      />
      <div className="flex-1 min-w-0">
        <p className="text-sm truncate text-stone-800">{item.file.name}</p>
        <p className="text-xs text-stone-400">{formatBytes(item.file.size)}</p>
      </div>
      <button
        onClick={() => onRemove(item.id)}
        aria-label={`Remove ${item.file.name}`}
        className="text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded px-1.5 py-0.5 transition-colors shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/50"
      >
        Remove
      </button>
    </div>
  );
}

export default function ImagesToPDF() {
  const [tagged, setTagged] = useState<TaggedImage[]>([]);
  const files = tagged.map(t => t.file);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // Stable object URLs for image previews, keyed by tagged id so they survive
  // reordering. Revoked when the set changes or on unmount.
  const thumbUrls = useMemo(() => {
    const m: Record<string, string> = {};
    for (const t of tagged) m[t.id] = URL.createObjectURL(t.file);
    return m;
  }, [tagged]);
  const prevThumbUrlsRef = useRef<Record<string, string>>({});
  useEffect(() => {
    const prev = prevThumbUrlsRef.current;
    prevThumbUrlsRef.current = thumbUrls;
    return () => { Object.values(prev).forEach(URL.revokeObjectURL); };
  }, [thumbUrls]);

  function removeImage(id: string) {
    setTagged(prev => prev.filter(t => t.id !== id));
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setTagged(items => {
        const oldIdx = items.findIndex(t => t.id === active.id);
        const newIdx = items.findIndex(t => t.id === String(over.id));
        return arrayMove(items, oldIdx, newIdx);
      });
    }
  }

  async function handleConvert() {
    if (!files.length) return;
    setLoading(true);
    setError(null);
    try {
      const blob = await imagesToPDF(files);
      downloadBlob(blob, "images.pdf");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Conversion failed. Check that all files are valid images.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Layout title="Images to PDF" description="Convert images into a PDF — one image per page">
      <div className="space-y-6">
        <FileDropZone
          files={[]}
          onFiles={(added) => setTagged(prev => [...prev, ...added.map(tagImage)])}
          multiple
          accept={{
            "image/jpeg": [".jpg", ".jpeg"],
            "image/png":  [".png"],
            "image/tiff": [".tif", ".tiff"],
            "image/gif":  [".gif"],
            "image/bmp":  [".bmp"],
            "image/webp": [".webp"],
          }}
          label="Drop images here — each image becomes one page"
          hint="JPEG, PNG, TIFF, GIF, BMP or WebP"
        />

        {tagged.length > 0 && (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={tagged.map(t => t.id)} strategy={verticalListSortingStrategy}>
              <div className="rounded-xl border border-stone-200 bg-white divide-y divide-stone-100 overflow-hidden">
                <div className="px-4 py-2.5 flex items-center justify-between bg-stone-50/50">
                  <span className="text-[10px] font-medium text-stone-400 uppercase tracking-wide">
                    {tagged.length} image{tagged.length !== 1 ? "s" : ""} — {tagged.length} page{tagged.length !== 1 ? "s" : ""} in output
                  </span>
                  <span className="text-[10px] text-stone-400">Drag to reorder · top to bottom = page order</span>
                </div>
                {tagged.map((t) => (
                  <SortableImageRow key={t.id} item={t} thumb={thumbUrls[t.id]} onRemove={removeImage} />
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

        <ProcessButton
          onClick={handleConvert}
          loading={loading}
          disabled={files.length === 0}
          label={files.length === 0 ? "Add images first" : `Convert ${files.length} image(s) to PDF`}
        />
      </div>
    </Layout>
  );
}
