"use client";

import { useEffect, useRef, useState } from "react";

// ---------- helpers (self-contained) ----------
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
let _v = [];
function speak(t, lang) { try { if (!window.speechSynthesis) return; if (!_v.length) _v = window.speechSynthesis.getVoices() || []; const u = new SpeechSynthesisUtterance(t); const vo = _v.find((x) => (lang === "en" ? /^en/i : /^th/i).test(x.lang)); if (vo) u.voice = vo; u.lang = lang === "en" ? "en-US" : "th-TH"; window.speechSynthesis.speak(u); } catch (e) {} }
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

export default function Nav3D({ route, problems, onClose }) {
  const elRef = useRef(null);
  const mapRef = useRef(null);
  const ctx = useRef({ timer: null, prev: null, spoken: new Set(), voiceOn: true, lang: "th" });
  const [banner, setBanner] = useState({ instr: "เริ่มนำทาง", dist: null, dest: null });
  const [voice, setVoice] = useState(true);
  const [lang, setLang] = useState("th");

  useEffect(() => {
    let cancelled = false;
    const coords = route.coordinates;
    const cum = [0]; for (let i = 1; i < coords.length; i++) cum[i] = cum[i - 1] + haversine(coords[i - 1], coords[i]);
    const steps = route.steps || [];
    const total = cum[cum.length - 1];

    (async () => {
      const maplibregl = await loadMapLibre();
      if (cancelled || !elRef.current) return;
      const map = new maplibregl.Map({
        container: elRef.current,
        style: "https://tiles.openfreemap.org/styles/liberty",
        center: coords[0], zoom: 18, pitch: 62, bearing: 0, attributionControl: false,
      });
      mapRef.current = map;

      map.on("load", () => {
        if (cancelled) return;
        // ตึก 3D
        try {
          if (!map.getLayer("nav3d-buildings")) {
            map.addLayer({ id: "nav3d-buildings", source: "openmaptiles", "source-layer": "building", type: "fill-extrusion", minzoom: 14,
              paint: { "fill-extrusion-color": "#c8cdd8", "fill-extrusion-height": ["coalesce", ["get", "render_height"], 8], "fill-extrusion-base": ["coalesce", ["get", "render_min_height"], 0], "fill-extrusion-opacity": 0.88 } });
          }
        } catch (e) {}
        // เส้นทาง
        map.addSource("route", { type: "geojson", data: { type: "Feature", geometry: { type: "LineString", coordinates: coords } } });
        map.addLayer({ id: "route-line", type: "line", source: "route", paint: { "line-color": "#2a9d54", "line-width": 8, "line-opacity": 0.9 }, layout: { "line-cap": "round", "line-join": "round" } });
        // จุดร้องเรียน/น้ำท่วม ใกล้เส้นทาง
        const near = (problems || []).filter((p) => { let m = Infinity; for (let i = 0; i < coords.length; i += 2) { const d = haversine(p.pt, coords[i]); if (d < m) m = d; } return m < 45; });
        map.addSource("haz", { type: "geojson", data: { type: "FeatureCollection", features: near.map((p) => ({ type: "Feature", geometry: { type: "Point", coordinates: p.pt }, properties: { c: p.cat } })) } });
        map.addLayer({ id: "haz-c", type: "circle", source: "haz", paint: { "circle-radius": 7, "circle-color": ["match", ["get", "c"], "flood", "#1d6fb8", "flood_risk", "#0077b6", "light", "#3a0ca3", "#e63946"], "circle-stroke-color": "#fff", "circle-stroke-width": 2 } });

        // puck (ลูกศรนำทาง)
        const el = document.createElement("div");
        el.innerHTML = '<div style="width:0;height:0;border-left:11px solid transparent;border-right:11px solid transparent;border-bottom:26px solid #1d6fb8;filter:drop-shadow(0 0 3px rgba(0,0,0,.5))"></div>';
        ctx.current.marker = new maplibregl.Marker({ element: el, rotationAlignment: "map" }).setLngLat(coords[0]).addTo(map);

        // เริ่มเดินจำลอง
        let d = 0;
        ctx.current.timer = setInterval(() => {
          if (cancelled) return;
          d += 7; if (d > total) d = total;
          // ตำแหน่งที่ระยะ d
          let k = 0; while (k < cum.length - 1 && cum[k + 1] < d) k++;
          const seg = (cum[k + 1] - cum[k]) || 1, t = Math.min(1, (d - cum[k]) / seg);
          const u = [coords[k][0] + (coords[k + 1] ? (coords[k + 1][0] - coords[k][0]) * t : 0), coords[k][1] + (coords[k + 1] ? (coords[k + 1][1] - coords[k][1]) * t : 0)];
          const hd = ctx.current.prev ? bearing(ctx.current.prev, u) : 0;
          ctx.current.prev = u;
          ctx.current.marker.setLngLat(u);
          if (ctx.current.marker.setRotation) ctx.current.marker.setRotation(hd);
          map.easeTo({ center: u, bearing: hd, pitch: 62, zoom: 18, duration: 600 });

          // หาเลี้ยวจริงถัดไป
          let idx = k;
          let mWp = null, mName = "";
          let ks = steps.findIndex((st) => idx <= st.wpEnd); if (ks < 0) ks = steps.length - 1;
          for (let j = ks + 1; j < steps.length; j++) { const wp = steps[j].wpStart; const tt = turnSide(coords, wp, u); if (tt && tt !== "ตรงไป") { mWp = wp; mName = steps[j].name || ""; break; } }
          const distTurn = mWp != null ? Math.max(0, Math.round(cum[mWp] - cum[idx])) : Math.max(0, Math.round(total - cum[idx]));
          const turnTHv = mWp != null ? turnSide(coords, mWp, u) : null;
          const L = ctx.current.lang;
          const instr = mWp == null ? (L === "en" ? "Continue to destination" : "ตรงไปยังปลายทาง")
            : (L === "en" ? (TURN_EN[turnTHv] || "turn") + (mName ? " onto " + mName : "") : turnTHv + (mName ? ` เข้า ${mName}` : ""));
          const dest = Math.max(0, Math.round(total - cum[idx]));
          setBanner({ instr, dist: distTurn, dest });

          if (ctx.current.voiceOn && mWp != null && distTurn <= 55 && !ctx.current.spoken.has(mWp)) {
            ctx.current.spoken.add(mWp);
            const m = Math.max(10, Math.round(distTurn / 10) * 10);
            speakNow(L === "en" ? `In ${m} meters, ${TURN_EN[turnTHv] || "turn"}` : `ในอีก ${m} เมตร ${turnTHv}`, L);
          }
          if (d >= total) { clearInterval(ctx.current.timer); ctx.current.timer = null; setBanner({ instr: L === "en" ? "You have arrived" : "ถึงปลายทางแล้ว", dist: null, dest: 0 }); speakNow(L === "en" ? "You have arrived" : "ถึงปลายทางแล้ว", L); }
        }, 650);
      });
    })();

    return () => { cancelled = true; if (ctx.current.timer) clearInterval(ctx.current.timer); try { window.speechSynthesis && window.speechSynthesis.cancel(); } catch (e) {} if (mapRef.current) mapRef.current.remove(); };
  }, []);

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 3000, background: "#000" }}>
      <div ref={elRef} style={{ position: "absolute", inset: 0 }} />
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, background: "linear-gradient(#1d6fb8,#1d6fb8ee)", color: "#fff", padding: "14px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 22, fontWeight: 800, lineHeight: 1.15 }}>{banner.instr}</div>
          <div style={{ fontSize: 14, opacity: 0.95 }}>{banner.dist != null ? `อีก ${banner.dist} ม. · ` : ""}เหลือถึงปลายทาง {banner.dest ?? "-"} ม.</div>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button onClick={() => { const v = ctx.current.lang === "en" ? "th" : "en"; ctx.current.lang = v; setLang(v); }} style={btn}>{lang === "en" ? "EN" : "ไทย"}</button>
          <button onClick={() => { ctx.current.voiceOn = !ctx.current.voiceOn; setVoice(ctx.current.voiceOn); if (!ctx.current.voiceOn) try { window.speechSynthesis.cancel(); } catch (e) {} }} style={{ ...btn, fontSize: 16 }}>{voice ? "🔊" : "🔇"}</button>
          <button onClick={onClose} style={btn}>ออก</button>
        </div>
      </div>
      <div style={{ position: "absolute", bottom: 16, left: "50%", transform: "translateX(-50%)", background: "rgba(0,0,0,.6)", color: "#fff", padding: "6px 14px", borderRadius: 20, fontSize: 12 }}>โหมดนำทาง 3D (จำลอง) · ตึกจาก OpenStreetMap</div>
    </div>
  );
}
const btn = { background: "rgba(255,255,255,.25)", border: "none", color: "#fff", borderRadius: 8, padding: "8px 12px", fontWeight: 700, cursor: "pointer" };
