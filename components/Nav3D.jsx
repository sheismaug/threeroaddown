"use client";

import { useEffect, useRef, useState } from "react";

function haversine(a, b) {
  const R = 6371000;
  const dLat = ((b[1] - a[1]) * Math.PI) / 180, dLon = ((b[0] - a[0]) * Math.PI) / 180;
  const la1 = (a[1] * Math.PI) / 180, la2 = (b[1] * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
function bearing(a, b) {
  const f1 = (a[1] * Math.PI) / 180, f2 = (b[1] * Math.PI) / 180, dl = ((b[0] - a[0]) * Math.PI) / 180;
  const y = Math.sin(dl) * Math.cos(f2);
  const x = Math.cos(f1) * Math.sin(f2) - Math.sin(f1) * Math.cos(f2) * Math.cos(dl);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}
function walkFrom(coords, wp, dist, dir) {
  let i = wp, acc = 0;
  while (true) { const j = i + dir; if (j < 0 || j >= coords.length) return coords[i]; acc += haversine(coords[i], coords[j]); i = j; if (acc >= dist) return coords[i]; }
}
function turnSide(coords, wp, fromPt) {
  if (wp <= 0 || wp >= coords.length - 1) return null;
  const bOut = bearing(coords[wp], walkFrom(coords, wp, 16, 1));
  const bIn = haversine(fromPt, coords[wp]) > 20 ? bearing(fromPt, coords[wp]) : bearing(walkFrom(coords, wp, 16, -1), coords[wp]);
  const d = ((bOut - bIn + 540) % 360) - 180;
  const ad = Math.abs(d);
  if (ad < 22) return "ตรงไป";
  const side = d > 0 ? "ขวา" : "ซ้าย";
  if (ad > 150) return "กลับตัว";
  if (ad > 115) return "เลี้ยว" + side + "หักศอก";
  if (ad > 50) return "เลี้ยว" + side;
  return "เบี่ยง" + side;
}
const TURN_EN = { "เลี้ยวซ้าย": "turn left", "เลี้ยวขวา": "turn right", "เบี่ยงซ้าย": "keep left", "เบี่ยงขวา": "keep right", "เลี้ยวซ้ายหักศอก": "sharp left", "เลี้ยวขวาหักศอก": "sharp right", "ตรงไป": "go straight", "กลับตัว": "U-turn" };
const HAZ = {
  sidewalk: { emoji: "🚧", label: "ทางเท้าชำรุด", en: "broken sidewalk", color: "#e63946" },
  road: { emoji: "🛣️", label: "ถนนชำรุด", en: "road damage", color: "#f4a261" },
  flood: { emoji: "🌊", label: "น้ำท่วม", en: "flooding", color: "#1d6fb8" },
  flood_risk: { emoji: "🌊", label: "จุดเสี่ยงน้ำท่วม", en: "flood-risk area", color: "#0077b6" },
  light: { emoji: "🌑", label: "จุดมืด/ไฟดับ", en: "dark spot", color: "#3a0ca3" },
  obstruct: { emoji: "⛔", label: "สิ่งกีดขวาง", en: "obstruction", color: "#9d4edd" },
  cctv_broken: { emoji: "📷", label: "กล้องเสีย", en: "broken CCTV", color: "#ff5da2" },
};
const hz = (c) => HAZ[c] || { emoji: "⚠️", label: "จุดเสี่ยง", en: "hazard", color: "#e63946" };

let _v = [];
function speak(t, lang) { try { if (!window.speechSynthesis || !t) return; if (!_v.length) _v = window.speechSynthesis.getVoices() || []; const u = new SpeechSynthesisUtterance(t); const vo = _v.find((x) => (lang === "en" ? /^en/i : /^th/i).test(x.lang)); if (vo) u.voice = vo; u.lang = lang === "en" ? "en-US" : "th-TH"; window.speechSynthesis.speak(u); } catch (e) {} }
function speakNow(t, l) { try { window.speechSynthesis && window.speechSynthesis.cancel(); } catch (e) {} speak(t, l); }

function loadMapLibre() {
  return new Promise((resolve, reject) => {
    if (window.maplibregl) return resolve(window.maplibregl);
    if (!document.getElementById("mlgl-css")) {
      const l = document.createElement("link"); l.id = "mlgl-css"; l.rel = "stylesheet";
      l.href = "https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css"; document.head.appendChild(l);
    }
    const s = document.createElement("script");
    s.src = "https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js";
    s.onload = () => resolve(window.maplibregl); s.onerror = reject;
    document.body.appendChild(s);
  });
}

export default function Nav3D({ route, problems, destName, onClose }) {
  const elRef = useRef(null);
  const mapRef = useRef(null);
  const ctx = useRef({ timer: null, prev: null, spoken: new Set(), voiceOn: true, lang: "th", straightD: -999 });
  const [banner, setBanner] = useState({ instr: "เริ่มนำทาง", dist: null, dest: null });
  const [hazAlert, setHazAlert] = useState(null);
  const [arrived, setArrived] = useState(false);
  const [voice, setVoice] = useState(true);
  const [lang, setLang] = useState("th");

  useEffect(() => {
    let cancelled = false;
    const coords = route.coordinates;
    const cum = [0]; for (let i = 1; i < coords.length; i++) cum[i] = cum[i - 1] + haversine(coords[i - 1], coords[i]);
    const steps = route.steps || [];
    const total = cum[cum.length - 1];
    const dest = coords[coords.length - 1];

    const hazNear = [];
    for (const p of problems || []) {
      let ri = 0, rb = Infinity;
      for (let i = 0; i < coords.length; i++) { const d = haversine(p.pt, coords[i]); if (d < rb) { rb = d; ri = i; } }
      if (rb < 30) hazNear.push({ ...p, ri, ralong: cum[ri] });
    }

    (async () => {
      const maplibregl = await loadMapLibre();
      if (cancelled || !elRef.current) return;
      const map = new maplibregl.Map({
        container: elRef.current,
        style: "https://tiles.openfreemap.org/styles/bright",
        center: coords[0], zoom: 18.4, pitch: 70, bearing: 0, maxPitch: 80, attributionControl: false,
      });
      mapRef.current = map;

      map.on("load", () => {
        if (cancelled) return;
        try { map.setLight && map.setLight({ anchor: "viewport", color: "#ffffff", intensity: 0.45, position: [1.4, 200, 60] }); } catch (e) {}
        try {
          map.addLayer({
            id: "nav3d-buildings", source: "openmaptiles", "source-layer": "building", type: "fill-extrusion", minzoom: 14,
            paint: {
              "fill-extrusion-color": ["interpolate", ["linear"], ["coalesce", ["get", "render_height"], 8], 0, "#eef1f6", 15, "#dfe6f0", 45, "#c4d0e2", 120, "#aab9d4"],
              "fill-extrusion-height": ["coalesce", ["get", "render_height"], 8],
              "fill-extrusion-base": ["coalesce", ["get", "render_min_height"], 0],
              "fill-extrusion-opacity": 0.92,
              "fill-extrusion-vertical-gradient": true,
            },
          });
        } catch (e) {}
        map.addSource("route", { type: "geojson", data: { type: "Feature", geometry: { type: "LineString", coordinates: coords } } });
        map.addLayer({ id: "route-casing", type: "line", source: "route", paint: { "line-color": "#ffffff", "line-width": 13, "line-opacity": 0.9 }, layout: { "line-cap": "round", "line-join": "round" } });
        map.addLayer({ id: "route-line", type: "line", source: "route", paint: { "line-color": "#1aa64b", "line-width": 7 }, layout: { "line-cap": "round", "line-join": "round" } });

        const de = document.createElement("div");
        de.innerHTML = `<div style="display:flex;flex-direction:column;align-items:center"><div style="background:#c1121f;color:#fff;padding:4px 10px;border-radius:14px;font-weight:800;font-size:13px;white-space:nowrap;box-shadow:0 2px 6px rgba(0,0,0,.4)">🏁 ${destName || "ปลายทาง"}</div><div style="width:2px;height:18px;background:#c1121f"></div></div>`;
        new maplibregl.Marker({ element: de, anchor: "bottom" }).setLngLat(dest).addTo(map);

        for (const p of hazNear) {
          const m = hz(p.cat);
          const he = document.createElement("div");
          he.innerHTML = `<div style="display:flex;align-items:center;gap:4px;background:#fff;border:2px solid ${m.color};border-radius:14px;padding:2px 7px 2px 4px;box-shadow:0 2px 5px rgba(0,0,0,.3)"><span style="font-size:16px">${m.emoji}</span><span style="font-size:11px;font-weight:700;color:${m.color}">${m.label}</span></div>`;
          new maplibregl.Marker({ element: he, anchor: "bottom" }).setLngLat(p.pt).addTo(map);
        }

        const pe = document.createElement("div");
        pe.innerHTML = '<div style="width:0;height:0;border-left:12px solid transparent;border-right:12px solid transparent;border-bottom:30px solid #1d6fb8;filter:drop-shadow(0 1px 3px rgba(0,0,0,.6))"></div>';
        ctx.current.marker = new maplibregl.Marker({ element: pe, rotationAlignment: "map" }).setLngLat(coords[0]).addTo(map);

        speakNow(ctx.current.lang === "en" ? "Starting navigation" : "เริ่มนำทาง", ctx.current.lang);

        let d = 0;
        ctx.current.timer = setInterval(() => {
          if (cancelled) return;
          d += 7; if (d > total) d = total;
          let k = 0; while (k < cum.length - 1 && cum[k + 1] < d) k++;
          const seg = (cum[k + 1] - cum[k]) || 1, t = Math.min(1, (d - cum[k]) / seg);
          const nx = coords[k + 1] || coords[k];
          const u = [coords[k][0] + (nx[0] - coords[k][0]) * t, coords[k][1] + (nx[1] - coords[k][1]) * t];
          const hd = ctx.current.prev ? bearing(ctx.current.prev, u) : 0;
          ctx.current.prev = u;
          ctx.current.marker.setLngLat(u);
          if (ctx.current.marker.setRotation) ctx.current.marker.setRotation(hd);
          map.easeTo({ center: u, bearing: hd, pitch: 70, zoom: 18.4, duration: 600 });

          const L = ctx.current.lang;
          const idx = k;
          let mWp = null, mName = "";
          let ks = steps.findIndex((st) => idx <= st.wpEnd); if (ks < 0) ks = steps.length - 1;
          for (let j = ks + 1; j < steps.length; j++) { const wp = steps[j].wpStart; const tt = turnSide(coords, wp, u); if (tt && tt !== "ตรงไป") { mWp = wp; mName = steps[j].name || ""; break; } }
          const distTurn = mWp != null ? Math.max(0, Math.round(cum[mWp] - cum[idx])) : Math.max(0, Math.round(total - cum[idx]));
          const turnTHv = mWp != null ? turnSide(coords, mWp, u) : null;
          const instr = mWp == null ? (L === "en" ? "Continue to destination" : "ตรงไปยังปลายทาง")
            : (L === "en" ? (TURN_EN[turnTHv] || "turn") + (mName ? " onto " + mName : "") : turnTHv + (mName ? ` เข้า ${mName}` : ""));
          const destLeft = Math.max(0, Math.round(total - cum[idx]));
          setBanner({ instr, dist: distTurn, dest: destLeft });

          let alert = null, ab = Infinity;
          for (const p of hazNear) { const a = Math.round(p.ralong - cum[idx]); if (a >= -8 && a < 45 && Math.abs(a) < ab) { ab = Math.abs(a); alert = { ...hz(p.cat), dist: Math.max(0, a), id: p.pt.join(",") }; } }
          setHazAlert(alert);

          if (ctx.current.voiceOn) {
            if (alert && alert.dist <= 35 && !ctx.current.spoken.has("h" + alert.id)) {
              ctx.current.spoken.add("h" + alert.id);
              speakNow(L === "en" ? `Caution, ${alert.en} ahead` : `ระวัง ${alert.label} ข้างหน้า`, L);
            } else if (mWp != null && distTurn <= 55 && !ctx.current.spoken.has(mWp)) {
              ctx.current.spoken.add(mWp);
              const mm = Math.max(10, Math.round(distTurn / 10) * 10);
              speakNow(L === "en" ? `In ${mm} meters, ${TURN_EN[turnTHv] || "turn"}${mName ? " onto " + mName : ""}` : `ในอีก ${mm} เมตร ${instr}`, L);
            } else if ((mWp == null || distTurn > 90) && destLeft > 60 && d - ctx.current.straightD > 150) {
              ctx.current.straightD = d;
              speakNow(L === "en" ? "Continue straight" : "เดินตรงไป", L);
            }
          }

          if (d >= total) {
            clearInterval(ctx.current.timer); ctx.current.timer = null;
            setArrived(true); setBanner({ instr: L === "en" ? "You have arrived" : "ถึงปลายทางแล้ว", dist: null, dest: 0 });
            speakNow(L === "en" ? `You have arrived at ${destName || "your destination"}` : `ถึง${destName || "ปลายทาง"}แล้ว`, L);
          }
        }, 650);
      });
    })();

    return () => { cancelled = true; if (ctx.current.timer) clearInterval(ctx.current.timer); try { window.speechSynthesis && window.speechSynthesis.cancel(); } catch (e) {} if (mapRef.current) mapRef.current.remove(); };
  }, []);

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 3000, background: "#aac4e2" }}>
      <div ref={elRef} style={{ position: "absolute", inset: 0 }} />

      <div style={{ position: "absolute", top: 0, left: 0, right: 0, background: "linear-gradient(180deg,#1769aa,#1d6fb8)", color: "#fff", padding: "14px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, boxShadow: "0 3px 12px rgba(0,0,0,.25)" }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 24, fontWeight: 800, lineHeight: 1.15 }}>{banner.instr}</div>
          <div style={{ fontSize: 14, opacity: 0.95 }}>{banner.dist != null ? `อีก ${banner.dist} ม. · ` : ""}เหลือถึงปลายทาง {banner.dest ?? "-"} ม.</div>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button onClick={() => { const v = ctx.current.lang === "en" ? "th" : "en"; ctx.current.lang = v; setLang(v); }} style={btn}>{lang === "en" ? "EN" : "ไทย"}</button>
          <button onClick={() => { ctx.current.voiceOn = !ctx.current.voiceOn; setVoice(ctx.current.voiceOn); if (!ctx.current.voiceOn) try { window.speechSynthesis.cancel(); } catch (e) {} }} style={{ ...btn, fontSize: 18 }}>{voice ? "🔊" : "🔇"}</button>
          <button onClick={onClose} style={btn}>ออก</button>
        </div>
      </div>

      {hazAlert && !arrived ? (
        <div style={{ position: "absolute", top: 92, left: "50%", transform: "translateX(-50%)", background: "#fff", border: `3px solid ${hazAlert.color}`, borderRadius: 16, padding: "10px 16px", display: "flex", alignItems: "center", gap: 10, boxShadow: "0 4px 16px rgba(0,0,0,.3)", maxWidth: "90vw" }}>
          <span style={{ fontSize: 32 }}>{hazAlert.emoji}</span>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800, color: hazAlert.color }}>ระวัง! {hazAlert.label}</div>
            <div style={{ fontSize: 14, color: "#555" }}>อยู่ข้างหน้า อีก ~{hazAlert.dist} เมตร</div>
          </div>
        </div>
      ) : null}

      {arrived ? (
        <div style={{ position: "absolute", top: "40%", left: "50%", transform: "translate(-50%,-50%)", background: "#fff", borderRadius: 20, padding: "22px 28px", textAlign: "center", boxShadow: "0 6px 24px rgba(0,0,0,.35)" }}>
          <div style={{ fontSize: 44 }}>🏁</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: "#1aa64b", margin: "6px 0" }}>ถึง{destName || "ปลายทาง"}แล้ว!</div>
          <button onClick={onClose} style={{ marginTop: 8, background: "#1d6fb8", color: "#fff", border: "none", borderRadius: 12, padding: "10px 22px", fontWeight: 800, fontSize: 16, cursor: "pointer" }}>เสร็จสิ้น</button>
        </div>
      ) : null}

      <div style={{ position: "absolute", bottom: 14, left: "50%", transform: "translateX(-50%)", background: "rgba(0,0,0,.55)", color: "#fff", padding: "6px 14px", borderRadius: 20, fontSize: 12 }}>โหมดนำทาง 3D (จำลอง) · อาคารจาก OpenStreetMap</div>
    </div>
  );
}
const btn = { background: "rgba(255,255,255,.25)", border: "none", color: "#fff", borderRadius: 8, padding: "8px 12px", fontWeight: 700, cursor: "pointer" };
