// TEARDOWN — a creator's reels, pulled apart: transcript, hook, setup, pattern break,
// payoff, CTA. The analysis is produced outside the hub (Claude) as a JSON file in the
// "u2ber-teardown" format; this router stores it per user and exports it as JSON,
// Excel and PDF.
import express from "express";
import crypto from "crypto";
import path from "path";
import { fileURLToPath } from "url";
import PDFDocument from "pdfkit";
import ExcelJS from "exceljs";
import { q } from "./db/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const router = express.Router();

const MAX_REELS = 1000;
const str = (v, max = 4000) => (v == null ? "" : String(v)).slice(0, max);
const num = (v) => (typeof v === "number" && isFinite(v) ? v : null);

/* ---------- validation: accept only the fields we know, trimmed ---------- */
function sanitize(raw) {
  if (!raw || typeof raw !== "object") throw new Error("That file isn't a teardown JSON.");
  if (raw.format !== "u2ber-teardown") throw new Error('This JSON is missing "format": "u2ber-teardown" — is it the right file?');
  if (!Array.isArray(raw.reels) || !raw.reels.length) throw new Error("The teardown has no reels in it.");
  if (raw.reels.length > MAX_REELS) throw new Error(`Max ${MAX_REELS} reels per teardown.`);

  const s = raw.summary || {};
  const summary = {
    headline: str(s.headline, 300),
    formula: (Array.isArray(s.formula) ? s.formula : []).slice(0, 12).map((f) => ({
      t: str(f.t, 40), title: str(f.title, 80), text: str(f.text, 600) })),
    findings: (Array.isArray(s.findings) ? s.findings : []).slice(0, 20).map((f) => ({
      title: str(f.title, 120), text: str(f.text, 1500), example: str(f.example, 800) })),
    notes: str(s.notes, 1500),
  };
  const reels = raw.reels.map((r, i) => ({
    rank: num(r.rank) ?? i + 1,
    shortcode: str(r.shortcode, 40),
    url: str(r.url, 300),
    date: str(r.date, 20),
    type: str(r.type, 20) || "reel",
    plays: num(r.plays), likes: num(r.likes), comments: num(r.comments),
    duration_sec: num(r.duration_sec), words: num(r.words), wpm: num(r.wpm), speech_start: num(r.speech_start),
    audio: str(r.audio, 200), caption: str(r.caption, 3000),
    phase: str(r.phase, 80), topic: str(r.topic, 300), format: str(r.format, 200),
    hook_family: str(r.hook_family, 80), hook_type: str(r.hook_type, 200),
    hook: str(r.hook, 600), hook_spoken: str(r.hook_spoken, 600),
    setup: str(r.setup, 1500), pattern_break: str(r.pattern_break, 1500), payoff: str(r.payoff, 1500),
    cta: str(r.cta, 400), cta_kind: str(r.cta_kind, 60), cta_word: str(r.cta_word, 40),
    why: str(r.why, 1500), repost_of: str(r.repost_of, 120),
    beats: (Array.isArray(r.beats) ? r.beats : []).slice(0, 40).map((b) => ({ t: num(b.t) ?? 0, label: str(b.label, 200) })),
    transcript: (Array.isArray(r.transcript) ? r.transcript : []).slice(0, 600).map((t) => ({ t: num(t.t) ?? 0, text: str(t.text, 1000) })),
  }));
  return {
    format: "u2ber-teardown", version: 1,
    creator: str(raw.creator, 60).replace(/^@/, ""),
    platform: str(raw.platform, 30) || "instagram",
    generated_at: str(raw.generated_at, 40),
    source: str(raw.source, 300),
    summary, reels,
  };
}

async function loadOne(req, res) {
  const { rows } = await q("SELECT * FROM teardowns WHERE id=$1 AND user_id=$2", [req.params.id, req.user.id]);
  if (!rows[0]) { res.status(404).json({ error: "Teardown not found." }); return null; }
  return rows[0];
}
const fileBase = (td) => `${(td.creator || "creator").replace(/[^a-z0-9._-]+/gi, "_")}-teardown-${new Date(td.created_at).toISOString().slice(0, 10)}`;

/* ---------------- CRUD ---------------- */
router.get("/", async (req, res) => {
  const { rows } = await q(
    `SELECT id, creator, platform, reel_count, total_plays, created_at, data->>'generated_at' AS generated_at
       FROM teardowns WHERE user_id=$1 ORDER BY created_at DESC`, [req.user.id]);
  res.json({ teardowns: rows });
});

