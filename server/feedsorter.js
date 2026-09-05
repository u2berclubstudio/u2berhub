// FEEDSORTER — Instagram profile analyser, admin-only.
//
// This calls Instagram's public web API from the server. That has two consequences
// we design around:
//   1. Instagram rate-limits the SERVER's IP, and this VPS also serves the hub and
//      other sites. So scans are admin-only and throttled.
//   2. The endpoint is never exposed publicly — it sits behind the hub login.
import express from "express";
import { auth, adminOnly } from "./auth.js";

const IG_APP_ID = "936619743392459";
const apiHeaders = () => ({
  "x-ig-app-id": IG_APP_ID,
  "x-requested-with": "XMLHttpRequest",
  // a normal-looking UA; without it Instagram frequently returns an empty body
  "user-agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const median = (arr) => {
  const a = arr.filter((x) => typeof x === "number" && !isNaN(x)).sort((x, y) => x - y);
  if (!a.length) return 0;
  const mid = Math.floor(a.length / 2);
  return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2;
};

function normalize(item) {
  const isVideo = item.media_type === 2 || item.product_type === "clips";
  const isReel = item.product_type === "clips";
  const caption = item.caption?.text || "";
  const cands = item.image_versions2?.candidates || [];
  return {
    code: item.code,
    url: item.code ? `https://www.instagram.com/${isReel ? "reel" : "p"}/${item.code}/` : "",
    type: isReel ? "reel" : isVideo ? "video" : "photo",
    views: item.play_count ?? item.view_count ?? item.ig_play_count ?? null,
    likes: item.like_count ?? null,
    comments: item.comment_count ?? null,
    shares: item.reshare_count ?? item.share_count ?? null,
    saves: item.saved_count ?? item.save_count ?? null,
    caption,
    hook: caption.split("\n")[0].slice(0, 140),
    thumb: cands.length ? cands[cands.length - 1].url : "",
    takenAt: item.taken_at ? item.taken_at * 1000 : null,
  };
}

async function getProfile(username) {
  const url =
    "https://www.instagram.com/api/v1/users/web_profile_info/?username=" +
    encodeURIComponent(username);
  try {
    const res = await fetch(url, { headers: apiHeaders() });
    if (res.ok) {
      const data = await res.json();
      const user = data?.data?.user;
      if (user?.id) {
        return {
          ok: true,
          id: user.id,
          fullName: user.full_name || "",
          followers: user.edge_followed_by?.count ?? null,
          isPrivate: !!user.is_private,
        };
      }
    }
    if (res.status === 401 || res.status === 429) {
      return { ok: false, error: "Instagram is rate-limiting us right now. Wait ~10 minutes and try again." };
    }
  } catch (e) { /* fall through */ }
  return { ok: false, error: "Couldn't load that profile. Check the spelling — and it has to be public." };
}

async function fetchAllMedia(userId, cap = 150) {
  const collected = [];
  let maxId = "";
  let more = true;
  let guard = 0;

  while (more && collected.length < cap && guard < 16) {
    guard++;
    const url =
      `https://www.instagram.com/api/v1/feed/user/${userId}/?count=33` +
      (maxId ? `&max_id=${encodeURIComponent(maxId)}` : "");
    try {
      const res = await fetch(url, { headers: apiHeaders() });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const items = data.items || [];
      if (!items.length && !collected.length) {
        throw new Error("No posts came back — the profile may be private, empty, or we're rate-limited.");
      }
      for (const it of items) collected.push(normalize(it));
      more = !!data.more_available;
      maxId = data.next_max_id || "";
      if (!maxId) more = false;
      await sleep(500); // be polite; this is the difference between working and blocked
    } catch (e) {
      if (!collected.length) throw e;
      break; // partial results are still useful
    }
  }
  return collected;
}

/* ---- throttle: this VPS also serves the hub, so protect its IP ---- */
const MIN_GAP_MS = 15_000;      // between scans
const HOURLY_CAP = 20;          // scans per hour, per user
const lastScan = new Map();     // userId -> timestamp
const hourlyLog = new Map();    // userId -> [timestamps]

function throttle(userId) {
  const now = Date.now();
  const last = lastScan.get(userId) || 0;
  if (now - last < MIN_GAP_MS) {
    return `Give it ${Math.ceil((MIN_GAP_MS - (now - last)) / 1000)}s between scans — it keeps Instagram from blocking the server.`;
  }
  const log = (hourlyLog.get(userId) || []).filter((t) => now - t < 3_600_000);
  if (log.length >= HOURLY_CAP) {
    return `That's ${HOURLY_CAP} scans this hour — the cap exists so Instagram doesn't rate-limit this server. Try again later.`;
  }
  log.push(now);
  hourlyLog.set(userId, log);
  lastScan.set(userId, now);
  return null;
}

const router = express.Router();
router.use(auth(true), adminOnly);   // admin only, always

router.post("/scan", async (req, res) => {
  const username = String(req.body.username || "").trim().replace(/^@/, "");
  if (!username) return res.status(400).json({ error: "Type a username." });
  if (!/^[A-Za-z0-9._]{1,30}$/.test(username)) {
    return res.status(400).json({ error: "That doesn't look like an Instagram username." });
  }

  const blocked = throttle(req.user.id);
  if (blocked) return res.status(429).json({ error: blocked });

  try {
    const profile = await getProfile(username);
    if (!profile.ok) return res.status(400).json({ error: profile.error });
    if (profile.isPrivate) {
      return res.status(400).json({ error: "That account is private — nothing to read." });
    }

    const posts = await fetchAllMedia(profile.id);
    if (!posts.length) return res.status(400).json({ error: "No posts found." });

    // "viral score" = how many times the typical post's likes this one got
    const medLikes = median(posts.map((p) => p.likes || 0));
    posts.forEach((p) => { p.viral = medLikes > 0 ? (p.likes || 0) / medLikes : 0; });
    posts.sort((a, b) => (b.viral || 0) - (a.viral || 0));

    res.json({
      username,
      profile: { fullName: profile.fullName, followers: profile.followers },
      posts,
      stats: {
        count: posts.length,
        typical_likes: medLikes,
        top_viral: Number(Math.max(0, ...posts.map((p) => p.viral || 0)).toFixed(1)),
        avg_viral: Number((posts.reduce((a, b) => a + (b.viral || 0), 0) / posts.length).toFixed(1)),
      },
    });
  } catch (e) {
    res.status(500).json({ error: e.message || "Scan failed. Try again in a few minutes." });
  }
});

export default router;
