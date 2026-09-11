// Content Pillar Generator — a standalone worksheet tool for turning ANY business
// into a structured content-pillar strategy: Business info -> End goals -> 7 fixed
// pillars (with your own key points) -> a 7x6 Pillar x Angle idea grid (with generic
// example hints to break creative block) -> a shortlist -> a 3C keep/drop filter.
// Every user can save multiple business "profiles" (agency use: one per client).
import express from "express";
import PDFDocument from "pdfkit";
import path from "path";
import { fileURLToPath } from "url";
import { q } from "./db/index.js";
import { auth } from "./auth.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const uid = (p) => p + "_" + Math.random().toString(36).slice(2, 9);
const clean = (v, max = 400) => String(v ?? "").trim().slice(0, max);

/* ================= Fixed reference data (the framework itself) ================= */
export const PILLAR_DEFS = [
  { id: "product", label: "Product", icon: "\u{1F4E6}", desc: "What we offer — products/services, features, variations, packages." },
  { id: "problem", label: "Problem", icon: "⚠️", desc: "What struggles does our customer face — pain points, mistakes, frustrations." },
  { id: "education", label: "Education", icon: "\u{1F393}", desc: "What should our customer know — tips, how-to, guides, comparisons." },
  { id: "desire", label: "Desire", icon: "❤️", desc: "What does our customer ultimately want — aspirations, outcomes, transformation." },
  { id: "proof", label: "Proof", icon: "\u{1F4C8}", desc: "Why should they trust us — testimonials, results, case studies, certifications." },
  { id: "personality", label: "Personality", icon: "\u{1F465}", desc: "How do we show the human side — behind the scenes, founder story, team, values." },
  { id: "culture", label: "Culture / Context", icon: "\u{1F310}", desc: "What's happening around us — trends, occasions, community, industry news." },
];

export const ANGLE_DEFS = [
  { id: "teach", label: "Teach", sub: "Inform", desc: "How-to, tips & tricks, explainers, industry knowledge." },
  { id: "entertain", label: "Entertain", sub: "Grab attention", desc: "Humor, trends/memes, fun facts, storytelling." },
  { id: "inspire", label: "Inspire", sub: "Motivate", desc: "Success stories, transformations, aspirational content." },
  { id: "prove", label: "Prove", sub: "Build trust", desc: "Testimonials, results/case studies, before-after, UGC." },
  { id: "sell", label: "Sell", sub: "Drive action", desc: "Offers/promotions, product showcases, direct CTAs." },
  { id: "humanize", label: "Humanize", sub: "Make it relatable", desc: "Behind the scenes, team/daily life, founder story." },
];

export const END_GOALS = [
  { id: "awareness", label: "Brand Awareness" },
  { id: "leads", label: "Generate Leads" },
  { id: "sales", label: "Increase Sales" },
  { id: "community", label: "Build Community" },
  { id: "expert", label: "Position as Expert" },
  { id: "other", label: "Other" },
];