router.post("/", async (req, res) => {
  let td;
  try { td = sanitize(req.body); } catch (e) { return res.status(400).json({ error: e.message }); }
  const id = crypto.randomBytes(8).toString("hex");
  const totalPlays = td.reels.reduce((a, r) => a + (r.plays || 0), 0);
  await q(
    `INSERT INTO teardowns (id,user_id,creator,platform,reel_count,total_plays,data) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [id, req.user.id, td.creator, td.platform, td.reels.length, totalPlays, td]);
  res.json({ ok: true, id });
});

router.get("/:id", async (req, res) => {
  const row = await loadOne(req, res); if (!row) return;
  res.json({ id: row.id, created_at: row.created_at, ...row.data });
});

router.delete("/:id", async (req, res) => {
  await q("DELETE FROM teardowns WHERE id=$1 AND user_id=$2", [req.params.id, req.user.id]);
  res.json({ ok: true });
});

/* ---------------- EXPORT: JSON ---------------- */
router.get("/:id/json", async (req, res) => {
  const row = await loadOne(req, res); if (!row) return;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${fileBase(row)}.json"`);
  res.send(JSON.stringify(row.data, null, 2));
});

/* ---------------- EXPORT: Excel ---------------- */
const mmss = (s) => (s == null ? "" : `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`);

