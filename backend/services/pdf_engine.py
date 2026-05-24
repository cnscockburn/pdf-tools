"""PyMuPDF-based PDF operations. All functions accept/return raw bytes."""
import io
import zipfile

import fitz  # PyMuPDF


def _open(data: bytes) -> fitz.Document:
    return fitz.open(stream=data, filetype="pdf")


def _save(doc: fitz.Document) -> bytes:
    return doc.tobytes(garbage=4, deflate=True)


# ---------------------------------------------------------------------------
# Merge
# ---------------------------------------------------------------------------

def merge(file_bytes_list: list[bytes]) -> bytes:
    result = fitz.open()
    for data in file_bytes_list:
        doc = _open(data)
        result.insert_pdf(doc)
        doc.close()
    return _save(result)


# ---------------------------------------------------------------------------
# Split
# ---------------------------------------------------------------------------

def split(file_bytes: bytes, ranges: list[tuple[int, int]]) -> bytes:
    """Split PDF into parts defined by 1-indexed [start, end] ranges.

    Returns a single PDF if one range given, otherwise a ZIP archive.
    """
    doc = _open(file_bytes)
    parts: list[tuple[str, bytes]] = []

    for start, end in ranges:
        s = max(0, start - 1)
        e = min(end - 1, doc.page_count - 1)
        new_doc = fitz.open()
        new_doc.insert_pdf(doc, from_page=s, to_page=e)
        parts.append((f"part_{start}-{end}.pdf", _save(new_doc)))
        new_doc.close()

    doc.close()

    if len(parts) == 1:
        return parts[0][1]

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for name, data in parts:
            zf.writestr(name, data)
    return buf.getvalue()


def split_returns_zip(ranges: list[tuple[int, int]]) -> bool:
    return len(ranges) > 1


# ---------------------------------------------------------------------------
# Page operations
# ---------------------------------------------------------------------------

def rotate(file_bytes: bytes, pages: list[int], angle: int) -> bytes:
    """Rotate specified 1-indexed pages by angle degrees (added to current rotation)."""
    doc = _open(file_bytes)
    for page_num in pages:
        if 1 <= page_num <= doc.page_count:
            page = doc[page_num - 1]
            page.set_rotation((page.rotation + angle) % 360)
    return _save(doc)


def delete_pages(file_bytes: bytes, pages: list[int]) -> bytes:
    """Delete 1-indexed pages (sorted descending to avoid index shift)."""
    doc = _open(file_bytes)
    valid = sorted({p for p in pages if 1 <= p <= doc.page_count}, reverse=True)
    for page_num in valid:
        doc.delete_page(page_num - 1)
    return _save(doc)


def reorder(file_bytes: bytes, order: list[int]) -> bytes:
    """Reorder pages. order is a list of 1-indexed page numbers in desired sequence."""
    doc = _open(file_bytes)
    zero_indexed = [p - 1 for p in order if 1 <= p <= doc.page_count]
    doc.select(zero_indexed)
    return _save(doc)


def extract(file_bytes: bytes, pages: list[int]) -> bytes:
    """Extract 1-indexed pages into a new PDF, preserving their order."""
    doc = _open(file_bytes)
    new_doc = fitz.open()
    for page_num in sorted(pages):
        if 1 <= page_num <= doc.page_count:
            new_doc.insert_pdf(doc, from_page=page_num - 1, to_page=page_num - 1)
    result = _save(new_doc)
    new_doc.close()
    doc.close()
    return result


# ---------------------------------------------------------------------------
# Convert: images → PDF
# ---------------------------------------------------------------------------

_IMAGE_FILETYPES = {
    "image/jpeg": "jpeg",
    "image/jpg": "jpeg",
    "image/png": "png",
    "image/tiff": "tiff",
    "image/tif": "tiff",
    "image/bmp": "bmp",
    "image/gif": "gif",
    "image/webp": "webp",
}