// One generic, industry-agnostic nudge per Pillar x Angle cell — enough to break a
// blank page without pretending to know the user's specific business (no AI here).
const IDEA_HINTS = {
  product: {
    teach: "How [product] is made or how it works, step by step",
    entertain: "Show your product in an unexpected or funny situation",
    inspire: "The bigger transformation your product enables",
    prove: "Before/after or side-by-side comparison of your product in use",
    sell: "This week's offer or bundle on [product]",
    humanize: "The story of how this product came to be",
  },
  problem: {
    teach: "The #1 mistake people make that your product/service fixes",
    entertain: "A relatable 'we've all been there' moment about this problem",
    inspire: "How solving this problem changed a customer's day",
    prove: "A quick stat showing how common this problem is",
    sell: "Problem → your product as the fix, in one clip",
    humanize: "Your own team's story of running into this exact problem",
  },
  education: {
    teach: "A quick how-to or 3-step guide your audience can use today",
    entertain: "Mythbusting — a common belief in your industry, debunked",
    inspire: "A lesson you learned the hard way, shared simply",
    prove: "Explain your process and why it works better",
    sell: "Teach one tip, then show how your product does the rest",
    humanize: "Q&A — answer the question you get asked most",
  },
  desire: {
    teach: "What 'success' actually looks like for your customer, broken down",
    entertain: "A wish-list or dream-scenario video for your audience",
    inspire: "Paint the after — life once the outcome is achieved",
    prove: "A customer who got the outcome, in their own words",
    sell: "Show the end result your product/service delivers",
    humanize: "What your own team dreams of building next",
  },
  proof: {
    teach: "Walk through how you measure results or quality",
    entertain: "A fun way to show off a stat or milestone",
    inspire: "A customer transformation story, told in full",
    prove: "Testimonial, review, or case study — straight to camera",
    sell: "Your best proof point paired with a direct offer",
    humanize: "The team behind the results, on camera",
  },
  personality: {
    teach: "How your team actually does [X] — a real behind-the-scenes look",
    entertain: "A funny team moment or inside joke, made public",
    inspire: "Founder's story — why you started this",
    prove: "Meet the person responsible for [X] — their experience",
    sell: "A personal, from-the-founder pitch for an offer",
    humanize: "A day in the life at your business",
  },
  culture: {
    teach: "Explain a trend or industry news item and what it means for your audience",
    entertain: "React to or remix a trend relevant to your niche",
    inspire: "Tie a season/occasion to a bigger idea your brand stands for",
    prove: "Show up in the news, an award, or industry recognition",
    sell: "A seasonal/occasion-based offer",
    humanize: "How your community or industry celebrates this moment",
  },
};

function emptyPillars() {
  const out = {};
  PILLAR_DEFS.forEach((p) => { out[p.id] = { keyPoints: [] }; });
  return out;
}

/* ================= Storage: tool_data (tool='pillargen', key='profiles') ================= */
export async function loadProfiles(userId) {
  const { rows } = await q(
    "SELECT value FROM tool_data WHERE user_id=$1 AND tool='pillargen' AND key='profiles'", [userId]);
  const v = rows[0]?.value;
  const profiles = Array.isArray(v?.profiles) ? v.profiles : [];
  // backfill — keep old saved profiles working if the shape grows later
  profiles.forEach((p) => {
    if (!p.business) p.business = { name: "", industry: "", products: "", audience: "", problem: "", competitors: "" };
    if (!p.goals) p.goals = { selected: [], otherText: "" };
    if (!p.pillars) p.pillars = emptyPillars();
    PILLAR_DEFS.forEach((pd) => {
      if (!p.pillars[pd.id]) p.pillars[pd.id] = { keyPoints: [] };
      if (!Array.isArray(p.pillars[pd.id].keyPoints)) p.pillars[pd.id].keyPoints = [];
    });
    if (!p.ideaGrid || typeof p.ideaGrid !== "object") p.ideaGrid = {};
    if (!Array.isArray(p.shortlist)) p.shortlist = [];
    p.shortlist.forEach((s) => {
      if (!s.threeC) s.threeC = { customer: false, content: false, commercial: false };
      if (!("format" in s)) s.format = "";
      if (!("goal" in s)) s.goal = "";
      if (!("status" in s)) s.status = "Idea";
    });
  });
  return profiles;
}
export async function saveProfiles(userId, profiles) {
  await q(
    `INSERT INTO tool_data (user_id,tool,key,value,updated_at) VALUES ($1,'pillargen','profiles',$2,now())
     ON CONFLICT (user_id,tool,key) DO UPDATE SET value=EXCLUDED.value, updated_at=now()`,
    [userId, { profiles }]);
}

const router = express.Router();
router.use(auth(true));

async function withProfile(req, res, fn) {
  const userId = req.user.id;
  const profiles = await loadProfiles(userId);
  const profile = profiles.find((p) => p.id === req.params.id);
  if (!profile) return res.status(404).json({ error: "Not found" });
  let result;
  try {
    result = await fn(profile, profiles);
  } catch (e) {
    // route handlers below throw Object.assign(new Error(...), { code: 4xx }) for
    // validation failures — Express 4 won't route a thrown async error anywhere on
    // its own, so this catch is what actually turns it into a real HTTP response.
    const code = Number.isInteger(e.code) ? e.code : 500;
    return res.status(code).json({ error: e.message || "Something went wrong." });
  }
  await saveProfiles(userId, profiles);
  res.json(result);
}

