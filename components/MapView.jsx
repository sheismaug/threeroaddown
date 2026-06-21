"use client";

import { useEffect, useRef, useState } from "react";
import Nav3D from "./Nav3D";

const CENTER = [13.7375, 100.5348];
const ZOOM = 15;
const DEMO_BBOX = [13.724, 100.527, 13.751, 100.542];
const W = { safe: 0.4, shade: 0.25, green: 0.2, toilet: 0.15 };
const OVERPASS_MIRRORS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"];
const CAT = {
  sidewalk: { color: "#e63946", label: "ทางเท้า" },
  road: { color: "#f4a261", label: "ถนน" },
  flood: { color: "#1d6fb8", label: "น้ำท่วม" },
  light: { color: "#3a0ca3", label: "จุดมืด/แสงสว่าง" },
  obstruct: { color: "#9d4edd", label: "กีดขวาง" },
  cctv_broken: { color: "#ff5da2", label: "กล้องเสีย (ร้องเรียน)" },
};
const catColor = (c) => (CAT[c]?.color || "#888");
// แปลงรหัสการเลี้ยวของ ORS เป็นภาษาไทย
const MAN = { 0: "เลี้ยวซ้าย", 1: "เลี้ยวขวา", 2: "เลี้ยวซ้ายหักศอก", 3: "เลี้ยวขวาหักศอก", 4: "เบี่ยงซ้าย", 5: "เบี่ยงขวา", 6: "ตรงไป", 7: "เข้าวงเวียน", 8: "ออกวงเวียน", 9: "กลับรถ", 10: "ถึงปลายทาง", 11: "เริ่มเดิน", 12: "ชิดซ้าย", 13: "ชิดขวา" };
const thaiInstr = (st) => (MAN[st.type] || "ไปต่อ") + (st.name ? ` เข้า ${st.name}` : "");
let _voices = [];
let _spRefs = [];   // เก็บ reference ของ utterance ไว้ กัน GC ตัดเสียงกลางประโยค ("พูดไม่จบ/เป็นคำๆ")
let _spLast = 0;    // เวลาเริ่มพูดล่าสุด ใช้ตรวจสถานะ "ค้าง"
let _spWatch = null;
function loadVoices() { try { _voices = (window.speechSynthesis && window.speechSynthesis.getVoices()) || []; } catch (e) {} }
function hasThaiVoice() { if (!_voices.length) loadVoices(); return _voices.some((v) => /^th/i.test(v.lang)); }
function pickVoice(lang) { if (!_voices.length) loadVoices(); const re = lang === "en" ? /^en/i : /^th/i; return _voices.find((v) => re.test(v.lang)) || null; }
function _spWatchdog() {
  if (_spWatch) return;
  _spWatch = setInterval(() => {
    try {
      const ss = window.speechSynthesis; if (!ss) return;
      if (ss.paused) ss.resume();                                   // กันบั๊ก Chrome หยุดพูดเองหลัง ~15 วิ
      if (ss.speaking && Date.now() - _spLast > 12000) ss.cancel(); // สถานะ speaking ค้าง -> รีเซ็ต
      if (!ss.speaking && !ss.pending) _spRefs = [];
    } catch (e) {}
  }, 3000);
}
// urgent=true -> ยกเลิกของเดิมแล้วพูดทันที, ไม่งั้น -> ข้ามถ้ากำลังพูดอยู่ (เว้นแต่ค้างนานเกินไป)
function speak(text, lang, opts) {
  try {
    const ss = window.speechSynthesis; if (!ss || !text) return;
    const urgent = !!(opts && opts.urgent);
    if (ss.paused) ss.resume();
    if (urgent) ss.cancel();
    else if (ss.speaking || ss.pending) { if (Date.now() - _spLast > 12000) ss.cancel(); else return; }
    const u = new SpeechSynthesisUtterance(text);
    const v = pickVoice(lang || "th"); if (v) u.voice = v;
    u.lang = lang === "en" ? "en-US" : "th-TH"; u.rate = 1;
    u.onend = u.onerror = () => { _spRefs = _spRefs.filter((x) => x !== u); };
    _spRefs.push(u); _spLast = Date.now(); _spWatchdog();
    ss.speak(u);
  } catch (e) {}
}
function speakNow(text, lang) { speak(text, lang, { urgent: true }); }
// ปลดล็อกเสียงบนมือถือ: ต้องเรียกตอนผู้ใช้แตะปุ่ม (user gesture) ไม่งั้น iOS/Android บล็อกเสียงทั้งหมด
function unlockSpeech() { try { if (!window.speechSynthesis) return; loadVoices(); const u = new SpeechSynthesisUtterance(" "); u.volume = 0.01; window.speechSynthesis.speak(u); _spWatchdog(); } catch (e) {} }
const TURN_EN = { "เลี้ยวซ้าย": "turn left", "เลี้ยวขวา": "turn right", "เบี่ยงซ้าย": "keep left", "เบี่ยงขวา": "keep right", "เลี้ยวซ้ายหักศอก": "sharp left turn", "เลี้ยวขวาหักศอก": "sharp right turn", "ตรงไป": "go straight", "กลับตัว": "make a U-turn" };
const ROAD_EN = {
  "อังรีดูนังต์": "Henri Dunant Road", "พระรามที่ 1": "Rama I Road", "พระราม 1": "Rama I Road",
  "พระรามที่ 4": "Rama IV Road", "พระราม 4": "Rama IV Road", "พระรามที่ 6": "Rama VI Road", "พระราม 6": "Rama VI Road",
  "พญาไท": "Phaya Thai Road", "ราชดำริ": "Ratchadamri Road", "เพชรบุรี": "Phetchaburi Road",
  "สุขุมวิท": "Sukhumvit Road", "สีลม": "Silom Road", "สาทร": "Sathon Road", "ศรีอยุธยา": "Si Ayutthaya Road",
  "ราชปรารภ": "Ratchaprarop Road", "เพลินจิต": "Phloen Chit Road", "วิทยุ": "Witthayu Road",
  "จุฬาลงกรณ์": "Chulalongkorn", "พระราม 3": "Rama III Road", "นราธิวาส": "Narathiwat Road",
};
function roadEN(th) { if (!th) return ""; if (ROAD_EN[th]) return ROAD_EN[th]; const k = Object.keys(ROAD_EN).find((x) => th.includes(x)); return k ? ROAD_EN[k] : ""; }