def images_to_pdf(image_data: list[tuple[bytes, str]]) -> bytes:
    """Convert a list of (image_bytes, content_type) tuples into a single PDF."""
    result = fitz.open()
    for img_bytes, content_type in image_data:
        filetype = _IMAGE_FILETYPES.get(content_type.lower(), "jpeg")
        try:
            img_doc = fitz.open(stream=img_bytes, filetype=filetype)
        except Exception:
            img_doc = fitz.open(stream=img_bytes)  # fallback: auto-detect
        pdf_bytes = img_doc.convert_to_pdf()
        img_pdf = fitz.open("pdf", pdf_bytes)
        result.insert_pdf(img_pdf)
        img_doc.close()
        img_pdf.close()
    return _save(result)


# ---------------------------------------------------------------------------
# Compress
# ---------------------------------------------------------------------------

def compress(file_bytes: bytes, quality: str = "ebook") -> bytes:
    """
    Compress a PDF. Removes unused objects and recompresses images with Pillow.
    quality: 'screen' (smallest/lowest), 'ebook' (balanced), 'printer' (high quality)
    """
    from PIL import Image

    jpeg_quality = {"screen": 25, "ebook": 55, "printer": 82}.get(quality, 55)

    doc = _open(file_bytes)
    seen: set[int] = set()

    for page in doc:
        for img_info in page.get_images(full=True):
            xref = img_info[0]
            if xref in seen:
                continue
            seen.add(xref)
            try:
                base = doc.extract_image(xref)
                # Only recompress colour/gray images — skip masks and exotic types
                if base.get("n", 0) not in (1, 3):
                    continue
                pil = Image.open(io.BytesIO(base["image"]))
                if pil.mode not in ("RGB", "L", "RGBA"):
                    continue
                if pil.mode == "RGBA":
                    pil = pil.convert("RGB")
                buf = io.BytesIO()
                pil.save(buf, "JPEG", quality=jpeg_quality, optimize=True)
                new_bytes = buf.getvalue()
                if len(new_bytes) < len(base["image"]):
                    doc.update_stream(xref, new_bytes)
            except Exception:
                pass  # leave the image untouched if anything goes wrong

    return doc.tobytes(garbage=4, deflate=True, clean=True)


# ---------------------------------------------------------------------------
# Watermark
# ---------------------------------------------------------------------------

def watermark_text(
    file_bytes: bytes,
    text: str,
    opacity: float = 0.3,
    angle: float = 45.0,
    fontsize: float = 60.0,
    color: tuple[float, float, float] = (0.5, 0.5, 0.5),
) -> bytes:
    """Stamp a diagonal text watermark on every page."""
    doc = _open(file_bytes)
    font = fitz.Font("helv")

    for page in doc:
        tw = fitz.TextWriter(page.rect)
        # Estimate text width to centre it before rotation
        text_len = font.text_length(text, fontsize=fontsize)
        cx, cy = page.rect.center
        # Start point so the baseline midpoint sits at the page centre
        start = fitz.Point(cx - text_len / 2, cy + fontsize * 0.15)
        tw.append(start, text, font=font, fontsize=fontsize)
        # Rotate the entire writer around the page centre
        tw.write_text(
            page,
            opacity=opacity,
            color=color,
            morph=(page.rect.center, fitz.Matrix(angle)),
        )

    return _save(doc)


# ---------------------------------------------------------------------------
# Crop
# ---------------------------------------------------------------------------

def crop(
    file_bytes: bytes,
    x0: float, y0: float, x1: float, y1: float,
    pages: list[int] | None = None,
) -> bytes:
    """
    Crop pages to a rectangle specified as fractions (0.0–1.0) of each page's dimensions.
    pages: 1-indexed list of pages to crop; None means all pages.
    """
    doc = _open(file_bytes)
    for i, page in enumerate(doc):
        if pages is not None and (i + 1) not in pages:
            continue
        mb = page.mediabox
        new_rect = fitz.Rect(
            mb.x0 + x0 * mb.width,
            mb.y0 + y0 * mb.height,
            mb.x0 + x1 * mb.width,
            mb.y0 + y1 * mb.height,
        )
        page.set_cropbox(new_rect)
    return _save(doc)


# ---------------------------------------------------------------------------
# Redact
# ---------------------------------------------------------------------------

