import React, { useState, useEffect } from "react";
import { api } from "./theme.js";

export default function Hub({ me, go }) {
  const [tools, setTools] = useState([]);
  useEffect(() => { api.get("/api/tools").then((r) => setTools(r.tools || [])); }, []);
  const open = (t) => {
    if (t.status !== "live") return;
    // ContentFlow is a static sub-app served at /contentflow/; others are in-app routes
    if (t.id === "contentflow") { window.location.href = "/contentflow/"; return; }
    go("/tool/" + t.id);
  };

  return (
    <div className="wrap">
      <div className="eyebrow" style={{ marginTop: 10 }}>Welcome back</div>
      <div className="h1">Hi {me.name.split(" ")[0]} 👋</div>
      <div className="sub">Your U2berClub tools. Each one saves your work to your own account — nobody else sees it.</div>
      <div className="tools-grid">
        {tools.map((t) => (
          <div key={t.id} className={"tool " + (t.status !== "live" ? "soon" : "")} onClick={() => open(t)}>
            <span className={"badge " + t.status}>{t.status === "live" ? "Live" : "Soon"}</span>
            <div className="tn">{t.name}</div>
            <div className="tt">{t.tagline}</div>
            {t.status === "live" && <div style={{ marginTop: 12, fontFamily: "var(--mono)", fontSize: 11.5, color: "var(--amber)" }}>Open →</div>}
          </div>
        ))}
      </div>
    </div>
  );
}
