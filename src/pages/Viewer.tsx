import { useState, useRef, useEffect, useMemo } from "react";
import { useTabContext } from "../lib/tabs";
import * as pdfjsLib from "pdfjs-dist";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import { useDropzone } from "react-dropzone";
import {
  ZoomIn, ZoomOut, ChevronLeft, ChevronRight, UploadCloud,
  MessageSquare, EyeOff, Crop,
  Stamp, Loader2, Highlighter, Type, Pencil, Check, X, Download,
  Underline, Strikethrough, Search, HelpCircle, User,
  PenLine, Square, Command, Columns,
} from "lucide-react";
import { cn, downloadBlob } from "../lib/utils";
import ThumbnailSidebar from "../components/ThumbnailSidebar";
import RightPanel, { type PanelTool } from "../components/RightPanel";
import RightRail, { type RailTab } from "../components/RightRail";
import AnnotationLayer, {
  type LocalAnnot, type HlColor, type CreateMode, type AnnotId, type AnnotStatus,
  type FracRect, type ShapeSubType, newId, boundingBox, STAMP_LABELS,
} from "../components/AnnotationLayer";
import TextLayer from "../components/TextLayer";
import QuickActionBar from "../components/QuickActionBar";
import SearchBar, { type SearchResult } from "../components/SearchBar";
import KeyboardCheatSheet from "../components/KeyboardCheatSheet";
import CommandPalette, { type PaletteCommand } from "../components/CommandPalette";
// SettingsDialog is now rendered by TabShell; Viewer only calls openSettings() from context.
import MiniMap from "../components/MiniMap";
import MenuBar, { type MenuDef } from "../components/MenuBar";
import { annotatePDF, redactPDF, cropPDF, decryptPDF, checkHealth, ocrPDF, comparePDFs, type Annotation, type RedactRegion } from "../api/client";
import { useBookmarks } from "../lib/storage";
import { useSettingsContext } from "../lib/settingsContext";
import { downloadAnnotationReport, downloadAnnotationCsv, downloadAnnotationJson } from "../lib/annotationReport";
import { annotationReportPdf } from "../api/client";
import TocEditorDialog from "../components/TocEditorDialog";
import { subscribe, publish } from "../lib/mirrorSync";
import { pickPdfFiles } from "../lib/fileIntake";
import { useHelpMode, helpForMode } from "../lib/helpMode";
import { startAutoSave, deleteRecovery } from "../lib/autoSave";
import ContinuousCanvas from "../components/ContinuousCanvas";
import { getDiff, setDiff, clearDiff } from "../lib/diffStore";
import type { DiffEntry } from "../lib/diffStore";
import type { CanvasMode, RedactBox, CropSel, DiffRegion } from "../lib/viewerTypes";

const HIGHLIGHT_COLORS: HlColor[] = [
  { label: "Yellow", rgb: [1, 1, 0],     bg: "rgba(255,255,0,0.35)",   border: "rgba(200,160,0,0.8)" },
  { label: "Cyan",   rgb: [0, 1, 1],     bg: "rgba(0,255,255,0.35)",   border: "rgba(0,160,200,0.8)" },
  { label: "Green",  rgb: [0, 1, 0.5],   bg: "rgba(0,255,128,0.35)",   border: "rgba(0,180,80,0.8)" },
  { label: "Pink",   rgb: [1, 0.5, 0.8], bg: "rgba(255,128,200,0.35)", border: "rgba(200,80,150,0.8)" },
];

// Ink colours — primary pen colours for freehand drawing (UX-05).
const INK_COLORS: { label: string; rgb: [number, number, number]; css: string }[] = [
  { label: "Black", rgb: [0.1, 0.1, 0.1], css: "#1c1917" },
  { label: "Red",   rgb: [0.85, 0.1, 0.1], css: "#d92020" },
  { label: "Blue",  rgb: [0.1, 0.3, 0.85], css: "#2563eb" },
  { label: "Green", rgb: [0.1, 0.6, 0.25], css: "#16a34a" },
  { label: "Amber", rgb: [0.85, 0.47, 0.02], css: "#d97706" },
];

// Weighted ink-width scale bound to number keys 1-9 in ink mode (UX-05).
const INK_WIDTH_SCALE = [1, 1.5, 2, 3, 4, 6, 8, 12, 20];

/** Convert AnnotationLayer's local types to the backend API shape. */
function toApiAnnotations(localAnns: LocalAnnot[]): Annotation[] {
  return localAnns.map((a) => {
    // Author is stamped into the PDF annotation's /T field by the backend so it
    // survives the round-trip (shows in external viewers and on re-open).
    const meta = a.author ? { author: a.author } : {};
    if (a.type === "note")
      return { type: "note", page: a.page, x: a.x, y: a.y, text: a.text, ...meta };
    if (a.type === "highlight")
      return { type: "highlight", page: a.page, x0: a.x0, y0: a.y0, x1: a.x1, y1: a.y1,
               color: a.color, ...(a.rects ? { rects: a.rects } : {}), ...meta };
    if (a.type === "freetext")
      return { type: "freetext", page: a.page, x0: a.x0, y0: a.y0, x1: a.x1, y1: a.y1, text: a.text, ...meta };
    if (a.type === "underline")
      return { type: "underline", page: a.page, x0: a.x0, y0: a.y0, x1: a.x1, y1: a.y1,
               ...(a.rects ? { rects: a.rects } : {}), ...(a.text ? { text: a.text } : {}), ...meta };
    if (a.type === "strikethrough")
      return { type: "strikethrough", page: a.page, x0: a.x0, y0: a.y0, x1: a.x1, y1: a.y1,
               ...(a.rects ? { rects: a.rects } : {}), ...(a.text ? { text: a.text } : {}), ...meta };
    if (a.type === "ink")
      return { type: "ink", page: a.page, strokes: a.strokes,
               ...(a.color ? { color: a.color } : {}),
               ...(a.strokeWidth ? { strokeWidth: a.strokeWidth } : {}), ...meta };
    if (a.type === "shape")
      return { type: "shape", page: a.page, x0: a.x0, y0: a.y0, x1: a.x1, y1: a.y1,
               shape: a.shape,
               ...(a.color ? { color: a.color } : {}),
               ...(a.strokeWidth ? { strokeWidth: a.strokeWidth } : {}),
               ...(a.text ? { text: a.text } : {}), ...meta };
    if (a.type === "stamp")
      return { type: "stamp", page: a.page, x0: a.x0, y0: a.y0, x1: a.x1, y1: a.y1,
               label: a.label, color: a.color, ...meta };
    // fallback
    return { type: "note", page: (a as LocalAnnot).page, x: 0, y: 0, text: "" };
  });
}

let _rid = 0;
const newRid = () => `r${++_rid}_${Math.random().toString(36).slice(2, 6)}`;

/** Build a per-page string index from PDF.js for in-document search. */
interface PageText {
  page: number;
  text: string;
  items: Array<{ str: string; start: number; end: number; transform: number[]; width: number; height: number }>;
  viewport: { width: number; height: number; convertToViewportPoint: (x: number, y: number) => [number, number] };
}

interface ViewerProps {
  initialFile?: File;
  tabId?: string;
  toolHint?: string;
  /** When true, this viewer is the secondary pane in side-by-side mode. Hides the right rail. */
  isSecondaryPane?: boolean;
  /** Shared ID for mirrored side-by-side tabs. When set, annotations sync between panes. */
  mirrorGroupId?: string;
}