def redact(file_bytes: bytes, regions: list[dict]) -> bytes:
    """
    Permanently black out regions.
    regions: [{page, x0, y0, x1, y1}] — coords as fractions of page size (0.0–1.0).
    """
    doc = _open(file_bytes)

    by_page: dict[int, list[dict]] = {}
    for r in regions:
        by_page.setdefault(r["page"] - 1, []).append(r)

    for page_idx, rects in by_page.items():
        if page_idx >= doc.page_count:
            continue
        page = doc[page_idx]
        pb = page.rect
        for r in rects:
            rect = fitz.Rect(
                pb.x0 + r["x0"] * pb.width,
                pb.y0 + r["y0"] * pb.height,
                pb.x0 + r["x1"] * pb.width,
                pb.y0 + r["y1"] * pb.height,
            )
            page.add_redact_annot(rect, fill=(0, 0, 0))
        page.apply_redactions(
            images=fitz.PDF_REDACT_IMAGE_PIXELS,
            graphics=fitz.PDF_REDACT_LINE_ART_REMOVE_IF_COVERED,
            text=fitz.PDF_REDACT_TEXT_REMOVE,
        )

    return _save(doc)


# ---------------------------------------------------------------------------
# Annotate
# ---------------------------------------------------------------------------

def annotate(file_bytes: bytes, annotations: list[dict]) -> bytes:
    """
    Apply annotations to a PDF (replace semantics).

    All existing annotations are removed first so that repeated calls are
    idempotent — the caller's list is always the authoritative set.

    Supported annotation types:
      {type:"note",      page:N, x:f, y:f, text:"..."}
      {type:"highlight", page:N, x0:f, y0:f, x1:f, y1:f, color:[r,g,b]}
      {type:"freetext",  page:N, x0:f, y0:f, x1:f, y1:f, text:"...", fontsize:12}

    All coords are fractions of page dimensions (0.0–1.0).
    page is 1-indexed.
    """
    doc = _open(file_bytes)

    # Clear every existing annotation from every page so re-saving is safe.
    for page in doc:
        for annot in list(page.annots()):
            page.delete_annot(annot)

    for ann in annotations:
        page_idx = ann["page"] - 1
        if page_idx >= doc.page_count:
            continue
        page = doc[page_idx]
        pb = page.rect

        if ann["type"] == "note":
            pt = fitz.Point(pb.x0 + ann["x"] * pb.width, pb.y0 + ann["y"] * pb.height)
            a = page.add_text_annot(pt, ann.get("text", ""), icon="Comment")
            a.update()

        elif ann["type"] == "highlight":
            rect = fitz.Rect(
                pb.x0 + ann["x0"] * pb.width, pb.y0 + ann["y0"] * pb.height,
                pb.x0 + ann["x1"] * pb.width, pb.y0 + ann["y1"] * pb.height,
            )
            color = ann.get("color", [1, 1, 0])
            a = page.add_highlight_annot(rect)
            a.set_colors(stroke=color)
            a.update()

        elif ann["type"] == "freetext":
            rect = fitz.Rect(
                pb.x0 + ann["x0"] * pb.width, pb.y0 + ann["y0"] * pb.height,
                pb.x0 + ann["x1"] * pb.width, pb.y0 + ann["y1"] * pb.height,
            )
            a = page.add_freetext_annot(
                rect,
                ann.get("text", ""),
                fontsize=ann.get("fontsize", 11),
                text_color=(0, 0, 0),
                fill_color=(1, 1, 0.7),
                align=fitz.TEXT_ALIGN_LEFT,
            )
            a.update()

    return _save(doc)


# ---------------------------------------------------------------------------
# PDF → Images
# ---------------------------------------------------------------------------

def pdf_to_images(file_bytes: bytes, dpi: int = 150, fmt: str = "png") -> bytes:
    """Render every page to an image and return a ZIP archive."""
    doc = _open(file_bytes)
    mat = fitz.Matrix(dpi / 72, dpi / 72)
    ext = "jpeg" if fmt == "jpg" else fmt
    mime_ext = "jpg" if fmt == "jpg" else fmt

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for i, page in enumerate(doc):
            pix = page.get_pixmap(matrix=mat, alpha=False)
            zf.writestr(f"page_{i + 1:03d}.{mime_ext}", pix.tobytes(ext))

    return buf.getvalue()
