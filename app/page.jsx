"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import MissionPage from "../components/MissionPage";
import NotificationPage from "../components/NotificationPage";

const MapView = dynamic(() => import("../components/MapView"), {
  ssr: false,
  loading: () => <div style={{ padding: 24, fontSize: 18, color: "var(--bdi-text-dim)" }}>กำลังโหลดแผนที่…</div>,
});

const TABS = [
  { id: "explore", label: "EXPLORE", icon: "🧭" },
  { id: "mission", label: "MISSION", icon: "🏆" },
  { id: "notification", label: "NOTIFICATION", icon: "🔔" },
];
const TITLE = { explore: "EXPLORE", mission: "MISSION", notification: "NOTIFICATION" };

// สถิติเดินแบบย่อบน top bar (ย้ายมาจาก HUD ลอยบนแผนที่ — ลดความรก) · รายละเอียดเต็มอยู่แท็บ MISSION
function TopStats({ onGo }) {
  const [s, setS] = useState(null);
  useEffect(() => {
    fetch("/api/missions").then((r) => r.json()).then((d) => setS(d.stats)).catch(() => {});
  }, []);
  if (!s) return null;
  return (
    <button onClick={onGo} title="ดูรายละเอียดใน MISSION"
      style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6, background: "rgba(183,235,62,.14)", border: "1px solid rgba(183,235,62,.4)", borderRadius: 999, padding: "4px 11px", cursor: "pointer", color: "var(--bdi-text)" }}>
      <span style={{ fontSize: 12 }}>🔥{s.streakDays}</span>
      <span style={{ fontWeight: 800, fontSize: 12, color: "var(--bdi-green)" }}>{s.todayKm} km</span>
    </button>
  );
}

export default function Page() {
  const mapApi = useRef(null);
  const [tab, setTab] = useState("explore");

  return (
    <div className="bdi-shell">
      <div className="bdi-main">
        {/* Top bar ตาม Figma */}
        <div className="bdi-topbar">
          <div className="bdi-avatar">👤</div>
          <h1>{TITLE[tab]}</h1>
          {tab === "explore" ? <TopStats onGo={() => setTab("mission")} /> : null}
        </div>

        {/* EXPLORE — แผนที่ mount ค้างไว้เสมอ (กันโหลด Leaflet ใหม่ตอนสลับแท็บ) */}
        <div style={{ position: "absolute", inset: 0, visibility: tab === "explore" ? "visible" : "hidden" }}>
          <MapView apiRef={mapApi} />
        </div>

        {tab === "mission" ? <MissionPage /> : null}
        {tab === "notification" ? <NotificationPage /> : null}
      </div>

      {/* Bottom nav ตาม Figma (Frame 22) */}
      <nav className="bdi-nav">
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? "on" : ""} onClick={() => setTab(t.id)}>
            <span className="ic">{t.icon}</span>
            {t.label}
          </button>
        ))}
      </nav>
    </div>
  );
}
