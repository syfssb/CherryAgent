---
name: pdf
description: Comprehensive PDF manipulation toolkit for extracting text and tables, creating new PDFs, merging/splitting documents, and handling forms. When Claude needs to fill in a PDF form or programmatically process, generate, or analyze PDF documents at scale.
category: writing
source: builtin
managedBy: preset
icon: file-text
---

## Built-in Runtime Environment

This system MAY have a built-in Node.js runtime with pre-installed libraries.
Before using any library, first check availability:

**Check available runtimes** (run these commands first):
- `echo $CHERRY_NODE` (POSIX) / `echo %CHERRY_NODE%` (Windows) — if non-empty, built-in Node.js is available
- `echo $CHERRY_PYTHON` (POSIX) / `echo %CHERRY_PYTHON%` (Windows) — if non-empty, built-in Python is available
- If neither is set, try system `node --version` / `python3 --version` as fallback

**Pre-installed Node.js libraries** (available when `CHERRY_NODE` is set):
- `pptxgenjs` — PowerPoint creation
- `exceljs` — Excel creation and editing
- `docx` — Word document creation
- `pdf-lib` — PDF creation and manipulation

**IMPORTANT workflow rules**:
1. Check `CHERRY_NODE` first — if set, use the built-in Node.js to run scripts
2. **Always use `.cjs` extension** for Node.js scripts (ensures CommonJS compatibility)
3. Do NOT install the above pre-installed libraries (they are already available)
4. **Always quote paths** — the app install path contains spaces (e.g. `Cherry Agent`)
5. Pre-installed libraries are self-contained — do NOT assume `npm` or `pip` is available
6. If neither built-in nor system runtimes are available, inform the user

**How to run scripts** (POSIX — macOS/Linux):
```bash
# Node.js
ELECTRON_RUN_AS_NODE=1 "$CHERRY_NODE" script.cjs

# Python
PYTHONHOME="$CHERRY_PYTHONHOME" PYTHONNOUSERSITE=1 "$CHERRY_PYTHON" script.py
```

**How to run scripts** (Windows — cmd.exe):
```cmd
:: Node.js
set ELECTRON_RUN_AS_NODE=1 && "%CHERRY_NODE%" script.cjs

:: Python
set PYTHONHOME=%CHERRY_PYTHONHOME% && set PYTHONNOUSERSITE=1 && "%CHERRY_PYTHON%" script.py
```

**Note**: `ELECTRON_RUN_AS_NODE` and `PYTHONHOME` must be set per-command (not globally) to avoid interfering with other processes.

# PDF Processing Guide

## Overview

This guide covers essential PDF processing operations. The **default tool** for creating and manipulating PDFs is **pdf-lib** (built-in, no installation needed). For advanced features like text/table extraction, Python libraries (pypdf, pdfplumber, reportlab) are available as fallback when Python is present.

### Tool Selection Decision Tree

1. **Creating/manipulating PDFs** → Use **pdf-lib** (DEFAULT, built-in via `$CHERRY_NODE`)
2. **Extracting text/tables from PDFs** → Use **pdfplumber** (Python fallback) or command-line `pdftotext`
3. **Merging/splitting PDFs** → Use **pdf-lib** (default) or **pypdf** (Python fallback)
4. **Filling PDF forms** → Use **pdf-lib** (default) — see forms.md
5. **Creating complex report-style PDFs** → Use **pdf-lib** (default) or **reportlab** (Python fallback)

## Quick Start — pdf-lib (DEFAULT)

```javascript
// save as: output.cjs
const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');
async function main() {
  const doc = await PDFDocument.create();
  const page = doc.addPage();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.drawText('Hello World', { x: 50, y: 700, font, size: 24 });
  const bytes = await doc.save();
  require('fs').writeFileSync('output.pdf', Buffer.from(bytes));
}
main();
// run: ELECTRON_RUN_AS_NODE=1 "$CHERRY_NODE" output.cjs
```

### Merge PDFs with pdf-lib

```javascript
// save as: merge.cjs
const { PDFDocument } = require('pdf-lib');
const fs = require('fs');
async function main() {
  const merged = await PDFDocument.create();
  for (const file of ['doc1.pdf', 'doc2.pdf']) {
    const src = await PDFDocument.load(fs.readFileSync(file));
    const pages = await merged.copyPages(src, src.getPageIndices());
    pages.forEach(p => merged.addPage(p));
  }
  fs.writeFileSync('merged.pdf', Buffer.from(await merged.save()));
}
main();
// run: ELECTRON_RUN_AS_NODE=1 "$CHERRY_NODE" merge.cjs
```

## Python Libraries (Fallback — use when `$CHERRY_NODE` is not available)

### pypdf - Basic Operations

#### Merge PDFs
```python
from pypdf import PdfWriter, PdfReader

writer = PdfWriter()
for pdf_file in ["doc1.pdf", "doc2.pdf", "doc3.pdf"]:
    reader = PdfReader(pdf_file)
    for page in reader.pages:
        writer.add_page(page)

with open("merged.pdf", "wb") as output:
    writer.write(output)
```

#### Split PDF
```python
reader = PdfReader("input.pdf")
for i, page in enumerate(reader.pages):
    writer = PdfWriter()
    writer.add_page(page)
    with open(f"page_{i+1}.pdf", "wb") as output:
        writer.write(output)
```

#### Extract Metadata
```python
reader = PdfReader("document.pdf")
meta = reader.metadata
print(f"Title: {meta.title}")
print(f"Author: {meta.author}")
print(f"Subject: {meta.subject}")
print(f"Creator: {meta.creator}")
```

