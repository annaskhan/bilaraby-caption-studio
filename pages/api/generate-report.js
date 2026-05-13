// Generates a branded monthly activity PDF report for stakeholders
// Uses pdf-lib (no server-side dependencies — all rendering is vector)

import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

// Brand colors
const COLORS = {
  dark: rgb(0.055, 0.078, 0.067),       // #0E1411
  hero: rgb(0.031, 0.043, 0.039),       // #080B0A
  cream: rgb(0.976, 0.969, 0.918),      // #F9F7EA
  creamSoft: rgb(0.949, 0.937, 0.878),  // #F2EFE0
  green: rgb(0.059, 0.478, 0.302),      // #0F7A4D
  greenDim: rgb(0.059, 0.478, 0.302),   // same green for accents
  text: rgb(0.106, 0.094, 0.059),       // #1B180F
  muted: rgb(0.36, 0.337, 0.282),       // #5C5648
  border: rgb(0.847, 0.824, 0.741),     // #D8D2BD
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { stats, allUserStats, volunteers, month, year, costEstimate } = req.body;

  if (!stats && !allUserStats) {
    return res.status(400).json({ error: 'Missing stats data' });
  }

  try {
    const pdfDoc = await PDFDocument.create();
    const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const helveticaOblique = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);

    // Letter size: 612 × 792 points
    const W = 612, H = 792;
    const M = 50; // margin

    let page = pdfDoc.addPage([W, H]);
    let y = H - M;

    // === COVER PAGE ===
    // Hero header bar
    page.drawRectangle({ x: 0, y: H - 180, width: W, height: 180, color: COLORS.hero });

    // Brand mark — two diamonds
    const diamondSize = 14;
    const dx = W - M - 60;
    const dy = H - 50;
    page.drawRectangle({ x: dx, y: dy, width: diamondSize, height: diamondSize, color: COLORS.green, rotate: { type: 'degrees', angle: 45 } });
    page.drawRectangle({ x: dx + 24, y: dy, width: diamondSize, height: diamondSize, color: COLORS.green, rotate: { type: 'degrees', angle: 45 } });

    // Cover label
    page.drawText('ACTIVITY REPORT', { x: M, y: H - 75, size: 9, font: helveticaBold, color: COLORS.green, characterSpacing: 3 });

    // Cover title
    page.drawText('BilAraby Translate', { x: M, y: H - 115, size: 32, font: helveticaBold, color: COLORS.cream });

    // Subtitle
    const monthLabel = `${month} ${year}`;
    page.drawText(monthLabel, { x: M, y: H - 145, size: 16, font: helveticaOblique, color: COLORS.creamSoft });

    // Tagline at bottom of hero
    page.drawText('A voice and an echo for ideas', { x: M, y: H - 170, size: 9, font: helveticaOblique, color: rgb(0.6, 0.58, 0.52), characterSpacing: 2 });

    y = H - 220;

    // === EXECUTIVE SUMMARY ===
    page.drawText('EXECUTIVE SUMMARY', { x: M, y, size: 9, font: helveticaBold, color: COLORS.green, characterSpacing: 2.5 });
    y -= 18;
    // Underline
    page.drawLine({ start: { x: M, y }, end: { x: M + 110, y }, thickness: 1, color: COLORS.green });
    y -= 24;

    const totalVideos = stats.videosTranslated || 0;
    const totalTracks = stats.languagesGenerated || 0;
    const totalSegments = stats.segmentsTranslated || 0;
    const totalDrafts = stats.youtubeDraftsPushed || 0;
    const activeVolunteers = volunteers ? Object.values(allUserStats || {}).filter(s => (s.videosTranslated || 0) > 0).length : 0;
    const totalVolunteers = volunteers?.length || 0;

    const summary = `In ${monthLabel}, the BilAraby Translate team produced ${totalTracks} caption tracks across ${totalVideos} videos, totalling ${totalSegments.toLocaleString()} translated subtitle segments. The team pushed ${totalDrafts} caption drafts to YouTube for review. ${activeVolunteers} of ${totalVolunteers} volunteers contributed to the work, with average estimated cost per video at ~$0.15 — a fraction of the previous CaptionHub spend.`;

    y = drawWrappedText(page, summary, M, y, W - M - M, helvetica, 11, COLORS.text, 17);

    y -= 22;

    // === KEY METRICS CARDS ===
    page.drawText('KEY METRICS', { x: M, y, size: 9, font: helveticaBold, color: COLORS.green, characterSpacing: 2.5 });
    y -= 18;
    page.drawLine({ start: { x: M, y }, end: { x: M + 78, y }, thickness: 1, color: COLORS.green });
    y -= 22;

    // 4 metric cards in a 2x2 grid
    const cardW = (W - M - M - 16) / 2;
    const cardH = 75;
    const metrics = [
      { label: 'Videos Translated', value: totalVideos.toLocaleString(), sub: 'completed jobs' },
      { label: 'Caption Tracks', value: totalTracks.toLocaleString(), sub: 'language outputs' },
      { label: 'Segments', value: totalSegments.toLocaleString(), sub: 'subtitle lines' },
      { label: 'YouTube Drafts', value: totalDrafts.toLocaleString(), sub: 'pushed to channel' },
    ];

    metrics.forEach((m, i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const cx = M + col * (cardW + 16);
      const cy = y - row * (cardH + 12);

      // Card bg
      page.drawRectangle({ x: cx, y: cy - cardH, width: cardW, height: cardH, color: COLORS.creamSoft });
      // Green left stripe
      page.drawRectangle({ x: cx, y: cy - cardH, width: 3, height: cardH, color: COLORS.green });

      page.drawText(m.label.toUpperCase(), { x: cx + 18, y: cy - 20, size: 8, font: helveticaBold, color: COLORS.green, characterSpacing: 1.8 });
      page.drawText(m.value, { x: cx + 18, y: cy - 50, size: 24, font: helveticaBold, color: COLORS.text });
      page.drawText(m.sub, { x: cx + 18, y: cy - 65, size: 8, font: helvetica, color: COLORS.muted });
    });

    y -= cardH * 2 + 28;

    // === COST ESTIMATE ===
    if (costEstimate !== undefined) {
      page.drawText('COST OVERVIEW', { x: M, y, size: 9, font: helveticaBold, color: COLORS.green, characterSpacing: 2.5 });
      y -= 18;
      page.drawLine({ start: { x: M, y }, end: { x: M + 92, y }, thickness: 1, color: COLORS.green });
      y -= 22;

      // Cost box
      page.drawRectangle({ x: M, y: y - 56, width: W - M - M, height: 56, color: COLORS.creamSoft });
      page.drawRectangle({ x: M, y: y - 56, width: 3, height: 56, color: COLORS.green });

      page.drawText(`Estimated API spend: $${costEstimate.toFixed(2)} USD`, { x: M + 18, y: y - 22, size: 13, font: helveticaBold, color: COLORS.text });
      const savingsAnnual = 41000 - (costEstimate * 12);
      page.drawText(`Projected annual savings vs CaptionHub: ~$${Math.round(savingsAnnual).toLocaleString()} (QAR ${Math.round(savingsAnnual * 3.64).toLocaleString()})`, { x: M + 18, y: y - 40, size: 10, font: helvetica, color: COLORS.muted });

      y -= 70;
    }

    // === VOLUNTEER LEADERBOARD ===
    if (allUserStats && Object.keys(allUserStats).length > 0) {
      // Check if we need a new page
      if (y < 280) {
        page = pdfDoc.addPage([W, H]);
        y = H - M;
      }

      page.drawText('VOLUNTEER CONTRIBUTIONS', { x: M, y, size: 9, font: helveticaBold, color: COLORS.green, characterSpacing: 2.5 });
      y -= 18;
      page.drawLine({ start: { x: M, y }, end: { x: M + 162, y }, thickness: 1, color: COLORS.green });
      y -= 24;

      // Table header
      const cols = { code: M, name: M + 65, videos: M + 230, tracks: M + 300, segments: M + 370, drafts: M + 450 };
      page.drawRectangle({ x: M, y: y - 22, width: W - M - M, height: 22, color: COLORS.hero });
      const headerY = y - 14;
      page.drawText('CODE', { x: cols.code + 6, y: headerY, size: 8, font: helveticaBold, color: COLORS.green, characterSpacing: 1.5 });
      page.drawText('NAME', { x: cols.name, y: headerY, size: 8, font: helveticaBold, color: COLORS.green, characterSpacing: 1.5 });
      page.drawText('VIDEOS', { x: cols.videos, y: headerY, size: 8, font: helveticaBold, color: COLORS.green, characterSpacing: 1.5 });
      page.drawText('TRACKS', { x: cols.tracks, y: headerY, size: 8, font: helveticaBold, color: COLORS.green, characterSpacing: 1.5 });
      page.drawText('SEGMENTS', { x: cols.segments, y: headerY, size: 8, font: helveticaBold, color: COLORS.green, characterSpacing: 1.5 });
      page.drawText('DRAFTS', { x: cols.drafts, y: headerY, size: 8, font: helveticaBold, color: COLORS.green, characterSpacing: 1.5 });
      y -= 22;

      // Sort volunteers by videos translated
      const sorted = volunteers.map(v => ({
        ...v,
        ...(allUserStats[v.code] || { videosTranslated: 0, languagesGenerated: 0, segmentsTranslated: 0, youtubeDraftsPushed: 0 })
      })).sort((a, b) => (b.videosTranslated || 0) - (a.videosTranslated || 0));

      sorted.forEach((v, i) => {
        const rowH = 22;
        if (y - rowH < M + 40) {
          page = pdfDoc.addPage([W, H]);
          y = H - M;
        }
        // Alternating row background
        if (i % 2 === 0) {
          page.drawRectangle({ x: M, y: y - rowH, width: W - M - M, height: rowH, color: COLORS.creamSoft });
        }
        const rowY = y - 14;
        // Top performer highlight
        if (i === 0 && (v.videosTranslated || 0) > 0) {
          page.drawText('★', { x: M - 12, y: rowY, size: 10, font: helveticaBold, color: COLORS.green });
        }
        page.drawText(v.code, { x: cols.code + 6, y: rowY, size: 9, font: helveticaBold, color: COLORS.green });
        page.drawText(truncate(v.name, 28), { x: cols.name, y: rowY, size: 9, font: helvetica, color: COLORS.text });
        page.drawText(String(v.videosTranslated || 0), { x: cols.videos, y: rowY, size: 9, font: helvetica, color: COLORS.text });
        page.drawText(String(v.languagesGenerated || 0), { x: cols.tracks, y: rowY, size: 9, font: helvetica, color: COLORS.text });
        page.drawText(String(v.segmentsTranslated || 0), { x: cols.segments, y: rowY, size: 9, font: helvetica, color: COLORS.text });
        page.drawText(String(v.youtubeDraftsPushed || 0), { x: cols.drafts, y: rowY, size: 9, font: helvetica, color: COLORS.text });
        y -= rowH;
      });

      y -= 12;
    }

    // === FOOTER on every page ===
    const pages = pdfDoc.getPages();
    pages.forEach((p, i) => {
      const fontSize = 8;
      p.drawLine({ start: { x: M, y: 35 }, end: { x: W - M, y: 35 }, thickness: 0.5, color: COLORS.border });
      p.drawText(`BilAraby Translate · Activity Report · ${monthLabel}`, { x: M, y: 22, size: fontSize, font: helveticaOblique, color: COLORS.muted });
      p.drawText(`Page ${i + 1} of ${pages.length}`, { x: W - M - 60, y: 22, size: fontSize, font: helvetica, color: COLORS.muted });
    });

    const pdfBytes = await pdfDoc.save();

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="bilaraby-translate-${month.toLowerCase()}-${year}.pdf"`);
    return res.status(200).send(Buffer.from(pdfBytes));
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

// Helper: wraps text by width
function drawWrappedText(page, text, x, y, maxWidth, font, size, color, lineHeight) {
  const words = text.split(' ');
  let line = '';
  let curY = y;
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    const width = font.widthOfTextAtSize(test, size);
    if (width > maxWidth && line) {
      page.drawText(line, { x, y: curY, size, font, color });
      line = word;
      curY -= lineHeight;
    } else {
      line = test;
    }
  }
  if (line) {
    page.drawText(line, { x, y: curY, size, font, color });
    curY -= lineHeight;
  }
  return curY;
}

function truncate(s, max) {
  if (!s) return '';
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}