export default function Viewer({ initialFile, tabId, toolHint: toolHintProp, isSecondaryPane, mirrorGroupId }: ViewerProps = {}) {
  // ── Settings (from shell-level context) + bookmarks ──────────────────────
  const { settings, updateSettings, addSnippet, removeSnippet, openSettings } = useSettingsContext();
  const { bookmarks, addBookmark, removeBookmark, renameBookmark } = useBookmarks();
  const [editingAuthor, setEditingAuthor] = useState(false);
  const [authorInput, setAuthorInput]     = useState("");

  // ── File & PDF ─────────────────────────────────────────────────────────────
  const [file, setFile]           = useState<File | null>(null);
  const [workingBlob, setWorkingBlob] = useState<Blob | null>(null);
  const [pdf, setPdf]             = useState<PDFDocumentProxy | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [scale, setScale]         = useState(1.4);
  const [filename, setFilename]   = useState("");
  const [rendering, setRendering] = useState(false);
  const [pageInput, setPageInput] = useState("1");
  const [editingPage, setEditingPage] = useState(false);

  // ── Filename editing ───────────────────────────────────────────────────────
  const [editingFilename, setEditingFilename] = useState(false);
  const [filenameInput, setFilenameInput]     = useState("");

  // ── Layout — initial states read from settings defaults ───────────────────
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => !(settings.thumbnailsOpenDefault ?? false),
  );
  // Right rail collapse. Secondary panes start collapsed to save space; the
  // primary follows the user's default (UX-22 / N-06).
  const [railCollapsed, setRailCollapsed] = useState(
    () => isSecondaryPane ? true : !(settings.rightRailOpenDefault ?? true),
  );
  const [panelTool, setPanelTool] = useState<PanelTool>(null);
  const [railTab, setRailTab] = useState<RailTab>("annotations");
  const [helpMode, setHelpModeState] = useHelpMode();

  // ── Canvas modes ───────────────────────────────────────────────────────────
  const [canvasMode, setCanvasMode]           = useState<CanvasMode>("view");
  const [annotateSubMode, setAnnotateSubMode] = useState<CreateMode>("note");
  const [hlColor, setHlColor]                 = useState<number>(
    () => settings.defaultHighlightColor ?? 0,
  );
  const [shapeSubType, setShapeSubType]       = useState<ShapeSubType>("rect");
  const [stampLabel, setStampLabel]           = useState(STAMP_LABELS[0]);
  const [inkStrokeWidth, setInkStrokeWidth]   = useState<number>(
    () => settings.defaultInkWidth ?? 2,
  );
  const [inkColorIdx, setInkColorIdx]         = useState<number>(0);

  // ── Command palette ────────────────────────────────────────────────────────
  const [paletteOpen, setPaletteOpen] = useState(false);

  // ── Annotations visibility toggle (Shift+H / View menu) ───────────────────
  const [annotationsVisible, setAnnotationsVisible] = useState(true);

  // ── Pending tool: activated when a PDF loads (from Home page card clicks) ─
  const pendingToolRef = useRef<string | null>(null);

  // ── Tab navigation ─────────────────────────────────────────────────────────
  const { openTab, updateTabTitle, openSideBySide, closeSideBySide, isSideBySide,
          registerCloseGuard, unregisterCloseGuard } = useTabContext();

  // ── Annotations ────────────────────────────────────────────────────────────
  const [annotations, setAnnotations]         = useState<LocalAnnot[]>([]);
  /**
   * Annotations that have been committed (baked into the PDF blob).
   * Kept in state so they remain visible in the sidebar and overlay after "Done".
   * Only `annotations` (the draft overlay) gets submitted to the backend —
   * `bakedAnnotations` are already in the blob.
   */
  const [bakedAnnotations, setBakedAnnotations] = useState<LocalAnnot[]>([]);
  /** Externally-requested annotation to select (from sidebar / popup nav arrows). */
  const [focusAnnotId, setFocusAnnotId]       = useState<AnnotId | null>(null);
  // A4: id of annotation the user wants to immediately enter edit mode on (from rail double-click)
  const [forceEditAnnotId, setForceEditAnnotId] = useState<AnnotId | null>(null);
  const [autoSaving, setAutoSaving]           = useState(false);
  const [annotateError, setAnnotateError]     = useState<string | null>(null);
  // A1: track whether the working blob was modified since the last download
  const [modifiedSinceDownload, setModifiedSinceDownload] = useState(false);

  // B12: TOC editor dialog
  const [tocEditorOpen, setTocEditorOpen] = useState(false);
  // B3: OCR in-progress flag
  const [ocrLoading, setOcrLoading] = useState(false);
  // B1: Continuous scroll mode
  const [continuousScroll, setContinuousScroll] = useState(false);
  // B6: Diff highlights — keyed by 1-indexed page number
  const [diffHighlights, setDiffHighlights] = useState<Map<number, DiffRegion[]> | null>(null);
  const [diffId, setDiffId] = useState<string | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);

  // ── Mirror sync (same-document side-by-side) ─────────────────────────────
  // Uses a monotonic version counter instead of a boolean flag to prevent echo.
  // When we receive data from the other pane, we bump `mirrorRecvVersion`.
  // The publish effect checks whether the version changed since its last run —
  // if so, the current annotations came from a remote update and should not be
  // re-broadcast. This is immune to React batching / timing races.
  const mirrorSenderIdRef = useRef(tabId ?? `viewer_${Date.now()}`);
  const mirrorRecvVersionRef = useRef(0);
  const mirrorLastPublishedVersionRef = useRef(0);

  // A2: Sync navigation between split panes. On by default for mirror groups
  // (same document) — can be toggled via View menu. Defaults off for two different documents.
  const [syncNavigation, setSyncNavigation] = useState(() => !!mirrorGroupId);
  // Guard against page-nav echo: true while applying a received page jump.
  const receivingNavRef = useRef(false);

  // Subscribe to mirror channel — annotations + optional page nav
  useEffect(() => {
    if (!mirrorGroupId) return;
    const unsub = subscribe<{ annotations?: LocalAnnot[]; baked?: LocalAnnot[]; page?: number }>(
      mirrorGroupId,
      (data, senderId) => {
        if (senderId === mirrorSenderIdRef.current) return;
        // Annotation payload
        if (data.annotations !== undefined && data.baked !== undefined) {
          mirrorRecvVersionRef.current += 1;
          setAnnotations(data.annotations);
          setBakedAnnotations(data.baked);
        }
        // Page navigation payload (A2)
        if (data.page !== undefined) {
          receivingNavRef.current = true;
          setCurrentPage(data.page);
          setPageInput(String(data.page));
          receivingNavRef.current = false;
        }
      },
    );
    return unsub;
  }, [mirrorGroupId]);

  // Publish annotation changes to the mirror channel
  useEffect(() => {
    if (!mirrorGroupId) return;
    // Skip if the current state came from a mirror receive (version bumped)
    if (mirrorRecvVersionRef.current !== mirrorLastPublishedVersionRef.current) {
      mirrorLastPublishedVersionRef.current = mirrorRecvVersionRef.current;
      return;
    }
    publish(mirrorGroupId, mirrorSenderIdRef.current, {
      annotations,
      baked: bakedAnnotations,
    });
  }, [mirrorGroupId, annotations, bakedAnnotations]);

  // A2: Publish page navigation to the mirror channel
  useEffect(() => {
    if (!mirrorGroupId || !syncNavigation) return;
    if (receivingNavRef.current) return; // don't echo back
    publish(mirrorGroupId, mirrorSenderIdRef.current, { page: currentPage });
  }, [mirrorGroupId, syncNavigation, currentPage]); // eslint-disable-line

  // ── Text selection / QuickActionBar ───────────────────────────────────────
  const [textSelectActive, setTextSelectActive] = useState(false);
  const [quickBar, setQuickBar] = useState<{
    rects: FracRect[]; text: string; barX: number; barY: number; barYBottom: number;
  } | null>(null);

  // ── Search ─────────────────────────────────────────────────────────────────
  const [searchOpen, setSearchOpen]     = useState(false);
  const [searchQuery, setSearchQuery]   = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchIdx, setSearchIdx]       = useState(0);
  const [searchLoading, setSearchLoading] = useState(false);
  const [pageIndex, setPageIndex]       = useState<PageText[]>([]);

  // ── Keyboard cheat sheet ──────────────────────────────────────────────────
  const [cheatSheetOpen, setCheatSheetOpen] = useState(false);

  // ── Default fit mode — applied once after each new PDF loads ─────────────
  // fitOnLoadRef stores the desired fit mode during the first render cycle
  // after loadFile().  The render useEffect consumes it (sets to null) so it
  // only fires once per file load, preventing an update loop.
  const fitOnLoadRef = useRef<import("../lib/storage").FitMode | null>(null);

  // ── Mini-map visibility ────────────────────────────────────────────────────
  const [miniMapVisible, setMiniMapVisible] = useState(true);

  // ── First-run hint (shows once, dismissed permanently via localStorage) ────
  const [showFirstRunHint, setShowFirstRunHint] = useState(() => {
    try { return !localStorage.getItem("stria:viewer-onboarded"); } catch { return true; }
  });
  function dismissFirstRunHint() {
    setShowFirstRunHint(false);
    try { localStorage.setItem("stria:viewer-onboarded", "1"); } catch { /* noop */ }
  }

  // ── Backend health ─────────────────────────────────────────────────────────
  const [backendOk, setBackendOk] = useState<boolean | null>(null);

  // ── Redact ─────────────────────────────────────────────────────────────────
  const [redactBoxes, setRedactBoxes]     = useState<RedactBox[]>([]);
  const [selectedRedact, setSelectedRedact] = useState<string | null>(null);
  const [redactLoading, setRedactLoading] = useState(false);
  const [redactError, setRedactError]     = useState<string | null>(null);
  const [redactLive, setRedactLive]       = useState<CropSel | null>(null);
  const redactDragRef = useRef<{ startFrac: { x: number; y: number } } | null>(null);

  // ── Crop ───────────────────────────────────────────────────────────────────
  const [cropSelection, setCropSelection] = useState<CropSel | null>(null);
  const [cropLive, setCropLive]           = useState<CropSel | null>(null);
  const [applyToAll, setApplyToAll]       = useState(true);
  const [cropLoading, setCropLoading]     = useState(false);
  const [cropError, setCropError]         = useState<string | null>(null);
  const cropDragRef = useRef<{ startFrac: { x: number; y: number } } | null>(null);

  // ── Confirmation gates for destructive actions ─────────────────────────────
  const [confirmRedact, setConfirmRedact]       = useState(false);
  const [confirmCrop, setConfirmCrop]           = useState(false);
  const [confirmClearAnnot, setConfirmClearAnnot] = useState(false);

  // ── Unsaved-changes navigation guard ──────────────────────────────────────
  type PendingNav =
    | { type: "home" }
    | { type: "tab"; tabType: "merge" | "rearrange" | "images-to-pdf"; file?: File };
  const [pendingNav, setPendingNav] = useState<PendingNav | null>(null);

  // ── Transient toast (e.g. "no changes to download") ────────────────────────
  const [toast, setToast] = useState<string | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  function showToast(msg: string) {
    setToast(msg);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 3000);
  }

  // ── Download guard (uncommitted annotations) ───────────────────────────────
  const [downloadGuard, setDownloadGuard] = useState(false);

  // ── Password-protected PDFs (5.2) ──────────────────────────────────────────
  const [passwordPrompt, setPasswordPrompt] = useState<{ file: File } | null>(null);
  const [passwordInput, setPasswordInput]   = useState("");
  const [passwordError, setPasswordError]   = useState<string | null>(null);
  const [passwordBusy, setPasswordBusy]     = useState(false);

  // ── Multi-level undo / redo ────────────────────────────────────────────────
  const [undoStack, setUndoStack] = useState<LocalAnnot[][]>([]);
  const [redoStack, setRedoStack] = useState<LocalAnnot[][]>([]);
  const annotationsRef   = useRef<LocalAnnot[]>([]);
  const undoAnnotationRef = useRef<() => void>(() => {});
  const redoAnnotationRef = useRef<() => void>(() => {});

  // ── Refs ───────────────────────────────────────────────────────────────────
  const canvasRef     = useRef<HTMLCanvasElement>(null);
  const canvasWrapRef = useRef<HTMLDivElement>(null);
  const canvasAreaRef = useRef<HTMLDivElement>(null);
  const renderTaskRef = useRef<RenderTask | null>(null);
  // (location removed — initial file/tool come from props)
  /** Tracks drag-start for the rect-fallback mode (when textSelectActive=true but no text selected) */
  const freeRectDragRef = useRef<{ x: number; y: number } | null>(null);

  // ── Stable ref for mode switch ─────────────────────────────────────────────
  const switchModeRef = useRef<(m: CanvasMode) => void>(() => {});

  // ── Stable ref for opening settings (used by the Ctrl+, keyboard shortcut) ──
  const openSettingsRef = useRef<() => void>(() => {});
  openSettingsRef.current = openSettings;

  // ── Stable ref for the download entry point (used by the Ctrl+S shortcut) ───
  const requestDownloadRef = useRef<() => void>(() => {});

  // ── Stable ref for print (used by the Ctrl+P shortcut) ──────────────────────
  const printDocumentRef = useRef<() => void>(() => {});

  // ── Always-fresh ref to the working blob (read after awaits where the state
  //    closure would be stale, e.g. commit-then-download). ──────────────────
  const workingBlobRef = useRef<Blob | null>(null);
  workingBlobRef.current = workingBlob;

  // ── Stable ref to applyMarkup (used by the text-selection auto-apply path) ──
  const applyMarkupRef = useRef<(type: "highlight" | "underline" | "strikethrough", rects: FracRect[], text: string) => void>(() => {});

  // ── Stable refs for zoom (used by the keyboard + wheel handlers) ───────────
  const zoomByRef = useRef<(dir: 1 | -1, step?: number) => void>(() => {});
  const resetZoomRef = useRef<() => void>(() => {});

  // ── Keyboard shortcut state ref ────────────────────────────────────────────
  const kbRef = useRef({
    currentPage: 1,
    pdf:           null as PDFDocumentProxy | null,
    workingBlob:   null as Blob | null,
    filename:      "",
    selectedRedact: null as string | null,
    isSideBySide:  false,
    canvasMode:    "view" as CanvasMode,
    annotateSubMode: "note" as CreateMode,
  });
  kbRef.current = { currentPage, pdf, workingBlob, filename, selectedRedact, isSideBySide, canvasMode, annotateSubMode };
  annotationsRef.current = annotations;

  // ── Effective highlight colors (user-labelled palette) ───────────────────
  const effectiveHlColors = useMemo<typeof HIGHLIGHT_COLORS>(
    () => HIGHLIGHT_COLORS.map((c, i) => ({
      ...c,
      label: settings.colorLabels[i] ?? c.label,
    })),
    [settings.colorLabels],
  );

  // Built-in stamps + any user-defined custom labels (5.5).
  const effectiveStampLabels = useMemo(
    () => [...STAMP_LABELS, ...(settings.customStampLabels ?? [])],
    [settings.customStampLabels],
  );

  // ── Current annotate state ref (for free-rect fallback closure) ─────────
  // Avoids stale closures inside the mouseup listener without re-registering it.
  const freeRectStateRef = useRef({ annotateSubMode, hlColor, effectiveHlColors, currentPage, settings });
  freeRectStateRef.current = { annotateSubMode, hlColor, effectiveHlColors, currentPage, settings };

  // ── Working file ──────────────────────────────────────────────────────────
  const workingFile = useMemo<File | null>(() => {
    if (!file) return null;
    if (!workingBlob) return file;
    return new File([workingBlob], filename, { type: "application/pdf" });
  }, [file, workingBlob, filename]);

  // ── Load from tab props ───────────────────────────────────────────────────
  useEffect(() => {
    if (toolHintProp) {
      if (toolHintProp.startsWith("diff:")) {
        // B6: secondary pane — read diff highlights from the diff store.
        const uuid = toolHintProp.slice(5);
        const entry = getDiff(uuid);
        if (entry) {
          setDiffHighlights(entry.b);
          setDiffId(uuid);
        }
      } else {
        pendingToolRef.current = toolHintProp;
      }
    }
    if (initialFile) loadFile(initialFile);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Sync tab title with filename ─────────────────────────────────────────
  useEffect(() => {
    if (tabId && filename) updateTabTitle(tabId, filename);
  }, [tabId, filename, updateTabTitle]);

  // ── Sync window title (Tauri / browser tab) ──────────────────────────────
  useEffect(() => {
    if (!isSecondaryPane) {
      document.title = filename ? `${filename} — Stria` : "Stria";
    }
  }, [filename, isSecondaryPane]);

  // ── PDF canvas render ─────────────────────────────────────────────────────
  // When the document has no JS-side overlay annotations (a freshly opened PDF,
  // possibly one we previously baked annotations into), let PDF.js paint the
  // embedded annotations itself (annotationMode 2 = ENABLE). The moment the user
  // starts annotating (or we have baked annotations held in JS state that we
  // re-draw as overlays), switch to annotationMode 0 to avoid double-rendering.
  // Using a boolean threshold means the canvas only re-renders when crossing the
  // 0 ↔ non-zero boundary, not on every individual annotation change.
  const hasOverlayAnnots = bakedAnnotations.length > 0 || annotations.length > 0;
  useEffect(() => {
    // B1: In continuous scroll mode ContinuousCanvas owns all canvas rendering.
    if (continuousScroll) return;
    if (!pdf || !canvasRef.current) return;
    let cancelled = false;

    (async () => {
      if (renderTaskRef.current) { renderTaskRef.current.cancel(); renderTaskRef.current = null; }
      setRendering(true);
      try {
        const page = await pdf.getPage(currentPage);
        if (cancelled) return;
        const vp = page.getViewport({ scale });
        const canvas = canvasRef.current!;
        canvas.width  = vp.width;
        canvas.height = vp.height;
        const ctx = canvas.getContext("2d")!;
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        const task = page.render({
          canvasContext: ctx,
          viewport: vp,
          // ENABLE (2) when we have no overlays to draw, so PDF.js renders any
          // annotations already embedded in the PDF. DISABLE (0) while we own
          // the overlay so the two layers don't stack.
          annotationMode: hasOverlayAnnots ? 0 : 2,
        });
        renderTaskRef.current = task;
        await task.promise;
      } catch { /* RenderingCancelledException is expected */ }
      finally { if (!cancelled) setRendering(false); }

      // ── Apply default fit mode once per file load ─────────────────────────
      // fitOnLoadRef is set in loadFile() and consumed here on first render so
      // subsequent scale changes do not re-trigger it (no update loop).
      if (!cancelled && fitOnLoadRef.current && canvasAreaRef.current && canvasRef.current) {
        const fitMode = fitOnLoadRef.current;
        fitOnLoadRef.current = null; // consume — only fires once per load
        if (fitMode !== "actual") {
          const w  = canvasAreaRef.current.clientWidth  - 64;
          const h  = canvasAreaRef.current.clientHeight - 64;
          const pw = canvasRef.current.width  / scale;
          const ph = canvasRef.current.height / scale;
          const fitted =
            fitMode === "width"
              ? parseFloat(Math.max(0.5, Math.min(w / pw, 4)).toFixed(2))
              : parseFloat(Math.max(0.5, Math.min(Math.min(w / pw, h / ph), 4)).toFixed(2));
          if (fitted !== scale) setScale(fitted);
        }
      }
    })();

    return () => { cancelled = true; renderTaskRef.current?.cancel(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdf, currentPage, scale, hasOverlayAnnots, continuousScroll]);

  // ── Build text search index when PDF loads ────────────────────────────────
  useEffect(() => {
    if (!pdf) { setPageIndex([]); return; }
    let cancelled = false;
    (async () => {
      const index: PageText[] = [];
      for (let i = 1; i <= pdf.numPages; i++) {
        if (cancelled) return;
        try {
          const page = await pdf.getPage(i);
          const vp = page.getViewport({ scale: 1 });
          const tc = await page.getTextContent();
          let text = "";
          const items: PageText["items"] = [];
          for (const item of tc.items) {
            if (!("str" in item)) continue;
            const { str, transform, width, height } = item as {
              str: string; transform: number[]; width: number; height: number;
            };
            const start = text.length;
            text += str;
            items.push({ str, start, end: text.length, transform, width, height });
          }
          index.push({ page: i, text, items, viewport: vp as unknown as PageText["viewport"] });
        } catch { /* page unavailable */ }
      }
      if (!cancelled) setPageIndex(index);
    })();
    return () => { cancelled = true; };
  }, [pdf]);

  // ── Search: run when query changes ────────────────────────────────────────
  useEffect(() => {
    if (!searchQuery.trim() || pageIndex.length === 0) {
      setSearchResults([]); setSearchIdx(0); return;
    }
    setSearchLoading(true);
    const lower = searchQuery.toLowerCase();
    const results: SearchResult[] = [];

    for (const pt of pageIndex) {
      const lowerText = pt.text.toLowerCase();
      let idx = 0;
      while ((idx = lowerText.indexOf(lower, idx)) !== -1) {
        const end = idx + lower.length;
        // Find all overlapping text items
        const matchItems = pt.items.filter(it => it.end > idx && it.start < end);
        const rects: SearchResult["rects"] = [];
        for (const it of matchItems) {
          try {
            const [a,, , d, tx, ty] = it.transform;
            const fontH = Math.abs(d) || Math.abs(a) || 10;
            const bl = pt.viewport.convertToViewportPoint(tx, ty);
            const tr = pt.viewport.convertToViewportPoint(tx + it.width, ty + fontH);
            const vw = pt.viewport.width, vh = pt.viewport.height;
            rects.push({
              x0: Math.max(0, Math.min(bl[0], tr[0]) / vw),
              y0: Math.max(0, Math.min(bl[1], tr[1]) / vh),
              x1: Math.min(1, Math.max(bl[0], tr[0]) / vw),
              y1: Math.min(1, Math.max(bl[1], tr[1]) / vh),
            });
          } catch { /* skip */ }
        }
        if (rects.length > 0) results.push({ page: pt.page, rects });
        idx += lower.length;
      }
    }

    setSearchResults(results);
    setSearchIdx(0);
    setSearchLoading(false);
  }, [searchQuery, pageIndex]);

  // ── Navigate to search result page ────────────────────────────────────────
  useEffect(() => {
    if (searchResults.length > 0 && searchResults[searchIdx]) {
      const target = searchResults[searchIdx].page;
      if (target !== currentPage) { setCurrentPage(target); setPageInput(String(target)); }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchIdx, searchResults]);

  // ── Backend health check (primary pane only — avoids N parallel polls) ────
  useEffect(() => {
    if (isSecondaryPane) return;
    let cancelled = false;
    async function check() {
      const ok = await checkHealth();
      if (!cancelled) setBackendOk(ok);
    }
    check();
    const id = setInterval(check, 15_000);
    return () => { cancelled = true; clearInterval(id); };
  }, [isSecondaryPane]);

  // ── Text selection → QuickActionBar ──────────────────────────────────────
  // Active in annotate mode AND view mode (UX-05): selecting text anywhere
  // surfaces the quick markup bar. In view mode there's no free-rect fallback
  // (that drag ref is only set in annotate mode) and no auto-apply.
  useEffect(() => {
    if (canvasMode !== "annotate" && canvasMode !== "view") return;

    function onMouseUp(e: MouseEvent) {
      // Small delay so the selection settles
      setTimeout(() => {
        const sel = window.getSelection();
        if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
          setQuickBar(null);

          // ── Free-rect fallback ──────────────────────────────────────────
          // When the user dragged inside the canvas but no text was selected
          // (e.g. scanned PDF with no text layer), create a rectangle annotation.
          const dragStart = freeRectDragRef.current;
          freeRectDragRef.current = null;
          if (dragStart && canvasWrapRef.current) {
            const wrap = canvasWrapRef.current;
            const rect = wrap.getBoundingClientRect();
            const endX = (e.clientX - rect.left) / rect.width;
            const endY = (e.clientY - rect.top)  / rect.height;
            const x0 = Math.max(0, Math.min(dragStart.x, endX));
            const y0 = Math.max(0, Math.min(dragStart.y, endY));
            const x1 = Math.min(1, Math.max(dragStart.x, endX));
            const y1 = Math.min(1, Math.max(dragStart.y, endY));
            // Require a meaningful drag — tiny movements are just clicks
            if (x1 - x0 > 0.015 && y1 - y0 > 0.004) {
              const { annotateSubMode: mode, hlColor: ci, effectiveHlColors: hcs, currentPage: pg, settings: s } = freeRectStateRef.current;
              const id = newId();
              const base = { id, page: pg, author: s.author || undefined };
              if (mode === "highlight") {
                setAnnotations(prev => [...prev, { ...base, type: "highlight", x0, y0, x1, y1, colorIdx: ci, color: hcs[ci].rgb }]);
              } else if (mode === "underline") {
                setAnnotations(prev => [...prev, { ...base, type: "underline", x0, y0, x1, y1 }]);
              } else if (mode === "strikethrough") {
                setAnnotations(prev => [...prev, { ...base, type: "strikethrough", x0, y0, x1, y1 }]);
              }
            }
          }
          return;
        }
        // Only act on selections within our canvas wrapper
        if (!canvasWrapRef.current) return;
        const wrapEl = canvasWrapRef.current;
        const range = sel.getRangeAt(0);
        if (!wrapEl.contains(range.commonAncestorContainer)) {
          setQuickBar(null);
          freeRectDragRef.current = null;
          return;
        }
        // Text selection is valid — clear drag ref so the free-rect fallback
        // doesn't fire on the next mouseup (e.g. clicking the QuickActionBar).
        freeRectDragRef.current = null;

        const wrapRect = wrapEl.getBoundingClientRect();
        const clientRects = Array.from(range.getClientRects());
        const rects: FracRect[] = clientRects
          .map(r => ({
            x0: Math.max(0, (r.left   - wrapRect.left) / wrapRect.width),
            y0: Math.max(0, (r.top    - wrapRect.top)  / wrapRect.height),
            x1: Math.min(1, (r.right  - wrapRect.left) / wrapRect.width),
            y1: Math.min(1, (r.bottom - wrapRect.top)  / wrapRect.height),
          }))
          .filter(r => r.x1 - r.x0 > 0.001 && r.y1 - r.y0 > 0.001);

        if (rects.length === 0) { setQuickBar(null); return; }

        const text = sel.toString();

        // P1-09: if a markup tool is already chosen, apply it directly to the
        // selection instead of popping the redundant H/U/S chooser bar.
        const subMode = freeRectStateRef.current.annotateSubMode;
        if (subMode === "highlight" || subMode === "underline" || subMode === "strikethrough") {
          applyMarkupRef.current(subMode, rects, text);
          window.getSelection()?.removeAllRanges();
          setQuickBar(null);
          return;
        }

        // Position bar above the topmost rect, centred on its midpoint. Also pass
        // the bottommost edge so the bar can flip below the selection when there
        // isn't room above (near the top of the viewport / under the menu bar).
        const topRect = clientRects.reduce((t, r) => r.top < t.top ? r : t, clientRects[0]);
        const bottomRect = clientRects.reduce((b, r) => r.bottom > b.bottom ? r : b, clientRects[0]);
        setQuickBar({
          rects,
          text,
          barX: topRect.left + topRect.width / 2,
          barY: topRect.top,
          barYBottom: bottomRect.bottom,
        });
      }, 10);
    }

    window.addEventListener("mouseup", onMouseUp);
    return () => window.removeEventListener("mouseup", onMouseUp);
  }, [canvasMode]);

  // Dismiss QuickActionBar when clicking elsewhere
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if ((e.target as HTMLElement).closest("[data-quickbar]")) return;
      setQuickBar(null);
      // Don't clear browser selection here — user may still want to read it
    }
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, []);

  // ── Auto-enable text layer for text-markup annotation modes ──────────────
  // Highlight / underline / strikethrough all work by selecting text, so the
  // text layer is automatically made interactive when those sub-modes are active.
  // All other modes (note, freetext, ink, shape, stamp) use drag/click so the
  // text layer stays transparent and doesn't interfere.
  useEffect(() => {
    const textModes: CreateMode[] = ["highlight", "underline", "strikethrough"];
    setTextSelectActive(canvasMode === "annotate" && textModes.includes(annotateSubMode));
  }, [annotateSubMode, canvasMode]);

  // ── Single-page scroll boundary — advance page at edge ──────────────────────
  // When the canvas area is scrolled to its top or bottom edge and the user
  // keeps scrolling, advance to the previous / next page.
  // Disabled in continuous scroll mode (ContinuousCanvas handles its own scroll).
  // passive:false is required so we can call preventDefault() at boundaries,
  // preventing parent-container scroll or Mac rubber-band while we accumulate.
  useEffect(() => {
    if (continuousScroll) return; // B1: natural scroll handled by ContinuousCanvas
    const area = canvasAreaRef.current;
    if (!area) return;

    let accum = 0;
    const THRESHOLD = 80;            // px of delta needed to flip page
    let cooldown = false;

    function onWheel(e: WheelEvent) {
      const el = canvasAreaRef.current;
      if (!el) return;
      const { pdf, currentPage } = kbRef.current;
      if (!pdf) return;

      // Ctrl/Cmd + wheel → zoom (UX-02), like every other document viewer.
      // 5% fine steps for precise framing.
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        zoomByRef.current(e.deltaY < 0 ? 1 : -1, 0.05);
        return;
      }

      // hasOverflow: the rendered page is taller than the scroll container
      const hasOverflow = el.scrollHeight > el.clientHeight + 2;
      // at-boundary checks — 6px tolerance for sub-pixel rounding
      const atBottom = hasOverflow ? el.scrollTop + el.clientHeight >= el.scrollHeight - 6 : true;
      const atTop    = hasOverflow ? el.scrollTop <= 6 : true;

      if (e.deltaY > 0 && atBottom && currentPage < pdf.numPages) {
        // At bottom boundary, more pages → swallow the event, accumulate
        e.preventDefault();
        accum += e.deltaY;
        if (accum >= THRESHOLD && !cooldown) {
          accum = 0; cooldown = true;
          const next = currentPage + 1;
          setCurrentPage(next);
          setPageInput(String(next));
          requestAnimationFrame(() => { el.scrollTop = 0; });
          setTimeout(() => { cooldown = false; }, 400);
        }
      } else if (e.deltaY < 0 && atTop && currentPage > 1) {
        // At top boundary, prior pages → swallow, accumulate
        e.preventDefault();
        accum += e.deltaY; // negative
        if (accum <= -THRESHOLD && !cooldown) {
          accum = 0; cooldown = true;
          const prev = currentPage - 1;
          setCurrentPage(prev);
          setPageInput(String(prev));
          requestAnimationFrame(() => { el.scrollTop = el.scrollHeight; });
          setTimeout(() => { cooldown = false; }, 400);
        }
      } else {
        // Mid-page scroll (or last/first page) — native scroll handles it
        accum = 0;
      }
    }

    area.addEventListener("wheel", onWheel, { passive: false });
    return () => area.removeEventListener("wheel", onWheel);
  // Re-attach whenever `pdf` or `continuousScroll` changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdf, continuousScroll]);

  // ── Keyboard shortcuts (stable handler via ref) ────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      // Allow search input to capture everything
      if (tag === "INPUT" || tag === "TEXTAREA") return;

      const { currentPage, pdf, selectedRedact } = kbRef.current;

      // ── Cheat sheet ────────────────────────────────────────────────────
      if (e.key === "?" && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        setCheatSheetOpen(v => !v);
        return;
      }

      // ── Ctrl shortcuts ────────────────────────────────────────────────
      if (e.ctrlKey || e.metaKey) {
        if (e.key === "f" || e.key === "F") {
          e.preventDefault();
          setSearchOpen(v => !v);
          return;
        }
        if (((e.key === "p" || e.key === "P") && e.shiftKey) || e.key === "k" || e.key === "K") {
          e.preventDefault();
          setPaletteOpen(v => !v);
          return;
        }
        if (e.key === ",") {
          e.preventDefault();
          openSettingsRef.current();
          return;
        }
        if (e.key === "s" || e.key === "S") {
          e.preventDefault();
          requestDownloadRef.current();
          return;
        }
        if ((e.key === "p" || e.key === "P") && !e.shiftKey) {
          e.preventDefault();
          printDocumentRef.current();
          return;
        }
        if ((e.key === "z" || e.key === "Z") && !e.shiftKey) {
          e.preventDefault();
          undoAnnotationRef.current();
          return;
        }
        if (((e.key === "z" || e.key === "Z") && e.shiftKey) || e.key === "y" || e.key === "Y") {
          e.preventDefault();
          redoAnnotationRef.current();
          return;
        }
        if (e.key === "+" || e.key === "=") { e.preventDefault(); zoomByRef.current(1); return; }
        if (e.key === "-")                  { e.preventDefault(); zoomByRef.current(-1); return; }
        if (e.key === "0")                  { e.preventDefault(); resetZoomRef.current(); return; }
        if (e.key === "\\") {
          e.preventDefault();
          if (kbRef.current.isSideBySide) closeSideBySide();
          else openSideBySide("horizontal", "new");
          return;
        }
      }

      if (e.key === "Escape") {
        if (paletteOpen)    { setPaletteOpen(false); return; }
        if (cheatSheetOpen) { setCheatSheetOpen(false); return; }
        if (searchOpen)     { setSearchOpen(false); return; }
        switchModeRef.current("view");
        return;
      }

      if (tag === "INPUT" || tag === "TEXTAREA") return;

      // ── Shift+H: toggle annotation visibility ────────────────────────
      if ((e.key === "h" || e.key === "H") && e.shiftKey && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        setAnnotationsVisible(v => !v);
        return;
      }

      // ── Mode shortcuts (no modifier) ──────────────────────────────────
      if (!e.ctrlKey && !e.metaKey && !e.altKey) {
        if (e.key === "v" || e.key === "V") { e.preventDefault(); switchModeRef.current("view"); return; }
        if (e.key === "a" || e.key === "A") { e.preventDefault(); switchModeRef.current("annotate"); setAnnotateSubMode("note"); return; }
        if (e.key === "h" || e.key === "H") { e.preventDefault(); switchModeRef.current("annotate"); setAnnotateSubMode("highlight"); return; }
        if (e.key === "u" || e.key === "U") { e.preventDefault(); switchModeRef.current("annotate"); setAnnotateSubMode("underline"); return; }
        if (e.key === "s" || e.key === "S") { e.preventDefault(); switchModeRef.current("annotate"); setAnnotateSubMode("strikethrough"); return; }
        if (e.key === "t" || e.key === "T") { e.preventDefault(); switchModeRef.current("annotate"); setAnnotateSubMode("freetext"); return; }
        if (e.key === "i" || e.key === "I") { e.preventDefault(); switchModeRef.current("annotate"); setAnnotateSubMode("ink"); return; }
        if (e.key === "g" || e.key === "G") { e.preventDefault(); switchModeRef.current("annotate"); setAnnotateSubMode("shape"); return; }
        if (e.key === "p" || e.key === "P") { e.preventDefault(); switchModeRef.current("annotate"); setAnnotateSubMode("stamp"); return; }
        if (e.key === "r" || e.key === "R") { e.preventDefault(); switchModeRef.current("redact"); return; }
        if (e.key === "c" || e.key === "C") { e.preventDefault(); switchModeRef.current("crop"); return; }
        if (e.key === "+" || e.key === "=") { zoomByRef.current(1); return; }
        if (e.key === "-")                  { zoomByRef.current(-1); return; }
        // Number keys: in ink mode 1-9 set stroke width on a weighted scale
        // (UX-05); otherwise 1-4 pick the highlight colour.
        if (e.key >= "1" && e.key <= "9") {
          const n = Number(e.key);
          if (kbRef.current.annotateSubMode === "ink") {
            setInkStrokeWidth(INK_WIDTH_SCALE[n - 1]);
          } else if (n <= 4) {
            setHlColor(n - 1);
          }
          return;
        }
      }

      // ── Navigation ────────────────────────────────────────────────────
      if (!pdf) return;
      const nav = (delta: number) => {
        const p = Math.max(1, Math.min(currentPage + delta, pdf.numPages));
        setCurrentPage(p); setPageInput(String(p));
      };
      if (e.key === "ArrowRight" || e.key === "ArrowDown" || e.key === "PageDown") { e.preventDefault(); nav(+1); return; }
      if (e.key === "ArrowLeft"  || e.key === "ArrowUp"   || e.key === "PageUp")   { e.preventDefault(); nav(-1); return; }
      if (e.key === "Home") { e.preventDefault(); setCurrentPage(1);             setPageInput("1");                    return; }
      if (e.key === "End")  { e.preventDefault(); setCurrentPage(pdf.numPages); setPageInput(String(pdf.numPages)); return; }

      // ── Delete selected redact box ────────────────────────────────────
      if ((e.key === "Delete" || e.key === "Backspace") && selectedRedact) {
        e.preventDefault();
        setRedactBoxes(prev => prev.filter(b => b.id !== selectedRedact));
        setSelectedRedact(null);
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Live ref for modifiedSinceDownload so close guard always sees the current value.
  const modifiedSinceDownloadRef = useRef(false);
  modifiedSinceDownloadRef.current = modifiedSinceDownload;

  // ── Tab close guard: warn before closing with uncommitted annotations or
  //    an undownloaded modified blob (A1 + P1-03 / P1-24). Both guards read
  //    live refs so they don't need to re-register on every state change.
  useEffect(() => {
    if (!tabId) return;
    registerCloseGuard(tabId, () => {
      const n = annotationsRef.current.length;
      if (n > 0) {
        return { safe: false, message: `You have ${n} uncommitted annotation${n !== 1 ? "s" : ""} that haven't been saved into the PDF.`, details: 'Commit them with "Done" first if you want to keep them.' };
      }
      if (modifiedSinceDownloadRef.current) {
        return { safe: false, message: "You have unsaved changes that have not been downloaded.", details: 'Click "Save / Download" (Ctrl+S) to save your work first.' };
      }
      return { safe: true };
    });
    return () => unregisterCloseGuard(tabId);
  }, [tabId, registerCloseGuard, unregisterCloseGuard]);

  // ── Auto-save / crash recovery (B10) ─────────────────────────────────────────
  // In packaged builds, checkpoint the working blob every 2 minutes.
  // Use the live ref so the interval always gets the most-recent blob without
  // needing to re-register. Clear the snapshot on clean download or tab close.
  const workingBlobForAutoSave = useRef<Blob | null>(null);
  workingBlobForAutoSave.current = workingBlob;
  useEffect(() => {
    if (!tabId) return;
    const cancel = startAutoSave(tabId, () => workingBlobForAutoSave.current);
    return () => {
      cancel();
      // Clean up the recovery file when the Viewer unmounts (tab closed cleanly).
      if (tabId) deleteRecovery(tabId).catch(() => {});
    };
  }, [tabId]); // eslint-disable-line

  // ── UI-scale ↔ PDF-zoom compensation (UX-04) ───────────────────────────────
  // The whole content area is CSS-zoomed by uiScale, so raising the UI scale
  // enlarges the PDF too. Counter-scale the page so its apparent size on screen
  // stays constant when the user changes UI scale in Settings.
  const prevUiScaleRef = useRef(settings.uiScale ?? 1);
  useEffect(() => {
    const prev = prevUiScaleRef.current;
    const next = settings.uiScale ?? 1;
    if (prev !== next) {
      prevUiScaleRef.current = next;
      setScale(s => parseFloat(Math.max(0.5, Math.min(s * (prev / next), 4)).toFixed(2)));
    }
  }, [settings.uiScale]);

  // ── Helpers ───────────────────────────────────────────────────────────────
  async function loadFile(f: File) {
    if (renderTaskRef.current) { renderTaskRef.current.cancel(); renderTaskRef.current = null; }
    setPdf(null);
    setFile(f);
    setWorkingBlob(null);
    setModifiedSinceDownload(false); // A1: new file, nothing unsaved yet
    setFilename(f.name);
    setCurrentPage(1);
    setPageInput("1");
    setAnnotations([]);
    setBakedAnnotations([]);
    setUndoStack([]); setRedoStack([]);
    setRedactBoxes([]);
    setCropSelection(null);
    doSwitchMode("view");
    setPanelTool(null);
    setSearchQuery("");
    setSearchResults([]);
    setQuickBar(null);
    setPasswordPrompt(null); setPasswordError(null); setPasswordInput("");
    const buf = await f.arrayBuffer();
    try {
      const doc = await pdfjsLib.getDocument({ data: buf }).promise;
      setPdf(doc);
    } catch (e) {
      // Password-protected PDF — prompt to unlock instead of failing (5.2).
      if (e instanceof Error && e.name === "PasswordException") {
        setPasswordPrompt({ file: f });
        return;
      }
      throw e;
    }
    // Schedule default fit mode application for the first render of this PDF
    fitOnLoadRef.current = settings.defaultFitMode ?? "width";
    // Activate any pending tool hint (from Home page card clicks)
    activatePendingTool();
  }

  // Unlock a password-protected PDF: decrypt once via the backend, then load the
  // decrypted copy so every later operation works without the password.
  async function unlockPdf() {
    if (!passwordPrompt) return;
    if (backendOk === false) {
      setPasswordError("The background service isn't running — can't unlock this PDF.");
      return;
    }
    setPasswordBusy(true); setPasswordError(null);
    try {
      const blob = await decryptPDF(passwordPrompt.file, passwordInput);
      const decrypted = new File([blob], passwordPrompt.file.name, { type: "application/pdf" });
      setPasswordPrompt(null); setPasswordInput("");
      await loadFile(decrypted);
    } catch {
      setPasswordError("Incorrect password, or this PDF can't be unlocked.");
    } finally {
      setPasswordBusy(false);
    }
  }

  async function applyBlob(blob: Blob) {
    if (renderTaskRef.current) { renderTaskRef.current.cancel(); renderTaskRef.current = null; }
    setPdf(null);
    setWorkingBlob(blob);
    setModifiedSinceDownload(true); // A1: any backend result means unsaved changes
    const buf = await blob.arrayBuffer();
    const doc = await pdfjsLib.getDocument({ data: buf }).promise;
    const page = Math.min(currentPage, doc.numPages);
    setCurrentPage(page);
    setPageInput(String(page));
    setPdf(doc);
  }

  // B3: Make document searchable via Tesseract OCR
  async function handleOcr() {
    if (!workingFile || ocrLoading) return;
    setOcrLoading(true);
    showToast("Running OCR; this may take a moment...");
    try {
      const blob = await ocrPDF(workingFile);
      await applyBlob(blob);
      showToast("OCR complete. Document is now searchable.");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "OCR failed.");
    } finally {
      setOcrLoading(false);
    }
  }

  // ── B6: PDF comparison / diff ──────────────────────────────────────────────

  async function handleComparePdfs() {
    if (!workingFile) return;
    const picked = await pickPdfFiles(false);
    const opened2 = picked[0];
    if (!opened2) return;
    const file2 = opened2.file;
    setDiffLoading(true);
    try {
      const result = await comparePDFs(workingFile, file2);
      const uuid = crypto.randomUUID();
      const entryA = new Map<number, DiffRegion[]>();
      const entryB = new Map<number, DiffRegion[]>();
      for (const pg of result.pages) {
        if (pg.diffs_a.length > 0) entryA.set(pg.page, pg.diffs_a as DiffRegion[]);
        if (pg.diffs_b.length > 0) entryB.set(pg.page, pg.diffs_b as DiffRegion[]);
      }
      const diffEntry: DiffEntry = { a: entryA, b: entryB };
      setDiff(uuid, diffEntry);
      setDiffHighlights(entryA);
      setDiffId(uuid);
      // Open the comparison file in the secondary pane. The toolHint "diff:UUID"
      // tells it to load its highlights from the diff store.
      openSideBySide("horizontal", "new", file2, `diff:${uuid}`);
      showToast("Diff ready — red = removed, green = added.");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Comparison failed.");
    } finally {
      setDiffLoading(false);
    }
  }

  function handleCloseDiff() {
    setDiffHighlights(null);
    if (diffId) { clearDiff(diffId); setDiffId(null); }
    showToast("Diff view closed.");
  }

  function doSwitchMode(m: CanvasMode) {
    setCanvasMode(m);
    setCropSelection(null); setCropLive(null);
    setRedactLive(null); setSelectedRedact(null);
    setAnnotateError(null); setRedactError(null); setCropError(null);
    setTextSelectActive(false);
    setQuickBar(null);
  }

  function switchMode(m: CanvasMode) {
    if (autoSaving) return;
    if (canvasMode === "annotate" && m !== "annotate" && annotations.length > 0 && workingFile) {
      autoSaveAnnotations(m);
      return;
    }
    doSwitchMode(m);
  }
  switchModeRef.current = switchMode;
  requestDownloadRef.current = requestDownload;
  printDocumentRef.current = printDocument;

  // ── Annotation history (multi-level undo / redo) ───────────────────────────

  /** Record current annotations into the undo stack, clear redo, then apply next. */
  function changeAnnotations(next: LocalAnnot[]) {
    setUndoStack(prev => [...prev.slice(-60), annotationsRef.current]);
    setRedoStack([]);
    setAnnotations(next);
  }

  function undoAnnotation() {
    setUndoStack(prev => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      setRedoStack(r => [...r.slice(-60), annotationsRef.current]);
      setAnnotations(last);
      return prev.slice(0, -1);
    });
  }

  function redoAnnotation() {
    setRedoStack(prev => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      setUndoStack(u => [...u.slice(-60), annotationsRef.current]);
      setAnnotations(last);
      return prev.slice(0, -1);
    });
  }

  undoAnnotationRef.current = undoAnnotation;
  redoAnnotationRef.current = redoAnnotation;

  // ── Unsaved-changes navigation guard ──────────────────────────────────────

  function doNavigate(nav: PendingNav) {
    if (nav.type === "home") {
      openTab("home");
    } else {
      openTab(nav.tabType, { file: nav.file });
    }
  }

  /** Navigate, but show the guard modal when there is unsaved work. */
  function maybeNavigate(nav: PendingNav) {
    if (workingBlob || annotations.length > 0) { setPendingNav(nav); return; }
    doNavigate(nav);
  }

  // Consume the pending tool hint set by router state (Home page card clicks).
  // Maps tool id strings to the appropriate panel or canvas mode.
  function activatePendingTool() {
    const tool = pendingToolRef.current;
    if (!tool) return;
    pendingToolRef.current = null;

    const panelTools = ["compress", "watermark", "split", "extract", "rotate-delete", "security", "pdf-to-images", "snippets"] as const;
    for (const pt of panelTools) {
      if (tool === pt) { togglePanel(pt); return; }
    }
    if (tool === "redact")   { doSwitchMode("redact"); return; }
    if (tool === "annotate") { doSwitchMode("annotate"); return; }
    if (tool === "crop")     { doSwitchMode("crop"); return; }
  }

  function goTo(n: number) {
    if (!pdf) return;
    const p = Math.max(1, Math.min(n, pdf.numPages));
    setCurrentPage(p); setPageInput(String(p));
  }

  function commitPageInput() {
    const n = parseInt(pageInput);
    if (!isNaN(n)) goTo(n); else setPageInput(String(currentPage));
    setEditingPage(false);
  }

  function commitFilename() {
    const t = filenameInput.trim();
    if (t) {
      const next = t.endsWith(".pdf") ? t : `${t}.pdf`;
      setFilename(next);
      // A rename is a modification: if nothing has been baked yet there is no
      // workingBlob, so Ctrl+S / the download button would stay disabled and the
      // user couldn't save the renamed file. Seed a workingBlob from the original
      // file so the rename alone is downloadable. (Fixes D-07.)
      if (!workingBlob && file) {
        setWorkingBlob(new Blob([file], { type: "application/pdf" }));
      }
    }
    setEditingFilename(false);
  }

  /**
   * Central download entry point used by Ctrl+S, the File menu, the toolbar
   * button, and the command palette. Handles the three states:
   *   - uncommitted annotations present → guard modal (commit first or discard)
   *   - nothing to download (no blob, no annotations) → toast
   *   - otherwise → download the working blob
   */
  function requestDownload() {
    if (annotations.length > 0) { setDownloadGuard(true); return; }
    if (!workingBlob) {
      showToast("No changes to download yet — annotate, redact, or crop first.");
      return;
    }
    downloadBlob(workingBlob, filename);
    setModifiedSinceDownload(false); // A1: cleared on download
  }

  function togglePanel(t: PanelTool) {
    setPanelTool(prev => (prev === t ? null : t));
  }

  // ── Print (5.6) ────────────────────────────────────────────────────────────
  // Print the current document (working copy if modified) via a hidden iframe so
  // only the PDF prints, not the app chrome.
  function printDocument() {
    const blob: Blob | null = workingBlob ?? file;
    if (!blob) { showToast("Open a PDF first."); return; }
    const url = URL.createObjectURL(blob);
    const iframe = document.createElement("iframe");
    iframe.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;";
    iframe.src = url;
    iframe.onload = () => {
      try { iframe.contentWindow?.focus(); iframe.contentWindow?.print(); }
      catch { showToast("Couldn't open the print dialog."); }
      setTimeout(() => {
        if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
        URL.revokeObjectURL(url);
      }, 60_000);
    };
    document.body.appendChild(iframe);
  }

  // ── Zoom (UX-02) ───────────────────────────────────────────────────────────
  // Step zooms snap to the nearest 10% in the direction of travel, then move in
  // 10% increments. Ctrl+scroll uses finer 5% steps for precise framing.
  function zoomBy(dir: 1 | -1, step = 0.1) {
    setScale(s => {
      const snapped = dir > 0
        ? Math.ceil(s * 10 - 1e-4) / 10   // next 10% up
        : Math.floor(s * 10 + 1e-4) / 10; // next 10% down
      const next = Math.abs(snapped - s) > 1e-3 ? snapped : s + dir * step;
      return parseFloat(Math.max(0.5, Math.min(next, 4)).toFixed(2));
    });
  }
  function resetZoom() { setScale(1); }
  zoomByRef.current = zoomBy;
  resetZoomRef.current = resetZoom;

  // ── Operations ────────────────────────────────────────────────────────────

  async function autoSaveAnnotations(targetMode: CanvasMode) {
    if (!workingFile || annotations.length === 0) { doSwitchMode(targetMode); return; }
    if (backendOk === false) {
      setAnnotateError("Annotation service unavailable — the background service isn't running.");
      return;
    }
    setAutoSaving(true); setAnnotateError(null);
    try {
      // The backend uses replace semantics: it clears every existing annotation
      // from the PDF, then writes the list we send. So we must send the FULL
      // authoritative set (already-baked + new draft), otherwise the previously
      // baked annotations would be wiped on this save. (Fixes E-08c.)
      const fullSet = [...bakedAnnotations, ...annotations];
      const blob = await annotatePDF(workingFile, toApiAnnotations(fullSet));
      await applyBlob(blob);
      // Move drafted annotations into the committed (baked) list so they remain
      // visible in the sidebar without being re-sent on the next save.
      setBakedAnnotations(prev => [...prev, ...annotations]);
      setAnnotations([]);
      setUndoStack([]);
      setRedoStack([]);
      doSwitchMode(targetMode);
    } catch (e) {
      setAnnotateError(e instanceof Error ? e.message : "Unknown error");
    } finally { setAutoSaving(false); }
  }

  async function applyRedactions() {
    if (!workingFile || redactBoxes.length === 0) return;
    setRedactLoading(true); setRedactError(null);
    try {
      const regions: RedactRegion[] = redactBoxes.map(b => ({ page: b.page, x0: b.x0, y0: b.y0, x1: b.x1, y1: b.y1 }));
      const blob = await redactPDF(workingFile, regions);
      setRedactBoxes([]);
      await applyBlob(blob);
      switchMode("view");
    } catch (e) { setRedactError(e instanceof Error ? e.message : "Unknown error"); }
    finally { setRedactLoading(false); }
  }

  async function applyCrop() {
    if (!workingFile || !cropSelection) return;
    setCropLoading(true); setCropError(null);
    try {
      const { x0, y0, x1, y1 } = cropSelection;
      const blob = await cropPDF(workingFile, x0, y0, x1, y1, applyToAll ? "all" : [currentPage]);
      setCropSelection(null);
      await applyBlob(blob);
      switchMode("view");
    } catch (e) { setCropError(e instanceof Error ? e.message : "Unknown error"); }
    finally { setCropLoading(false); }
  }

  // ── QuickActionBar handlers ───────────────────────────────────────────────

  /** Create a markup annotation from selection rects. Shared by the
   *  QuickActionBar buttons and the auto-apply path (P1-09). Goes through
   *  changeAnnotations so it lands on the undo stack. */
  function applyMarkup(type: "highlight" | "underline" | "strikethrough", rects: FracRect[], _text: string) {
    const bb = boundingBox(rects);
    const id = newId();
    const base = { id, page: currentPage, author: settings.author || undefined };
    const ann: LocalAnnot = type === "highlight"
      ? { ...base, type: "highlight", x0: bb.x0, y0: bb.y0, x1: bb.x1, y1: bb.y1, rects, colorIdx: hlColor, color: effectiveHlColors[hlColor].rgb }
      : { ...base, type, x0: bb.x0, y0: bb.y0, x1: bb.x1, y1: bb.y1, rects };
    changeAnnotations([...annotationsRef.current, ann]);
    window.getSelection()?.removeAllRanges();
    setQuickBar(null);
    if (canvasMode !== "annotate") doSwitchMode("annotate");
  }
  applyMarkupRef.current = applyMarkup;

  function createAnnotFromSelection(type: "highlight" | "underline" | "strikethrough") {
    if (!quickBar) return;
    applyMarkup(type, quickBar.rects, quickBar.text);
  }

  function addNoteAtSelection() {
    if (!quickBar) return;
    const bb = boundingBox(quickBar.rects);
    const id = newId();
    // Pre-populate the note with the selected text and switch to annotate/note
    // mode so it's immediately editable (double-click to refine). Goes through
    // changeAnnotations for undo. (UX-09 / G-02)
    const ann: LocalAnnot = {
      id, page: currentPage, type: "note",
      x: bb.x0, y: bb.y0, text: quickBar.text.slice(0, 200),
      author: settings.author || undefined,
    };
    changeAnnotations([...annotationsRef.current, ann]);
    window.getSelection()?.removeAllRanges();
    setQuickBar(null);
    doSwitchMode("annotate");
    setAnnotateSubMode("note");
  }

  // ── Annotation management ─────────────────────────────────────────────────

  /** Jump to an annotation's page AND select it in the overlay.
   *  Works for both draft (annotations) and committed (bakedAnnotations). */
  function focusAnnotation(id: AnnotId) {
    const isDraft = annotations.some(a => a.id === id);
    const ann = isDraft
      ? annotations.find(a => a.id === id)
      : bakedAnnotations.find(a => a.id === id);
    if (!ann) return;
    goTo(ann.page);
    setFocusAnnotId(id);
    // Only switch to annotate mode for draft annotations — baked ones are
    // always visible via the read-only layer regardless of canvasMode.
    if (isDraft && canvasMode !== "annotate") doSwitchMode("annotate");

    // Scroll the canvas so the annotation sits roughly in the middle of the
    // viewport, not just somewhere on the (possibly tall) page (UX-10). Delay
    // lets a cross-page navigation finish rendering the new page first.
    const yFrac = "y" in ann ? ann.y : ann.y0;
    setTimeout(() => {
      const area = canvasAreaRef.current, wrap = canvasWrapRef.current;
      if (!area || !wrap) return;
      const target = wrap.offsetTop + yFrac * wrap.offsetHeight - area.clientHeight / 2;
      area.scrollTo({ top: Math.max(0, target), behavior: settings.reduceMotion ? "auto" : "smooth" });
    }, 120);

    // Keep the row/overlay highlighted long enough to read as "selected".
    setTimeout(() => setFocusAnnotId(null), 1600);
  }

  function deleteAnnot(id: AnnotId) {
    changeAnnotations(annotations.filter(a => a.id !== id));
    // Also remove from baked list (display-only — PDF still has it until next save)
    setBakedAnnotations(prev => prev.filter(a => a.id !== id));
  }

  function changeAnnotStatus(id: AnnotId, status: AnnotStatus) {
    // Try draft list first; fall back to updating baked list (display-only change)
    if (annotations.some(a => a.id === id)) {
      changeAnnotations(annotations.map(a => a.id === id ? { ...a, status } : a));
    } else {
      setBakedAnnotations(prev => prev.map(a => a.id === id ? { ...a, status } as LocalAnnot : a));
    }
  }

  // ── Drop zone ──────────────────────────────────────────────────────────────
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: ([f]) => f && loadFile(f),
    accept: { "application/pdf": [".pdf"] },
    multiple: false,
  });

  // Open a PDF into THIS viewer tab. Native picker in Tauri captures the path
  // and records a recent; browser falls back to a hidden input.
  async function openFilePicker() {
    const opened = await pickPdfFiles(false);
    if (opened[0]) loadFile(opened[0].file);
  }

  // ── Overlay coordinate helper ─────────────────────────────────────────────
  function overlayFrac(el: HTMLElement, clientX: number, clientY: number) {
    const r = el.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min((clientX - r.left) / r.width, 1)),
      y: Math.max(0, Math.min((clientY - r.top) / r.height, 1)),
    };
  }

  // ── Redact drag ────────────────────────────────────────────────────────────
  function onRedactDown(e: React.MouseEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest("[data-rbox]")) return;
    setSelectedRedact(null);
    e.preventDefault();
    const el = e.currentTarget;
    const sf = overlayFrac(el, e.clientX, e.clientY);
    redactDragRef.current = { startFrac: sf };

    const onMove = (me: MouseEvent) => {
      if (!redactDragRef.current) return;
      const cur = overlayFrac(el, me.clientX, me.clientY);
      setRedactLive({ x0: Math.min(sf.x, cur.x), y0: Math.min(sf.y, cur.y), x1: Math.max(sf.x, cur.x), y1: Math.max(sf.y, cur.y) });
    };
    const onUp = (me: MouseEvent) => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      if (!redactDragRef.current) return;
      redactDragRef.current = null;
      const cur = overlayFrac(el, me.clientX, me.clientY);
      const box = { x0: Math.min(sf.x, cur.x), y0: Math.min(sf.y, cur.y), x1: Math.max(sf.x, cur.x), y1: Math.max(sf.y, cur.y) };
      setRedactLive(null);
      if (box.x1 - box.x0 > 0.01 && box.y1 - box.y0 > 0.005)
        setRedactBoxes(prev => [...prev, { id: newRid(), page: currentPage, ...box }]);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  // ── Crop drag ──────────────────────────────────────────────────────────────
  function onCropDown(e: React.MouseEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    e.preventDefault();
    const el = e.currentTarget;
    const sf = overlayFrac(el, e.clientX, e.clientY);
    cropDragRef.current = { startFrac: sf };
    setCropSelection(null);

    const onMove = (me: MouseEvent) => {
      if (!cropDragRef.current) return;
      const cur = overlayFrac(el, me.clientX, me.clientY);
      setCropLive({ x0: Math.min(sf.x, cur.x), y0: Math.min(sf.y, cur.y), x1: Math.max(sf.x, cur.x), y1: Math.max(sf.y, cur.y) });
    };
    const onUp = (me: MouseEvent) => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      if (!cropDragRef.current) return;
      cropDragRef.current = null;
      const cur = overlayFrac(el, me.clientX, me.clientY);
      const sel = { x0: Math.min(sf.x, cur.x), y0: Math.min(sf.y, cur.y), x1: Math.max(sf.x, cur.x), y1: Math.max(sf.y, cur.y) };
      setCropLive(null);
      if (sel.x1 - sel.x0 > 0.01 && sel.y1 - sel.y0 > 0.005) setCropSelection(sel);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  // ── Current-page search rects ──────────────────────────────────────────────
  // Each rect is tagged `active` when it belongs to the currently-focused match
  // (searchResults[searchIdx]), so the active match is visually distinct from the
  // other matches on the same page — regardless of its position on the page.
  const pageSearchRects = useMemo(() => {
    if (!searchQuery) return [] as Array<{ x0: number; y0: number; x1: number; y1: number; active: boolean }>;
    return searchResults
      .map((r, idx) => ({ r, active: idx === searchIdx }))
      .filter(({ r }) => r.page === currentPage)
      .flatMap(({ r, active }) => r.rects.map(rect => ({ ...rect, active })));
  }, [searchResults, currentPage, searchQuery, searchIdx]);

  // ── Derived display values ─────────────────────────────────────────────────
  const pageRedactBoxes = redactBoxes.filter(b => b.page === currentPage);
  const displayCrop     = cropLive ?? cropSelection;

  // ── Empty state ────────────────────────────────────────────────────────────
  if (!pdf || !file) {
    return (
      <div className="min-h-screen bg-stone-800 flex flex-col">
        <div className="bg-stone-900 border-b border-stone-700 px-4 py-3 flex items-center gap-3">
          <button onClick={() => openTab("home")} className="text-xs text-stone-400 hover:text-white flex items-center gap-1 transition">
            <ChevronLeft className="h-4 w-4" /> All tools
          </button>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center p-8 gap-6">
          <div {...getRootProps()} className={cn(
            "border-2 border-dashed rounded-2xl p-14 text-center cursor-pointer transition-colors max-w-md w-full",
            isDragActive ? "border-brand-500 bg-stone-700" : "border-stone-600 hover:border-stone-500 hover:bg-stone-700/40"
          )}>
            <input {...getInputProps()} />
            <UploadCloud className={cn("mx-auto mb-3 h-10 w-10 transition-colors", isDragActive ? "text-brand-500" : "text-stone-500")} />
            <p className="font-medium text-stone-300">{isDragActive ? "Drop PDF here" : "Open a PDF to start reviewing"}</p>
            <p className="mt-1 text-xs text-stone-500">Drop a file, or click to browse</p>
          </div>

          {/* Capability hints — discoverable features */}
          <div className="flex flex-col items-center gap-2 max-w-sm w-full">
            {[
              { key: "Ctrl+K", desc: "Command palette — find any tool or action" },
              { key: "A",      desc: "Annotate: highlights, notes, ink, shapes, stamps" },
              { key: "Ctrl+\\", desc: "Compare two documents side by side" },
              { key: "?",      desc: "Browse all keyboard shortcuts" },
            ].map(({ key, desc }) => (
              <div key={key} className="flex items-center gap-2.5 w-full">
                <kbd className="shrink-0 rounded border border-stone-600 bg-stone-700 px-1.5 py-0.5 text-[10px] font-mono text-stone-400 min-w-[3rem] text-center">{key}</kbd>
                <span className="text-[11px] text-stone-500">{desc}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ── Toolbar button helpers ─────────────────────────────────────────────────
  const modeBtn = (m: CanvasMode, icon: React.ReactNode, label: string, key: string) => (
    <button key={m} onClick={() => switchMode(m)} title={`${label} (${key})`}
      className={cn(
        "flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition",
        canvasMode === m ? "bg-brand-600 text-white shadow" : "text-stone-300 hover:bg-stone-700"
      )}>
      {icon} {label}
      <kbd className={cn(
        "ml-0.5 rounded border px-1 py-0 text-[9px] font-mono leading-4 transition",
        canvasMode === m
          ? "border-white/25 bg-white/10 text-white/70"
          : "border-stone-600 bg-stone-800 text-stone-500"
      )}>{key}</kbd>
    </button>
  );

  const sidebarFile = workingFile ?? file;

  // ── Menu bar definitions ──────────────────────────────────────────────────
  function buildViewerMenus(): MenuDef[] {
    const hasDoc = !!pdf;

    return [
      {
        label: "File",
        items: [
          { label: "Open…",               shortcut: "Ctrl+O",       action: () => openFilePicker() },
          { label: "Save / Download",      shortcut: "Ctrl+S",       action: () => requestDownload() },
          { type: "separator" },
          { label: "Export Review Report (.md)",   action: () => downloadAnnotationReport([...bakedAnnotations, ...annotations], filename), disabled: bakedAnnotations.length === 0 && annotations.length === 0 },
          { label: "Export Review Report (.pdf)", action: async () => {
              const allAnns = [...bakedAnnotations, ...annotations];
              if (!workingFile || allAnns.length === 0) { showToast("No annotations to export."); return; }
              try {
                const blob = await annotationReportPdf(workingFile, toApiAnnotations(allAnns) as Annotation[]);
                downloadBlob(blob, filename.replace(/\.pdf$/i, "") + "_review_report.pdf");
              } catch (e) { showToast(e instanceof Error ? e.message : "Export failed."); }
            }, disabled: bakedAnnotations.length === 0 && annotations.length === 0 },
          { label: "Print…",               shortcut: "Ctrl+P", action: () => printDocument(), disabled: !hasDoc },
          { type: "separator" },
          { label: "Settings…",            shortcut: "Ctrl+,", action: () => openSettings() },
        ],
      },
      {
        label: "Document",
        items: [
          { label: "Annotate",         shortcut: "A", action: () => switchMode("annotate"),               disabled: !hasDoc },
          { label: "Redact",           shortcut: "R", action: () => switchMode("redact"),                 disabled: !hasDoc },
          { label: "Crop",             shortcut: "C", action: () => switchMode("crop"),                   disabled: !hasDoc },
          { type: "separator" },
          { label: "Compress PDF",           action: () => togglePanel("compress"),       disabled: !hasDoc },
          { label: "Add Watermark",          action: () => togglePanel("watermark"),      disabled: !hasDoc },
          { label: "Encrypt / Decrypt",      action: () => togglePanel("security"),       disabled: !hasDoc },
          { type: "separator" },
          { label: "Split PDF",              action: () => togglePanel("split"),          disabled: !hasDoc },
          { label: "Extract Pages",          action: () => togglePanel("extract"),        disabled: !hasDoc },
          { label: "Rotate / Delete Pages",  action: () => togglePanel("rotate-delete"), disabled: !hasDoc },
          { label: "Organise Pages",         action: () => maybeNavigate({ type: "tab", tabType: "rearrange", file: workingFile ?? file ?? undefined }), disabled: !hasDoc },
          { label: "Merge PDFs",             action: () => maybeNavigate({ type: "tab", tabType: "merge", file: workingFile ?? file ?? undefined }) },
          { type: "separator" },
          { label: "Fill Form",             action: () => togglePanel("form"),           disabled: !hasDoc },
          { label: "Export to Images",       action: () => togglePanel("pdf-to-images"), disabled: !hasDoc },
          { type: "separator" },
          { label: ocrLoading ? "Running OCR…" : "Make Searchable (OCR)",
            action: () => handleOcr(),
            disabled: !hasDoc || ocrLoading },
          { label: "Edit Table of Contents",
            action: () => setTocEditorOpen(true),
            disabled: !hasDoc },
          { type: "separator" },
          { label: diffLoading ? "Comparing…" : diffHighlights ? "Close Diff View" : "Compare with PDF…",
            action: () => diffHighlights ? handleCloseDiff() : handleComparePdfs(),
            disabled: !hasDoc || diffLoading },
        ],
      },
      {
        label: "View",
        items: [
          { label: "Zoom In",          shortcut: "+",        action: () => zoomBy(1) },
          { label: "Zoom Out",         shortcut: "−",        action: () => zoomBy(-1) },
          { label: "Reset Zoom (100%)", shortcut: "Ctrl+0",  action: () => resetZoom() },
          { label: "Fit Width",                             action: async () => {
              if (!canvasAreaRef.current) return;
              const w = canvasAreaRef.current.clientWidth - 64;
              let pw: number;
              if (continuousScroll && pdf) {
                // In continuous mode the canvasRef canvas may not exist; use page 1 viewport.
                const pg = await pdf.getPage(1);
                pw = pg.getViewport({ scale }).width / scale;
              } else {
                if (!canvasRef.current) return;
                pw = canvasRef.current.width / scale;
              }
              setScale(parseFloat(Math.max(0.5, Math.min(w / pw, 4)).toFixed(2)));
            }
          },
          { type: "separator" },
          { label: annotationsVisible ? "Hide annotations" : "Show annotations", shortcut: "Shift+H", action: () => setAnnotationsVisible(v => !v), checked: annotationsVisible },
          { label: "Show Thumbnails",    action: () => setSidebarCollapsed(v => !v), checked: !sidebarCollapsed },
          { label: "Show Side Panel",    action: () => setRailCollapsed(v => !v),    checked: !railCollapsed },
          { label: "Mini-map",          action: () => setMiniMapVisible(v => !v),   checked: miniMapVisible },
          { type: "separator" },
          { label: "Annotations panel",  action: () => { setRailCollapsed(false); setRailTab("annotations"); },  disabled: !hasDoc },
          { label: "Outline & Bookmarks", action: () => { setRailCollapsed(false); setRailTab("document"); },     disabled: !hasDoc },
          { type: "separator" },
          { label: "Side by Side — Same Document",                       action: () => openSideBySide("horizontal", "mirror", workingFile ?? file), disabled: !hasDoc },
          { label: "Side by Side — New Document",   shortcut: "Ctrl+\\",  action: () => openSideBySide("horizontal", "new") },
          ...(isSideBySide ? [{ label: "Close Side by Side",  shortcut: "Ctrl+\\", action: () => closeSideBySide() }] : []),
          ...(isSideBySide ? [{ label: syncNavigation ? "Sync navigation: On" : "Sync navigation: Off", checked: syncNavigation, action: () => setSyncNavigation(v => !v) }] : []),
          { type: "separator" },
          { label: continuousScroll ? "Single-page view" : "Continuous Scroll", shortcut: "Ctrl+Alt+S",
            checked: continuousScroll, action: () => setContinuousScroll(v => !v), disabled: !hasDoc },
        ],
      },
    ];
  }

  return (
    <div className="h-full flex flex-col bg-stone-800 viewer-light:bg-stone-100 overflow-hidden">

      {/* ── Top bar ───────────────────────────────────────────────────────────── */}
      {/* Hidden dropzone input — triggered via openFilePicker() from File menu */}
      <div {...getRootProps()} className="hidden"><input {...getInputProps()} /></div>

      <div className="bg-stone-900 border-b border-stone-700 px-3 py-1.5 flex items-center gap-2 shrink-0 min-w-0">
        {/* Logo + Home link */}
        <button
          onClick={() => openTab("home")}
          title="Back to home"
          className="shrink-0 flex items-center gap-1.5 text-stone-400 hover:text-white transition focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-500/50 rounded"
        >
          <svg width="16" height="16" viewBox="0 0 32 32" fill="none" aria-hidden="true">
            <rect x="2" y="9" width="18" height="18" stroke="#d97706" strokeWidth="1.5" strokeLinejoin="round"/>
            <line x1="2"  y1="9"  x2="20" y2="27" stroke="#d97706" strokeWidth="1.5"/>
            <line x1="20" y1="9"  x2="2"  y2="27" stroke="#d97706" strokeWidth="1.5"/>
            <line x1="20" y1="9"  x2="30" y2="2"  stroke="#d97706" strokeWidth="1.5"/>
            <line x1="30" y1="2"  x2="30" y2="13" stroke="#d97706" strokeWidth="1.5"/>
            <line x1="20" y1="13" x2="30" y2="13" stroke="#d97706" strokeWidth="1.5"/>
            <line x1="20" y1="9"  x2="30" y2="13" stroke="#d97706" strokeWidth="1.5"/>
            <circle cx="11" cy="18" r="1.5" fill="#d97706"/>
          </svg>
        </button>

        <div className="w-px h-4 bg-stone-700 shrink-0" />

        {/* Editable filename */}
        {editingFilename ? (
          <div className="flex items-center gap-1.5 min-w-0 w-48">
            <input autoFocus value={filenameInput}
              onChange={e => setFilenameInput(e.target.value)}
              onBlur={commitFilename}
              onKeyDown={e => { if (e.key === "Enter") commitFilename(); if (e.key === "Escape") setEditingFilename(false); }}
              className="flex-1 min-w-0 bg-stone-800 border border-brand-500 rounded px-2 py-0.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
            <button onClick={commitFilename} aria-label="Confirm rename" className="shrink-0 text-green-400 hover:text-green-300 transition focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-green-500/50 rounded"><Check className="h-3.5 w-3.5" /></button>
            <button onClick={() => setEditingFilename(false)} aria-label="Cancel rename" className="shrink-0 text-stone-400 hover:text-white transition focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-stone-500/50 rounded"><X className="h-3.5 w-3.5" /></button>
          </div>
        ) : (
          <button onClick={() => { setFilenameInput(filename); setEditingFilename(true); }} title="Click to rename"
            aria-label={filename ? `Rename file (currently ${filename})` : "Open or rename file"}
            className="flex items-center gap-1 group min-w-0 max-w-[200px]">
            <span className="text-xs text-stone-300 truncate group-hover:text-white transition">{filename || "No file"}</span>
            <Pencil className="h-2.5 w-2.5 text-stone-600 group-hover:text-stone-400 shrink-0 transition" />
          </button>
        )}

        <div className="w-px h-4 bg-stone-700 shrink-0" />

        {/* Menu bar: File / Document / View */}
        <MenuBar menus={buildViewerMenus()} />

        {/* Right side */}
        <div className="ml-auto flex items-center gap-2 shrink-0">
          {/* Side by side toggle */}
          {!isSecondaryPane && !!pdf && (
            isSideBySide ? (
              <button
                onClick={() => closeSideBySide()}
                title="Close side by side (Ctrl+\)"
                className="flex items-center gap-1.5 rounded-lg p-1.5 text-cyan-400 bg-cyan-500/10 hover:bg-cyan-500/20 transition"
              >
                <Columns className="h-3.5 w-3.5" />
                <span className="text-[10px] font-medium hidden sm:inline">Side by Side</span>
              </button>
            ) : (
              <button
                onClick={() => openSideBySide("horizontal", "mirror", workingFile ?? file)}
                title="View side by side (Ctrl+\)"
                className="flex items-center gap-1.5 rounded-lg p-1.5 text-stone-500 hover:text-stone-300 hover:bg-stone-700 transition"
              >
                <Columns className="h-3.5 w-3.5" />
                <span className="text-[10px] font-medium hidden sm:inline">Side by Side</span>
              </button>
            )
          )}

          {/* Settings is reached via the File menu (Settings…), the tab-bar gear,
              or Ctrl+, — no separate gear here to avoid a duplicate entry point. */}

          {/* Author badge — primary pane only */}
          {!isSecondaryPane && (
            editingAuthor ? (
              <input
                autoFocus
                value={authorInput}
                onChange={e => setAuthorInput(e.target.value)}
                onBlur={() => { updateSettings({ author: authorInput.trim() }); setEditingAuthor(false); }}
                onKeyDown={e => {
                  if (e.key === "Enter") { updateSettings({ author: authorInput.trim() }); setEditingAuthor(false); }
                  if (e.key === "Escape") setEditingAuthor(false);
                }}
                placeholder="Your name"
                className="w-24 bg-stone-800 border border-brand-500 rounded px-2 py-0.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            ) : (
              <button
                onClick={() => { setAuthorInput(settings.author); setEditingAuthor(true); }}
                title="Set your name for annotations"
                aria-label={settings.author ? `Author: ${settings.author}` : "Set author name"}
                className="flex items-center gap-1 text-[10px] text-stone-500 hover:text-stone-300 transition"
              >
                <User className="h-3 w-3" />
                <span className="hidden sm:inline">{settings.author || "Add your name"}</span>
              </button>
            )
          )}

          {/* Backend status — primary pane only. When offline, show a visible
              label so the failure isn't communicated by a tiny dot alone. */}
          {!isSecondaryPane && (
            <>
              <div
                role="status"
                aria-label={backendOk === null ? "Checking backend" : backendOk ? "Backend connected" : "Backend offline"}
                title={backendOk === null ? "Checking background service…" : backendOk ? "Background service connected" : "Background service unavailable — annotation saving, redaction, compression, and cropping require it"}
                className={cn("w-2 h-2 rounded-full shrink-0 transition-colors",
                  backendOk === null ? "bg-stone-600" : backendOk ? "bg-green-500" : "bg-red-500 animate-pulse")}
              />
              {backendOk === false && (
                <span
                  title="Background service unavailable — annotation saving, redaction, compression, and cropping require it"
                  className="text-[10px] font-medium text-red-400 shrink-0 hidden sm:inline"
                >
                  Service offline
                </span>
              )}
              {rendering && <span className="text-[10px] text-stone-500 animate-pulse">Rendering…</span>}
            </>
          )}

          {/* Download button — primary pane only */}
          {!isSecondaryPane && workingBlob && (
            <button
              onClick={() => requestDownload()}
              title="Download modified PDF (Ctrl+S)"
              className="flex items-center gap-1.5 rounded-lg bg-brand-500 hover:bg-brand-600 px-2.5 py-1.5 text-xs font-semibold text-white transition shadow-lg"
            >
              <Download className="h-3.5 w-3.5" /> Download
            </button>
          )}
        </div>
      </div>

      {/* ── Middle: sidebar + canvas + right panel ─────────────────────────────── */}
      <div className="flex-1 flex overflow-hidden">

        {/* Left: thumbnail sidebar */}
        <ThumbnailSidebar
          file={sidebarFile}
          currentPage={currentPage}
          onSelect={goTo}
          collapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed(c => !c)}
          annotations={[...bakedAnnotations, ...annotations]}
          accent={isSecondaryPane ? "cyan" : "amber"}
        />

        {/* Center: canvas + context bars + toolbar */}
        <div className="flex-1 flex flex-col overflow-hidden">

          {/* First-run hint — dismissible, shows once */}
          {showFirstRunHint && !isSecondaryPane && (
            <div className="shrink-0 flex items-center gap-3 px-4 py-2 bg-stone-900 border-b border-stone-700 text-[11px] text-stone-300">
              <span className="flex items-center gap-5 flex-wrap">
                <span>Press <kbd className="rounded border border-stone-600 bg-stone-700 px-1.5 py-px font-mono text-stone-200">A</kbd> to annotate — or select text to get quick options</span>
                <span className="w-px h-3 bg-stone-700 shrink-0" />
                <span><kbd className="rounded border border-stone-600 bg-stone-700 px-1.5 py-px font-mono text-stone-200">Ctrl+K</kbd> command palette</span>
                <span className="w-px h-3 bg-stone-700 shrink-0" />
                <span><kbd className="rounded border border-stone-600 bg-stone-700 px-1.5 py-px font-mono text-stone-200">?</kbd> all shortcuts</span>
              </span>
              <button onClick={dismissFirstRunHint} className="ml-auto shrink-0 text-stone-500 hover:text-stone-300 transition" aria-label="Dismiss tips">
                <X className="h-3 w-3" />
              </button>
            </div>
          )}

          {/* Help mode — contextual explanation of the current tool (6.4) */}
          {helpMode && (() => {
            const h = helpForMode(canvasMode, annotateSubMode);
            return (
              <div className="shrink-0 flex items-start gap-2 px-4 py-1.5 bg-brand-950/40 border-b border-brand-500/30 text-[11px] text-stone-300">
                <HelpCircle className="h-3.5 w-3.5 shrink-0 text-brand-500 mt-px" />
                <span><span className="font-semibold text-brand-300">{h.title}:</span> {h.body}</span>
                <button onClick={() => setHelpModeState(false)} className="ml-auto shrink-0 text-stone-500 hover:text-stone-300 transition" aria-label="Turn off help">
                  <X className="h-3 w-3" />
                </button>
              </div>
            );
          })()}

          {/* Canvas area — single-page or continuous (B1) */}
          {continuousScroll && pdf ? (
            <ContinuousCanvas
              pdf={pdf}
              scale={scale}
              currentPage={currentPage}
              onPageChange={p => { setCurrentPage(p); setPageInput(String(p)); }}
              canvasWrapRef={canvasWrapRef as React.MutableRefObject<HTMLDivElement | null>}
              canvasAreaRef={canvasAreaRef as React.MutableRefObject<HTMLDivElement | null>}
              freeRectDragRef={freeRectDragRef}
              annotations={annotations}
              bakedAnnotations={bakedAnnotations}
              onAnnotationsChange={changeAnnotations}
              canvasMode={canvasMode}
              annotateSubMode={annotateSubMode}
              hlColorIdx={hlColor}
              highlightColors={effectiveHlColors}
              textSelectActive={textSelectActive}
              author={settings.author}
              shapeSubType={shapeSubType}
              inkStrokeWidth={inkStrokeWidth}
              inkColor={INK_COLORS[inkColorIdx].rgb}
              stampLabel={stampLabel}
              snippets={settings.snippets}
              annotationsVisible={annotationsVisible}
              focusAnnotId={focusAnnotId}
              forceEditAnnotId={forceEditAnnotId}
              onForceEditConsumed={() => setForceEditAnnotId(null)}
              onNavigateAnnot={focusAnnotation}
              hasOverlayAnnots={hasOverlayAnnots}
              reduceMotion={settings.reduceMotion}
              searchResults={searchResults}
              searchIdx={searchIdx}
              searchQuery={searchQuery}
              redactBoxes={redactBoxes}
              selectedRedact={selectedRedact}
              onRedactBoxesChange={setRedactBoxes}
              onSelectRedact={setSelectedRedact}
              cropSelection={cropSelection}
              cropLive={cropLive}
              onCropSelChange={setCropSelection}
              onCropLiveChange={setCropLive}
              diffHighlights={diffHighlights ?? undefined}
            />
          ) : (
          <div ref={canvasAreaRef} className="flex-1 overflow-auto scrollbar-dark flex flex-col items-center py-8 px-4">

            <div
              ref={canvasWrapRef}
              className="relative inline-block shadow-2xl rounded"
              style={{
                lineHeight: 0,
                // Gentle fade-in when a new page renders so page changes don't
                // snap (UX-01). Respects reduce-motion.
                opacity: rendering ? 0.65 : 1,
                transition: settings.reduceMotion ? "none" : "opacity 160ms ease-out",
              }}
              onMouseDown={e => {
                // Record drag-start for free-rect fallback when textSelectActive=true
                if (!textSelectActive || canvasMode !== "annotate") return;
                const wrap = canvasWrapRef.current;
                if (!wrap) return;
                const rect = wrap.getBoundingClientRect();
                freeRectDragRef.current = {
                  x: (e.clientX - rect.left) / rect.width,
                  y: (e.clientY - rect.top)  / rect.height,
                };
              }}
            >
              <canvas
                ref={canvasRef}
                role="img"
                aria-label={`${filename || "Document"} — page ${currentPage}${pdf ? ` of ${pdf.numPages}` : ""}`}
                className="rounded block"
              />

              {/* ── Text layer — mounted in annotate AND view mode ──────────────
                   View mode: always selectable so the quick markup bar can be
                   summoned over a selection (UX-05). Annotate mode: selectable
                   only in the text-markup sub-modes (textSelectActive). ── */}
              {(canvasMode === "annotate" || canvasMode === "view") && pdf && (
                <TextLayer
                  pdf={pdf}
                  pageNum={currentPage}
                  scale={scale}
                  active={canvasMode === "view" ? true : textSelectActive}
                />
              )}

              {/* ── Annotation overlay (always rendered) ────────────────────
                   In annotate mode: draft annotations are fully interactive.
                   In all other modes: only the baked read-only layer shows.
                   PDF.js annotation widgets are suppressed (annotationMode: 0)
                   so this overlay is always the source of truth.           ── */}
              <AnnotationLayer
                annotations={canvasMode === "annotate" ? annotations : []}
                // In a mirror pane the partner's draft annotations arrive via the
                // mirror channel while this pane sits in view mode; show them as
                // read-only so they appear live instead of only after switching
                // to annotate mode (P1-26).
                readOnlyAnnotations={
                  canvasMode === "annotate"
                    ? bakedAnnotations
                    : mirrorGroupId
                      ? [...bakedAnnotations, ...annotations]
                      : bakedAnnotations
                }
                page={currentPage}
                createMode={annotateSubMode}
                hlColorIdx={hlColor}
                highlightColors={effectiveHlColors}
                onAnnotationsChange={changeAnnotations}
                textSelectActive={textSelectActive}
                author={settings.author}
                shapeSubType={shapeSubType}
                inkStrokeWidth={inkStrokeWidth}
                inkColor={INK_COLORS[inkColorIdx].rgb}
                stampLabel={stampLabel}
                snippets={settings.snippets}
                visible={annotationsVisible}
                focusAnnotId={focusAnnotId}
                forceEditAnnotId={forceEditAnnotId}
                onForceEditConsumed={() => setForceEditAnnotId(null)}
                onNavigateAnnot={focusAnnotation}
                readOnly={canvasMode !== "annotate"}
              />

              {/* ── Search result highlight overlays ───────────────────────── */}
              {pageSearchRects.length > 0 && (
                <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 5 }}>
                  {pageSearchRects.map((r, i) => (
                    <div key={i} className="absolute" style={{
                      left: `${r.x0 * 100}%`, top: `${r.y0 * 100}%`,
                      width: `${(r.x1 - r.x0) * 100}%`, height: `${(r.y1 - r.y0) * 100}%`,
                      backgroundColor: r.active
                        ? "rgba(255,120,0,0.45)"   // active match — warm amber
                        : "rgba(255,200,0,0.35)",  // other matches — warm yellow
                      outline: r.active ? "1.5px solid rgba(217,119,6,0.9)" : "none",
                      borderRadius: 2,
                    }} />
                  ))}
                </div>
              )}

              {/* ── Diff highlights (B6) ───────────────────────────────────── */}
              {diffHighlights && (() => {
                const pageDiffs = diffHighlights.get(currentPage) ?? [];
                return pageDiffs.length > 0 && (
                  <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 6 }}>
                    {pageDiffs.map((d, i) => (
                      <div key={i} title={d.text} className="absolute" style={{
                        left: `${d.x0 * 100}%`, top: `${d.y0 * 100}%`,
                        width: `${(d.x1 - d.x0) * 100}%`,
                        height: `${Math.max((d.y1 - d.y0) * 100, 1.2)}%`,
                        backgroundColor: d.type === "remove" ? "rgba(220,38,38,0.35)" : "rgba(34,197,94,0.35)",
                        outline: d.type === "remove" ? "1px solid rgba(220,38,38,0.6)" : "1px solid rgba(34,197,94,0.6)",
                        borderRadius: 1,
                      }} />
                    ))}
                  </div>
                );
              })()}

              {/* ── Redact overlay ─────────────────────────────────────────── */}
              {canvasMode === "redact" && (
                <div className="absolute inset-0 cursor-crosshair" style={{ userSelect: "none" }}
                  onMouseDown={onRedactDown}
                >
                  {pageRedactBoxes.map(box => (
                    <div key={box.id} data-rbox="true"
                      className={cn("absolute pointer-events-auto", selectedRedact === box.id && "ring-2 ring-offset-0 ring-brand-400")}
                      style={{
                        left: `${box.x0 * 100}%`, top: `${box.y0 * 100}%`,
                        width: `${(box.x1 - box.x0) * 100}%`, height: `${(box.y1 - box.y0) * 100}%`,
                        background: "rgba(0,0,0,0.88)", cursor: "pointer",
                      }}
                      onClick={e => { e.stopPropagation(); setSelectedRedact(box.id === selectedRedact ? null : box.id); }}
                    >
                      {selectedRedact === box.id && (
                        <button
                          className="absolute -top-1.5 -right-1.5 z-10 bg-red-500 hover:bg-red-400 text-white rounded-full w-4 h-4 flex items-center justify-center text-[10px] transition"
                          onMouseDown={e => e.stopPropagation()}
                          onClick={e => { e.stopPropagation(); setRedactBoxes(prev => prev.filter(b => b.id !== box.id)); setSelectedRedact(null); }}
                        >×</button>
                      )}
                    </div>
                  ))}
                  {redactLive && (
                    <div className="absolute pointer-events-none" style={{
                      left: `${redactLive.x0 * 100}%`, top: `${redactLive.y0 * 100}%`,
                      width: `${(redactLive.x1 - redactLive.x0) * 100}%`, height: `${(redactLive.y1 - redactLive.y0) * 100}%`,
                      background: "rgba(0,0,0,0.55)", border: "2px dashed rgba(255,255,255,0.4)",
                    }} />
                  )}
                </div>
              )}

              {/* ── Crop overlay ───────────────────────────────────────────── */}
              {canvasMode === "crop" && (
                <div className="absolute inset-0 cursor-crosshair" style={{ userSelect: "none" }}
                  onMouseDown={onCropDown}
                >
                  {displayCrop && (
                    <div className="absolute inset-0 pointer-events-none">
                      <div className="absolute bg-black/40" style={{ top: 0, left: 0, right: 0, height: `${displayCrop.y0 * 100}%` }} />
                      <div className="absolute bg-black/40" style={{ bottom: 0, left: 0, right: 0, top: `${displayCrop.y1 * 100}%` }} />
                      <div className="absolute bg-black/40" style={{ top: `${displayCrop.y0 * 100}%`, bottom: `${(1 - displayCrop.y1) * 100}%`, left: 0, width: `${displayCrop.x0 * 100}%` }} />
                      <div className="absolute bg-black/40" style={{ top: `${displayCrop.y0 * 100}%`, bottom: `${(1 - displayCrop.y1) * 100}%`, right: 0, left: `${displayCrop.x1 * 100}%` }} />
                      <div className="absolute" style={{ left: `${displayCrop.x0 * 100}%`, top: `${displayCrop.y0 * 100}%`, width: `${(displayCrop.x1 - displayCrop.x0) * 100}%`, height: `${(displayCrop.y1 - displayCrop.y0) * 100}%`, border: "2px solid #d97706" }} />
                    </div>
                  )}
                  {!displayCrop && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <span className="bg-black/50 text-white text-xs px-3 py-1.5 rounded-full">Drag to select crop area</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
          )} {/* end single-page / continuous ternary */}

          {/* ── Context toolbars ────────────────────────────────────────────── */}

          {canvasMode === "annotate" && (
            <div className="shrink-0 px-4 pb-2 flex justify-center">
              <div className="flex flex-wrap items-center gap-1.5 bg-stone-900 border border-stone-700 rounded-xl px-3 py-2 shadow-lg w-full max-w-4xl">

                {/* ── Mode groups ─────────────────────────────────────────── */}
                {/* Group 1: Text markup */}
                <div className="flex gap-0.5">
                  {([
                    { m: "note"          as CreateMode, icon: <MessageSquare className="h-3.5 w-3.5" />, label: "Note",      key: "A" },
                    { m: "highlight"     as CreateMode, icon: <Highlighter   className="h-3.5 w-3.5" />, label: "Highlight", key: "H" },
                    { m: "underline"     as CreateMode, icon: <Underline     className="h-3.5 w-3.5" />, label: "Underline", key: "U" },
                    { m: "strikethrough" as CreateMode, icon: <Strikethrough className="h-3.5 w-3.5" />, label: "Strike",    key: "S" },
                  ]).map(({ m, icon, label, key }) => {
                    const active = annotateSubMode === m;
                    return (
                      <button key={m} onClick={() => setAnnotateSubMode(m)}
                        title={`${label} (${key})`}
                        aria-pressed={active}
                        className={cn("flex items-center gap-1 rounded-md px-2 py-1.5 text-[11px] font-medium transition focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-500/60",
                          active ? "bg-brand-600 text-white" : "text-stone-400 hover:bg-stone-700 hover:text-stone-200")}>
                        {icon}
                        <span className="hidden sm:inline">{label}</span>
                        <kbd className={cn("hidden sm:inline shrink-0 rounded border px-[3px] py-px text-[8px] font-mono leading-none", active ? "border-white/25 bg-white/10 text-white/60" : "border-stone-600/60 bg-stone-800 text-stone-500")}>{key}</kbd>
                      </button>
                    );
                  })}
                </div>

                <div className="w-px h-5 bg-stone-700 shrink-0 mx-0.5" />

                {/* Group 2: Drawing & text */}
                <div className="flex gap-0.5">
                  {([
                    { m: "freetext" as CreateMode, icon: <Type    className="h-3.5 w-3.5" />, label: "Text",  key: "T" },
                    { m: "ink"      as CreateMode, icon: <PenLine className="h-3.5 w-3.5" />, label: "Ink",   key: "I" },
                    { m: "shape"    as CreateMode, icon: <Square  className="h-3.5 w-3.5" />, label: "Shape", key: "G" },
                  ]).map(({ m, icon, label, key }) => {
                    const active = annotateSubMode === m;
                    return (
                      <button key={m} onClick={() => setAnnotateSubMode(m)}
                        title={`${label} (${key})`}
                        aria-pressed={active}
                        className={cn("flex items-center gap-1 rounded-md px-2 py-1.5 text-[11px] font-medium transition focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-500/60",
                          active ? "bg-brand-600 text-white" : "text-stone-400 hover:bg-stone-700 hover:text-stone-200")}>
                        {icon}
                        <span className="hidden sm:inline">{label}</span>
                        <kbd className={cn("hidden sm:inline shrink-0 rounded border px-[3px] py-px text-[8px] font-mono leading-none", active ? "border-white/25 bg-white/10 text-white/60" : "border-stone-600/60 bg-stone-800 text-stone-500")}>{key}</kbd>
                      </button>
                    );
                  })}
                </div>

                <div className="w-px h-5 bg-stone-700 shrink-0 mx-0.5" />

                {/* Group 3: Stamp */}
                <div className="flex gap-0.5">
                  {(() => {
                    const active = annotateSubMode === "stamp";
                    return (
                      <button onClick={() => setAnnotateSubMode("stamp")}
                        title="Stamp (P)"
                        aria-pressed={active}
                        className={cn("flex items-center gap-1 rounded-md px-2 py-1.5 text-[11px] font-medium transition focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-500/60",
                          active ? "bg-brand-600 text-white" : "text-stone-400 hover:bg-stone-700 hover:text-stone-200")}>
                        <Stamp className="h-3.5 w-3.5" />
                        <span className="hidden sm:inline">Stamp</span>
                        <kbd className={cn("hidden sm:inline shrink-0 rounded border px-[3px] py-px text-[8px] font-mono leading-none", active ? "border-white/25 bg-white/10 text-white/60" : "border-stone-600/60 bg-stone-800 text-stone-500")}>P</kbd>
                      </button>
                    );
                  })()}
                </div>

                {/* ── Contextual options (inline, after a divider) ────────── */}
                {annotateSubMode === "highlight" && (
                  <>
                    <div className="w-px h-5 bg-stone-700 shrink-0 mx-0.5" />
                    <div className="flex items-center gap-1">
                      {effectiveHlColors.map((c, i) => (
                        <button key={i} onClick={() => setHlColor(i)} title={`${c.label} (${i + 1})`}
                          className={cn("h-5 w-5 rounded-full border-2 transition",
                            hlColor === i ? "border-white scale-110" : "border-transparent hover:border-stone-500")}
                          style={{ background: c.bg }} />
                      ))}
                    </div>
                  </>
                )}
                {annotateSubMode === "shape" && (
                  <>
                    <div className="w-px h-5 bg-stone-700 shrink-0 mx-0.5" />
                    <div className="flex items-center gap-0.5">
                      {(["rect", "ellipse", "line", "arrow", "arrowOpen"] as ShapeSubType[]).map(s => (
                        <button key={s} onClick={() => setShapeSubType(s)}
                          title={s === "rect" ? "Rectangle" : s === "ellipse" ? "Ellipse" : s === "line" ? "Straight line" : s === "arrow" ? "Arrow (filled head)" : "Arrow (open head)"}
                          aria-pressed={shapeSubType === s}
                          className={cn("px-1.5 py-0.5 rounded text-[10px] font-medium transition",
                            shapeSubType === s ? "bg-brand-600 text-white" : "text-stone-400 hover:bg-stone-700 hover:text-stone-200")}>
                          {s === "rect" ? "Rect" : s === "arrowOpen" ? "Arrow (open)" : s.charAt(0).toUpperCase() + s.slice(1)}
                        </button>
                      ))}
                    </div>
                  </>
                )}
                {annotateSubMode === "ink" && (
                  <>
                    <div className="w-px h-5 bg-stone-700 shrink-0 mx-0.5" />
                    <div className="flex items-center gap-1">
                      <span className="text-[9px] text-stone-600 mr-0.5 select-none">Colour</span>
                      {INK_COLORS.map((c, i) => (
                        <button key={i} onClick={() => setInkColorIdx(i)} title={c.label}
                          aria-pressed={inkColorIdx === i}
                          className={cn("h-5 w-5 rounded-full border-2 transition",
                            inkColorIdx === i ? "border-white scale-110" : "border-transparent hover:border-stone-500")}
                          style={{ background: c.css }} />
                      ))}
                    </div>
                    <div className="w-px h-5 bg-stone-700 shrink-0 mx-0.5" />
                    <div className="flex items-center gap-1">
                      <span className="text-[9px] text-stone-600 mr-0.5 select-none">Width</span>
                      {[1, 2, 4, 8].map(w => (
                        <button key={w} onClick={() => setInkStrokeWidth(w)}
                          title={`${w}px stroke width`}
                          aria-pressed={inkStrokeWidth === w}
                          className={cn("w-6 h-6 rounded flex items-center justify-center text-[10px] transition",
                            inkStrokeWidth === w ? "bg-brand-600 text-white" : "text-stone-400 hover:bg-stone-700")}>
                          {w}
                        </button>
                      ))}
                      <span className="text-[9px] text-stone-600 ml-0.5 select-none">keys 1–9</span>
                    </div>
                  </>
                )}
                {annotateSubMode === "stamp" && (
                  <>
                    <div className="w-px h-5 bg-stone-700 shrink-0 mx-0.5" />
                    <div className="flex items-center gap-0.5 flex-wrap">
                      {effectiveStampLabels.map(l => (
                        <button key={l} onClick={() => setStampLabel(l)}
                          className={cn("px-1.5 py-0.5 rounded text-[9px] font-bold tracking-wide transition",
                            stampLabel === l ? "bg-red-800 text-red-200" : "text-stone-500 hover:bg-stone-700 hover:text-stone-300")}>
                          {l}
                        </button>
                      ))}
                    </div>
                  </>
                )}

                {/* ── Right: status + actions ─────────────────────────────── */}
                <div className="flex items-center gap-2 ml-auto">
                  {autoSaving ? (
                    <span className="flex items-center gap-1 text-xs text-brand-400">
                      <Loader2 className="h-3 w-3 animate-spin" /> Saving…
                    </span>
                  ) : annotations.length === 0 ? (
                    <span className="text-[10px] text-stone-600 italic">Click the page to annotate</span>
                  ) : (
                    <span className="text-[10px] text-stone-500 tabular-nums">
                      {annotations.length}{annotations.length !== 1 ? " annotations" : " annotation"}
                    </span>
                  )}
                  {annotateError && (
                    <span className="text-[10px] text-red-400 max-w-40 truncate cursor-help" title={annotateError}>⚠ {annotateError}</span>
                  )}
                  {annotations.length > 0 && !autoSaving && (
                    <>
                      <button
                        onClick={() => undoAnnotationRef.current()}
                        disabled={undoStack.length === 0}
                        title={undoStack.length > 0 ? `Undo (Ctrl+Z) — ${undoStack.length} step${undoStack.length !== 1 ? "s" : ""} available` : "Nothing to undo (Ctrl+Z)"}
                        className="text-[10px] text-stone-500 hover:text-stone-300 disabled:opacity-30 transition focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-stone-500/50 rounded"
                      >Undo</button>
                      {redoStack.length > 0 && (
                        <button
                          onClick={() => redoAnnotationRef.current()}
                          title={`Redo (Ctrl+Shift+Z) — ${redoStack.length} step${redoStack.length !== 1 ? "s" : ""}`}
                          className="text-[10px] text-stone-500 hover:text-stone-300 transition focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-stone-500/50 rounded"
                        >Redo</button>
                      )}
                      {confirmClearAnnot ? (
                        <span className="flex items-center gap-1.5">
                          <span className="text-[10px] text-stone-400">Clear all {annotations.length}?</span>
                          <button onClick={() => { changeAnnotations([]); setConfirmClearAnnot(false); }}
                            className="text-[10px] text-red-400 hover:text-red-300 transition font-medium">Clear</button>
                          <button onClick={() => setConfirmClearAnnot(false)}
                            className="text-[10px] text-stone-500 hover:text-stone-300 transition">Keep</button>
                        </span>
                      ) : (
                        <button onClick={() => setConfirmClearAnnot(true)}
                          className="text-[10px] text-stone-500 hover:text-stone-300 transition focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-stone-500/50 rounded">Clear</button>
                      )}
                    </>
                  )}
                  {annotateError && annotations.length > 0 && (
                    <button onClick={() => autoSaveAnnotations("view")} disabled={autoSaving}
                      className="flex items-center gap-1 rounded-md bg-brand-500 px-2 py-1 text-[11px] font-semibold text-white hover:bg-brand-600 disabled:opacity-50 transition">
                      <Check className="h-3 w-3" /> Retry
                    </button>
                  )}

                  <button
                    onClick={() => switchMode("view")}
                    disabled={autoSaving}
                    title="Save annotations and return to view mode (Esc)"
                    className="flex items-center gap-1 rounded-md bg-stone-600 hover:bg-stone-500 border border-stone-500 px-2.5 py-1.5 text-[11px] font-semibold text-white disabled:opacity-50 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50"
                  >
                    <Check className="h-3 w-3" /> Done
                  </button>
                </div>
              </div>
            </div>
          )}

          {canvasMode === "redact" && (
            <div className="shrink-0 px-4 pb-2 flex justify-center">
              <div className="flex flex-wrap items-center gap-3 bg-red-950/60 border border-red-900/60 rounded-xl px-3 py-2 shadow-lg w-full max-w-3xl">
                <EyeOff className="h-3.5 w-3.5 text-red-400 shrink-0" />
                <span className="text-xs text-red-300">Drag to draw redaction boxes · Click a box to select · Del to remove</span>
                <div className="flex items-center gap-3 ml-auto">
                  <span className="text-xs text-red-500">{redactBoxes.length} region{redactBoxes.length !== 1 ? "s" : ""}</span>
                  {redactError && <span className="text-xs text-red-300 max-w-40 truncate" title={redactError}>{redactError}</span>}
                  {redactBoxes.length > 0 && (
                    <>
                      <button onClick={() => setRedactBoxes([])} className="text-xs text-red-400 hover:text-red-300 transition focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-red-500/50 rounded">Clear all</button>
                      {confirmRedact ? (
                        <span className="flex items-center gap-1.5">
                          <span className="text-[10px] text-red-300">This is permanent.</span>
                          <button onClick={() => { setConfirmRedact(false); applyRedactions(); }} disabled={redactLoading}
                            className="flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-500 disabled:opacity-50 transition">
                            {redactLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <EyeOff className="h-3.5 w-3.5" />}
                            Confirm
                          </button>
                          <button onClick={() => setConfirmRedact(false)}
                            className="text-xs text-red-400 hover:text-red-300 transition">Cancel</button>
                        </span>
                      ) : (
                        <button onClick={() => setConfirmRedact(true)} disabled={redactLoading}
                          className="flex items-center gap-1.5 rounded-lg bg-red-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-600 disabled:opacity-50 transition">
                          <EyeOff className="h-3.5 w-3.5" />
                          Apply Redactions
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          )}

          {canvasMode === "crop" && (
            <div className="shrink-0 px-4 pb-2 flex justify-center">
              <div className="flex flex-wrap items-center gap-3 bg-brand-950/40 border border-brand-900/40 rounded-xl px-3 py-2 shadow-lg w-full max-w-3xl">
                <Crop className="h-3.5 w-3.5 text-brand-400 shrink-0" />
                <span className="text-xs text-brand-300">
                  {cropSelection ? "Selection drawn — apply or redraw." : "Drag to select the area to keep."}
                </span>
                <label className="flex items-center gap-1.5 text-xs text-brand-300 cursor-pointer">
                  <input type="checkbox" checked={applyToAll} onChange={e => setApplyToAll(e.target.checked)} className="accent-brand-500" />
                  All pages
                </label>
                {cropError && <span className="text-xs text-red-400">{cropError}</span>}
                <div className="flex items-center gap-2 ml-auto">
                  {cropSelection && (
                    <>
                      <button onClick={() => setCropSelection(null)} className="text-xs text-brand-400 hover:text-brand-300 transition focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-500/50 rounded">Clear</button>
                      {confirmCrop ? (
                        <span className="flex items-center gap-1.5">
                          <span className="text-[10px] text-brand-300">Content outside the selection will be removed.</span>
                          <button onClick={() => { setConfirmCrop(false); applyCrop(); }} disabled={cropLoading}
                            className="flex items-center gap-1.5 rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-600 disabled:opacity-50 transition">
                            {cropLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Crop className="h-3.5 w-3.5" />}
                            Confirm
                          </button>
                          <button onClick={() => setConfirmCrop(false)}
                            className="text-xs text-brand-400 hover:text-brand-300 transition">Cancel</button>
                        </span>
                      ) : (
                        <button onClick={() => setConfirmCrop(true)} disabled={cropLoading}
                          className="flex items-center gap-1.5 rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-600 disabled:opacity-50 transition">
                          <Crop className="h-3.5 w-3.5" />
                          Apply Crop
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ── Search bar ──────────────────────────────────────────────────── */}
          {searchOpen && (
            <div className="shrink-0 px-4 pb-2 flex justify-center">
              <SearchBar
                query={searchQuery}
                onChange={q => { setSearchQuery(q); setSearchIdx(0); }}
                results={searchResults}
                focusIdx={searchIdx}
                loading={searchLoading}
                onNext={() => setSearchIdx(i => searchResults.length > 0 ? (i + 1) % searchResults.length : 0)}
                onPrev={() => setSearchIdx(i => searchResults.length > 0 ? (i - 1 + searchResults.length) % searchResults.length : 0)}
                onClose={() => { setSearchOpen(false); setSearchQuery(""); setSearchResults([]); }}
              />
            </div>
          )}

          {/* ── Annotations hidden notice ───────────────────────────────────── */}
          {!annotationsVisible && (
            <div className="shrink-0 px-4 pb-1 flex justify-center">
              <div className="flex items-center gap-2 bg-stone-900/90 border border-stone-600/60 rounded-lg px-3 py-1.5 text-xs text-stone-400">
                <EyeOff className="h-3 w-3 shrink-0 text-brand-500" />
                <span>
                  Annotations hidden
                  {canvasMode === "annotate" && annotations.length > 0 && (
                    <> ({annotations.length} unsaved) — <span className="text-stone-500">will save to PDF on Done</span></>
                  )}
                </span>
                <button
                  onClick={() => setAnnotationsVisible(true)}
                  className="ml-1 text-brand-500 hover:text-brand-400 font-medium transition"
                >Show</button>
              </div>
            </div>
          )}

          {/* ── Mini-map strip — sits between context bars and bottom toolbar ── */}
          {pdf && miniMapVisible && (
            <div className="shrink-0 px-4 pt-1">
              <MiniMap
                totalPages={pdf.numPages}
                currentPage={currentPage}
                annotations={[...bakedAnnotations, ...annotations]}
                onGoTo={goTo}
                accent={isSecondaryPane ? "cyan" : "amber"}
                pdf={pdf}
                reduceMotion={settings.reduceMotion ?? false}
              />
            </div>
          )}

          {/* ── Bottom toolbar ──────────────────────────────────────────────── */}
          <div className="shrink-0 px-4 pb-4 flex justify-center">
            <div className="flex items-center gap-1 bg-stone-900 border border-stone-700 rounded-2xl px-3 py-2 shadow-xl">

              {/* Annotate toggle */}
              {modeBtn("annotate", <MessageSquare className="h-3.5 w-3.5" />, "Annotate", "A")}

              <div className="w-px h-5 bg-stone-700 mx-0.5" />

              {/* Zoom */}
              <button onClick={() => zoomBy(-1)}
                title="Zoom out (−)" aria-label="Zoom out" className="p-1.5 rounded-lg hover:bg-stone-700 transition text-stone-300">
                <ZoomOut className="h-4 w-4" />
              </button>
              <button onClick={() => resetZoom()}
                title="Reset zoom to 100% (Ctrl+0)" aria-label="Reset zoom"
                className="text-xs text-stone-300 tabular-nums w-10 text-center hover:text-white rounded transition" aria-live="polite">{Math.round(scale * 100)}%</button>
              <button onClick={() => zoomBy(1)}
                title="Zoom in (+)" aria-label="Zoom in" className="p-1.5 rounded-lg hover:bg-stone-700 transition text-stone-300">
                <ZoomIn className="h-4 w-4" />
              </button>
              <button onClick={() => {
                if (!canvasAreaRef.current || !canvasRef.current) return;
                const w = canvasAreaRef.current.clientWidth - 64;
                const pw = canvasRef.current.width / scale;
                setScale(parseFloat(Math.max(0.5, Math.min(w / pw, 4)).toFixed(2)));
              }} title="Fit width" className="px-2 py-1 rounded-lg text-[11px] text-stone-400 hover:text-white hover:bg-stone-700 transition">
                Fit W
              </button>

              <div className="w-px h-5 bg-stone-700 mx-0.5" />

              {/* Page navigation */}
              <button onClick={() => goTo(currentPage - 1)} disabled={currentPage <= 1}
                aria-label="Previous page" className="p-1.5 rounded-lg hover:bg-stone-700 transition disabled:opacity-30 text-stone-300">
                <ChevronLeft className="h-4 w-4" />
              </button>
              {editingPage ? (
                <input type="number" value={pageInput} autoFocus min={1} max={pdf.numPages}
                  onChange={e => setPageInput(e.target.value)}
                  onBlur={commitPageInput}
                  onKeyDown={e => {
                    if (e.key === "Enter") commitPageInput();
                    if (e.key === "Escape") { setEditingPage(false); setPageInput(String(currentPage)); }
                  }}
                  className="no-spinner w-12 rounded bg-stone-700 border border-stone-600 text-center text-xs text-white py-0.5 focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
              ) : (
                <button onClick={() => { setEditingPage(true); setPageInput(String(currentPage)); }}
                  title="Click to jump to page"
                  className="text-xs tabular-nums text-stone-300 hover:text-white transition px-1 rounded hover:bg-stone-700 min-w-[4.5rem] text-center">
                  {currentPage} / {pdf.numPages}
                </button>
              )}
              <button onClick={() => goTo(currentPage + 1)} disabled={currentPage >= pdf.numPages}
                aria-label="Next page" className="p-1.5 rounded-lg hover:bg-stone-700 transition disabled:opacity-30 text-stone-300">
                <ChevronRight className="h-4 w-4" />
              </button>

              <div className="w-px h-5 bg-stone-700 mx-0.5" />

              {/* Search */}
              <button onClick={() => setSearchOpen(v => !v)} title="Search (Ctrl+F)"
                className={cn("flex items-center gap-1 rounded-lg px-2 py-1.5 transition",
                  searchOpen ? "bg-brand-600 text-white" : "text-stone-400 hover:text-white hover:bg-stone-700")}>
                <Search className="h-3.5 w-3.5" />
                <kbd className={cn(
                  "rounded border px-1 py-0 text-[9px] font-mono leading-4 transition",
                  searchOpen ? "border-white/25 bg-white/10 text-white/70" : "border-stone-600 bg-stone-800 text-stone-500"
                )}>Ctrl+F</kbd>
              </button>

              <div className="w-px h-5 bg-stone-700 mx-0.5" />

              {/* Command palette */}
              <button onClick={() => setPaletteOpen(true)} title="Command palette (Ctrl+K)"
                className="flex items-center gap-1 rounded-lg px-2 py-1.5 hover:bg-stone-700 transition text-stone-500 hover:text-stone-300">
                <Command className="h-3.5 w-3.5" />
                <kbd className="rounded border border-stone-600 bg-stone-800 px-1 py-0 text-[9px] font-mono leading-4 text-stone-500">Ctrl+K</kbd>
              </button>

              {/* Help mode toggle (6.4) */}
              <button onClick={() => setHelpModeState(!helpMode)}
                title={helpMode ? "Turn off help hints" : "Show help hints"}
                aria-pressed={helpMode}
                className={cn("flex items-center gap-1 rounded-lg px-2 py-1.5 transition",
                  helpMode ? "bg-brand-600 text-white" : "text-stone-500 hover:text-stone-300 hover:bg-stone-700")}>
                <HelpCircle className="h-3.5 w-3.5" />
                <span className="text-[10px] font-medium">Help</span>
              </button>

              {/* Keyboard cheat sheet */}
              <button onClick={() => setCheatSheetOpen(true)} title="Keyboard shortcuts (?)"
                className="flex items-center gap-1 rounded-lg px-2 py-1.5 hover:bg-stone-700 transition text-stone-500 hover:text-stone-300">
                <HelpCircle className="h-3.5 w-3.5" />
                <kbd className="rounded border border-stone-600 bg-stone-800 px-1 py-0 text-[9px] font-mono leading-4 text-stone-500">?</kbd>
              </button>
            </div>
          </div>

        </div>

        {/* Right: utility panel (opened via palette) OR persistent navigation rail.
             Hidden in the secondary side-by-side pane to save space. */}
        {!isSecondaryPane && (panelTool ? (
          <RightPanel
            tool={panelTool}
            file={(workingFile ?? file)!}
            pageCount={pdf.numPages}
            onClose={() => setPanelTool(null)}
            onApplied={async (blob) => {
              await applyBlob(blob);
              if (panelTool !== "snippets") setPanelTool(null);
            }}
            snippets={settings.snippets}
            onAddSnippet={addSnippet}
            onRemoveSnippet={removeSnippet}
          />
        ) : railCollapsed ? (
          // Collapsed rail — a thin bar with an expand handle (UX-22 / N-06).
          <div className="w-8 shrink-0 flex flex-col items-center bg-stone-800 border-l border-stone-600">
            <button
              onClick={() => setRailCollapsed(false)}
              title="Show panel"
              aria-label="Show annotations panel"
              className="mt-3 flex h-6 w-6 items-center justify-center rounded-full bg-stone-700 border border-stone-600 text-stone-300 hover:bg-stone-600 transition focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-500/50 -ml-6 z-20"
            >
              <ChevronLeft className="h-3 w-3" />
            </button>
          </div>
        ) : (
          <div className="relative flex">
            <button
              onClick={() => setRailCollapsed(true)}
              title="Hide panel"
              aria-label="Hide annotations panel"
              className="absolute -left-3 top-3 z-20 flex h-6 w-6 items-center justify-center rounded-full bg-stone-700 border border-stone-600 text-stone-300 hover:bg-stone-600 transition focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-500/50"
            >
              <ChevronRight className="h-3 w-3" />
            </button>
            <RightRail
              annotations={[...bakedAnnotations, ...annotations]}
              currentPage={currentPage}
              onGoToPage={goTo}
              onFocusAnnot={focusAnnotation}
              onEditAnnot={id => {
                // A4: jump to the annotation's page, focus it, switch to annotate
                // mode, and set forceEditAnnotId so AnnotationLayer opens the editor.
                focusAnnotation(id);
                switchMode("annotate");
                setForceEditAnnotId(id);
              }}
              onDeleteAnnot={deleteAnnot}
              onStatusChange={changeAnnotStatus}
              onExportReport={() => downloadAnnotationReport([...bakedAnnotations, ...annotations], filename)}
              onExportReportPdf={async () => {
                const allAnns = [...bakedAnnotations, ...annotations];
                if (!workingFile || allAnns.length === 0) { showToast("No annotations to export."); return; }
                try {
                  const blob = await annotationReportPdf(workingFile, toApiAnnotations(allAnns) as Annotation[]);
                  downloadBlob(blob, filename.replace(/\.pdf$/i, "") + "_review_report.pdf");
                } catch (e) { showToast(e instanceof Error ? e.message : "Export failed."); }
              }}
              onExportCsv={() => downloadAnnotationCsv([...bakedAnnotations, ...annotations], filename)}
              onExportJson={() => downloadAnnotationJson([...bakedAnnotations, ...annotations], filename)}
              focusAnnotId={focusAnnotId}
              colorLabels={settings.colorLabels}
              pdf={pdf}
              bookmarks={bookmarks}
              onAddBookmark={() => addBookmark(currentPage)}
              onDeleteBookmark={removeBookmark}
              onRenameBookmark={renameBookmark}
              activeTab={railTab}
              onTabChange={setRailTab}
            />
          </div>
        ))}

      </div>

      {/* ── QuickActionBar ────────────────────────────────────────────────────── */}
      {quickBar && (canvasMode === "annotate" || canvasMode === "view") && (
        <div data-quickbar="true">
          <QuickActionBar
            x={quickBar.barX}
            y={quickBar.barY}
            yBottom={quickBar.barYBottom}
            onHighlight={() => createAnnotFromSelection("highlight")}
            onUnderline={() => createAnnotFromSelection("underline")}
            onStrikethrough={() => createAnnotFromSelection("strikethrough")}
            onComment={addNoteAtSelection}
            onCopy={() => { navigator.clipboard.writeText(quickBar.text).catch(() => {}); setQuickBar(null); }}
          />
        </div>
      )}

      {/* ── Keyboard cheat sheet ──────────────────────────────────────────────── */}
      {cheatSheetOpen && (
        <KeyboardCheatSheet onClose={() => setCheatSheetOpen(false)} />
      )}

      {/* ── TOC editor dialog (B12) ───────────────────────────────────────────── */}
      {tocEditorOpen && workingFile && (
        <TocEditorDialog
          file={workingFile}
          pageCount={pdf?.numPages ?? 0}
          onSave={async (blob) => {
            setTocEditorOpen(false);
            await applyBlob(blob);
          }}
          onClose={() => setTocEditorOpen(false)}
        />
      )}

      {/* ── Command palette ───────────────────────────────────────────────────── */}
      {paletteOpen && pdf && (
        <CommandPalette
          commands={buildPaletteCommands()}
          snippets={settings.snippets}
          pageCount={pdf.numPages}
          onGoToPage={p => { goTo(p); setPaletteOpen(false); }}
          onClose={() => setPaletteOpen(false)}
        />
      )}

      {/* ── Unsaved-changes guard modal ───────────────────────────────────────── */}
      {pendingNav && (workingBlob || annotations.length > 0) && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Unsaved changes"
          className="fixed inset-0 z-[300] flex items-center justify-center bg-black/70"
          onClick={e => { if (e.target === e.currentTarget) setPendingNav(null); }}
        >
          <div className="bg-stone-900 border border-stone-700 rounded-2xl shadow-2xl w-[380px] max-w-[90vw] p-6 flex flex-col gap-5">
            <div>
              <h2 className="text-sm font-semibold text-white">Modified PDF — download before leaving?</h2>
              <p className="mt-1.5 text-xs text-stone-400 leading-relaxed">
                {workingBlob
                  ? <>You have a modified version of <span className="text-stone-300 font-medium">{filename}</span> that hasn't been downloaded.</>
                  : <>You have <span className="text-stone-300 font-medium">{annotations.length} unsaved annotation{annotations.length !== 1 ? "s" : ""}</span> that haven't been burned into the PDF yet.</>
                }
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => {
                  if (workingBlob) downloadBlob(workingBlob, filename);
                  const nav = pendingNav;
                  setPendingNav(null);
                  setTimeout(() => doNavigate(nav), 80);
                }}
                className="flex items-center justify-center gap-2 rounded-xl bg-brand-500 hover:bg-brand-600 px-4 py-2.5 text-xs font-semibold text-white transition shadow-lg"
              >
                <Download className="h-3.5 w-3.5" /> Download, then leave
              </button>
              <button
                onClick={() => { const nav = pendingNav; setPendingNav(null); doNavigate(nav); }}
                className="rounded-xl bg-stone-700 hover:bg-stone-600 border border-stone-600 px-4 py-2.5 text-xs font-medium text-stone-300 transition"
              >
                Leave without downloading
              </button>
              <button
                onClick={() => setPendingNav(null)}
                className="rounded-xl px-4 py-2 text-xs text-stone-500 hover:text-stone-300 transition"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Download guard: uncommitted annotations (P1-11) ─────────────────── */}
      {downloadGuard && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Uncommitted annotations"
          className="fixed inset-0 z-[300] flex items-center justify-center bg-black/70"
          onClick={e => { if (e.target === e.currentTarget) setDownloadGuard(false); }}
        >
          <div className="bg-stone-900 border border-stone-700 rounded-2xl shadow-2xl w-[400px] max-w-[90vw] p-6 flex flex-col gap-5">
            <div>
              <h2 className="text-sm font-semibold text-white">Commit annotations before downloading?</h2>
              <p className="mt-1.5 text-xs text-stone-400 leading-relaxed">
                You have <span className="text-stone-300 font-medium">{annotations.length} annotation{annotations.length !== 1 ? "s" : ""}</span> that
                {" "}haven't been embedded into the PDF yet. Commit them first so they appear in the downloaded file, or download the current version without them.
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <button
                onClick={async () => {
                  setDownloadGuard(false);
                  await autoSaveAnnotations("view");
                  // autoSaveAnnotations updates workingBlob; download the result.
                  // Read the freshest blob via a microtask so state has settled.
                  setTimeout(() => {
                    if (workingBlobRef.current) downloadBlob(workingBlobRef.current, filename);
                  }, 60);
                }}
                disabled={autoSaving}
                className="flex items-center justify-center gap-2 rounded-xl bg-brand-500 hover:bg-brand-600 px-4 py-2.5 text-xs font-semibold text-white transition shadow-lg disabled:opacity-50"
              >
                <Check className="h-3.5 w-3.5" /> Commit, then download
              </button>
              <button
                onClick={() => {
                  setDownloadGuard(false);
                  if (workingBlob) downloadBlob(workingBlob, filename);
                  else showToast("Nothing committed yet — annotate and commit to create a downloadable PDF.");
                }}
                className="rounded-xl bg-stone-700 hover:bg-stone-600 border border-stone-600 px-4 py-2.5 text-xs font-medium text-stone-300 transition"
              >
                Download without them
              </button>
              <button
                onClick={() => setDownloadGuard(false)}
                className="rounded-xl px-4 py-2 text-xs text-stone-500 hover:text-stone-300 transition"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Transient toast ────────────────────────────────────────────────── */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[400] pointer-events-none">
          <div className="bg-stone-900 border border-stone-600 rounded-lg shadow-2xl px-4 py-2 text-xs text-stone-200">
            {toast}
          </div>
        </div>
      )}

      {/* ── Password unlock dialog (5.2) ───────────────────────────────────── */}
      {passwordPrompt && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Password required"
          className="fixed inset-0 z-[350] flex items-center justify-center bg-black/70"
        >
          <div className="bg-stone-900 border border-stone-700 rounded-2xl shadow-2xl w-[360px] max-w-[90vw] p-6 flex flex-col gap-4">
            <div>
              <h2 className="text-sm font-semibold text-white">This PDF is password-protected</h2>
              <p className="mt-1.5 text-xs text-stone-400 leading-relaxed truncate" title={passwordPrompt.file.name}>
                Enter the password to open <span className="text-stone-300">{passwordPrompt.file.name}</span>.
              </p>
            </div>
            <input
              type="password"
              autoFocus
              value={passwordInput}
              onChange={e => setPasswordInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") unlockPdf(); if (e.key === "Escape") setPasswordPrompt(null); }}
              placeholder="Password"
              className="w-full bg-stone-800 border border-stone-600 rounded-lg px-3 py-2 text-sm text-white placeholder-stone-600 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500/30 transition"
            />
            {passwordError && <p className="text-[11px] text-red-400">{passwordError}</p>}
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => { setPasswordPrompt(null); setPasswordInput(""); setPasswordError(null); }}
                className="px-3.5 py-1.5 rounded-lg text-xs text-stone-400 hover:text-white hover:bg-stone-700 transition"
              >
                Cancel
              </button>
              <button
                onClick={() => unlockPdf()}
                disabled={passwordBusy || !passwordInput}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-brand-500 hover:bg-brand-600 text-xs font-semibold text-white transition disabled:opacity-50"
              >
                {passwordBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} Unlock
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  // ── Command palette command list ───────────────────────────────────────────
  function buildPaletteCommands(): PaletteCommand[] {
    const go = (m: CanvasMode, sub?: CreateMode) => () => {
      switchMode(m);
      if (sub) setAnnotateSubMode(sub);
      setPaletteOpen(false);
    };
    return [
      { id: "view",         label: "View mode",        description: "Read the document (V)",         category: "Modes",      action: go("view") },
      { id: "annotate",     label: "Annotate mode",    description: "Mark up the document (A)",       category: "Modes",      action: go("annotate") },
      { id: "redact",       label: "Redact mode",      description: "Black out content (R)",          category: "Modes",      action: go("redact") },
      { id: "crop",         label: "Crop mode",        description: "Crop page area (C)",             category: "Modes",      action: go("crop") },
      { id: "highlight",    label: "Highlight",        description: "Yellow text highlight (H)",      category: "Annotate",   action: go("annotate", "highlight") },
      { id: "note",         label: "Note",             description: "Place a comment pin (A)",        category: "Annotate",   action: go("annotate", "note") },
      { id: "underline",    label: "Underline",        description: "Underline text (U)",             category: "Annotate",   action: go("annotate", "underline") },
      { id: "strikethrough",label: "Strikethrough",    description: "Strike through text (S)",        category: "Annotate",   action: go("annotate", "strikethrough") },
      { id: "freetext",     label: "Text box",         description: "Drag to place a text box (T)",   category: "Annotate",   action: go("annotate", "freetext") },
      { id: "ink",          label: "Ink",              description: "Freehand drawing (I)",           category: "Annotate",   action: go("annotate", "ink") },
      { id: "shape",        label: "Shape",            description: "Draw rect / ellipse / arrow",    category: "Annotate",   action: go("annotate", "shape") },
      { id: "stamp",        label: "Stamp",            description: "Place a stamp label",            category: "Annotate",   action: go("annotate", "stamp") },
      { id: "open",         label: "Open PDF…",         description: "Open another file (Ctrl+O)",     category: "File",       action: () => { setPaletteOpen(false); openFilePicker(); } },
      { id: "print",        label: "Print…",            description: "Print the document (Ctrl+P)",    category: "File",       action: () => { setPaletteOpen(false); printDocument(); } },
      { id: "zoom-in",      label: "Zoom in",           description: "Enlarge the page (+)",           category: "View",       action: () => { zoomBy(1); setPaletteOpen(false); } },
      { id: "zoom-out",     label: "Zoom out",          description: "Shrink the page (−)",            category: "View",       action: () => { zoomBy(-1); setPaletteOpen(false); } },
      { id: "zoom-reset",   label: "Reset zoom",        description: "Back to 100% (Ctrl+0)",          category: "View",       action: () => { resetZoom(); setPaletteOpen(false); } },
      { id: "toggle-annots",label: annotationsVisible ? "Hide annotations" : "Show annotations", description: "Toggle annotation overlay (Shift+H)", category: "View", action: () => { setAnnotationsVisible(v => !v); setPaletteOpen(false); } },
      { id: "search",       label: "Search text",       description: "Find text in document (Ctrl+F)", category: "Navigation", action: () => { setSearchOpen(true); setPaletteOpen(false); } },
      { id: "cheatsheet",   label: "Keyboard shortcuts",description: "Show all key bindings (?)",     category: "Help",       action: () => { setCheatSheetOpen(true); setPaletteOpen(false); } },
      { id: "annotations",  label: "Annotations panel", description: "View all annotations",          category: "Navigation", action: () => { setRailTab("annotations"); setPaletteOpen(false); } },
      { id: "document",     label: "Outline & Bookmarks", description: "Table of contents + your bookmarks", category: "Navigation", action: () => { setRailCollapsed(false); setRailTab("document"); setPaletteOpen(false); } },
      { id: "bm-add",       label: "Bookmark this page",description: `Bookmark page ${currentPage}`,  category: "Bookmarks",  action: () => { addBookmark(currentPage); setPaletteOpen(false); } },
      { id: "snippets",     label: "Comment snippets",  description: "Manage reusable comment text",  category: "Tools",      action: () => { togglePanel("snippets"); setPaletteOpen(false); } },
      { id: "compress",     label: "Compress PDF",      description: "Reduce file size",              category: "Tools",      action: () => { togglePanel("compress"); setPaletteOpen(false); } },
      { id: "watermark",    label: "Add Watermark",     description: "Add text watermark to pages",   category: "Tools",      action: () => { togglePanel("watermark"); setPaletteOpen(false); } },
      { id: "split-pdf",    label: "Split PDF",         description: "Split into multiple files",     category: "Tools",      action: () => { togglePanel("split"); setPaletteOpen(false); } },
      { id: "extract-pages",label: "Extract Pages",     description: "Extract a page range to PDF",   category: "Tools",      action: () => { togglePanel("extract"); setPaletteOpen(false); } },
      { id: "rotate-del",   label: "Rotate / Delete",   description: "Rotate or delete pages",        category: "Tools",      action: () => { togglePanel("rotate-delete"); setPaletteOpen(false); } },
      { id: "security",     label: "Security / Encrypt",description: "Encrypt or decrypt the PDF",    category: "Tools",      action: () => { togglePanel("security"); setPaletteOpen(false); } },
      { id: "to-images",    label: "Export to Images",  description: "Convert pages to PNG / JPEG",   category: "Tools",      action: () => { togglePanel("pdf-to-images"); setPaletteOpen(false); } },
      { id: "fill-form",    label: "Fill Form",         description: "Fill in PDF form fields",       category: "Tools",      action: () => { togglePanel("form"); setPaletteOpen(false); } },
      { id: "minimap",      label: "Toggle mini-map",   description: "Show/hide the page-position strip", category: "Navigation", action: () => { setMiniMapVisible(v => !v); setPaletteOpen(false); } },
      { id: "settings",     label: "Preferences",       description: "Author name, colour labels",    category: "Tools",      action: () => { openSettings(); setPaletteOpen(false); } },
      { id: "ocr",          label: "Make Searchable (OCR)", description: "Run Tesseract OCR on scanned pages", category: "Tools", action: () => { setPaletteOpen(false); handleOcr(); } },
      { id: "toc-edit",     label: "Edit Table of Contents", description: "Add, rename or reorder TOC entries", category: "Tools", action: () => { setPaletteOpen(false); setTocEditorOpen(true); } },
      { id: "continuous-scroll", label: continuousScroll ? "Switch to single-page view" : "Switch to continuous scroll", description: "Toggle virtualized multi-page scroll (B1)", category: "View", action: () => { setContinuousScroll(v => !v); setPaletteOpen(false); } },
      { id: "compare-pdfs", label: diffHighlights ? "Close Diff View" : "Compare PDFs…", description: "Highlight differences between two documents (B6)", category: "Tools", action: () => { setPaletteOpen(false); diffHighlights ? handleCloseDiff() : handleComparePdfs(); } },
      { id: "export",       label: "Export report",     description: "Download annotations as .md",   category: "Export",     action: () => { downloadAnnotationReport([...bakedAnnotations, ...annotations], filename); setPaletteOpen(false); } },
      ...(workingBlob ? [{
        id: "download", label: "Download PDF", description: "Save modified PDF (Ctrl+S)", category: "Export",
        action: () => { setPaletteOpen(false); requestDownload(); },
      }] : []),
      { id: "sbs-same",     label: "Side by Side — Same Document", description: "View this document in two panes (Ctrl+\\)", category: "View", action: () => { openSideBySide("horizontal", "mirror", workingFile ?? file); setPaletteOpen(false); } },
      { id: "sbs-new",      label: "Side by Side — New Document",  description: "Open another document alongside",          category: "View", action: () => { openSideBySide("horizontal", "new"); setPaletteOpen(false); } },
      ...(isSideBySide ? [{
        id: "close-sbs", label: "Close Side by Side", description: "Return to single pane", category: "View",
        action: () => { closeSideBySide(); setPaletteOpen(false); },
      }] : []),
    ];
  }
}