// ---- reference data (static, no auth needed really, but keep it behind the tool gate) ----
router.get("/reference", (req, res) => res.json({ pillars: PILLAR_DEFS, angles: ANGLE_DEFS, goals: END_GOALS, hints: IDEA_HINTS }));

// ---- profiles ----
router.get("/profiles", async (req, res) => res.json(await loadProfiles(req.user.id)));

router.get("/profiles/:id", async (req, res) => {
  const profiles = await loadProfiles(req.user.id);
  const p = profiles.find((x) => x.id === req.params.id);
  if (!p) return res.status(404).json({ error: "Not found" });
  res.json(p);
});

router.post("/profiles", async (req, res) => {
  const name = clean(req.body.name, 80);
  if (!name) return res.status(400).json({ error: "Give the business a name." });
  const profiles = await loadProfiles(req.user.id);
  const profile = {
    id: uid("bp"),
    createdAt: new Date().toISOString(),
    business: { name, industry: "", products: "", audience: "", problem: "", competitors: "" },
    goals: { selected: [], otherText: "" },
    pillars: emptyPillars(),
    ideaGrid: {},
    shortlist: [],
  };
  profiles.unshift(profile);
  await saveProfiles(req.user.id, profiles);
  res.json(profile);
});

router.delete("/profiles/:id", async (req, res) => {
  let profiles = await loadProfiles(req.user.id);
  profiles = profiles.filter((p) => p.id !== req.params.id);
  await saveProfiles(req.user.id, profiles);
  res.json({ ok: true });
});

// ---- Step 1: Business info ----
router.patch("/profiles/:id/business", (req, res) => withProfile(req, res, (p) => {
  const b = p.business;
  for (const k of ["name", "industry", "products", "audience", "problem", "competitors"]) {
    if (k in req.body) b[k] = clean(req.body[k], k === "name" ? 80 : 600);
  }
  return p.business;
}));

// ---- Step 2: End goals ----
router.patch("/profiles/:id/goals", (req, res) => withProfile(req, res, (p) => {
  if (Array.isArray(req.body.selected)) {
    p.goals.selected = req.body.selected.filter((g) => END_GOALS.some((eg) => eg.id === g)).slice(0, END_GOALS.length);
  }
  if ("otherText" in req.body) p.goals.otherText = clean(req.body.otherText, 120);
  return p.goals;
}));

// ---- Step 3: Pillars — key points (growable bullet list per fixed pillar) ----
router.post("/profiles/:id/pillars/:pillarId/keypoints", (req, res) => withProfile(req, res, (p) => {
  const text = clean(req.body.text, 200);
  if (!text) throw Object.assign(new Error("Give the point some text."), { code: 400 });
  if (!PILLAR_DEFS.some((pd) => pd.id === req.params.pillarId)) throw Object.assign(new Error("Unknown pillar"), { code: 404 });
  const kp = { id: uid("kp"), text };
  p.pillars[req.params.pillarId].keyPoints.push(kp);
  return kp;
}));

router.delete("/profiles/:id/pillars/:pillarId/keypoints/:kpId", (req, res) => withProfile(req, res, (p) => {
  const pillar = p.pillars[req.params.pillarId];
  if (!pillar) return { ok: true };
  pillar.keyPoints = pillar.keyPoints.filter((k) => k.id !== req.params.kpId);
  return { ok: true };
}));

// ---- Step 4: Idea grid — one cell = one pillar x angle combo ----
router.patch("/profiles/:id/grid", (req, res) => withProfile(req, res, (p) => {
  const { pillarId, angleId, text } = req.body;
  if (!PILLAR_DEFS.some((pd) => pd.id === pillarId) || !ANGLE_DEFS.some((a) => a.id === angleId)) {
    throw Object.assign(new Error("Unknown pillar or angle"), { code: 400 });
  }
  const key = `${pillarId}|${angleId}`;
  const val = clean(text, 300);
  if (val) p.ideaGrid[key] = val; else delete p.ideaGrid[key];
  return { key, text: val };
}));