function loadLeaflet() {
  return new Promise((resolve, reject) => {
    if (window.L) return resolve(window.L);
    const s = document.createElement("script");
    s.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    s.crossOrigin = ""; s.onload = () => resolve(window.L); s.onerror = reject;
    document.body.appendChild(s);
  });
}
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
// ทิศเลี้ยว ณ จุด wp คำนวณจากมุมเปลี่ยนทิศของเส้นทาง (ซ้าย/ขวาจริงตามทิศเดิน)
function turnTH(coords, wp) {
  if (wp <= 0 || wp >= coords.length - 1) return null;
  const bIn = bearing(coords[wp - 1], coords[wp]);
  const bOut = bearing(coords[wp], coords[wp + 1]);
  const d = ((bOut - bIn + 540) % 360) - 180; // + = ขวา, - = ซ้าย
  const ad = Math.abs(d);
  if (ad < 18) return "ตรงไป";
  const side = d > 0 ? "ขวา" : "ซ้าย";
  if (ad > 150) return "เลี้ยว" + side + "หักศอก";
  if (ad > 55) return "เลี้ยว" + side;
  return "เบี่ยง" + side;
}
function walkFrom(coords, wp, dist, dir) {
  let i = wp, acc = 0;
  while (true) {
    const j = i + dir;
    if (j < 0 || j >= coords.length) return coords[i];
    acc += haversine(coords[i], coords[j]);
    i = j;
    if (acc >= dist) return coords[i];
  }
}
// ทิศเลี้ยวแบบมองช่วง ~18 ม. ก่อน/หลังจุดเลี้ยว (กันมุมสั่นจาก geometry ละเอียด)
function turnAt(coords, wp) {
  if (wp <= 0 || wp >= coords.length - 1) return null;
  const back = walkFrom(coords, wp, 18, -1);
  const fwd = walkFrom(coords, wp, 18, 1);
  const d = ((bearing(coords[wp], fwd) - bearing(back, coords[wp]) + 540) % 360) - 180;
  const ad = Math.abs(d);
  if (ad < 20) return "ตรงไป";
  const side = d > 0 ? "ขวา" : "ซ้าย";
  if (ad > 150) return "กลับตัว";
  if (ad > 115) return "เลี้ยว" + side + "หักศอก";
  if (ad > 50) return "เลี้ยว" + side;
  return "เบี่ยง" + side;
}
// ทิศเลี้ยวโดยอ้างอิง "ทิศที่ผู้ใช้กำลังมุ่งหน้าจริง" (จากตำแหน่ง -> จุดเลี้ยว) แม่นกว่า geometry ที่สั่น
function turnSide(coords, wp, fromPt) {
  if (wp <= 0 || wp >= coords.length - 1) return null;
  const after = walkFrom(coords, wp, 16, 1);
  const bOut = bearing(coords[wp], after);
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
function sampleLine(coords, stepM = 25) {
  const out = []; let carry = 0;
  for (let i = 0; i < coords.length - 1; i++) {
    const a = coords[i], b = coords[i + 1]; const segLen = haversine(a, b); if (segLen === 0) continue;
    let d = stepM - carry;
    while (d < segLen) { const t = d / segLen; out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); d += stepM; }
    carry = (carry + segLen) % stepM;
  }
  if (out.length === 0 && coords.length) out.push(coords[0]);
  return out;
}
function ratioNear(samples, pts, radiusM) {
  if (!pts || !pts.length) return null;
  let hit = 0; const degLat = radiusM / 111000;
  for (const s of samples) { const degLon = radiusM / (111000 * Math.cos((s[1] * Math.PI) / 180)); for (const p of pts) { if (Math.abs(p[1] - s[1]) > degLat || Math.abs(p[0] - s[0]) > degLon) continue; if (haversine(s, p) <= radiusM) { hit++; break; } } }
  return hit / samples.length;
}
function countNear(samples, pts, radiusM) {
  if (!pts || !pts.length) return 0;
  let count = 0; const degLat = radiusM / 111000;
  for (const p of pts) { const degLon = radiusM / (111000 * Math.cos((p[1] * Math.PI) / 180)); for (const s of samples) { if (Math.abs(p[1] - s[1]) > degLat || Math.abs(p[0] - s[0]) > degLon) continue; if (haversine(p, s) <= radiusM) { count++; break; } } }
  return count;
}
async function fetchOSM(bbox) {
  const cacheKey = "osm:" + bbox.map((x) => Math.round(x * 1000)).join(",");
  const b = bbox.join(",");
  // 1) ดึงผ่านเซิร์ฟเวอร์ (Vercel) — เสถียรกว่าดึง Overpass จากมือถือตรงๆ
  try {
    const res = await fetch("/api/osm?bbox=" + encodeURIComponent(b));
    if (res.ok) {
      const o = await res.json();
      if (o && o.ok) {
        try { localStorage.setItem(cacheKey, JSON.stringify({ trees: o.trees, buildings: o.buildings, toilets: o.toilets, green: o.green, cameras: o.cameras, crossings: o.crossings })); } catch (e) {}
        return { ...o, ok: true };
      }
    }
  } catch (e) {}
  // 2) สำรอง: ดึง Overpass ตรงจากเบราว์เซอร์
  const q = `[out:json][timeout:25];(node["natural"="tree"](${b});node["amenity"="toilets"](${b});way["leisure"="park"](${b});way["landuse"="grass"](${b});way["natural"="water"](${b});way["natural"="wood"](${b});node["man_made"="surveillance"](${b});node["highway"="crossing"](${b}););out center;`;
  for (const url of OVERPASS_MIRRORS) {
    const controller = new AbortController(); const t = setTimeout(() => controller.abort(), 25000);
    try {
      const res = await fetch(url, { method: "POST", body: "data=" + encodeURIComponent(q), headers: { "Content-Type": "application/x-www-form-urlencoded" }, signal: controller.signal });
      clearTimeout(t); if (!res.ok) continue;
      const json = await res.json();
      const trees = [], buildings = [], toilets = [], green = [], cameras = [], crossings = [];
      for (const el of json.elements || []) {
        const lat = el.lat ?? el.center?.lat, lon = el.lon ?? el.center?.lon; if (lat == null || lon == null) continue;
        const pt = [lon, lat], tg = el.tags || {};
        if (tg.highway === "crossing") crossings.push(pt);
        else if (tg.man_made === "surveillance") cameras.push(pt);
        else if (tg.natural === "tree") { trees.push(pt); green.push(pt); }
        else if (tg.amenity === "toilets") toilets.push({ pt, tags: tg });
        else if (tg.building) buildings.push(pt);
        else if (tg.leisure === "park" || tg.landuse === "grass" || tg.natural === "wood" || tg.natural === "water") green.push(pt);
      }
      const out = { trees, buildings, toilets, green, cameras, crossings, ok: true };
      try { if (toilets.length + trees.length + cameras.length + crossings.length > 0) localStorage.setItem(cacheKey, JSON.stringify({ trees, buildings, toilets, green, cameras, crossings })); } catch (e) {}
      return out;
    } catch (e) { clearTimeout(t); continue; }
  }
  try { const c = localStorage.getItem(cacheKey); if (c) { const o = JSON.parse(c); return { ...o, ok: true, cached: true }; } } catch (e) {}
  return { ok: false, trees: [], buildings: [], toilets: [], green: [], cameras: [], crossings: [] };
}
function timeWeights() {
  const h = new Date().getHours();
  const day = h >= 7 && h < 18;
  return day
    ? { safe: 0.35, shade: 0.30, green: 0.20, toilet: 0.15, night: false, mode: "กลางวัน ☀️ (ให้ความสำคัญกับร่มเงา)" }
    : { safe: 0.55, shade: 0.0, green: 0.10, toilet: 0.15, night: true, mode: "กลางคืน 🌙 (เน้นแสงสว่าง/หลีกจุดมืด แทนร่ม)" };
}
function scoreRoutes(routes, osm, problems) {
  const WT = timeWeights();
  const shadePts = osm.trees;
  const toiletPts = osm.toilets.map((t) => t.pt);
  const allHaz = problems.map((p) => p.pt);
  const floodPts = problems.filter((p) => p.cat === "flood").map((p) => p.pt);
  const darkPts = problems.filter((p) => p.cat === "light").map((p) => p.pt);
  const floodRiskPts = problems.filter((p) => p.cat === "flood_risk").map((p) => p.pt);
  return routes.map((r) => {
    const samples = sampleLine(r.coordinates, 25);
    const hazards = countNear(samples, allHaz, 30);
    const cams = countNear(samples, osm.cameras, 40);
    const floodN = countNear(samples, floodPts, 30);
    const darkN = countNear(samples, darkPts, 30);
    const floodRiskN = countNear(samples, floodRiskPts, 45);
    const shadeR = ratioNear(samples, shadePts, 25);
    const greenR = ratioNear(samples, osm.green, 40);
    const toiletsN = countNear(samples, toiletPts, 150);
    const hazAdj = hazards + (WT.night ? darkN * 1.5 : 0); // กลางคืน จุดมืดอันตรายกว่า
    const safe = Math.max(0, Math.min(100, Math.round(100 * Math.exp(-hazAdj / 12)) + Math.min(15, cams * 3)));
    const shade = shadeR == null ? null : Math.round(shadeR * 100);
    const green = greenR == null ? null : Math.round(greenR * 100);
    const toilet = osm.ok ? Math.min(100, toiletsN * 34) : null;
    let num = 0, den = 0; const add = (v, w) => { if (v != null) { num += v * w; den += w; } };
    add(safe, WT.safe); add(shade, WT.shade); add(green, WT.green); add(toilet, WT.toilet);
    const comfort = den ? Math.round(num / den) : null;
    // รายชื่อห้องน้ำใกล้เส้นทาง (ชื่อ + ระยะจากต้นทาง) — ส่งให้ผู้ช่วย AI ตอบได้ว่าห้องน้ำอยู่ตรงไหนจริง ไม่ใช่เดาเอง
    const rcum = [0]; for (let i = 1; i < r.coordinates.length; i++) rcum[i] = rcum[i - 1] + haversine(r.coordinates[i - 1], r.coordinates[i]);
    const stepRoad = (ix) => { for (const st of (r.steps || [])) { if (ix >= st.wpStart && ix <= st.wpEnd && st.name) return st.name; } return ""; };
    const toiletList = [];
    for (const t of (osm.toilets || [])) {
      let bi = 0, bd = Infinity;
      for (let i = 0; i < r.coordinates.length; i++) { const dd = haversine(t.pt, r.coordinates[i]); if (dd < bd) { bd = dd; bi = i; } }
      if (bd <= 120) toiletList.push({ name: (t.tags && (t.tags.name || t.tags["name:th"])) || "ห้องน้ำสาธารณะ", along: Math.round(rcum[bi]), off: Math.round(bd), road: stepRoad(bi), pt: t.pt });
    }
    toiletList.sort((a, b) => a.along - b.along);
    // จุดกล้อง CCTV ใกล้เส้นทาง (≤50 ม.) — ใช้โชว์หมุดในโหมดนำทาง 3D
    const cameraList = [];
    for (const cpt of (osm.cameras || [])) {
      let cbd = Infinity;
      for (let i = 0; i < r.coordinates.length; i++) { const dd = haversine(cpt, r.coordinates[i]); if (dd < cbd) cbd = dd; }
      if (cbd <= 50) cameraList.push(cpt);
    }
    return { ...r, hazards, cameras: cams, floodN, darkN, floodRiskN, safe, shade, green, toilet, toiletsNear: toiletsN, comfort, timeMode: WT.mode, night: WT.night, toiletList: toiletList.slice(0, 8), cameraList: cameraList.slice(0, 20) };
  });
}
function comfortColor(v) { if (v == null) return "#888"; if (v >= 70) return "#2a9d54"; if (v >= 45) return "#e9a23b"; return "#c1121f"; }
function popupHtml(p) {
  const photo = p.photo ? `<img src="${p.photo}" alt="" style="width:100%;max-width:240px;border-radius:8px;margin-top:6px"/>` : "";
  const date = (p.timestamp || "").slice(0, 16); const lbl = CAT[p.cat]?.label || p.type || "ปัญหา";
  return `<div style="max-width:240px;font-family:system-ui"><div style="font-weight:700;color:${catColor(p.cat)}">${lbl}</div><div style="font-size:13px;margin:4px 0;white-space:pre-wrap">${(p.comment || "").slice(0, 240)}</div><div style="font-size:12px;color:#555">สถานะ: <b>${p.state || "-"}</b></div><div style="font-size:11px;color:#888">${date}</div>${photo}</div>`;
}
// พจนานุกรมสถานที่สำคัญย่านปทุมวัน (พิกัดจริงโดยประมาณ) — ใช้ก่อนถาม Nominatim เพื่อความแม่นยำ/กันชื่อกำกวม
const LANDMARKS = [
  { aliases: ["สนามกีฬาแห่งชาติ", "สนามกีฬา", "national stadium", "สนามศุภ", "ศุภชลาศัย"], coord: [100.5294, 13.7466], name: "สนามกีฬาแห่งชาติ" },
  { aliases: ["สยามพารากอน", "พารากอน", "paragon"], coord: [100.5347, 13.7462], name: "สยามพารากอน" },
  { aliases: ["สยามสแควร์", "สยาม", "siam"], coord: [100.5331, 13.7456], name: "สยาม (BTS)" },
  { aliases: ["มาบุญครอง", "mbk", "เอ็มบีเค"], coord: [100.5300, 13.7445], name: "MBK / มาบุญครอง" },
  { aliases: ["โรงพยาบาลจุฬา", "รพ.จุฬา", "รพจุฬา", "chula hospital"], coord: [100.5356, 13.7314], name: "รพ.จุฬาฯ", query: "โรงพยาบาลจุฬาลงกรณ์ ปทุมวัน กรุงเทพ" },
  { aliases: ["จุฬาลงกรณ์มหาวิทยาลัย", "จุฬาลงกรณ์", "จุฬา", "chulalongkorn", "chula"], coord: [100.5318, 13.7378], name: "จุฬาลงกรณ์มหาวิทยาลัย" },
  { aliases: ["สามย่านมิตรทาวน์", "สามย่าน", "samyan"], coord: [100.5283, 13.7320], name: "สามย่าน" },
  { aliases: ["จามจุรีสแควร์", "จามจุรี", "chamchuri"], coord: [100.5295, 13.7335], name: "จามจุรีสแควร์" },
  { aliases: ["เซ็นทรัลเวิลด์", "centralworld", "central world"], coord: [100.5396, 13.7466], name: "เซ็นทรัลเวิลด์" },
  { aliases: ["ราชประสงค์", "ratchaprasong"], coord: [100.5400, 13.7445], name: "ราชประสงค์" },
  { aliases: ["ราชเทวี", "ratchathewi"], coord: [100.5320, 13.7585], name: "ราชเทวี" },
  { aliases: ["สีลม", "silom"], coord: [100.5340, 13.7248], name: "สีลม" },
  { aliases: ["หัวลำโพง", "hua lamphong", "hualamphong"], coord: [100.5170, 13.7373], name: "หัวลำโพง" },
  { aliases: ["ปทุมวัน", "pathumwan", "pathum wan"], coord: [100.5320, 13.7440], name: "ปทุมวัน" },
];
// แก้พิกัดแลนด์มาร์กให้ "ทนทาน": ถ้า lm มี query เฉพาะ -> ถาม OSM (Nominatim) เอาพิกัดจริง
// แต่ยอมรับเฉพาะเมื่ออยู่ใกล้พิกัด curated (<1.5 กม.) กัน Nominatim คืนที่ผิด/กำกวม
// ถ้าออฟไลน์/หาไม่เจอ -> ใช้พิกัด curated เป็น fallback · ผลลัพธ์ cache ใน localStorage
async function resolveLandmark(lm) {
  if (!lm.query) return { coord: lm.coord, name: lm.name, landmark: true };
  const key = "lmpos:" + lm.name;
  try { const cc = localStorage.getItem(key); if (cc) { const o = JSON.parse(cc); if (o && o.coord) return { coord: o.coord, name: lm.name, landmark: true }; } } catch (e) {}
  try {
    const g = await geocodeNominatim(lm.query);
    if (g && g.coord && haversine(g.coord, lm.coord) < 1500) {
      try { localStorage.setItem(key, JSON.stringify({ coord: g.coord })); } catch (e) {}
      return { coord: g.coord, name: lm.name, landmark: true };
    }
  } catch (e) {}
  return { coord: lm.coord, name: lm.name, landmark: true };
}
async function resolvePlace(q) {
  if (!q) return null;
  const s = q.trim().toLowerCase();
  if (s.length < 2) return null;
  for (const lm of LANDMARKS) {
    for (const a of lm.aliases) {
      const al = a.toLowerCase();
      if (s.includes(al) || (al.length >= 3 && al.includes(s))) return await resolveLandmark(lm);
    }
  }
  return null;
}
async function geocodeNominatim(q) {
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&accept-language=th&countrycodes=th&viewbox=100.45,13.95,100.75,13.55&bounded=1&q=${encodeURIComponent(q)}`;
    const r = await fetch(url, { headers: { Accept: "application/json" } }); if (!r.ok) return null;
    const j = await r.json(); if (!j.length) return null;
    return { coord: [parseFloat(j[0].lon), parseFloat(j[0].lat)], name: (j[0].display_name || q).split(",")[0] };
  } catch (e) { return null; }
}

function pointAtDistance(coords, cum, d) {
  if (d <= 0) return coords[0];
  const last = cum.length - 1;
  if (d >= cum[last]) return coords[last];
  let k = 0; while (k < last && cum[k + 1] < d) k++;
  const seg = (cum[k + 1] - cum[k]) || 1; const t = (d - cum[k]) / seg;
  return [coords[k][0] + (coords[k + 1][0] - coords[k][0]) * t, coords[k][1] + (coords[k + 1][1] - coords[k][1]) * t];
}

let _gcChain = Promise.resolve();
function queuedGeocode(query) {
  const key = "fg:" + query;
  try { const c = localStorage.getItem(key); if (c) return Promise.resolve(JSON.parse(c)); } catch (e) {}
  const run = async () => {
    await new Promise((r) => setTimeout(r, 1100)); // เคารพ rate limit Nominatim
    const g = await geocodeNominatim(query);
    try { if (g) localStorage.setItem(key, JSON.stringify(g)); } catch (e) {}
    return g;
  };
  const pr = _gcChain.then(run, run);
  _gcChain = pr.catch(() => {});
  return pr;
}
// reverse geocode: พิกัด -> ชื่อถนน/ตึก/ย่าน (ใช้บอกว่าห้องน้ำ "อยู่ตึกไหน ถนนอะไร")
async function reverseGeocode(lonlat) {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&accept-language=th&zoom=18&lon=${lonlat[0]}&lat=${lonlat[1]}`;
    const r = await fetch(url, { headers: { Accept: "application/json" } });
    if (!r.ok) return null;
    const j = await r.json();
    const a = j.address || {};
    const road = a.road || a.pedestrian || a.footway || a.path || "";
    const place = a.building || a.amenity || a.shop || a.mall || a.office || a.tourism || a.neighbourhood || a.suburb || "";
    return { road, place };
  } catch (e) { return null; }
}
// ต่อคิวเดียวกับ geocode (เคารพ rate limit Nominatim 1 req/วิ) + cache ลง localStorage
function queuedReverse(lonlat) {
  const key = "rev:" + lonlat.map((x) => x.toFixed(5)).join(",");
  try { const c = localStorage.getItem(key); if (c) return Promise.resolve(JSON.parse(c)); } catch (e) {}
  const run = async () => {
    await new Promise((r) => setTimeout(r, 1100));
    const g = await reverseGeocode(lonlat);
    try { if (g) localStorage.setItem(key, JSON.stringify(g)); } catch (e) {}
    return g;
  };
  const pr = _gcChain.then(run, run);
  _gcChain = pr.catch(() => {});
  return pr;
}