#### Rotate Pages
```python
reader = PdfReader("input.pdf")
writer = PdfWriter()

page = reader.pages[0]
page.rotate(90)  # Rotate 90 degrees clockwise
writer.add_page(page)

with open("rotated.pdf", "wb") as output:
    writer.write(output)
```

### pdfplumber - Text and Table Extraction

#### Extract Text with Layout
```python
import pdfplumber

with pdfplumber.open("document.pdf") as pdf:
    for page in pdf.pages:
        text = page.extract_text()
        print(text)
```

#### Extract Tables
```python
with pdfplumber.open("document.pdf") as pdf:
    for i, page in enumerate(pdf.pages):
        tables = page.extract_tables()
        for j, table in enumerate(tables):
            print(f"Table {j+1} on page {i+1}:")
            for row in table:
                print(row)
```

#### Advanced Table Extraction
```python
import pandas as pd

with pdfplumber.open("document.pdf") as pdf:
    all_tables = []
    for page in pdf.pages:
        tables = page.extract_tables()
        for table in tables:
            if table:  # Check if table is not empty
                df = pd.DataFrame(table[1:], columns=table[0])
                all_tables.append(df)

# Combine all tables
if all_tables:
    combined_df = pd.concat(all_tables, ignore_index=True)
    combined_df.to_excel("extracted_tables.xlsx", index=False)
```

### reportlab - Create PDFs

#### Basic PDF Creation
```python
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas

c = canvas.Canvas("hello.pdf", pagesize=letter)
width, height = letter

# Add text
c.drawString(100, height - 100, "Hello World!")
c.drawString(100, height - 120, "This is a PDF created with reportlab")

# Add a line
c.line(100, height - 140, 400, height - 140)

# Save
c.save()
```

#### Create PDF with Multiple Pages
```python
from reportlab.lib.pagesizes import letter
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, PageBreak
from reportlab.lib.styles import getSampleStyleSheet

doc = SimpleDocTemplate("report.pdf", pagesize=letter)
styles = getSampleStyleSheet()
story = []

# Add content
title = Paragraph("Report Title", styles['Title'])
story.append(title)
story.append(Spacer(1, 12))

body = Paragraph("This is the body of the report. " * 20, styles['Normal'])
story.append(body)
story.append(PageBreak())

# Page 2
story.append(Paragraph("Page 2", styles['Heading1']))
story.append(Paragraph("Content for page 2", styles['Normal']))

# Build PDF
doc.build(story)
```

## Command-Line Tools

### pdftotext (poppler-utils)
```bash
# Extract text
pdftotext input.pdf output.txt

# Extract text preserving layout
pdftotext -layout input.pdf output.txt

# Extract specific pages
pdftotext -f 1 -l 5 input.pdf output.txt  # Pages 1-5
```

### qpdf
```bash
# Merge PDFs
qpdf --empty --pages file1.pdf file2.pdf -- merged.pdf

# Split pages
qpdf input.pdf --pages . 1-5 -- pages1-5.pdf
qpdf input.pdf --pages . 6-10 -- pages6-10.pdf

# Rotate pages
qpdf input.pdf output.pdf --rotate=+90:1  # Rotate page 1 by 90 degrees

# Remove password
qpdf --password=mypassword --decrypt encrypted.pdf decrypted.pdf
```

### pdftk (if available)
```bash
# Merge
pdftk file1.pdf file2.pdf cat output merged.pdf

# Split
pdftk input.pdf burst

# Rotate
pdftk input.pdf rotate 1east output rotated.pdf
```

## Common Tasks

### Extract Text from Scanned PDFs
```python
# Requires: pip install pytesseract pdf2image
import pytesseract
from pdf2image import convert_from_path

# Convert PDF to images
images = convert_from_path('scanned.pdf')

# OCR each page
text = ""
for i, image in enumerate(images):
    text += f"Page {i+1}:\n"
    text += pytesseract.image_to_string(image)
    text += "\n\n"

print(text)
```

### Add Watermark
```python
from pypdf import PdfReader, PdfWriter

# Create watermark (or load existing)
watermark = PdfReader("watermark.pdf").pages[0]

# Apply to all pages
reader = PdfReader("document.pdf")
writer = PdfWriter()

for page in reader.pages:
    page.merge_page(watermark)
    writer.add_page(page)

with open("watermarked.pdf", "wb") as output:
    writer.write(output)
```

### Extract Images
```bash
# Using pdfimages (poppler-utils)
pdfimages -j input.pdf output_prefix

# This extracts all images as output_prefix-000.jpg, output_prefix-001.jpg, etc.
```

### Password Protection
```python
from pypdf import PdfReader, PdfWriter

reader = PdfReader("input.pdf")
writer = PdfWriter()

for page in reader.pages:
    writer.add_page(page)

# Add password
writer.encrypt("userpassword", "ownerpassword")

with open("encrypted.pdf", "wb") as output:
    writer.write(output)
```

## Quick Reference

| Task | Best Tool | Fallback |
|------|-----------|----------|
| Create PDFs | **pdf-lib** (built-in) | reportlab (Python) |
| Merge PDFs | **pdf-lib** (built-in) | pypdf (Python) |
| Split PDFs | **pdf-lib** (built-in) | pypdf (Python) |
| Extract text | pdfplumber (Python) | `pdftotext` (CLI) |
| Extract tables | pdfplumber (Python) | — |
| Fill PDF forms | **pdf-lib** (built-in) | pypdf (Python) — see forms.md |
| Command line merge | qpdf | `pdftk` |
| OCR scanned PDFs | pytesseract (Python) | — |

## Next Steps

- For advanced pypdfium2 usage, see reference.md
- For more pdf-lib examples (JavaScript), see reference.md
- If you need to fill out a PDF form, follow the instructions in forms.md
- For troubleshooting guides, see reference.md