// ---- Step 5: Shortlist ----
router.post("/profiles/:id/shortlist", (req, res) => withProfile(req, res, (p) => {
  const text = clean(req.body.text, 300);
  if (!text) throw Object.assign(new Error("Give the idea some text."), { code: 400 });
  const item = {
    id: uid("sl"),
    text,
    pillarId: PILLAR_DEFS.some((pd) => pd.id === req.body.pillarId) ? req.body.pillarId : "",
    angleId: ANGLE_DEFS.some((a) => a.id === req.body.angleId) ? req.body.angleId : "",
    format: clean(req.body.format, 40),
    goal: clean(req.body.goal, 80),
    status: clean(req.body.status, 30) || "Idea",
    threeC: { customer: false, content: false, commercial: false },
  };
  p.shortlist.push(item);
  return item;
}));

router.patch("/profiles/:id/shortlist/:itemId", (req, res) => withProfile(req, res, (p) => {
  const item = p.shortlist.find((s) => s.id === req.params.itemId);
  if (!item) throw Object.assign(new Error("Not found"), { code: 404 });
  if ("text" in req.body) item.text = clean(req.body.text, 300);
  if ("format" in req.body) item.format = clean(req.body.format, 40);
  if ("goal" in req.body) item.goal = clean(req.body.goal, 80);
  if ("status" in req.body) item.status = clean(req.body.status, 30) || "Idea";
  if (req.body.threeC && typeof req.body.threeC === "object") {
    for (const k of ["customer", "content", "commercial"]) {
      if (k in req.body.threeC) item.threeC[k] = !!req.body.threeC[k];
    }
  }
  return item;
}));

router.delete("/profiles/:id/shortlist/:itemId", (req, res) => withProfile(req, res, (p) => {
  p.shortlist = p.shortlist.filter((s) => s.id !== req.params.itemId);
  return { ok: true };
}));

/* ================= PDF export ================= */
const FONTS_DIR = path.join(__dirname, "fonts");
const FONT_REG = "body";
const FONT_BOLD = "bold";

const AMBER = "#E8852B";
const AMBER_DARK = "#C96A18";
const AMBER_LIGHT = "#FDF3E7";
const INK = "#2B2320";
const SOFT = "#6B5F55";
const BORDER = "#EAE1D3";
const GRAY_BG = "#F1ECE2";
const GREEN = "#2E7D46";
const GREEN_BG = "#E8F5E9";
const RED = "#C0392B";
const RED_BG = "#FDECEA";