// แนะนำสถานที่แบบสด: รวมแลนด์มาร์กในเครื่อง + ค้นจาก OSM (Nominatim) ตามที่พิมพ์
async function suggestPlaces(q) {
  const s = (q || "").trim().toLowerCase();
  const out = [];
  for (const lm of LANDMARKS) {
    if (lm.aliases.some((a) => { const al = a.toLowerCase(); return al.includes(s) || s.includes(al); })) {
      if (!out.some((o) => o.name === lm.name)) out.push({ name: lm.name, coord: lm.coord, src: "landmark", lm });
    }
  }
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=6&accept-language=th&countrycodes=th&viewbox=100.45,13.95,100.75,13.55&bounded=1&q=${encodeURIComponent(q)}`;
    const r = await fetch(url, { headers: { Accept: "application/json" } });
    if (r.ok) {
      const j = await r.json();
      for (const it of j) {
        const name = (it.display_name || "").split(",").slice(0, 2).join(", ").trim();
        if (name && !out.some((o) => o.name === name)) out.push({ name, coord: [parseFloat(it.lon), parseFloat(it.lat)], src: "osm" });
      }
    }
  } catch (e) {}
  return out.slice(0, 8);
}
function PlaceInput({ value, onChange, onPick, onEnter, placeholder }) {
  const [sugs, setSugs] = useState([]);
  const [open, setOpen] = useState(false);
  const tRef = useRef(null);
  function handle(v) {
    onChange(v);
    const ss = (v || "").trim().toLowerCase();
    if (tRef.current) clearTimeout(tRef.current);
    if (!v || ss.length < 2) { setSugs([]); setOpen(false); return; }
    // โชว์สถานที่ยอดนิยมในเครื่องทันที (ไม่รอเน็ต) แล้วค่อยเติมผลจาก OSM
    const local = LANDMARKS.filter((lm) => lm.aliases.some((a) => { const al = a.toLowerCase(); return al.includes(ss) || ss.includes(al); })).map((lm) => ({ name: lm.name, coord: lm.coord, src: "landmark", lm }));
    if (local.length) { setSugs(local); setOpen(true); }
    tRef.current = setTimeout(async () => { const r = await suggestPlaces(v); if (r.length) { setSugs(r); setOpen(true); } }, 250);
  }
  const istyle = { width: "100%", boxSizing: "border-box", padding: "9px 11px", borderRadius: 9, border: "1px solid #ccc", fontSize: 14, outline: "none" };
  return (
    <div style={{ position: "relative" }}>
      <input value={value} onChange={(e) => handle(e.target.value)} onFocus={() => { if (sugs.length) setOpen(true); }} onBlur={() => setTimeout(() => setOpen(false), 160)}
        onKeyDown={(e) => { if (e.key === "Enter") { setOpen(false); onEnter && onEnter(); } }} placeholder={placeholder} style={istyle} />
      {open ? (
        <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: "#fff", border: "1px solid #ddd", borderRadius: 9, boxShadow: "0 4px 14px rgba(0,0,0,.18)", zIndex: 1400, maxHeight: 240, overflowY: "auto", marginTop: 2 }}>
          {sugs.map((sg, i) => (
            <div key={i} onMouseDown={() => { onPick(sg); setOpen(false); }}
              style={{ padding: "9px 11px", fontSize: 14, cursor: "pointer", borderBottom: "1px solid #f0f0f0", display: "flex", justifyContent: "space-between", gap: 8 }}>
              <span>{sg.name}</span><span style={{ fontSize: 11, color: "#aaa" }}>{sg.src === "landmark" ? "⭐ ที่นิยม" : "OSM"}</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
export default function MapView({ apiRef }) {
  const mapEl = useRef(null);
  const mapRef = useRef(null);
  const ctx = useRef({ L: null, routeLayer: null, problems: [], osmPromise: null, select: () => {}, scored: null, voiceOn: true, voiceLang: "th", crossings: [], placeCache: {} });
  const [info, setInfo] = useState({ count: 0, source: "", loading: true });
  const [toilets, setToilets] = useState(null);
  const [cams, setCams] = useState(null);
  const [routeData, setRouteData] = useState(null);
  const [active, setActive] = useState(null);
  const [nav, setNav] = useState(null);
  const [voice, setVoice] = useState(true);
  const [voiceLang, setVoiceLang] = useState("th");
  const [nav3d, setNav3D] = useState(null);
  const [legendOpen, setLegendOpen] = useState(false);
  const [sFrom, setSFrom] = useState("");
  const [sTo, setSTo] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = await loadLeaflet();
      if (cancelled || mapRef.current) return;
      ctx.current.L = L;
      loadVoices();
      try { if (window.speechSynthesis) window.speechSynthesis.onvoiceschanged = () => { loadVoices(); if (!hasThaiVoice()) { ctx.current.voiceLang = "en"; setVoiceLang("en"); } }; } catch (e) {}
      setTimeout(() => { if (!hasThaiVoice()) { ctx.current.voiceLang = "en"; setVoiceLang("en"); } }, 800);
      const map = L.map(mapEl.current).setView(CENTER, ZOOM);
      mapRef.current = map;
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap" }).addTo(map);
      const problemsLayer = L.layerGroup().addTo(map);
      const toiletsLayer = L.layerGroup().addTo(map);
      const cctvLayer = L.layerGroup().addTo(map);
      const floodRiskLayer = L.layerGroup().addTo(map);
      const routeLayer = L.layerGroup().addTo(map);
      ctx.current.routeLayer = routeLayer;
      L.control.layers(null, { "เส้นทางเดิน": routeLayer, "จุดร้องเรียน (Traffy)": problemsLayer, "เสี่ยงน้ำท่วม กทม.": floodRiskLayer, "ห้องน้ำ (OSM)": toiletsLayer, "กล้อง CCTV (OSM)": cctvLayer }, { collapsed: true }).addTo(map);
      const toiletIcon = L.divIcon({ className: "", html: '<div style="font-size:12px;line-height:18px;background:#2a9d8f;color:white;border-radius:50%;width:18px;height:18px;text-align:center;font-weight:700">W</div>', iconSize: [18, 18], iconAnchor: [9, 9] });
      const camIcon = L.divIcon({ className: "", html: '<div style="font-size:11px;line-height:18px;background:#1b998b;color:white;border-radius:3px;width:18px;height:18px;text-align:center;font-weight:700">C</div>', iconSize: [18, 18], iconAnchor: [9, 9] });
      // วาดหมุดห้องน้ำ/กล้องแบบกันซ้ำ — ใช้ทั้งตอนโหลดย่าน demo และตอนค้นเส้นทางที่ออกนอกย่าน
      // เพื่อให้ "หมุด W บนแผนที่" ตรงกับ "ห้องน้ำที่ AI ตอบ" (ก่อนหน้านี้คนละชุดข้อมูลเลยไม่สัมพันธ์กัน)
      ctx.current.toiletSeen = new Set(); ctx.current.camSeen = new Set();
      ctx.current.addOsmMarkers = (osm) => {
        if (!osm) return;
        for (const t of (osm.toilets || [])) { const [lon, lat] = t.pt; const k = lon.toFixed(5) + "," + lat.toFixed(5); if (ctx.current.toiletSeen.has(k)) continue; ctx.current.toiletSeen.add(k); const name = t.tags?.name || t.tags?.["name:th"] || "ห้องน้ำสาธารณะ"; L.marker([lat, lon], { icon: toiletIcon }).bindPopup(`<b>ห้องน้ำ: ${name}</b>`).addTo(toiletsLayer); }
        for (const cpt of (osm.cameras || [])) { const [lon, lat] = cpt; const k = lon.toFixed(5) + "," + lat.toFixed(5); if (ctx.current.camSeen.has(k)) continue; ctx.current.camSeen.add(k); L.marker([lat, lon], { icon: camIcon }).bindPopup("กล้อง CCTV (OSM)").addTo(cctvLayer); }
        setToilets(ctx.current.toiletSeen.size); setCams(ctx.current.camSeen.size);
      };

      try {
        const res = await fetch("/api/traffy"); const data = await res.json();
        for (const f of data.geojson.features) {
          const [lon, lat] = f.geometry.coordinates; const c = f.properties.cat;
          ctx.current.problems.push({ pt: [lon, lat], cat: c });
          L.circleMarker([lat, lon], { radius: 6, color: catColor(c), fillColor: catColor(c), fillOpacity: 0.8, weight: 1 }).bindPopup(popupHtml(f.properties)).addTo(problemsLayer);
        }
        if (!cancelled) setInfo({ count: data.geojson.features.length, source: data.source, loading: false });
      } catch (e) { if (!cancelled) setInfo({ count: 0, source: "error", loading: false }); }

      ctx.current.osmPromise = fetchOSM(DEMO_BBOX).then((osm) => {
        if (cancelled) return osm;
        ctx.current.addOsmMarkers(osm); ctx.current.crossings = osm.crossings || [];
        return osm;
      });

      // จุดเสี่ยงน้ำท่วม กทม. (สนน. 2566) — geocode ฝั่งเบราว์เซอร์ + cache
      (async () => {
        try {
          const res = await fetch("/api/floodrisk");
          const data = await res.json();
          const fIcon = L.divIcon({ className: "", html: '<div style="width:15px;height:15px;background:#0077b6;border:2px solid #fff;transform:rotate(45deg);box-shadow:0 0 3px rgba(0,0,0,.5)"></div>', iconSize: [15, 15], iconAnchor: [8, 8] });
          for (const row of data.rows || []) {
            const g = await queuedGeocode(row.query);
            if (cancelled) return;
            if (!g || !g.coord) continue;
            const [lon, lat] = g.coord;
            ctx.current.problems.push({ pt: [lon, lat], cat: "flood_risk" });
            L.marker([lat, lon], { icon: fIcon }).bindPopup('<b>จุดเสี่ยงน้ำท่วม (กทม.)</b><br/>' + row.area + '<br/><span style="font-size:11px;color:#888">' + row.district + ' · สนน. ปี 2566</span>').addTo(floodRiskLayer);
          }
        } catch (e) {}
      })();
    })();
    return () => { cancelled = true; if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; } };
  }, []);

  useEffect(() => {
    if (!apiRef) return;
    apiRef.current = {
      showRoutes: async (from, to) => {
        const c = ctx.current, L = c.L; if (!L) return null;
        const key = `${from || ""}|${to || ""}`;
        if (c.routeKey === key && c.scored) { c.select(c.best); return c.scored; }
        c.routeLayer.clearLayers(); setRouteData({ loading: true });
        let sName = "สยาม (BTS)", eName = "รพ.จุฬาฯ", sCoord = null, eCoord = null, note = null;
        const resolve = async (x) => { if (!x) return null; const pc = c.placeCache && c.placeCache[x]; if (pc) return pc; return (await resolvePlace(x)) || (await geocodeNominatim(x)); };
        const [gFrom, gTo] = await Promise.all([resolve(from), resolve(to)]);
        if (from) { if (gFrom) { sCoord = gFrom.coord; sName = gFrom.name; } else note = `หา "${from}" ไม่เจอ (ใช้สยามแทน) — ลองพิมพ์ชื่อให้ชัดขึ้น เช่น สนามกีฬาแห่งชาติ`; }
        if (to) { if (gTo) { eCoord = gTo.coord; eName = gTo.name; } else note = (note ? note + " · " : "") + `หา "${to}" ไม่เจอ (ใช้ รพ.จุฬาฯ แทน)`; }
        let data;
        try {
          const qs = new URLSearchParams();
          if (sCoord) { qs.set("slon", sCoord[0]); qs.set("slat", sCoord[1]); }
          if (eCoord) { qs.set("elon", eCoord[0]); qs.set("elat", eCoord[1]); }
          const res = await fetch("/api/route?" + qs.toString()); data = await res.json();
          if (data.error) { setRouteData({ error: data.error }); return null; }
        } catch (e) { setRouteData({ error: String(e) }); return null; }
        const { routes, start, end } = data;
        if (!routes.length || routes[0].distance_m < 30) { setRouteData({ error: "หาเส้นทางไม่ได้ ลองระบุชื่อสถานที่ให้ชัดขึ้น" }); return null; }
        const sIcon = (txt, bg) => L.divIcon({ className: "", html: `<div style="background:${bg};color:white;border-radius:50%;width:22px;height:22px;line-height:22px;text-align:center;font-weight:700;font-size:12px">${txt}</div>`, iconSize: [22, 22], iconAnchor: [11, 11] });
        L.marker([start[1], start[0]], { icon: sIcon("S", "#2a9d54") }).bindPopup("จุดเริ่ม: " + sName).addTo(c.routeLayer);
        L.marker([end[1], end[0]], { icon: sIcon("E", "#c1121f") }).bindPopup("ปลายทาง: " + eName).addTo(c.routeLayer);
        const polylines = routes.map((r) => L.polyline(r.coordinates.map(([lon, lat]) => [lat, lon]), { color: "#888", weight: 4, opacity: 0.6, dashArray: "6 6" }).addTo(c.routeLayer));
        c.select = (i) => { polylines.forEach((pl, j) => { if (j === i) pl.setStyle({ color: "#2a9d54", weight: 6, opacity: 1, dashArray: null }).bringToFront(); else pl.setStyle({ color: "#888", weight: 4, opacity: 0.5, dashArray: "6 6" }); }); setActive(i); };
        let lons = [], lats = []; routes.forEach((r) => r.coordinates.forEach(([lo, la]) => { lons.push(lo); lats.push(la); }));
        const within = Math.min(...lats) >= DEMO_BBOX[0] && Math.min(...lons) >= DEMO_BBOX[1] && Math.max(...lats) <= DEMO_BBOX[2] && Math.max(...lons) <= DEMO_BBOX[3];
        const mg = 0.004;
        // คะแนนเร็ว: ความปลอดภัยจาก Traffy (โหลดไว้แล้ว) โชว์ทันที ไม่ต้องรอ OSM
        const quick = scoreRoutes(routes, { ok: false, trees: [], green: [], toilets: [], cameras: [] }, c.problems);
        const bestQ = quick.reduce((bi, r, i, a) => ((r.comfort ?? -1) > (a[bi].comfort ?? -1) ? i : bi), 0);
        c.select(bestQ);
        if (mapRef.current) mapRef.current.fitBounds(polylines[bestQ].getBounds().pad(0.15));
        c.routeKey = key; c.best = bestQ; c.scored = quick.map((r, i) => ({ ...r, recommended: i === bestQ }));
        setRouteData({ routes: quick, best: bestQ, osmOk: false, startName: sName, endName: eName, note, scoring: true });
        // เติมคะแนนร่ม/สวน/ห้องน้ำจาก OSM ทีหลัง (ไม่บล็อกการตอบ)
        const lo0 = Math.min(...lons), la0 = Math.min(...lats), lo1 = Math.max(...lons), la1 = Math.max(...lats);
        (async () => {
          const osm = within ? await c.osmPromise : await fetchOSM([la0 - mg, lo0 - mg, la1 + mg, lo1 + mg]);
          if (c.routeKey !== key) return;
          if (osm.crossings && osm.crossings.length) c.crossings = osm.crossings;
          if (c.addOsmMarkers) c.addOsmMarkers(osm); // วาดหมุดห้องน้ำ/กล้องของย่านเส้นทางนี้ ให้ตรงกับที่ AI ตอบ
          const full = scoreRoutes(routes, osm, c.problems);
          const best = full.reduce((bi, r, i, a) => ((r.comfort ?? -1) > (a[bi].comfort ?? -1) ? i : bi), 0);
          c.best = best; c.scored = full.map((r, i) => ({ ...r, recommended: i === best }));
          c.select(best);
          setRouteData({ routes: full, best, osmOk: osm.ok, startName: sName, endName: eName, note });
          // เติมชื่อตึก/ย่านของห้องน้ำด้วย reverse geocode (เบื้องหลัง + cache) เพื่อให้ AI บอกได้ว่า "อยู่ตึกไหน"
          (async () => {
            const seen = {};
            for (const r of full) {
              for (const t of (r.toiletList || [])) {
                if (!t.pt) continue;
                const kk = t.pt.map((x) => x.toFixed(5)).join(",");
                if (!(kk in seen)) seen[kk] = await queuedReverse(t.pt);
                if (c.routeKey !== key) return;
                const g = seen[kk];
                if (g) { if (g.place) t.place = g.place; if (!t.road && g.road) t.road = g.road; }
              }
            }
            c.scored = full.map((r, i) => ({ ...r, recommended: i === best }));
          })();
        })();
        return c.scored;
      },
      getRoutes: () => ctx.current.scored,
    };
  }, [apiRef]);

  // ---------- โหมดนำทาง GPS ----------
  function updateNav(u) {
    const c = ctx.current, n = c.nav; if (!n) return;
    const lang = c.voiceLang || "th";
    c.userMarker?.setLatLng([u[1], u[0]]);
    if (c.prevPos && c.userMarker && c.L && haversine(c.prevPos, u) > 1.5) {
      const hd = bearing(c.prevPos, u);
      c.userMarker.setIcon(c.L.divIcon({ className: "", html: `<div style="width:24px;height:24px;line-height:24px;text-align:center;font-size:22px;color:#1d6fb8;transform:rotate(${hd}deg)">\u25B2</div>`, iconSize: [24, 24], iconAnchor: [12, 12] }));
    }
    c.prevPos = u;
    if (mapRef.current) mapRef.current.setView([u[1], u[0]], Math.max(mapRef.current.getZoom(), 17), { animate: true });
    let idx = 0, bd = Infinity;
    for (let i = 0; i < n.coords.length; i++) { const d = haversine(u, n.coords[i]); if (d < bd) { bd = d; idx = i; } }
    const distDest = Math.max(0, Math.round(n.cum[n.cum.length - 1] - n.cum[idx]));
    let k = n.steps.findIndex((st) => idx <= st.wpEnd); if (k < 0) k = n.steps.length - 1;
    let mWp = null, mTurn = null, mName = "";
    for (let j = k + 1; j < n.steps.length; j++) {
      const wp = n.steps[j].wpStart;
      const tt = turnAt(n.coords, wp);
      if (tt && tt !== "ตรงไป") { mWp = wp; mName = n.steps[j].name || ""; const ts = turnSide(n.coords, wp, u); mTurn = (ts && ts !== "ตรงไป") ? ts : tt; break; }
    }
    const distTurn = mWp != null ? Math.max(0, Math.round(n.cum[mWp] - n.cum[idx])) : distDest;
    const nameEN = roadEN(mName);
    const instr = lang === "en"
      ? (TURN_EN[mTurn] || "continue to the destination") + (nameEN ? " onto " + nameEN : "")
      : (mTurn || "ตรงไปยังปลายทาง") + (mName ? ` เข้า ${mName}` : "");
    let crossAhead = null, cbest = Infinity;
    for (const cp of c.crossings || []) {
      if (haversine(u, cp) > 60) continue;
      let ci = 0, cb = Infinity; for (let i = 0; i < n.coords.length; i++) { const dd = haversine(cp, n.coords[i]); if (dd < cb) { cb = dd; ci = i; } }
      if (cb > 10 || ci < idx) continue; // ต้องอยู่บนเส้นทางจริง (≤10 ม.) ไม่ใช่ทางข้ามของซอยข้างๆ
      // เตือน "ข้ามถนน" เฉพาะเมื่อมีจุดเลี้ยวจริงของเส้นทางอยู่ใกล้หมุดทางข้าม (±25 ม.) — กันเตือนผิดตอนเดินตรงยาว
      let nearTurn = false;
      for (const st of n.steps) {
        const wp = st.wpStart;
        if (wp <= 0 || wp >= n.coords.length - 1) continue;
        if (Math.abs(n.cum[wp] - n.cum[ci]) > 25) continue;
        const tt = turnAt(n.coords, wp);
        if (tt && tt !== "ตรงไป") { nearTurn = true; break; }
      }
      if (!nearTurn) continue;
      const al = Math.round(n.cum[ci] - n.cum[idx]);
      if (al >= 0 && al < cbest) { cbest = al; crossAhead = { dist: al, id: cp.join(",") }; }
    }
    let hazard = null, hbest = Infinity, hid = null;
    for (const p of c.problems) {
      if (haversine(u, p.pt) > 80) continue;
      let pidx = 0, pbd = Infinity; for (let i = 0; i < n.coords.length; i++) { const dd = haversine(p.pt, n.coords[i]); if (dd < pbd) { pbd = dd; pidx = i; } }
      if (pbd > 28 || pidx < idx - 4) continue;
      const along = Math.round(n.cum[pidx] - n.cum[idx]);
      if (along > 90) continue;
      const near = Math.abs(along);
      if (near < hbest) { hbest = near; hazard = { label: CAT[p.cat]?.label || "จุดเสี่ยง", dist: Math.max(0, along) }; hid = p.pt.join(","); }
    }
    const arrived = distDest < 20;
    setNav({ active: true, instr, distTurn, distDest, hazard, arrived, cross: crossAhead });
    if (c.voiceOn) {
      const rnd = (m) => Math.max(10, Math.round(m / 10) * 10);
      const en = lang === "en";
      if (crossAhead && crossAhead.dist <= 35 && c.spokenCross && !c.spokenCross.has(crossAhead.id)) {
        c.spokenCross.add(crossAhead.id);
        speakNow(en ? "Prepare to cross the road, watch for traffic" : "เตรียมข้ามถนน ระวังรถ", lang);
      } else if (mWp != null && distTurn <= 55 && !c.spokenTurns.has(mWp)) {
        c.spokenTurns.add(mWp);
        const m = rnd(distTurn);
        if (distTurn <= 12) speakNow(instr, lang);
        else speakNow(en ? `In ${m} meters, ${TURN_EN[mTurn] || "continue"}${nameEN ? " onto " + nameEN : ""}` : `ในอีก ${m} เมตร ${instr}`, lang);
      }
      if ((mWp == null || distTurn > 90) && distDest > 40 && !c.straightSpoken) { c.straightSpoken = true; speakNow(en ? "Continue straight" : "เดินตรงไป", lang); }
      if (mWp != null && distTurn < 60) c.straightSpoken = false;
      if (hazard && hazard.dist < 50 && !c.spokenHaz.has(hid)) { c.spokenHaz.add(hid); speak(en ? "Caution, obstacle ahead" : `ระวัง ${hazard.label} ข้างหน้า`, lang); }
      if (arrived && !c.spokenArrived) { c.spokenArrived = true; speak(en ? "You have arrived" : "ถึงปลายทางแล้ว", lang); }
    }
  }
  function onPos(pos) { updateNav([pos.coords.longitude, pos.coords.latitude]); }
  function onErr() { setNav((p) => ({ ...(p || { active: true }), instr: "เปิด GPS ไม่สำเร็จ — อนุญาตตำแหน่ง แล้วเปิดเว็บแบบ HTTPS บนมือถือ", distTurn: null, distDest: null, hazard: null })); }
  function startNav(i) {
    const c = ctx.current, L = c.L; const r = c.scored?.[i]; if (!r || !L) return;
    const coords = r.coordinates; const cum = [0];
    for (let k = 1; k < coords.length; k++) cum[k] = cum[k - 1] + haversine(coords[k - 1], coords[k]);
    c.nav = { coords, cum, steps: r.steps || [] };
    c.spokenTurns = new Set(); c.spokenHaz = new Set(); c.spokenCross = new Set(); c.spokenArrived = false; c.prevPos = null; c.straightSpoken = false;
    if (!c.userMarker) c.userMarker = L.marker([coords[0][1], coords[0][0]], { icon: L.divIcon({ className: "", html: '<div style="width:18px;height:18px;border-radius:50%;background:#1d6fb8;border:3px solid #fff;box-shadow:0 0 6px rgba(0,0,0,.6)"></div>', iconSize: [18, 18], iconAnchor: [9, 9] }) }).addTo(mapRef.current);
    setNav({ active: true, instr: "กำลังหาตำแหน่ง…", distTurn: null, distDest: Math.round(cum[cum.length - 1]), hazard: null, arrived: false });
    if (!navigator.geolocation) { onErr(); return; }
    c.navWatch = navigator.geolocation.watchPosition(onPos, onErr, { enableHighAccuracy: true, maximumAge: 1000, timeout: 15000 });
  }
  function startSim(i) {
    const c = ctx.current, L = c.L; const r = c.scored?.[i]; if (!r || !L) return;
    if (c.simTimer) { clearInterval(c.simTimer); c.simTimer = null; }
    const coords = r.coordinates; const cum = [0];
    for (let k = 1; k < coords.length; k++) cum[k] = cum[k - 1] + haversine(coords[k - 1], coords[k]);
    c.nav = { coords, cum, steps: r.steps || [] };
    c.spokenTurns = new Set(); c.spokenHaz = new Set(); c.spokenCross = new Set(); c.spokenArrived = false; c.prevPos = null; c.straightSpoken = false;
    if (!c.userMarker) c.userMarker = L.marker([coords[0][1], coords[0][0]], { icon: L.divIcon({ className: "", html: '<div style="width:18px;height:18px;border-radius:50%;background:#1d6fb8;border:3px solid #fff;box-shadow:0 0 6px rgba(0,0,0,.6)"></div>', iconSize: [18, 18], iconAnchor: [9, 9] }) }).addTo(mapRef.current);
    setNav({ active: true, instr: "เริ่มเดิน (โหมดจำลอง)", distTurn: null, distDest: Math.round(cum[cum.length - 1]), hazard: null, arrived: false });
    let d = 0; const total = cum[cum.length - 1];
    c.simTimer = setInterval(() => {
      d += 7; if (d > total) d = total;
      updateNav(pointAtDistance(coords, cum, d));
      if (d >= total) { clearInterval(c.simTimer); c.simTimer = null; }
    }, 650);
  }
  function stopNav() {
    const c = ctx.current;
    if (c.navWatch != null) { navigator.geolocation.clearWatch(c.navWatch); c.navWatch = null; }
    if (c.simTimer) { clearInterval(c.simTimer); c.simTimer = null; }
    if (c.userMarker && mapRef.current) { mapRef.current.removeLayer(c.userMarker); c.userMarker = null; }
    c.nav = null; setNav(null);
  }

  function toggleVoice() { const c = ctx.current; c.voiceOn = !c.voiceOn; setVoice(c.voiceOn); if (!c.voiceOn && window.speechSynthesis) window.speechSynthesis.cancel(); }
  function toggleVoiceLang() { const c = ctx.current; c.voiceLang = c.voiceLang === "en" ? "th" : "en"; setVoiceLang(c.voiceLang); }
  function doSearch() { const f = sFrom.trim(), t = sTo.trim(); try { apiRef?.current?.showRoutes?.(f || null, t || null); } catch (e) {} }

  const navTarget = active ?? (routeData && !routeData.error && !routeData.loading ? routeData.best : null);

  return (
    <div style={{ position: "relative", height: "100vh", width: "100%" }}>
      <style>{`
        .wb-card{position:absolute;background:#fff;border-radius:10px;box-shadow:0 2px 8px rgba(0,0,0,.2);font-family:system-ui;z-index:1000;}
        .wb-info{top:12px;left:12px;max-width:280px;padding:10px 14px;}
        .wb-route{top:12px;right:12px;width:300px;padding:10px 14px;z-index:1300;max-height:calc(100vh - 24px);overflow:auto;}
        body.wb-chatopen .wb-route{max-height:calc(100vh - 500px);}
        .wb-legend{bottom:16px;left:12px;padding:8px 12px;font-size:12px;column-count:2;column-gap:14px;}
        .wb-nav{top:0;left:0;right:0;border-radius:0;background:#1d6fb8;color:#fff;padding:12px 16px;z-index:1600;}
        .wb-startbtn{display:block;width:100%;margin-top:8px;padding:10px;border:none;border-radius:8px;background:#1d6fb8;color:#fff;font-weight:800;font-size:15px;cursor:pointer;}
        .wb-legendtoggle{display:none;position:absolute;bottom:16px;left:12px;z-index:1100;background:#fff;border:1px solid #ddd;border-radius:20px;box-shadow:0 2px 8px rgba(0,0,0,.2);padding:7px 12px;font-size:13px;font-weight:700;cursor:pointer;}
        .wb-search{top:12px;left:50%;transform:translateX(-50%);width:340px;padding:10px 12px;z-index:1250;}
        @media (max-width:640px){
          .wb-info{display:none;}
          .wb-search{left:8px;right:8px;width:auto;transform:none;top:8px;padding:8px 9px;}
          .wb-route{width:auto;left:8px;right:8px;top:172px;bottom:auto;max-height:52vh;overflow:auto;z-index:1300;}
          body.wb-chatopen .wb-route{display:none;}
          .wb-legend{display:none;bottom:58px;left:8px;font-size:11px;column-count:2;column-gap:10px;padding:8px 10px;max-width:82vw;z-index:1150;}
          .wb-legend.open{display:block;}
          .wb-legendtoggle{display:block;}
        }
      `}</style>

      <div ref={mapEl} style={{ height: "100%", width: "100%" }} />

      {nav?.active ? (
        <div className="wb-card wb-nav">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
            <div style={{ flex: 1 }}>
              {nav.arrived ? (
                <div style={{ fontSize: 20, fontWeight: 800 }}>🎉 ถึงปลายทางแล้ว</div>
              ) : (
                <>
                  <div style={{ fontSize: 20, fontWeight: 800, lineHeight: 1.2 }}>{nav.instr}</div>
                  {nav.distTurn != null ? <div style={{ fontSize: 14, opacity: 0.9 }}>อีก {nav.distTurn} ม. · เหลือถึงปลายทาง {nav.distDest} ม.</div> : <div style={{ fontSize: 13, opacity: 0.9 }}>{nav.distDest != null ? `เหลือ ${nav.distDest} ม.` : ""}</div>}
                </>
              )}
              {nav.cross ? <div style={{ marginTop: 6, background: "#e9a23b", borderRadius: 6, padding: "5px 8px", fontWeight: 700, fontSize: 14 }}>🚸 เตรียมข้ามถนน อีก ~{nav.cross.dist} ม.</div> : null}
              {nav.hazard ? <div style={{ marginTop: 6, background: "#c1121f", borderRadius: 6, padding: "5px 8px", fontWeight: 700, fontSize: 14 }}>⚠️ ระวัง {nav.hazard.label} อีก ~{nav.hazard.dist} ม.</div> : null}
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button onClick={toggleVoiceLang} style={{ background: "rgba(255,255,255,.25)", border: "none", color: "#fff", borderRadius: 8, padding: "8px 10px", fontWeight: 700, cursor: "pointer", fontSize: 13 }}>{voiceLang === "en" ? "EN" : "ไทย"}</button>
              <button onClick={toggleVoice} style={{ background: "rgba(255,255,255,.25)", border: "none", color: "#fff", borderRadius: 8, padding: "8px 11px", fontWeight: 700, cursor: "pointer", fontSize: 16 }}>{voice ? "🔊" : "🔇"}</button>
              <button onClick={stopNav} style={{ background: "rgba(255,255,255,.25)", border: "none", color: "#fff", borderRadius: 8, padding: "8px 12px", fontWeight: 700, cursor: "pointer" }}>หยุด</button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="wb-card wb-info">
        <div style={{ fontWeight: 800, fontSize: 16 }}>เดินกรุงเทพ — ปทุมวัน</div>
        <div style={{ fontSize: 13, color: "#444", marginTop: 4 }}>จุดร้องเรียนที่<b>ยังไม่แก้</b> (ทางเท้า/น้ำท่วม/แสงสว่าง/กล้อง)</div>
        <div style={{ fontSize: 13, marginTop: 6 }}>{info.loading ? "กำลังโหลด…" : `${info.count} จุด · Traffy ${info.source === "live" ? "(สด)" : "(cache)"}`}</div>
        {toilets != null ? <div style={{ fontSize: 13, color: "#444" }}>ห้องน้ำ {toilets} · กล้อง CCTV {cams ?? 0} (OSM)</div> : null}
      </div>

      {!nav?.active ? (
      <div className="wb-card wb-search">
        <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 6 }}>🔍 ค้นหาเส้นทางเดิน</div>
        <PlaceInput value={sFrom} onChange={setSFrom} onEnter={doSearch} onPick={async (sg) => { let coord = sg.coord; if (sg.src === "landmark" && sg.lm) { try { const r = await resolveLandmark(sg.lm); if (r?.coord) coord = r.coord; } catch (e) {} } setSFrom(sg.name); ctx.current.placeCache[sg.name] = { coord, name: sg.name }; }} placeholder="จาก (เช่น สนามกีฬาแห่งชาติ)" />
        <div style={{ height: 6 }} />
        <PlaceInput value={sTo} onChange={setSTo} onEnter={doSearch} onPick={async (sg) => { let coord = sg.coord; if (sg.src === "landmark" && sg.lm) { try { const r = await resolveLandmark(sg.lm); if (r?.coord) coord = r.coord; } catch (e) {} } setSTo(sg.name); ctx.current.placeCache[sg.name] = { coord, name: sg.name }; }} placeholder="ไป (เช่น รพ.จุฬาฯ)" />
        <button onClick={doSearch} style={{ width: "100%", marginTop: 8, padding: "9px", border: "none", borderRadius: 9, background: "#2a9d54", color: "#fff", fontWeight: 800, fontSize: 15, cursor: "pointer" }}>ค้นหาเส้นทาง</button>
      </div>
      ) : null}

      {routeData && !nav?.active ? (
        <div className="wb-card wb-route">
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 6 }}>{routeData.loading ? "กำลังหาเส้นทาง…" : `เส้นทางเดิน ${routeData.startName || "สยาม"} → ${routeData.endName || "จุฬาฯ"}`}</div>
          {routeData.loading ? <div style={{ fontSize: 13, color: "#888" }}>กำลังคำนวณเส้นทาง…</div> : routeData.error ? <div style={{ fontSize: 12, color: "#c1121f" }}>ใช้ไม่ได้: {routeData.error}</div> : (
            <div>
              {navTarget != null ? (
                <div style={{ marginBottom: 8 }}>
                  <button className="wb-startbtn" style={{ background: "#6a4c93" }} onClick={() => { unlockSpeech(); const r = ctx.current.scored?.[navTarget]; if (r) setNav3D({ route: r, problems: ctx.current.problems, destName: routeData?.endName || "ปลายทาง" }); }}>🧭 นำทาง 3D (จำลอง)</button>
                  <button className="wb-startbtn" style={{ marginTop: 6 }} onClick={() => { unlockSpeech(); startSim(navTarget); }}>🧪 ทดลองเดิน 2D</button>
                  <button className="wb-startbtn" style={{ background: "#1d6fb8", marginTop: 6 }} onClick={() => { unlockSpeech(); startNav(navTarget); }}>▶ นำทางจริง (GPS)</button>
                </div>
              ) : null}
              {routeData.routes.map((r) => (
                <button key={r.index} onClick={() => ctx.current.select(r.index)}
                  style={{ display: "block", width: "100%", textAlign: "left", cursor: "pointer", margin: "5px 0", padding: "8px 10px", borderRadius: 8, fontSize: 13, border: active === r.index ? "2px solid #2a9d54" : "1px solid #ddd", background: active === r.index ? "#eaf7ee" : "white" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <b>เส้น {r.index + 1}{r.index === routeData.best ? " · ✓ แนะนำ" : ""}</b>
                    {r.comfort != null ? <span style={{ fontWeight: 800, fontSize: 18, color: comfortColor(r.comfort) }}>{r.comfort}</span> : null}
                  </div>
                  <div style={{ color: "#555" }}>{(r.distance_m / 1000).toFixed(2)} กม. · {r.duration_min} นาที</div>
                  <div style={{ fontSize: 12, color: "#666", marginTop: 2 }}>ปลอดภัย {r.safe}{r.shade != null ? ` · ร่ม ${r.shade}` : ""}{r.green != null ? ` · สวน ${r.green}` : ""}{r.toiletsNear != null ? ` · ห้องน้ำ ${r.toiletsNear}` : ""}</div>
                  {r.floodRiskN > 0 ? <div style={{ fontSize: 11, color: "#0077b6", fontWeight: 700 }}>เสี่ยงน้ำท่วม {r.floodRiskN} จุด (กทม.)</div> : null}
                </button>
              ))}
              {routeData.note ? <div style={{ fontSize: 11, color: "#b5651d", marginTop: 4 }}>{routeData.note}</div> : null}
              {routeData.routes[0]?.timeMode ? <div style={{ fontSize: 11, color: "#555", marginTop: 4 }}>โหมดเวลา: {routeData.routes[0].timeMode}</div> : null}
              {routeData.scoring ? <div style={{ fontSize: 11, color: "#888" }}>กำลังเติมคะแนนร่ม/สวน/ห้องน้ำ…</div> : null}
            </div>
          )}
        </div>
      ) : null}

      {!nav?.active ? <button className="wb-legendtoggle" onClick={() => setLegendOpen((v) => !v)}>{legendOpen ? "✕ ปิดสัญลักษณ์" : "🎨 สัญลักษณ์"}</button> : null}
      <div className={"wb-card wb-legend" + (legendOpen ? " open" : "")}>
        {Object.values(CAT).map((c) => <Legend key={c.label} color={c.color} label={c.label} />)}
        <Legend color="#2a9d8f" label="ห้องน้ำ (W)" />
        <Legend color="#1b998b" label="กล้อง CCTV (C)" />
        <Legend color="#0077b6" label="เสี่ยงน้ำท่วม (กทม.)" />
        <Legend color="#2a9d54" label="เส้นแนะนำ" />
      </div>
      {nav3d ? <Nav3D route={nav3d.route} problems={nav3d.problems} destName={nav3d.destName} onClose={() => setNav3D(null)} /> : null}
    </div>
  );
}

function Legend({ color, label }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, margin: "2px 0", breakInside: "avoid" }}>
      <span style={{ width: 12, height: 12, borderRadius: "50%", background: color, display: "inline-block" }} />
      <span>{label}</span>
    </div>
  );
}
