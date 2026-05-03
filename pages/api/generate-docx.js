// Generates a Word document for translator review with side-by-side
// Arabic original, translated text, and timestamps in a clean table format.

import { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, AlignmentType, HeadingLevel, BorderStyle, WidthType, ShadingType, Header, Footer } from 'docx';

const DARK = '1B180F';
const CREAM_2 = 'F2EFE0';
const GOLD = 'CD891C';
const TEXT = '1B180F';
const MUTED = '5C5648';

const border = { style: BorderStyle.SINGLE, size: 1, color: 'D8D2BD' };
const borders = { top: border, bottom: border, left: border, right: border };

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { langLabel, langCode, videoTitle, originalBlocks, translatedSrt, videoId } = req.body;
  if (!translatedSrt) return res.status(400).json({ error: 'Missing translated SRT' });

  try {
    // Parse the translated SRT into blocks
    const transBlocks = parseSRT(translatedSrt);
    const origMap = {};
    if (originalBlocks && Array.isArray(originalBlocks)) {
      originalBlocks.forEach((b, i) => { origMap[i] = b.text; });
    }

    const today = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

    const doc = new Document({
      styles: { default: { document: { run: { font: 'Arial', size: 21, color: TEXT } } } },
      sections: [{
        properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 1080, right: 1080, bottom: 1080, left: 1080 } } },
        headers: {
          default: new Header({ children: [new Paragraph({
            border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: GOLD, space: 4 } },
            spacing: { after: 120 },
            children: [
              new TextRun({ text: 'بالعربي  ', font: 'Arial', size: 24, bold: true, color: DARK }),
              new TextRun({ text: `·  Translate  ·  ${langLabel} Review`, font: 'Arial', size: 19, color: MUTED })
            ]
          })] })
        },
        footers: {
          default: new Footer({ children: [new Paragraph({
            border: { top: { style: BorderStyle.SINGLE, size: 2, color: 'D8D2BD', space: 4 } },
            spacing: { before: 80 },
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ text: `Generated ${today}  ·  Re-upload this file to apply your corrections`, font: 'Arial', size: 17, color: MUTED, italics: true })]
          })] })
        },
        children: [
          // Title block
          new Paragraph({
            spacing: { after: 100 },
            children: [new TextRun({ text: 'TRANSLATION REVIEW', font: 'Arial', size: 18, bold: true, color: GOLD, characterSpacing: 100 })]
          }),
          new Paragraph({
            spacing: { after: 120 },
            border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: GOLD, space: 8 } },
            children: [new TextRun({ text: langLabel, font: 'Arial', size: 48, bold: true, color: DARK })]
          }),
          new Paragraph({
            spacing: { before: 160, after: 320 },
            children: [
              new TextRun({ text: videoTitle ? `Video: ${videoTitle}` : 'BilAraby Video', font: 'Arial', size: 22, color: MUTED }),
              new TextRun({ text: videoId ? `   ·   ID: ${videoId}` : '', font: 'Arial', size: 18, color: MUTED, italics: true })
            ]
          }),

          // Instructions box
          new Table({
            width: { size: 9360, type: WidthType.DXA },
            columnWidths: [9360],
            rows: [new TableRow({
              children: [new TableCell({
                width: { size: 9360, type: WidthType.DXA },
                borders: { top: border, bottom: border, right: border, left: { style: BorderStyle.SINGLE, size: 24, color: GOLD } },
                margins: { top: 200, bottom: 200, left: 240, right: 200 },
                shading: { fill: CREAM_2, type: ShadingType.CLEAR },
                children: [
                  new Paragraph({
                    children: [new TextRun({ text: 'HOW TO USE THIS DOCUMENT', font: 'Arial', size: 19, bold: true, color: GOLD })],
                    spacing: { after: 100 }
                  }),
                  new Paragraph({
                    children: [new TextRun({ text: '1. Read each translated segment in the Translation column.', font: 'Arial', size: 20, color: TEXT })],
                    spacing: { after: 60 }
                  }),
                  new Paragraph({
                    children: [new TextRun({ text: '2. Edit any translation directly in the cell. Do NOT change row order, timestamps, or segment numbers.', font: 'Arial', size: 20, color: TEXT })],
                    spacing: { after: 60 }
                  }),
                  new Paragraph({
                    children: [new TextRun({ text: '3. Save the document and re-upload it to the BilAraby Translate tool to apply your corrections.', font: 'Arial', size: 20, color: TEXT })],
                    spacing: { after: 60 }
                  }),
                  new Paragraph({
                    children: [new TextRun({ text: '4. The tool will rebuild the SRT file with your edits, ready for YouTube.', font: 'Arial', size: 20, color: TEXT })]
                  })
                ]
              })]
            })]
          }),

          new Paragraph({ spacing: { before: 320 }, children: [new TextRun({ text: '' })] }),

          // The translation table
          new Table({
            width: { size: 9360, type: WidthType.DXA },
            columnWidths: [600, 1900, 3300, 3560],
            rows: [
              new TableRow({
                tableHeader: true,
                children: [
                  ['#', 'Timestamp', 'Original (Arabic)', `Translation (${langLabel})`].map((h, i) => new TableCell({
                    width: { size: [600, 1900, 3300, 3560][i], type: WidthType.DXA },
                    borders,
                    margins: { top: 120, bottom: 120, left: 140, right: 120 },
                    shading: { fill: DARK, type: ShadingType.CLEAR },
                    children: [new Paragraph({ children: [new TextRun({ text: h, font: 'Arial', size: 19, bold: true, color: GOLD })] })]
                  }))
                ]
              }),
              ...transBlocks.map((tb, i) => new TableRow({
                children: [
                  new TableCell({
                    width: { size: 600, type: WidthType.DXA }, borders,
                    margins: { top: 100, bottom: 100, left: 100, right: 100 },
                    shading: { fill: i % 2 === 0 ? CREAM_2 : 'FFFFFF', type: ShadingType.CLEAR },
                    children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: String(i + 1), font: 'Arial', size: 19, color: MUTED, bold: true })] })]
                  }),
                  new TableCell({
                    width: { size: 1900, type: WidthType.DXA }, borders,
                    margins: { top: 100, bottom: 100, left: 120, right: 120 },
                    shading: { fill: i % 2 === 0 ? CREAM_2 : 'FFFFFF', type: ShadingType.CLEAR },
                    children: [new Paragraph({ children: [new TextRun({ text: tb.timestamp, font: 'Courier New', size: 16, color: GOLD, bold: true })] })]
                  }),
                  new TableCell({
                    width: { size: 3300, type: WidthType.DXA }, borders,
                    margins: { top: 100, bottom: 100, left: 140, right: 140 },
                    shading: { fill: i % 2 === 0 ? CREAM_2 : 'FFFFFF', type: ShadingType.CLEAR },
                    children: [new Paragraph({
                      bidirectional: true,
                      children: [new TextRun({ text: origMap[i] || '—', font: 'Arial', size: 21, color: MUTED, rightToLeft: true })]
                    })]
                  }),
                  new TableCell({
                    width: { size: 3560, type: WidthType.DXA }, borders,
                    margins: { top: 100, bottom: 100, left: 140, right: 140 },
                    shading: { fill: i % 2 === 0 ? CREAM_2 : 'FFFFFF', type: ShadingType.CLEAR },
                    children: [new Paragraph({
                      children: [new TextRun({ text: tb.text, font: 'Arial', size: 21, color: TEXT })]
                    })]
                  })
                ]
              }))
            ]
          })
        ]
      }]
    });

    const buffer = await Packer.toBuffer(doc);

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    const safeName = (videoTitle || videoId || 'translation').replace(/[^a-z0-9]/gi, '_').slice(0, 40);
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}_${langCode}_review.docx"`);
    return res.status(200).send(buffer);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

function parseSRT(content) {
  const blocks = content.trim().split(/\n\s*\n/);
  return blocks.map(block => {
    const lines = block.trim().split('\n');
    return { index: lines[0], timestamp: lines[1], text: lines.slice(2).join('\n') };
  }).filter(b => b.timestamp && b.text);
}