function registerFonts(doc) {
  doc.registerFont(FONT_REG, path.join(FONTS_DIR, "NotoSansDevanagari-Regular.ttf"));
  doc.registerFont(FONT_BOLD, path.join(FONTS_DIR, "NotoSansDevanagari-Bold.ttf"));
}
function pageBreakIfNeeded(doc, needed) {
  if (doc.y + needed > doc.page.height - doc.page.margins.bottom) doc.addPage();
}
function sectionTitle(doc, text) {
  pageBreakIfNeeded(doc, 60);
  doc.moveDown(1);
  const y = doc.y;
  doc.rect(doc.page.margins.left, y + 2, 4, 13).fill(AMBER);
  doc.fontSize(13).fillColor(AMBER_DARK).font(FONT_BOLD).text(text.toUpperCase(), doc.page.margins.left + 12, y, { characterSpacing: 0.6 });
  doc.moveTo(doc.page.margins.left, doc.y + 4).lineTo(doc.page.width - doc.page.margins.right, doc.y + 4).lineWidth(1).strokeColor(BORDER).stroke();
  doc.y = doc.y + 10;
  doc.x = doc.page.margins.left;
  doc.fillColor(INK).font(FONT_REG);
}
function label(doc, l, value) {
  if (!value) return;
  doc.fontSize(9).fillColor(SOFT).font(FONT_BOLD).text(l.toUpperCase() + "  ", doc.x, doc.y, { continued: true });
  doc.fontSize(10.5).fillColor(INK).font(FONT_REG).text(String(value));
}
function chips(doc, items, opts = {}) {
  const clean2 = (items || []).filter(Boolean);
  if (!clean2.length) return;
  const bg = opts.bg || AMBER_LIGHT, fg = opts.fg || AMBER_DARK;
  const startX = opts.x != null ? opts.x : doc.page.margins.left;
  const maxX = doc.page.width - doc.page.margins.right;
  let x = startX, y = doc.y;
  const padX = 7, h = 16, gap = 6;
  clean2.forEach((l) => {
    doc.font(FONT_BOLD).fontSize(8.5);
    const w = doc.widthOfString(l) + padX * 2;
    if (x + w > maxX && x > startX) { x = startX; y += h + 5; }
    doc.roundedRect(x, y, w, h, 8).fill(bg);
    doc.fillColor(fg).text(l, x + padX, y + 4, { lineBreak: false, width: w - padX * 2 });
    x += w + gap;
  });
  doc.x = startX;
  doc.y = y + h + 6;
  doc.font(FONT_REG).fillColor(INK);
}
function headerBand(doc, business) {
  const contentW = doc.page.width - 100;
  doc.font(FONT_BOLD).fontSize(21);
  const title = business.name || "Untitled business";
  const titleH = doc.heightOfString(title, { width: contentW });
  const brandY = 24, titleY = brandY + 15, metaY = titleY + titleH + 8, bandH = metaY + 17;
  doc.rect(0, 0, doc.page.width, bandH).fill(AMBER);
  doc.fillColor("#FFF3E0").font(FONT_BOLD).fontSize(9).text("CONTENT PILLAR GENERATOR", 50, brandY, { characterSpacing: 0.6 });
  doc.fillColor("#FFFFFF").font(FONT_BOLD).fontSize(21).text(title, 50, titleY, { width: contentW });
  doc.fillColor("#FFF3E0").font(FONT_REG).fontSize(9.5).text(
    `Industry: ${business.industry || "—"}   ·   Audience: ${business.audience || "—"}`, 50, metaY, { width: contentW });
  doc.y = bandH + 22;
  doc.x = doc.page.margins.left;
  doc.fillColor(INK).font(FONT_REG);
}

