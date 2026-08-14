import React, { useState, useEffect, useCallback } from "react";
import { CSS, api } from "./theme.js";
import Auth from "./Auth.jsx";
import Hub from "./Hub.jsx";
import Admin from "./Admin.jsx";
import SavedReels from "./tools/SavedReels.jsx";
import Trends from "./tools/Trends.jsx";

export default function App() {
  const [me, setMe] = useState(undefined);      // undefined = loading
  const [route, setRoute] = useState(location.hash.slice(1) || "/");

  useEffect(() => {
    const h = () => setRoute(location.hash.slice(1) || "/");
    window.addEventListener("hashchange", h); return () => window.removeEventListener("hashchange", h);
  }, []);
  const go = (r) => { location.hash = r; setRoute(r); };

  const refresh = useCallback(async () => {
    const { user } = await api.get("/api/auth/me");
    setMe(user || null);
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  const logout = async () => { await api.post("/api/auth/logout"); setMe(null); go("/"); };

  if (me === undefined) return <><style>{CSS}</style><div className="center"><span style={{color:"var(--muted)"}}>Loading…</span></div></>;
  if (!me) return <><style>{CSS}</style><Auth onDone={refresh} /></>;

  const Bar = () => (
    <div className="wrap" style={{ paddingBottom: 0 }}>
      <div className="topbar">
        <img src="/logo.png" alt="" />
        <div className="brand" style={{ cursor: "pointer" }} onClick={() => go("/")}>U2BER<span>CLUB</span> TOOLS</div>
        <div className="sp" />
        {me.role === "admin" && <button className="btn btn-ghost" onClick={() => go("/admin")}>Admin</button>}
        <span className="who">{me.name}</span>
        <button className="btn btn-ghost" onClick={logout}>Sign out</button>
      </div>
    </div>
  );

  let body;
  if (route === "/admin" && me.role === "admin") body = <Admin />;
  else if (route === "/tool/savedreels") body = <SavedReels me={me} />;
  else if (route === "/tool/trends") body = <Trends me={me} />;
  else body = <Hub me={me} go={go} />;

  return <><style>{CSS}</style><Bar />{body}</>;
}
