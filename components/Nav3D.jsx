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
// ทิศเลี้ยวจากรูปทรงถนนจริง (มองช่วง ~18 ม. ก่อน/หลังจุดเลี้ยว) — ไม่อิงตำแหน่งผู้ใช้ จึงไม่เพี้ยนเวลาจุดเลี้ยวอยู่ไกล
function turnAt(coords, wp) {
  if (wp <= 0 || wp >= coords.length - 1) return null;
  const back = walkFrom(coords, wp, 18, -1);
  const fwd = walkFrom(coords, wp, 18, 1);
  const d = ((bearing(coords[wp], fwd) - bearing(back, coords[wp]) + 540) % 360) - 180;
  const ad = Math.abs(d);
  if (ad < 22) return "ตรงไป";
  const side = d > 0 ? "ขวา" : "ซ้าย";
  if (ad > 150) return "กลับตัว";
  if (ad > 115) return "เลี้ยว" + side + "หักศอก";
  if (ad > 50) return "เลี้ยว" + side;
  return "เบี่ยง" + side;
}
const TURN_EN = { "เลี้ยวซ้าย": "turn left", "เลี้ยวขวา": "turn right", "เบี่ยงซ้าย": "keep left", "เบี่ยงขวา": "keep right", "เลี้ยวซ้ายหักศอก": "sharp left", "เลี้ยวขวาหักศอก": "sharp right", "ตรงไป": "go straight", "กลับตัว": "U-turn" };
const ROAD_EN = {
  "อังรีดูนังต์": "Henri Dunant Road", "พระรามที่ 1": "Rama I Road", "พระราม 1": "Rama I Road",
  "พระรามที่ 4": "Rama IV Road", "พระราม 4": "Rama IV Road", "สี่พระยา": "Si Phraya Road",
  "พระรามที่ 6": "Rama VI Road", "พระราม 6": "Rama VI Road",
  "พญาไท": "Phaya Thai Road", "ราชดำริ": "Ratchadamri Road", "เพชรบุรี": "Phetchaburi Road",
  "สุรวงศ์": "Surawong Road", "สีลม": "Silom Road", "สาทร": "Sathon Road", "ศรีอยุธยา": "Si Ayutthaya Road",
  "ราชปรารภ": "Ratchaprarop Road", "เพลินจิต": "Phloen Chit Road", "วิทยุ": "Witthayu Road",
  "จุฬาลงกรณ์": "Chulalongkorn", "บรรทัดทอง": "Banthat Thong Road", "พญาไท": "Phaya Thai Road",
};
function roadEN(th) { if (!th) return ""; if (ROAD_EN[th]) return ROAD_EN[th]; const k = Object.keys(ROAD_EN).find((x) => th.includes(x)); return k ? ROAD_EN[k] : ""; }
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
let _vRefs = [];   // เก็บ reference utterance กัน GC ตัดเสียงกลางประโยค
let _vLast = 0;    // เวลาเริ่มพูดล่าสุด ใช้ตรวจสถานะค้าง
let _vWatch = null;
function _vWatchdog() {
  if (_vWatch) return;
  _vWatch = setInterval(() => {
    try {
      const ss = window.speechSynthesis; if (!ss) return;
      if (ss.paused) ss.resume();                                  // กันบั๊ก Chrome หยุดพูดเองหลัง ~15 วิ
      if (ss.speaking && Date.now() - _vLast > 12000) ss.cancel(); // สถานะค้าง -> รีเซ็ต (กัน 3D เงียบสนิท)
      if (!ss.speaking && !ss.pending) _vRefs = [];
    } catch (e) {}
  }, 3000);
}
function say(t, l, urgent) {
  try {
    const ss = window.speechSynthesis; if (!ss || !t) return;
    if (ss.paused) ss.resume();
    if (urgent) ss.cancel();
    else if (ss.speaking || ss.pending) { if (Date.now() - _vLast > 12000) ss.cancel(); else return; }
    if (!_v.length) _v = ss.getVoices() || [];
    const u = new SpeechSynthesisUtterance(t);
    const vo = _v.find((x) => (l === "en" ? /^en/i : /^th/i).test(x.lang)); if (vo) u.voice = vo;
    u.lang = l === "en" ? "en-US" : "th-TH";
    u.onend = u.onerror = () => { _vRefs = _vRefs.filter((x) => x !== u); };
    _vRefs.push(u); _vLast = Date.now(); _vWatchdog();
    ss.speak(u);
  } catch (e) {}
}

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
    try { if (window.speechSynthesis) { _v = window.speechSynthesis.getVoices() || []; window.speechSynthesis.onvoiceschanged = () => { _v = window.speechSynthesis.getVoices() || []; }; } } catch (e) {}
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
        center: coords[0], zoom: 17.5, pitch: 0, bearing: 0, maxPitch: 0, attributionControl: false,
      });
      mapRef.current = map;

      map.on("load", () => {
        if (cancelled) return;
        // แผนที่ 2D แบน — ไม่ใส่ตึก 3D เพื่อให้เห็นป้ายชื่อสถานที่ชัด
        map.addSource("route", { type: "geojson", data: { type: "Feature", geometry: { type: "LineString", coordinates: coords } } });
        map.addLayer({ id: "route-casing", type: "line", source: "route", paint: { "line-color": "#ffffff", "line-width": 12, "line-opacity": 0.9 }, layout: { "line-cap": "round", "line-join": "round" } });
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
        pe.innerHTML = '<div style="width:0;height:0;border-left:11px solid transparent;border-right:11px solid transparent;border-bottom:26px solid #1d6fb8;filter:drop-shadow(0 1px 3px rgba(0,0,0,.6))"></div>';
        ctx.current.marker = new maplibregl.Marker({ element: pe, rotationAlignment: "map" }).setLngLat(coords[0]).addTo(map);

        say(ctx.current.lang === "en" ? "Starting navigation" : "เริ่มนำทาง", ctx.current.lang, true);

        let d = 0;
        ctx.current.timer = setInterval(() => {
          if (cancelled) return;
          d += 4; if (d > total) d = total;
          let k = 0; while (k < cum.length - 1 && cum[k + 1] < d) k++;
          const seg = (cum[k + 1] - cum[k]) || 1, t = Math.min(1, (d - cum[k]) / seg);
          const nx = coords[k + 1] || coords[k];
          const u = [coords[k][0] + (nx[0] - coords[k][0]) * t, coords[k][1] + (nx[1] - coords[k][1]) * t];
          const hd = ctx.current.prev ? bearing(ctx.current.prev, u) : 0;
          ctx.current.prev = u;
          ctx.current.marker.setLngLat(u);
          if (ctx.current.marker.setRotation) ctx.current.marker.setRotation(hd);
          map.easeTo({ center: u, bearing: hd, pitch: 0, zoom: 17.5, duration: 640, offset: [0, 90], essential: true });

          const L = ctx.current.lang;
          const idx = k;
          // หา "จุดเลี้ยวจริง" ถัดไป (ข้ามการเบี่ยงเล็กน้อย/keep left ที่ไม่ใช่เลี้ยว) โดยคิดจากรูปถนน
          let mWp = null, mName = "", mTurn = null;
          let ks = steps.findIndex((st) => idx <= st.wpEnd); if (ks < 0) ks = steps.length - 1;
          for (let j = ks + 1; j < steps.length; j++) {
            const wp = steps[j].wpStart;
            const tt = turnAt(coords, wp);
            if (tt && tt !== "ตรงไป" && tt.indexOf("เบี่ยง") !== 0) { mWp = wp; mName = steps[j].name || ""; mTurn = tt; break; }
          }
          const distTurn = mWp != null ? Math.max(0, Math.round(cum[mWp] - d)) : null;
          const destLeft = Math.max(0, Math.round(total - d));
          // แสดงคำสั่งเลี้ยวเฉพาะเมื่อใกล้พอ (≤300 ม.) ไกลกว่านั้นบอก "เดินตรงไป"
          const showTurn = mWp != null && distTurn != null && distTurn <= 300;
          const nameEN = roadEN(mName);
          const turnTHv = showTurn ? mTurn : null;
          const instr = !showTurn
            ? (L === "en" ? "Continue straight" : "เดินตรงไป")
            : (L === "en" ? (TURN_EN[turnTHv] || "turn") + (nameEN ? " onto " + nameEN : "") : turnTHv + (mName ? ` เข้า ${mName}` : ""));
          setBanner({ instr, dist: showTurn ? distTurn : null, dest: destLeft });

          let alert = null, ab = Infinity;
          for (const p of hazNear) { const a = Math.round(p.ralong - d); if (a >= 3 && a <= 60 && a < ab) { ab = a; alert = { ...hz(p.cat), dist: a, id: p.pt.join(",") }; } }
          setHazAlert(alert);

          if (ctx.current.voiceOn) {
            if (alert && alert.dist <= 35 && !ctx.current.spoken.has("h" + alert.id)) {
              ctx.current.spoken.add("h" + alert.id);
              say(L === "en" ? `Caution, ${alert.en} ahead` : `ระวัง ${alert.label} ข้างหน้า`, L, false);
            } else if (showTurn && distTurn <= 55 && !ctx.current.spoken.has(mWp)) {
              ctx.current.spoken.add(mWp);
              const mm = Math.max(10, Math.round(distTurn / 10) * 10);
              say(L === "en" ? `In ${mm} meters, ${TURN_EN[turnTHv] || "turn"}${nameEN ? " onto " + nameEN : ""}` : `ในอีก ${mm} เมตร ${turnTHv}${mName ? ` เข้า ${mName}` : ""}`, L, true);
            } else if (!showTurn && destLeft > 60 && d - ctx.current.straightD > 250) {
              ctx.current.straightD = d;
              say(L === "en" ? "Continue straight" : "เดินตรงไป", L, false);
            }
          }

          if (d >= total) {
            clearInterval(ctx.current.timer); ctx.current.timer = null;
            setArrived(true); setBanner({ instr: L === "en" ? "You have arrived" : "ถึงปลายทางแล้ว", dist: null, dest: 0 });
            say(L === "en" ? `You have arrived at ${destName || "your destination"}` : `ถึง${destName || "ปลายทาง"}แล้ว`, L, true);
          }
        }, 700);
      });
    })();

    return () => { cancelled = true; if (ctx.current.timer) clearInterval(ctx.current.timer); try { window.speechSynthesis && window.speechSynthesis.cancel(); } catch (e) {} if (mapRef.current) mapRef.current.remove(); };
  }, []);

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 3000, background: "#eaf0f6" }}>
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

      <div style={{ position: "absolute", bottom: 14, left: "50%", transform: "translateX(-50%)", background: "rgba(0,0,0,.55)", color: "#fff", padding: "6px 14px", borderRadius: 20, fontSize: 12 }}>โหมดนำทาง (จำลอง) · แผนที่จาก OpenStreetMap</div>
    </div>
  );
}
const btn = { background: "rgba(255,255,255,.25)", border: "none", color: "#fff", borderRadius: 8, padding: "8px 12px", fontWeight: 700, cursor: "pointer" };