function buildProfilePDF(doc, profile) {
  registerFonts(doc);
  const b = profile.business;
  headerBand(doc, b);

  // Business
  sectionTitle(doc, "Business");
  label(doc, "Products / services", b.products);
  if (b.products) doc.moveDown(0.2);
  label(doc, "Target audience", b.audience);
  if (b.audience) doc.moveDown(0.2);
  label(doc, "Customer's main problem", b.problem);
  if (b.problem) doc.moveDown(0.2);
  label(doc, "Biggest competitors", b.competitors);

  // Goals
  sectionTitle(doc, "End goal — why are we doing this?");
  const goalLabels = (profile.goals.selected || []).map((id) => (END_GOALS.find((g) => g.id === id) || {}).label).filter(Boolean);
  if (profile.goals.otherText) goalLabels.push(profile.goals.otherText);
  if (goalLabels.length) chips(doc, goalLabels, { bg: AMBER_LIGHT, fg: AMBER_DARK });
  else doc.fontSize(10.5).fillColor(INK).font(FONT_REG).text("No goals selected.");

  // Pillars
  sectionTitle(doc, "The 7 content pillars");
  PILLAR_DEFS.forEach((pd, idx) => {
    if (idx > 0) doc.moveDown(0.6);
    pageBreakIfNeeded(doc, 50);
    doc.fontSize(12).fillColor(INK).font(FONT_BOLD).text(pd.label);
    doc.fontSize(9).fillColor(SOFT).font(FONT_REG).text(pd.desc);
    const points = (profile.pillars[pd.id] || {}).keyPoints || [];
    if (points.length) {
      doc.moveDown(0.2);
      points.forEach((kp) => {
        doc.fontSize(10).fillColor(INK).font(FONT_REG).text("•  " + kp.text, doc.page.margins.left + 4);
      });
    }
  });

  // Idea grid — only non-empty cells, grouped by pillar, so the PDF stays readable
  sectionTitle(doc, "Idea generation grid");
  let anyIdeas = false;
  PILLAR_DEFS.forEach((pd) => {
    const rowIdeas = ANGLE_DEFS
      .map((a) => ({ angle: a, text: profile.ideaGrid[`${pd.id}|${a.id}`] }))
      .filter((x) => x.text);
    if (!rowIdeas.length) return;
    anyIdeas = true;
    pageBreakIfNeeded(doc, 30);
    doc.fontSize(10.5).fillColor(AMBER_DARK).font(FONT_BOLD).text(pd.label);
    doc.moveDown(0.15);
    rowIdeas.forEach((x) => {
      pageBreakIfNeeded(doc, 22);
      doc.fontSize(8.5).fillColor(SOFT).font(FONT_BOLD).text(x.angle.label.toUpperCase() + "  ", doc.x, doc.y, { continued: true });
      doc.fontSize(10).fillColor(INK).font(FONT_REG).text(x.text);
    });
    doc.moveDown(0.4);
  });
  if (!anyIdeas) doc.fontSize(10.5).fillColor(INK).font(FONT_REG).text("No ideas filled in yet.");

  // Shortlist + 3C filter
  sectionTitle(doc, "Shortlist");
  if (!profile.shortlist.length) {
    doc.fontSize(10.5).fillColor(INK).font(FONT_REG).text("No ideas shortlisted yet.");
  } else {
    profile.shortlist.forEach((item, idx) => {
      if (idx > 0) doc.moveDown(0.5);
      pageBreakIfNeeded(doc, 60);
      const pillarLabel = (PILLAR_DEFS.find((p) => p.id === item.pillarId) || {}).label;
      const angleLabel = (ANGLE_DEFS.find((a) => a.id === item.angleId) || {}).label;
      doc.fontSize(11).fillColor(INK).font(FONT_BOLD).text(item.text);
      const meta = [pillarLabel, angleLabel, item.format, item.goal].filter(Boolean).join("   ·   ");
      if (meta) { doc.fontSize(9).fillColor(SOFT).font(FONT_REG).text(meta); }
      doc.moveDown(0.15);
      const c = item.threeC || {};
      const passCount = ["customer", "content", "commercial"].filter((k) => c[k]).length;
      const verdict = passCount === 3 ? "KEEP" : "REVIEW";
      chips(doc, [
        item.status,
        `Customer: ${c.customer ? "Yes" : "—"}`,
        `Content: ${c.content ? "Yes" : "—"}`,
        `Commercial: ${c.commercial ? "Yes" : "—"}`,
        verdict,
      ], passCount === 3 ? { bg: GREEN_BG, fg: GREEN } : { bg: GRAY_BG, fg: SOFT });
    });
  }

  // Footer: page numbers on every buffered page (bottom-margin-zero trick avoids
  // pdfkit silently adding a blank page when text sits right at the edge).
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    const oldBottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc.fontSize(8).fillColor(SOFT).font(FONT_REG)
      .text(`U2berClub Content Pillar Generator  ·  Page ${i - range.start + 1} of ${range.count}`,
        doc.page.margins.left, doc.page.height - oldBottom + 14,
        { width: doc.page.width - doc.page.margins.left - doc.page.margins.right, align: "center", lineBreak: false });
    doc.page.margins.bottom = oldBottom;
  }
}

router.get("/profiles/:id/pdf", async (req, res) => {
  const profiles = await loadProfiles(req.user.id);
  const profile = profiles.find((p) => p.id === req.params.id);
  if (!profile) return res.status(404).json({ error: "Not found" });
  const filename = (profile.business.name || "business").replace(/[^a-z0-9]+/gi, "_").slice(0, 60) + ".pdf";
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  const doc = new PDFDocument({ margin: 50, size: "A4", bufferPages: true });
  doc.pipe(res);
  buildProfilePDF(doc, profile);
  doc.end();
});

export default router;
