export const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Inter:wght@400;500;600&family=Space+Mono:wght@400;700&display=swap');
* { box-sizing: border-box; }
:root {
  --ink:#15171E; --ink-soft:#2A2E3A; --paper:#FBF8F2; --card:#FFFFFF;
  --amber:#E8852B; --amber-soft:#FBE9D2; --teal:#2D7384; --muted:#71757E; --line:#EBE5D8; --good:#3F8F5B; --warn:#C24A5B;
  --display:'Space Grotesk',sans-serif; --body:'Inter',sans-serif; --mono:'Space Mono',monospace;
}
body { font-family:var(--body); color:var(--ink); background:var(--paper); -webkit-font-smoothing:antialiased; }
a { color:var(--teal); }
.wrap { max-width:1080px; margin:0 auto; padding:24px 22px 80px; }
.topbar { display:flex; align-items:center; gap:12px; border-bottom:2px solid var(--ink); padding:14px 0; }
.topbar img { width:38px; height:38px; border-radius:50%; }
.topbar .brand { font-family:var(--display); font-weight:700; letter-spacing:-.02em; font-size:19px; }
.topbar .brand span { color:var(--amber); }
.topbar .sp { margin-left:auto; }
.topbar .who { font-size:12.5px; color:var(--muted); font-family:var(--mono); }
.eyebrow { font-family:var(--mono); font-size:10.5px; letter-spacing:.22em; text-transform:uppercase; color:var(--amber); font-weight:700; }
.h1 { font-family:var(--display); font-weight:700; font-size:34px; letter-spacing:-.03em; margin:6px 0 4px; }
.sub { color:var(--muted); font-size:14px; max-width:520px; }
.btn { font-family:var(--display); font-weight:600; font-size:13.5px; border:none; border-radius:9px; padding:11px 17px; cursor:pointer; transition:.15s; }
.btn-amber { background:var(--amber); color:#fff; } .btn-amber:hover{ filter:brightness(1.05); }
.btn-ink { background:var(--ink); color:#fff; }
.btn-ghost { background:transparent; color:var(--ink); border:1px solid var(--line); } .btn-ghost:hover{ border-color:var(--ink); }
.btn:disabled { opacity:.5; cursor:not-allowed; }
.card { background:var(--card); border:1px solid var(--line); border-radius:14px; padding:20px; }
.lbl { display:block; font-size:10px; letter-spacing:.09em; text-transform:uppercase; color:var(--muted); font-weight:700; margin:0 0 5px; }
.inp { width:100%; border:1px solid var(--line); border-radius:9px; padding:11px 12px; font-family:var(--body); font-size:14px; background:#fff; }
.inp:focus { outline:none; border-color:var(--amber); }
.field { margin-bottom:13px; }
.err { color:var(--warn); font-size:13px; margin:8px 0; }
.ok { color:var(--good); font-size:13px; margin:8px 0; }
.center { min-height:100vh; display:flex; align-items:center; justify-content:center; padding:20px; }
.authbox { width:100%; max-width:400px; }
.authbox .logo { width:52px; height:52px; border-radius:50%; display:block; margin:0 auto 14px; }
.tools-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:14px; margin-top:22px; }
.tool { background:var(--card); border:1px solid var(--line); border-radius:14px; padding:18px; cursor:pointer; transition:.14s; position:relative; }
.tool:hover { border-color:var(--ink); transform:translateY(-2px); }
.tool.soon { opacity:.6; cursor:default; } .tool.soon:hover{ transform:none; border-color:var(--line); }
.tool .tn { font-family:var(--display); font-weight:700; font-size:18px; letter-spacing:-.01em; }
.tool .tt { font-size:12.5px; color:var(--muted); margin-top:6px; line-height:1.45; }
.badge { position:absolute; top:14px; right:14px; font-family:var(--mono); font-size:9px; text-transform:uppercase; letter-spacing:.1em; padding:3px 7px; border-radius:5px; }
.badge.live { background:#E8F3EB; color:var(--good); } .badge.soon { background:#F2EFE7; color:var(--muted); }
.pending-note { background:var(--amber-soft); border:1px solid #F0D9B8; border-radius:12px; padding:16px; font-size:14px; margin-top:20px; }
table.admin { width:100%; border-collapse:collapse; font-size:13px; margin-top:14px; }
table.admin th { text-align:left; font-family:var(--mono); font-size:10px; text-transform:uppercase; letter-spacing:.08em; color:var(--muted); padding:8px 10px; border-bottom:1px solid var(--line); }
table.admin td { padding:9px 10px; border-bottom:1px solid var(--line); }
.pill { font-family:var(--mono); font-size:10px; padding:2px 7px; border-radius:5px; }
.pill.active{ background:#E8F3EB; color:var(--good);} .pill.pending{ background:var(--amber-soft); color:#8A5A1E;} .pill.blocked{ background:#F7E4E7; color:var(--warn);}
.code-chip { font-family:var(--mono); font-size:13px; background:var(--ink); color:#fff; padding:6px 10px; border-radius:7px; display:inline-block; }
.link-btn { background:none; border:none; color:var(--teal); font-size:12.5px; cursor:pointer; text-decoration:underline; font-family:var(--body); padding:0; }
.tabs { display:flex; gap:8px; margin:18px 0; }
.tab { font-family:var(--display); font-weight:600; font-size:13.5px; padding:8px 14px; border-radius:9px; border:1px solid var(--line); background:#fff; cursor:pointer; }
.tab.on { background:var(--ink); color:#fff; border-color:var(--ink); }
`;
export const api = {
  async get(u){ const r=await fetch(u,{credentials:"include"}); return r.json(); },
  async post(u,b){ const r=await fetch(u,{method:"POST",credentials:"include",headers:{"Content-Type":"application/json"},body:JSON.stringify(b||{})}); return r.json(); },
  async put(u,b){ const r=await fetch(u,{method:"PUT",credentials:"include",headers:{"Content-Type":"application/json"},body:JSON.stringify(b||{})}); return r.json(); },
  async del(u){ const r=await fetch(u,{method:"DELETE",credentials:"include"}); return r.json(); },
};
