import fs from 'node:fs';
import path from 'node:path';
import { jsPDF } from 'jspdf';

const projectRoot = process.cwd();
const inputPath = path.join(projectRoot, 'docs', 'FULL_PROJECT_DOCUMENTATION.md');
const outputPath = path.join(projectRoot, 'docs', 'FULL_PROJECT_DOCUMENTATION.pdf');

if (!fs.existsSync(inputPath)) {
  console.error(`Input file not found: ${inputPath}`);
  process.exit(1);
}

const raw = fs.readFileSync(inputPath, 'utf8');
const normalized = raw.replace(/\r\n/g, '\n');
const lines = normalized.split('\n');

const doc = new jsPDF({ unit: 'pt', format: 'a4' });
const pageWidth = doc.internal.pageSize.getWidth();
const pageHeight = doc.internal.pageSize.getHeight();
const marginX = 48;
const topMargin = 52;
const bottomMargin = 52;
const contentWidth = pageWidth - marginX * 2;

let y = topMargin;

function ensureSpace(nextHeight) {
  if (y + nextHeight > pageHeight - bottomMargin) {
    doc.addPage();
    y = topMargin;
  }
}

function writeWrappedText(text, fontSize = 11, isBold = false) {
  doc.setFont('helvetica', isBold ? 'bold' : 'normal');
  doc.setFontSize(fontSize);

  const wrapped = doc.splitTextToSize(text, contentWidth);
  const lineHeight = Math.max(14, fontSize + 3);
  const blockHeight = wrapped.length * lineHeight;

  ensureSpace(blockHeight);

  for (const line of wrapped) {
    doc.text(line, marginX, y);
    y += lineHeight;
  }
}

for (const line of lines) {
  const trimmed = line.trim();

  if (!trimmed) {
    y += 8;
    continue;
  }

  if (trimmed.startsWith('# ')) {
    y += 4;
    writeWrappedText(trimmed.replace(/^#\s+/, ''), 18, true);
    y += 4;
    continue;
  }

  if (trimmed.startsWith('## ')) {
    y += 6;
    writeWrappedText(trimmed.replace(/^##\s+/, ''), 14, true);
    y += 2;
    continue;
  }

  if (trimmed.startsWith('### ')) {
    y += 4;
    writeWrappedText(trimmed.replace(/^###\s+/, ''), 12, true);
    continue;
  }

  writeWrappedText(trimmed, 11, false);
}

const pdfBuffer = Buffer.from(doc.output('arraybuffer'));
fs.writeFileSync(outputPath, pdfBuffer);

console.log(`PDF generated: ${outputPath}`);