router.get("/:id/xlsx", async (req, res) => {
  const row = await loadOne(req, res); if (!row) return;
  const td = row.data;
  const wb = new ExcelJS.Workbook();
  wb.creator = "U2berClub Tools"; wb.created = new Date();
  const head = { font: { bold: true, color: { argb: "FFFFFFFF" } }, fill: { type: "pattern", pattern: "solid", fgColor: { argb: "FF15171E" } } };
  const styleHeader = (ws) => {
    ws.getRow(1).eachCell((c) => { c.font = head.font; c.fill = head.fill; c.alignment = { vertical: "middle", wrapText: true }; });
    ws.getRow(1).height = 22;
    ws.views = [{ state: "frozen", ySplit: 1 }];
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: ws.columnCount } };
  };

  // Sheet 1 — one row per reel
  const ws = wb.addWorksheet("Reels");
  ws.columns = [
    { header: "Rank", key: "rank", width: 7 },
    { header: "Date", key: "date", width: 11 },
    { header: "Reel", key: "url", width: 16 },
    { header: "Plays", key: "plays", width: 11 },
    { header: "Likes", key: "likes", width: 10 },
    { header: "Comments", key: "comments", width: 10 },
    { header: "Length (sec)", key: "duration_sec", width: 10 },
    { header: "Length (m:ss)", key: "mmss", width: 10 },
    { header: "Words", key: "words", width: 8 },
    { header: "WPM", key: "wpm", width: 7 },
    { header: "Phase", key: "phase", width: 22 },
    { header: "Topic", key: "topic", width: 40 },
    { header: "Format", key: "format", width: 28 },
    { header: "Hook family", key: "hook_family", width: 22 },
    { header: "Hook type", key: "hook_type", width: 28 },
    { header: "Hook (spoken, 0–5 sec)", key: "hook_spoken", width: 50 },
    { header: "Hook (summary)", key: "hook", width: 50 },
    { header: "Setup", key: "setup", width: 50 },
    { header: "Pattern break", key: "pattern_break", width: 50 },
    { header: "Payoff", key: "payoff", width: 50 },
    { header: "CTA", key: "cta", width: 30 },
    { header: "CTA keyword", key: "cta_word", width: 14 },
    { header: "Beats", key: "beats", width: 60 },
    { header: "Why it worked / didn't", key: "why", width: 60 },
    { header: "Repost / remake of", key: "repost_of", width: 20 },
    { header: "Audio", key: "audio", width: 24 },
    { header: "Caption", key: "caption", width: 60 },
  ];
  for (const r of td.reels) {
    const added = ws.addRow({
      ...r, mmss: mmss(r.duration_sec),
      url: r.url ? { text: r.shortcode || r.url, hyperlink: r.url } : "",
      beats: (r.beats || []).map((b) => `${b.t}s ${b.label}`).join("\n"),
    });
    added.alignment = { vertical: "top", wrapText: true };
  }
  ["plays", "likes", "comments"].forEach((k) => { ws.getColumn(k).numFmt = "#,##0"; });
  styleHeader(ws);

  // Sheet 2 — transcripts, one line per spoken segment
  const wt = wb.addWorksheet("Transcripts");
  wt.columns = [
    { header: "Rank", key: "rank", width: 7 },
    { header: "Reel", key: "shortcode", width: 16 },
    { header: "Topic", key: "topic", width: 36 },
    { header: "Time (sec)", key: "t", width: 9 },
    { header: "Time (m:ss)", key: "mmss", width: 9 },
    { header: "Spoken line", key: "text", width: 100 },
  ];
  for (const r of td.reels) {
    for (const s of r.transcript || []) {
      wt.addRow({ rank: r.rank, shortcode: r.shortcode, topic: r.topic, t: s.t, mmss: mmss(s.t), text: s.text }).alignment = { vertical: "top", wrapText: true };
    }
  }
  styleHeader(wt);

  // Sheet 3 — the formula + findings
  const wf = wb.addWorksheet("Formula");
  wf.columns = [{ header: "Section", key: "a", width: 22 }, { header: "Point", key: "b", width: 34 }, { header: "Detail", key: "c", width: 90 }, { header: "Example", key: "d", width: 60 }];
  (td.summary?.formula || []).forEach((f) => wf.addRow({ a: `Skeleton · ${f.t}`, b: f.title, c: f.text }));
  (td.summary?.findings || []).forEach((f) => wf.addRow({ a: "Pattern", b: f.title, c: f.text, d: f.example }));
  wf.eachRow((r, i) => { if (i > 1) r.alignment = { vertical: "top", wrapText: true }; });
  styleHeader(wf);

  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="${fileBase(row)}.xlsx"`);
  await wb.xlsx.write(res);
  res.end();
});

/* ---------------- EXPORT: PDF ---------------- */
const FONTS_DIR = path.join(__dirname, "fonts");
const AMBER = "#E8852B", AMBER_DARK = "#C96A18", AMBER_LIGHT = "#FDF3E7";
const INK = "#15171E", SOFT = "#6B6F78", BORDER = "#EBE5D8";
const fmtN = (n) => n == null ? "—" : n >= 1e6 ? (n / 1e6).toFixed(1).replace(/\.0$/, "") + "M" : n >= 1e3 ? (n / 1e3).toFixed(1).replace(/\.0$/, "") + "K" : String(n);

function buildPdf(doc, tdIn, opts) {
  // The bundled Noto Devanagari face has no arrow glyphs; swap them so they don't print as boxes.
  const td = JSON.parse(JSON.stringify(tdIn).replace(/→/g, "->").replace(/←/g, "<-").replace(/[↗↘]/g, ""));
  doc.registerFont("body", path.join(FONTS_DIR, "NotoSansDevanagari-Regular.ttf"));
  doc.registerFont("bold", path.join(FONTS_DIR, "NotoSansDevanagari-Bold.ttf"));
  const L = doc.page.margins.left, W = doc.page.width - L - doc.page.margins.right;
  const need = (h) => { if (doc.y + h > doc.page.height - doc.page.margins.bottom) doc.addPage(); };
  const section = (t) => {
    need(60); doc.moveDown(0.8);
    const y = doc.y;
    doc.rect(L, y + 2, 4, 13).fill(AMBER);
    doc.font("bold").fontSize(13).fillColor(AMBER_DARK).text(t.toUpperCase(), L + 12, y, { characterSpacing: 0.6 });
    doc.moveTo(L, doc.y + 4).lineTo(L + W, doc.y + 4).lineWidth(1).strokeColor(BORDER).stroke();
    doc.y += 10; doc.x = L;
  };
  const field = (label, value) => {
    if (!value) return;
    need(30);
    doc.font("bold").fontSize(8.5).fillColor(SOFT).text(label.toUpperCase(), L, doc.y, { characterSpacing: 0.4 });
    doc.font("body").fontSize(10).fillColor(INK).text(value, L, doc.y, { width: W });
    doc.moveDown(0.25);
  };

  // header band
  const plays = td.reels.reduce((a, r) => a + (r.plays || 0), 0);
  doc.rect(0, 0, doc.page.width, 104).fill(AMBER);
  doc.fillColor("#FFF3E0").font("bold").fontSize(9).text("U2BERCLUB TOOLS · TEARDOWN", L, 24, { characterSpacing: 0.6 });
  doc.fillColor("#FFFFFF").font("bold").fontSize(22).text(`@${td.creator || "creator"}`, L, 38, { width: W });
  doc.fillColor("#FFF3E0").font("body").fontSize(9.5).text(
    `${td.reels.length} posts  ·  ${fmtN(plays)} total plays  ·  generated ${String(td.generated_at || "").slice(0, 10)}`, L, 72, { width: W });
  doc.y = 124; doc.x = L;
  if (td.summary?.headline) { doc.font("body").fontSize(11).fillColor(INK).text(td.summary.headline, { width: W }); }

  if (td.summary?.formula?.length) {
    section("The winning reel skeleton");
    td.summary.formula.forEach((f) => {
      need(40);
      doc.font("bold").fontSize(10.5).fillColor(INK).text(`${f.title}`, L, doc.y, { continued: true })
        .font("body").fillColor(AMBER_DARK).text(`   ${f.t}`);
      doc.font("body").fontSize(10).fillColor(INK).text(f.text, L, doc.y, { width: W });
      doc.moveDown(0.4);
    });
  }
  if (td.summary?.findings?.length) {
    section("Patterns");
    td.summary.findings.forEach((f) => {
      need(60);
      doc.font("bold").fontSize(11).fillColor(INK).text(f.title, L, doc.y, { width: W });
      doc.font("body").fontSize(10).fillColor(INK).text(f.text, { width: W });
      if (f.example) doc.font("body").fontSize(9.5).fillColor(SOFT).text(f.example, { width: W });
      doc.moveDown(0.5);
    });
  }

  section(`Reel-by-reel (${opts.top ? `top ${opts.top} by plays` : "all voiced reels"})`);
  let reels = td.reels.filter((r) => (r.transcript || []).length || r.setup);
  if (opts.top) reels = [...reels].sort((a, b) => (b.plays || 0) - (a.plays || 0)).slice(0, opts.top);
  reels.forEach((r, i) => {
    if (i > 0) { need(20); doc.moveTo(L, doc.y + 4).lineTo(L + W, doc.y + 4).lineWidth(0.5).strokeColor(BORDER).stroke(); doc.moveDown(0.8); }
    need(90);
    doc.font("bold").fontSize(12).fillColor(INK).text(`#${r.rank}  ${r.topic || r.shortcode}`, L, doc.y, { width: W });
    doc.font("body").fontSize(9).fillColor(SOFT).text(
      [r.date, `${fmtN(r.plays)} plays`, `${fmtN(r.likes)} likes`, `${fmtN(r.comments)} comments`,
        r.duration_sec ? `${mmss(r.duration_sec)} (${Math.round(r.duration_sec)}s)` : null, r.hook_family].filter(Boolean).join("   ·   "), { width: W });
    doc.moveDown(0.3);
    if (r.hook_spoken || r.hook) {
      need(40);
      const y = doc.y, text = r.hook_spoken || r.hook;
      doc.font("bold").fontSize(10.5);
      const h = doc.heightOfString(text, { width: W - 20 });
      doc.rect(L, y, W, h + 12).fill(AMBER_LIGHT);
      doc.rect(L, y, 3, h + 12).fill(AMBER);
      doc.fillColor(INK).text(text, L + 12, y + 6, { width: W - 20 });
      doc.y = y + h + 18; doc.x = L;
    }
    field("Hook type", r.hook_type);
    field("Setup", r.setup);
    field("Pattern break", r.pattern_break);
    field("Payoff", r.payoff);
    field("CTA", r.cta);
    field("Why", r.why);
    if (opts.transcripts && r.transcript?.length) {
      need(30);
      doc.font("bold").fontSize(8.5).fillColor(SOFT).text("TRANSCRIPT", L, doc.y, { characterSpacing: 0.4 });
      r.transcript.forEach((s) => {
        need(16);
        doc.font("body").fontSize(9).fillColor(SOFT).text(mmss(s.t) + "  ", L, doc.y, { continued: true }).fillColor(INK).text(s.text, { width: W });
      });
    }
  });

  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    const oldBottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc.font("body").fontSize(8).fillColor(SOFT).text(
      `@${td.creator} teardown  ·  U2berClub Tools  ·  Page ${i - range.start + 1} of ${range.count}`,
      L, doc.page.height - oldBottom + 14, { width: W, align: "center", lineBreak: false });
    doc.page.margins.bottom = oldBottom;
  }
}

router.get("/:id/pdf", async (req, res) => {
  const row = await loadOne(req, res); if (!row) return;
  const top = Math.max(0, Math.min(1000, parseInt(req.query.top) || 0));
  const transcripts = req.query.transcripts === "1";
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${fileBase(row)}${top ? `-top${top}` : ""}.pdf"`);
  const doc = new PDFDocument({ margin: 50, size: "A4", bufferPages: true });
  doc.pipe(res);
  buildPdf(doc, row.data, { top, transcripts });
  doc.end();
});

export { sanitize, buildPdf };
export default router;
