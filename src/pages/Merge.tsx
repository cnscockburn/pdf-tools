import { useState } from "react";
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
import { mergePDFs } from "../api/client";
import { downloadBlob, formatBytes } from "../lib/utils";
import { cn } from "../lib/utils";

type TaggedFile = { id: string; file: File };
let _mergeId = 0;
const tagFile = (f: File): TaggedFile => ({ id: `mf_${++_mergeId}`, file: f });

// ── Sortable file row ────────────────────────────────────────────────────────

function SortableFileRow({ item, onRemove }: { item: TaggedFile; onRemove: (id: string) => void }) {
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
      <div className="flex-1 min-w-0">
        <p className="text-sm truncate text-stone-800">{item.file.name}</p>
        <p className="text-[10px] text-stone-400">{formatBytes(item.file.size)}</p>
      </div>
      <button
        onClick={() => onRemove(item.id)}
        aria-label={`Remove ${item.file.name}`}
        className="shrink-0 text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded px-1.5 py-0.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/50"
      >
        Remove
      </button>
    </div>
  );
}

// ── Workflow step indicator ───────────────────────────────────────────────────

function StepIndicator({ step }: { step: number }) {
  const steps = [
    { label: "Add files", done: step > 1 },
    { label: "Arrange order", done: step > 2 },
    { label: "Download", done: step > 3 },
  ];
  return (
    <div className="flex items-center gap-1.5 mb-1">
      {steps.map((s, i) => (
        <span key={i} className="flex items-center gap-1.5">
          {i > 0 && <span className="w-4 h-px bg-stone-200" />}
          <span className={cn(
            "text-[10px] font-medium transition-colors",
            i + 1 === step ? "text-amber-600" : s.done ? "text-stone-500" : "text-stone-300",
          )}>
            {s.label}
          </span>
        </span>
      ))}
    </div>
  );
}

// ── Component ────────────────────────────────────────────────────────────────

interface MergeProps {
  initialFile?: File;
}

export default function Merge({ initialFile }: MergeProps = {}) {
  const [tagged, setTagged] = useState<TaggedFile[]>(initialFile ? [tagFile(initialFile)] : []);
  const files = tagged.map(t => t.file);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const currentStep = files.length === 0 ? 1 : files.length >= 2 ? 2 : 1;

  async function handleMerge() {
    if (files.length < 2) return;
    setLoading(true);
    setError(null);
    try {
      const blob = await mergePDFs(files);
      downloadBlob(blob, "merged.pdf");
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Merge failed. Check that all files are valid PDFs.");
    } finally {
      setLoading(false);
    }
  }

  function removeFile(id: string) {
    setTagged((prev) => prev.filter((t) => t.id !== id));
    setDone(false);
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setTagged((items) => {
        const oldIdx = items.findIndex(t => t.id === active.id);
        const newIdx = items.findIndex(t => t.id === String(over.id));
        return arrayMove(items, oldIdx, newIdx);
      });
      setDone(false);
    }
  }

  return (
    <Layout title="Merge PDFs" description="Combine multiple PDF files into one document">
      <div className="space-y-6">
        <StepIndicator step={done ? 3 : currentStep} />

        <FileDropZone
          files={[]}
          onFiles={(added) => { setTagged((prev) => [...prev, ...added.map(tagFile)]); setDone(false); }}
          multiple
          accept={{ "application/pdf": [".pdf"] }}
          label="Drop PDFs here (add as many as you need)"
          hint="PDF files only"
        />

        {tagged.length > 0 && (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={tagged.map(t => t.id)} strategy={verticalListSortingStrategy}>
              <div className="rounded-xl border border-stone-200 bg-white divide-y divide-stone-100 overflow-hidden">
                <div className="px-4 py-2.5 flex items-center justify-between bg-stone-50/50">
                  <span className="text-[10px] font-medium text-stone-400 uppercase tracking-wide">
                    {tagged.length} file{tagged.length !== 1 ? "s" : ""} — drag to reorder
                  </span>
                  {tagged.length > 1 && (
                    <span className="text-[10px] text-stone-400">
                      Output order: top to bottom
                    </span>
                  )}
                </div>
                {tagged.map((t) => (
                  <SortableFileRow key={t.id} item={t} onRemove={removeFile} />
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

        {done && !error && (
          <p className="rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-700">
            Merged PDF downloaded. Add more files or close this tab.
          </p>
        )}

        <ProcessButton
          onClick={handleMerge}
          loading={loading}
          disabled={files.length < 2}
          label={files.length < 2 ? "Add at least 2 PDFs" : `Merge ${files.length} files`}
        />
      </div>
    </Layout>
  );
}
