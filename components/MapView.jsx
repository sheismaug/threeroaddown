"use client";

import { useEffect, useRef, useState } from "react";
import Nav3D from "./Nav3D";
import { speak, speakNow, unlockSpeech, loadVoices, hasThaiVoice } from "./speech";

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
// ระบบเสียง (speak/speakNow/unlockSpeech/loadVoices/hasThaiVoice) ย้ายไป ./speech แล้ว ใช้ร่วมกับ Nav3D
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
// คะแนน "สว่าง" แบบดูความหนาแน่นไฟ (ไม่ใช่แค่ % จุดที่ใกล้ไฟ ≥1 ต้น) — เฉลี่ยต่อจุด: ไฟ ≥target ต้นใน radius = เต็ม 1.0
// ทำให้ "ทางสว่างที่สุด" = ทางที่ไฟหนาแน่นจริง (ซอยไฟเยอะชนะถนนที่ลิตพอแต่ไฟบาง)
function lampDensityScore(samples, grid, radius = 35, target = 3) {
  if (!grid || !grid.size || !samples.length) return null;
  let s = 0;
  for (const p of samples) s += Math.min(1, lampCountNearGrid(grid, p, radius) / target);
  return s / samples.length;
}
// ── เฟส "ร่มสมจริง": ตำแหน่งดวงอาทิตย์ + ฝั่งเงา ──────────────────────────────
// คืน { azimuth: องศาเข็มทิศจากเหนือ-ตามเข็ม (ทิศที่ดวงอาทิตย์อยู่), elevation: องศาเหนือขอบฟ้า }
// อัลกอริทึมแบบ SunCalc (ไม่พึ่ง lib ภายนอก → ไม่ต้อง npm install / ตั้ง env เพิ่ม)
function sunPosition(date, lat, lon) {
  const rad = Math.PI / 180, dayMs = 86400000, J1970 = 2440588, J2000 = 2451545;
  const d = date.valueOf() / dayMs - 0.5 + J1970 - J2000; // วันนับจาก J2000
  const M = rad * (357.5291 + 0.98560028 * d);            // mean anomaly
  const C = rad * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M));
  const L = M + C + rad * 102.9372 + Math.PI;             // ecliptic longitude
  const e = rad * 23.4397;                                // obliquity
  const dec = Math.asin(Math.sin(L) * Math.sin(e));
  const ra = Math.atan2(Math.sin(L) * Math.cos(e), Math.cos(L));
  const phi = rad * lat, lw = rad * -lon;
  const H = rad * (280.16 + 360.9856235 * d) - lw - ra;   // hour angle
  const alt = Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H));
  const az = Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(phi) - Math.tan(dec) * Math.cos(phi)); // 0=ใต้
  let deg = ((az + Math.PI) * 180) / Math.PI % 360; if (deg < 0) deg += 360;
  return { azimuth: deg, elevation: (alt * 180) / Math.PI };
}
// ระยะจากจุด p ถึงเส้นตรง a-b (เมตร, ประมาณด้วย equirectangular ในระยะสั้น)
function pointToSegM(p, a, b) {
  const latR = (p[1] * Math.PI) / 180, kx = 111320 * Math.cos(latR), ky = 110540;
  const px = p[0] * kx, py = p[1] * ky, ax = a[0] * kx, ay = a[1] * ky, bx = b[0] * kx, by = b[1] * ky;
  const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy;
  let t = L2 ? ((px - ax) * dx + (py - ay) * dy) / L2 : 0; t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx, cy = ay + t * dy;
  return Math.hypot(px - cx, py - cy);
}
function nearPolyline(p, line, radiusM) {
  for (let i = 0; i < line.length - 1; i++) if (pointToSegM(p, line[i], line[i + 1]) <= radiusM) return true;
  return false;
}
// หา "จุดบนเส้นทางที่ใกล้ p ที่สุดจริงๆ" (ฉายตั้งฉากลง segment ไม่ใช่แค่จุดหักมุม)
// คืน { off: ระยะตั้งฉากถึงเส้น (ม.), along: ระยะสะสมจากต้นทางถึงจุดฉาย (ม.), seg: index ของ segment }
function nearestOnRoute(pt, coords, rcum) {
  let best = { off: Infinity, along: 0, seg: 0 };
  const latR = (pt[1] * Math.PI) / 180, kx = 111320 * Math.cos(latR), ky = 110540;
  const px = pt[0] * kx, py = pt[1] * ky;
  for (let i = 0; i < coords.length - 1; i++) {
    const a = coords[i], b = coords[i + 1];
    const ax = a[0] * kx, ay = a[1] * ky, bx = b[0] * kx, by = b[1] * ky;
    const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy;
    let t = L2 ? ((px - ax) * dx + (py - ay) * dy) / L2 : 0; t = Math.max(0, Math.min(1, t));
    const cx = ax + t * dx, cy = ay + t * dy;
    const off = Math.hypot(px - cx, py - cy);
    if (off < best.off) best = { off, along: rcum[i] + t * (rcum[i + 1] - rcum[i]), seg: i };
  }
  return best;
}
// อยู่ใต้ทางมีหลังคา/skywalk ไหม → ถือว่าร่ม 100%
function underCovered(p, coveredWays, radiusM) {
  if (!coveredWays) return false;
  for (const line of coveredWays) if (line.length >= 2 && nearPolyline(p, line, radiusM)) return true;
  return false;
}
// ผลต่างมุมเชิงมุม (0..180)
function angDiff(a, b) { let d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; }
// มีต้นไม้/แนวต้นไม้อยู่ "ฝั่งที่บังแดด" (ระหว่างจุดกับดวงอาทิตย์) ไหม
// sunAz = ทิศที่ดวงอาทิตย์อยู่ · วัตถุจะบังแดดเมื่ออยู่ในทิศเข้าหาดวงอาทิตย์ (cone ±60° — เผื่อความกว้างพุ่มไม้/การเดินเซ, แต่ตัดต้นไม้ที่อยู่ตั้งฉากออก)
const SHADE_CONE = 60;
function shadedBySun(p, trees, treeRows, radiusM, sunAz, lowSun) {
  const degLat = radiusM / 111000, degLon = radiusM / (111000 * Math.cos((p[1] * Math.PI) / 180));
  for (const t of (trees || [])) {
    if (Math.abs(t[1] - p[1]) > degLat || Math.abs(t[0] - p[0]) > degLon) continue;
    if (haversine(p, t) > radiusM) continue;
    if (lowSun || angDiff(bearing(p, t), sunAz) <= SHADE_CONE) return true; // กลางคืน/ดวงอาทิตย์ต่ำ: นับใกล้พอ
  }
  for (const line of (treeRows || [])) {
    if (line.length >= 2 && nearPolyline(p, line, radiusM)) {
      if (lowSun) return true;
      // เช็คฝั่ง: ใช้จุดบนแนวที่ใกล้สุดเป็นตัวแทนทิศ
      let bj = line[0], bd = Infinity;
      for (const q of line) { const dd = haversine(p, q); if (dd < bd) { bd = dd; bj = q; } }
      if (angDiff(bearing(p, bj), sunAz) <= SHADE_CONE) return true;
    }
  }
  return false;
}
// ── เงาตึกจริงจากความสูงดาวเทียม (ย้ายวิธีคิดมาจาก shade_demo_3d.html) ──
const M_LAT_D = 110540, M_LON_D = 111320 * Math.cos((13.7449 * Math.PI) / 180);
// เวกเตอร์เงา "ต่อความสูง 1 เมตร" (องศา lon/lat) — null ถ้าดวงอาทิตย์ต่ำ/กลางคืน
function shadowPerM(sun) {
  if (!sun || sun.elevation <= 3) return null;
  // cap เงายาวสุด 5 เท่าความสูงตึก — เช้าตรู่/เย็นมากๆ เงาทางทฤษฎียาวหลายร้อยเมตร ทำให้แผนที่ร่มเป็นแถบมั่วและเส้นแกว่ง
  const k = Math.min(5, 1 / Math.tan((sun.elevation * Math.PI) / 180));
  const dir = ((sun.azimuth + 180) * Math.PI) / 180; // เงาทอดตรงข้ามดวงอาทิตย์
  return { dLon: (Math.sin(dir) * k) / M_LON_D, dLat: (Math.cos(dir) * k) / M_LAT_D };
}
function pip(x, y, r) { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const xi = r[i][0], yi = r[i][1], xj = r[j][0], yj = r[j][1]; if (((yi > y) !== (yj > y)) && (x < ((xj - xi) * (y - yi)) / (yj - yi) + xi)) c = !c; } return c; }
// เตรียม bbox เงาต่อตึก (เร็วพอสำหรับเช็คทุกจุดตัวอย่าง)
function shadowPrep(per, bldgs) {
  if (!per || !bldgs || !bldgs.length) return null;
  return bldgs.map((b) => {
    const dx = per.dLon * b.h, dy = per.dLat * b.h;
    let minx = 1e9, miny = 1e9, maxx = -1e9, maxy = -1e9;
    for (const p of b.ring) { if (p[0] < minx) minx = p[0]; if (p[0] > maxx) maxx = p[0]; if (p[1] < miny) miny = p[1]; if (p[1] > maxy) maxy = p[1]; }
    return { ring: b.ring, dx, dy, minx: Math.min(minx, minx + dx), maxx: Math.max(maxx, maxx + dx), miny: Math.min(miny, miny + dy), maxy: Math.max(maxy, maxy + dy) };
  });
}
// จุดนี้อยู่ในเงาตึก (หรือในตัวตึก = เดินทะลุห้าง) ไหม — Minkowski sum แบบสุ่มช่วง t
// skipInterior = ใช้ตอน routing: ไม่นับ "ในตัวตึก" ว่าร่ม (กันเส้นถูกดูดมุดเข้าตึก — เดินทะลุห้างมีเฉพาะเส้น Skywalk ที่วาดแนวจริงไว้)
// step 0.1 (เดิม 0.2) — เงายาวตอนแดดต่ำเคยมี "รูโหว่" ระหว่างจุด sample ทำให้ตรวจร่มติดๆ ดับๆ เส้นเลยแกว่ง
function ptShaded(x, y, prep, skipInterior) {
  if (!prep) return false;
  for (const s of prep) {
    if (x < s.minx || x > s.maxx || y < s.miny || y > s.maxy) continue;
    for (let t = skipInterior ? 0.15 : 0; t <= 1.0001; t += 0.1) { if (pip(x - s.dx * t, y - s.dy * t, s.ring)) return true; }
  }
  return false;
}
// ดัชนี footprint ตึก (bbox precheck) — เช็ค "จุดอยู่ในตัวตึกไหม" เร็วพอเรียกใน Dijkstra ทุก edge
function buildingIndex(bldgs) {
  if (!bldgs || !bldgs.length) return null;
  return bldgs.map((b) => {
    let minx = 1e9, miny = 1e9, maxx = -1e9, maxy = -1e9;
    for (const p of b.ring) { if (p[0] < minx) minx = p[0]; if (p[0] > maxx) maxx = p[0]; if (p[1] < miny) miny = p[1]; if (p[1] > maxy) maxy = p[1]; }
    return { ring: b.ring, minx, miny, maxx, maxy };
  });
}
function inBuilding(p, idx) {
  if (!idx || !p) return false;
  for (const s of idx) {
    if (p[0] < s.minx || p[0] > s.maxx || p[1] < s.miny || p[1] > s.maxy) continue;
    if (pip(p[0], p[1], s.ring)) return true;
  }
  return false;
}
// สัดส่วนจุดบนเส้นทางที่ "ร่ม" (เงาตึกจริง / ใต้หลังคา-skywalk / ต้นไม้ฝั่งบังแดด) — คืน null ถ้าไม่มีข้อมูลเลย
function shadeRatio(samples, osm, sun, prep) {
  const trees = osm.trees || [], treeRows = osm.treeRows || [], covered = osm.coveredWays || [];
  if (!trees.length && !treeRows.length && !covered.length && !prep) return null;
  if (!samples.length) return null;
  const lowSun = !sun || sun.elevation <= 5; // ดวงอาทิตย์ต่ำ/ลับขอบฟ้า → ไม่เน้นทิศ
  const sunAz = sun ? sun.azimuth : 0;
  let hit = 0;
  for (const s of samples) {
    if (underCovered(s, covered, 14) || ptShaded(s[0], s[1], prep) || shadedBySun(s, trees, treeRows, 25, sunAz, lowSun)) hit++;
  }
  return hit / samples.length;
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
        try { localStorage.setItem(cacheKey, JSON.stringify({ trees: o.trees, buildings: o.buildings, toilets: o.toilets, green: o.green, cameras: o.cameras, crossings: o.crossings, treeRows: o.treeRows || [], coveredWays: o.coveredWays || [] })); } catch (e) {}
        return { ...o, treeRows: o.treeRows || [], coveredWays: o.coveredWays || [], ok: true };
      }
    }
  } catch (e) {}
  // 2) สำรอง: ดึง Overpass ตรงจากเบราว์เซอร์
  const q = `[out:json][timeout:25];(node["natural"="tree"](${b});node["amenity"="toilets"](${b});way["leisure"="park"](${b});way["landuse"="grass"](${b});way["natural"="water"](${b});way["natural"="wood"](${b});node["man_made"="surveillance"](${b});node["highway"="crossing"](${b}););out center;(way["natural"="tree_row"](${b});way["highway"]["covered"~"yes|arcade"](${b});way["highway"="footway"]["bridge"](${b});way["man_made"="bridge"](${b}););out geom;`;
  for (const url of OVERPASS_MIRRORS) {
    const controller = new AbortController(); const t = setTimeout(() => controller.abort(), 25000);
    try {
      const res = await fetch(url, { method: "POST", body: "data=" + encodeURIComponent(q), headers: { "Content-Type": "application/x-www-form-urlencoded" }, signal: controller.signal });
      clearTimeout(t); if (!res.ok) continue;
      const json = await res.json();
      const trees = [], buildings = [], toilets = [], green = [], cameras = [], crossings = [], treeRows = [], coveredWays = [];
      for (const el of json.elements || []) {
        const tg = el.tags || {};
        if (el.type === "way" && Array.isArray(el.geometry)) {
          const line = el.geometry.map((g) => [g.lon, g.lat]).filter((p) => p[0] != null && p[1] != null);
          if (line.length < 2) continue;
          if (tg.natural === "tree_row") treeRows.push(line);
          else if (tg.covered === "yes" || tg.covered === "arcade" || tg.bridge || tg.man_made === "bridge") coveredWays.push(line);
          continue;
        }
        const lat = el.lat ?? el.center?.lat, lon = el.lon ?? el.center?.lon; if (lat == null || lon == null) continue;
        const pt = [lon, lat];
        if (tg.highway === "crossing") crossings.push(pt);
        else if (tg.man_made === "surveillance") cameras.push(pt);
        else if (tg.natural === "tree") { trees.push(pt); green.push(pt); }
        else if (tg.amenity === "toilets") toilets.push({ pt, tags: tg });
        else if (tg.building) buildings.push(pt);
        else if (tg.leisure === "park" || tg.landuse === "grass" || tg.natural === "wood" || tg.natural === "water") green.push(pt);
      }
      const out = { trees, buildings, toilets, green, cameras, crossings, treeRows, coveredWays, ok: true };
      try { if (toilets.length + trees.length + cameras.length + crossings.length > 0) localStorage.setItem(cacheKey, JSON.stringify({ trees, buildings, toilets, green, cameras, crossings, treeRows, coveredWays })); } catch (e) {}
      return out;
    } catch (e) { clearTimeout(t); continue; }
  }
  try { const c = localStorage.getItem(cacheKey); if (c) { const o = JSON.parse(c); return { ...o, ok: true, cached: true }; } } catch (e) {}
  return { ok: false, trees: [], buildings: [], toilets: [], green: [], cameras: [], crossings: [] };
}
function timeWeights(hour) {
  const h = hour ?? new Date().getHours();
  const day = h >= 7 && h < 18;
  return day
    ? { shade: 1.0, light: 0.0, night: false, mode: "กลางวัน ☀️ ดูความร่มล้วน (เงาตึก + ทางเชื่อม/ในห้าง)" }
    : { shade: 0.0, light: 1.0, night: true, mode: "กลางคืน 🌙 ดูความสว่างล้วน (ไฟถนนจริง BMA)" };
}
// คะแนนเส้นทาง = ความร่ม (เงาตึกจริง 3D + skywalk/หลังคา + ต้นไม้) + แสงสว่าง (ไฟถนน BMA)
function scoreRoutes(routes, osm, problems, lamps, bldgs, hour) {
  const WT = timeWeights(hour);
  // ตำแหน่งดวงอาทิตย์ ณ เวลาที่เลือก (hour = null → ตอนนี้) — เวลาเปลี่ยน เงาตึกเปลี่ยน ร่มเปลี่ยน
  const dt = new Date(); if (hour != null) dt.setHours(hour, 0, 0, 0);
  const ref = (routes[0] && routes[0].coordinates && routes[0].coordinates[0]) || [100.534, 13.737];
  const sun = sunPosition(dt, ref[1], ref[0]);
  const per = shadowPerM(sun);
  const prep = shadowPrep(per, bldgs); // เงาตึกจริง (ความสูงดาวเทียม 374 หลัง)
  const toiletPts = osm.toilets.map((t) => t.pt);
  const lampGridScore = WT.night ? buildLampGrid(lamps || []) : null; // ดัชนีไฟสำหรับให้คะแนนความหนาแน่น (สร้างครั้งเดียวต่อการคิดคะแนน)
  return routes.map((r) => {
    const samples = sampleLine(r.coordinates, 25);
    const shadeR = WT.night ? null : shadeRatio(samples, osm, sun, prep); // กลางคืนไม่มีแดด — ไม่คิด/ไม่โชว์ร่ม
    const lightR = WT.night ? lampDensityScore(samples, lampGridScore) : null; // กลางวันไม่สนไฟถนน · กลางคืนดู "ความหนาแน่นไฟ" (ยิ่งเยอะยิ่งสว่าง)
    const toiletsN = countNear(samples, toiletPts, 150);
    // ห้างเปิด 10:00–22:00 — นอกเวลานี้เส้น "เดินทะลุห้าง" ใช้ไม่ได้จริง
    const hh = hour ?? new Date().getHours();
    const mallOpen = hh >= 10 && hh < 22;
    const mallClosed = !!r.skywalk && !mallOpen;
    let shade = shadeR == null ? null : Math.round(shadeR * 100);
    if (r.skywalk && !WT.night) shade = Math.max(shade ?? 0, 95); // เส้น Skywalk/เดินทะลุห้าง = ร่มเกือบตลอด (เฉพาะตอนมีแดด)
    let light = lightR == null ? null : Math.round(lightR * 100);
    // ไทม์ไลน์คำแนะนำ: 10-18 skywalk (ร่ม) · 18-22 skywalk (ไฟในห้าง — ยังเปิด เดินได้จริง) · 22-07 เส้นเสาไฟ BMA · 07-10 เส้นร่มจากกราฟ
    // กลางคืนช่วงห้างเปิด: ทางเชื่อม/ในห้างมี "ไฟของอาคาร" ตลอดแนว — บูสต์ 99 กันเส้นกราฟคะแนนสูงมาเสมอ/แซง
    if (r.skywalk && WT.night && mallOpen) light = Math.max(light ?? 0, 99);
    // 💡 เส้นไฟ hardcode (MBK↔สยาม): บูสต์เฉพาะช่วงห้างปิด (22:00-06:59) — ก่อนนั้นให้ skywalk ชนะ
    if (r.nightlamp && WT.night && !mallOpen) light = Math.max(light ?? 0, 99);
    // หมายเหตุ: เส้นถนนใหญ่ให้คะแนนตามข้อมูลเสาไฟ BMA จริงเท่านั้น (ไม่ boost)
    // — คำแนะนำกลางคืนจะสอดคล้องกับจุดไฟเหลืองที่ผู้ใช้เห็นบนแผนที่เสมอ
    let num = 0, den = 0; const add = (v, w) => { if (v != null && w) { num += v * w; den += w; } };
    add(shade, WT.shade); add(light, WT.light);
    let comfort = den ? Math.round(num / den) : null;
    if (mallClosed) comfort = comfort == null ? 15 : Math.min(comfort, 25); // ห้างปิด → กดคะแนนลง ระบบจะไม่แนะนำเส้นนี้
    if (r.nightlamp && !WT.night) comfort = comfort == null ? 15 : Math.min(comfort, 25); // เส้นไฟเป็นของกลางคืน — กลางวันไม่ให้ขึ้นมาแข่งเส้นร่ม
    // รายชื่อห้องน้ำใกล้เส้นทาง (ชื่อ + ระยะจากต้นทาง) — ส่งให้ผู้ช่วย AI ตอบได้ว่าห้องน้ำอยู่ตรงไหนจริง ไม่ใช่เดาเอง
    const rcum = [0]; for (let i = 1; i < r.coordinates.length; i++) rcum[i] = rcum[i - 1] + haversine(r.coordinates[i - 1], r.coordinates[i]);
    const stepRoad = (ix) => { for (const st of (r.steps || [])) { if (ix >= st.wpStart && ix <= st.wpEnd && st.name) return st.name; } return ""; };
    let toiletList = [];
    for (const t of (osm.toilets || [])) {
      const np = nearestOnRoute(t.pt, r.coordinates, rcum); // ระยะตั้งฉากถึงเส้นจริง + ตำแหน่งตามแนวเดิน
      if (np.off <= 120) toiletList.push({ name: (t.tags && (t.tags.name || t.tags["name:th"])) || "ห้องน้ำสาธารณะ", along: Math.round(np.along), off: Math.round(np.off), road: stepRoad(np.seg) || stepRoad(np.seg + 1), pt: t.pt });
    }
    // ยุบจุดที่ซ้อนใกล้กัน (≤30 ม. = น่าจะเป็นห้องน้ำเดียวกันถูก tag หลาย node) — เก็บจุดที่ใกล้เส้นทางที่สุด
    toiletList.sort((a, b) => a.off - b.off);
    const dedupT = [];
    for (const t of toiletList) {
      if (dedupT.some((u) => haversine(t.pt, u.pt) <= 30)) continue;
      dedupT.push(t);
    }
    toiletList = dedupT.sort((a, b) => a.along - b.along);
    // จุดกล้อง CCTV ใกล้เส้นทาง (≤50 ม.) — ใช้โชว์หมุดในโหมดนำทาง 3D
    const cameraList = [];
    for (const cpt of (osm.cameras || [])) {
      let cbd = Infinity;
      for (let i = 0; i < r.coordinates.length; i++) { const dd = haversine(cpt, r.coordinates[i]); if (dd < cbd) cbd = dd; }
      if (cbd <= 50) cameraList.push(cpt);
    }
    return { ...r, shade, light, mallClosed, toiletsNear: toiletsN, comfort, timeMode: WT.mode, night: WT.night, toiletList: toiletList.slice(0, 8), cameraList: cameraList.slice(0, 20) };
  });
}
function comfortColor(v) { if (v == null) return "#888"; if (v >= 70) return "#2a9d54"; if (v >= 45) return "#e9a23b"; return "#c1121f"; }
function popupHtml(p) {
  const photo = p.photo ? `<img src="${p.photo}" alt="" style="width:100%;max-width:240px;border-radius:8px;margin-top:6px"/>` : "";
  const date = (p.timestamp || "").slice(0, 16); const lbl = CAT[p.cat]?.label || p.type || "ปัญหา";
  return `<div style="max-width:240px;font-family:system-ui"><div style="font-weight:700;color:${catColor(p.cat)}">${lbl}</div><div style="font-size:13px;margin:4px 0;white-space:pre-wrap">${(p.comment || "").slice(0, 240)}</div><div style="font-size:12px;color:#555">สถานะ: <b>${p.state || "-"}</b></div><div style="font-size:11px;color:#888">${date}</div>${photo}</div>`;
}
// ── 🌉 เส้นทางร่ม Skywalk (จุดขายหลัก) ──
// แนวเดิน MBK ชั้น 2 → Skywalk แยกปทุมวัน → Siam Discovery → Siam Center ชั้น 2 → ลงบันไดเลื่อนชั้น 1 (Starbucks) → ประตูทางออก → ลงบันได → BTS สยาม
// อิงแนวเดียวกับ shade_demo_3d.html / Figma frame "route" (เดินใต้หลังคา-ในห้างเกือบตลอด)
const SKYWALK_PATH = [
  [100.52980, 13.74465], // ในตึก MBK ชั้น 2 (โถงกลาง)
  [100.52995, 13.74510], // เดินผ่านโซน A ฝั่ง Don Don Donki
  [100.53020, 13.74545], // ออกทางเชื่อมหัวมุม MBK (มุมแยกปทุมวัน)
  [100.53046, 13.74586], // ขึ้นวงแหวน Skywalk แยกปทุมวัน (แขนฝั่ง MBK)
  [100.53072, 13.74581], // เดินตามวงแหวน — ด้านใต้
  [100.53094, 13.74590], // วงแหวนด้านตะวันออกเฉียงใต้
  [100.53103, 13.74612], // วงแหวนด้านตะวันออก
  [100.53094, 13.74634], // วงแหวนด้านตะวันออกเฉียงเหนือ (แขนออก)
  [100.53096, 13.74648], // เข้า Siam Discovery ชั้น 2 (ฝั่งตะวันตก)
  [100.53120, 13.74668], // เดินในตึก SD — ผ่านบันไดเลื่อน
  [100.53150, 13.74660], // เดินในตึก SD
  [100.53176, 13.74642], // ออก SD ฝั่งตะวันออกเฉียงใต้
  [100.53192, 13.74634], // ทางเชื่อม SD → Siam Center
  [100.53215, 13.74652], // เดินในตึก Siam Center ชั้น 2
  [100.53265, 13.74640], // ทางเดินในตึก SC ชั้น 2
  [100.53288, 13.74620], // ฝั่งใต้ SC ชั้น 2 → ลงบันไดเลื่อนไปชั้น 1
  [100.53312, 13.74602], // Starbucks ชั้น 1 → เดินตรงไปประตูทางออก
  [100.53332, 13.74594], // ประตูทางออก → เดินลงบันได
  [100.53339, 13.74589], // ลงบันได → เข้า BTS สยาม (ตรงลูกศรเขียว/บันได)
];
// จุดเริ่มแยกตามโหมด (เฉพาะต้นทาง MBK): กลางวันเริ่ม Skywalk ชั้น 2 · กลางคืนออกประตูระดับพื้น (ใกล้สะพานลอยแยกปทุมวัน) แล้วเลาะไฟถนน
const MBK_L2 = [100.52980, 13.74462];        // ต้นทาง Skywalk (MBK ชั้น 2)
const MBK_NIGHT_EXIT = [100.53025, 13.74450]; // ประตูออกระดับพื้น (กลางคืน) — จุดที่ user วง
// (ถอด NIGHT_VIAS จุดแวะบังคับซอยจุฬาฯ 64/ซอย 3 ออกแล้ว — corridor ตายตัวทับการคำนวณ ทำให้จูนน้ำหนักไฟยังไงเส้นก็ไม่เปลี่ยน
//  ตอนนี้กลางคืนปล่อย Dijkstra เลือกตามความหนาแน่นไฟ BMA จริงล้วนๆ)
// ทางเท้าเลียบถนนใหญ่พระราม 1 ฝั่งใต้ (ใต้รางบีทีเอส — ไฟถนน BMA หนาแน่น เหมาะเดินกลางคืน)
// พิกัดดึงจากโครงข่ายทางเท้า OSM จริง (walknet) — เดิมเป็น 6 จุดหยาบ ลากช่วงละ ~100 ม. เส้นเลยพาดทับตึกตอนซูม
const MAINROAD_PATH = [
  [100.53033, 13.74451], // ประตู MBK ระดับพื้น (มุมแยกปทุมวัน)
  [100.53038, 13.74457],
  [100.53047, 13.74461],
  [100.53052, 13.74493], // ขึ้นเหนือเลียบพญาไท
  [100.53061, 13.74488],
  [100.53070, 13.74544],
  [100.53103, 13.74582], // เลี้ยวขวาเข้าทางเท้าพระราม 1 (ใต้ราง BTS)
  [100.53134, 13.74599],
  [100.53145, 13.74602],
  [100.53194, 13.74594],
  [100.53212, 13.74591],
  [100.53219, 13.74592],
  [100.53257, 13.74585],
  [100.53299, 13.74584], // ทางเข้า BTS สยาม
];
// สร้างเส้นทางตามแนวที่กำหนด เมื่อต้นทาง-ปลายทางอยู่ใกล้หัว/ท้ายแนว (≤350 ม.)
// จุดหมายที่ใกล้หัว/ท้ายแนวมาก (≤130 ม.) → จบที่ปลายแนวเลย ไม่ลากต่อ (เช่นไม่ข้ามถนนไปอีกฝั่งสถานี)
function corridorRoute(start, end, PATH) {
  const near = (p, q, m) => haversine(p, q) <= m;
  const a = PATH[0], b = PATH[PATH.length - 1];
  let core = null;
  if (near(start, a, 350) && near(end, b, 350)) core = PATH;
  else if (near(start, b, 350) && near(end, a, 350)) core = [...PATH].reverse();
  if (!core) return null;
  // ✂️ ตัดแนว ณ จุดฉายของต้นทาง/ปลายทาง เมื่อจุดหมายอยู่ "ข้างแนว" (off ≤40 ม.) และตัดแล้วลดระยะ ≥50 ม.
  // — เดิมเดินไปสุดแนวเสมอแล้วค่อยลากเข้าจุดหมาย เกิดอาการ "เดินเลยปลายทางแล้ววกกลับ" (เช่นเลย BTS สยามไป ~130 ม.)
  // เกณฑ์ ≥50 ม. กันตัดปลายแนวที่ตั้งใจวาดละเอียด (เช่นช่วงบันได Skywalk ลง BTS) ทิ้งโดยไม่จำเป็น
  let cum = [0]; for (let i = 1; i < core.length; i++) cum[i] = cum[i - 1] + haversine(core[i - 1], core[i]);
  const pe = nearestOnRoute(end, core, cum);
  if (pe.off <= 40 && cum[cum.length - 1] - pe.along >= 50) core = [...core.slice(0, pe.seg + 1), pointAtDistance(core, cum, pe.along)];
  cum = [0]; for (let i = 1; i < core.length; i++) cum[i] = cum[i - 1] + haversine(core[i - 1], core[i]);
  const ps = nearestOnRoute(start, core, cum);
  if (ps.off <= 40 && ps.along >= 50) core = [pointAtDistance(core, cum, ps.along), ...core.slice(ps.seg + 1)];
  const head = near(start, core[0], 130) ? [] : [start];
  const tail = near(end, core[core.length - 1], 130) ? [] : [end];
  const path = [...head, ...core, ...tail];
  let dist = 0; for (let i = 1; i < path.length; i++) dist += haversine(path[i - 1], path[i]);
  return { coordinates: path, distance_m: Math.round(dist), duration_min: Math.max(1, Math.round(dist / 75)), steps: [] };
}
function skywalkRoute(start, end) { const r = corridorRoute(start, end, SKYWALK_PATH); return r ? { ...r, skywalk: true } : null; }
function mainRoadRoute(start, end) { const r = corridorRoute(start, end, MAINROAD_PATH); return r ? { ...r, mainroad: true } : null; }
// ── 💡 เส้นทางไฟกลางคืน MBK ↔ สยาม (จุดขาย "ทางสว่าง ไม่เปลี่ยว") ──
// hardcode ตามแนวซอยไฟหนาแน่นที่ user เลือก (ตรวจกับข้อมูลเสาไฟ BMA แล้ว: ใกล้แนว ≤30 ม. ~14 ต้น
// เฉพาะซอยขึ้น BTS ช่วงเหนือมีไฟถี่สุดในย่าน ~15 ต้น) — ยอมอ้อมกว่าเส้นสั้นสุด ~130 ม. แลกกับเดินใต้ไฟเกือบตลอด
// พิกัดดึงจากโครงข่ายทางเท้า OSM จริง (walknet_pathumwan) — เดินได้จริงทุกช่วง
// แนว: ประตู MBK ระดับพื้น → เลาะซอยจุฬาฯ 64 → ขึ้นซอยไฟข้างสยามสแควร์วัน → BTS สยาม
const NIGHT_LAMP_PATH = [
  [100.53033, 13.74451], // ประตูออก MBK ระดับพื้น (ฝั่งใต้ มุมแยกปทุมวัน)
  [100.53064, 13.74449], // เข้าแนวซอยจุฬาฯ 64
  [100.53068, 13.74482],
  [100.53113, 13.74476],
  [100.53158, 13.74470],
  [100.53171, 13.74468],
  [100.53178, 13.74471],
  [100.53222, 13.74463],
  [100.53271, 13.74455],
  [100.53279, 13.74462], // เลี้ยวซ้ายเข้าปากซอยแถวเสาไฟทันที (เดิมมีจุด junction เกินทำให้เดินเลยปากซอย ~17 ม. แล้ววกกลับ)
  [100.53289, 13.74522], // เดินขึ้นเหนือทาบแถวเสาไฟ BMA (lon ~100.5328-100.5330)
  [100.53297, 13.74572],
  [100.53299, 13.74584], // ทางเข้า BTS สยาม
];
function nightLampRoute(start, end) { const r = corridorRoute(start, end, NIGHT_LAMP_PATH); return r ? { ...r, nightlamp: true } : null; }
// ── 🧭 Routing ของเราเอง: กราฟทางเท้า OSM + Dijkstra ถ่วงน้ำหนัก "ไฟ BMA" (กลางคืน) / "เงาตึก" (กลางวัน) ──
// ทำให้เส้น comfort ยอมอ้อมเข้าซอยที่สว่าง/ร่มจริง แทนที่จะใช้แค่ทางสั้นสุดจาก ORS
async function fetchWalkNet(bbox) {
  const cacheKey = "walknet5:" + bbox.map((x) => Math.round(x * 1000)).join(",");
  try { const cch = localStorage.getItem(cacheKey); if (cch) return JSON.parse(cch); } catch (e) {}
  const b = bbox.join(",");
  // 0) ไฟล์สำเร็จรูปที่ฝังมากับเว็บ (public/data/walknet_pathumwan.json) — โหลดทันที ไม่ต้องรอ OSM
  //    ทำให้ demo เปิดครั้งแรกก็มีเส้นเกาะไฟเลย ไม่ขึ้นแถบ "กำลังโหลด" (ถ้าไม่มีไฟล์ = ข้ามไปข้อ 1)
  try {
    const rs = await fetch("/data/walknet_pathumwan.json");
    if (rs.ok) {
      const o = await rs.json();
      if (o && o.ways && o.ways.length) {
        try { localStorage.setItem(cacheKey, JSON.stringify(o)); } catch (e) {}
        return o;
      }
    }
  } catch (e) {}
  // 1) ผ่านเซิร์ฟเวอร์ (มี cache — โหลดครั้งต่อไปเร็วทันที)
  try {
    const r = await fetch("/api/walknet?bbox=" + encodeURIComponent(b));
    if (r.ok) {
      const o = await r.json();
      if (o.ways && o.ways.length) {
        try { localStorage.setItem(cacheKey, JSON.stringify(o)); } catch (e) {}
        return o;
      }
    }
  } catch (e) {}
  // 2) สำรอง: Overpass ตรงจากเบราว์เซอร์
  const q = `[out:json][timeout:25];way["highway"~"footway|path|pedestrian|living_street|residential|unclassified|service|steps|primary|secondary|tertiary|primary_link|secondary_link|tertiary_link"](${b});out geom;`;
  for (const url of OVERPASS_MIRRORS) {
    const controller = new AbortController(); const t = setTimeout(() => controller.abort(), 25000);
    try {
      const res = await fetch(url, { method: "POST", body: "data=" + encodeURIComponent(q), headers: { "Content-Type": "application/x-www-form-urlencoded" }, signal: controller.signal });
      clearTimeout(t); if (!res.ok) continue;
      const j = await res.json();
      const ways = [];
      for (const el of j.elements || []) if (el.type === "way" && Array.isArray(el.geometry) && el.geometry.length > 1) ways.push(el.geometry.map((g) => [g.lon, g.lat]));
      if (!ways.length) continue;
      const out = { ways };
      try { localStorage.setItem(cacheKey, JSON.stringify(out)); } catch (e) {}
      return out;
    } catch (e) { clearTimeout(t); continue; }
  }
  return null;
}
// รวม way เป็นกราฟ: โหนด = จุดพิกัด (ปัดทศนิยม 5 ตำแหน่ง ≈ 1 ม. → จุดตัดซอยเชื่อมถึงกัน)
function buildGraph(ways, bldgs) {
  const bIdx = buildingIndex(bldgs); // ใช้กรอง snap edge ที่ลัดทะลุตึก (ถ้าข้อมูลตึกยังไม่มา factor ตอน routing กันซ้ำอีกชั้น)
  const nodes = new Map();
  const keyOf = (p) => p[0].toFixed(5) + "," + p[1].toFixed(5);
  const addEdge = (a, b2) => {
    const d = haversine(a, b2);
    if (d < 0.5 || d > 400) return;
    const ka = keyOf(a), kb = keyOf(b2);
    if (!nodes.has(ka)) nodes.set(ka, { pt: a, edges: [] });
    if (!nodes.has(kb)) nodes.set(kb, { pt: b2, edges: [] });
    const mid = [(a[0] + b2[0]) / 2, (a[1] + b2[1]) / 2];
    nodes.get(ka).edges.push({ to: kb, d, mid });
    nodes.get(kb).edges.push({ to: ka, d, mid });
  };
  for (const w of ways) {
    // แบ่งช่วงยาวเป็นท่อนละ ≤50 ม. — เช็คไฟ/เงาต่อท่อนได้ละเอียด ไม่เหมาช่วงยาวจาก midpoint เดียว
    for (let i = 0; i < w.length - 1; i++) {
      const a = w[i], b2 = w[i + 1];
      const d = haversine(a, b2);
      const n = Math.max(1, Math.ceil(d / 50));
      let prevPt = a;
      for (let k = 1; k <= n; k++) {
        const t = k / n;
        const q = k === n ? b2 : [a[0] + (b2[0] - a[0]) * t, a[1] + (b2[1] - a[1]) * t];
        addEdge(prevPt, q);
        prevPt = q;
      }
    }
  }
  // เชื่อม "โหนดที่เกือบชนกัน" (≤10 ม.) ที่ยังไม่ต่อกัน — OSM ทางเดินในสยามสแควร์หลายเส้นปลายซอยไม่ได้ต่อ node กัน
  // ทำให้ Dijkstra ทะลุเข้าซอยไฟเยอะได้ (ก่อนหน้านี้ซอยเป็น "เกาะ" แยกจากกัน เข้าไม่ถึง เลยเลาะขอบ)
  const SNAP = 16, scs = SNAP / 111000;
  const cell = new Map();
  for (const [k, n] of nodes) { const cx = Math.round(n.pt[0] / scs), cy = Math.round(n.pt[1] / scs); const ck = cx + "_" + cy; if (!cell.has(ck)) cell.set(ck, []); cell.get(ck).push(k); }
  for (const [k, n] of nodes) {
    const cx = Math.round(n.pt[0] / scs), cy = Math.round(n.pt[1] / scs);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      const arr = cell.get((cx + dx) + "_" + (cy + dy)); if (!arr) continue;
      for (const k2 of arr) {
        if (k2 === k) continue;
        const n2 = nodes.get(k2); const d = haversine(n.pt, n2.pt);
        if (d > 0.5 && d <= SNAP && !n.edges.some((e) => e.to === k2)) {
          const mid = [(n.pt[0] + n2.pt[0]) / 2, (n.pt[1] + n2.pt[1]) / 2];
          if (inBuilding(mid, bIdx)) continue; // ❌ snap ข้ามช่องว่างได้ แต่ห้ามลัดทะลุตัวตึก
          n.edges.push({ to: k2, d, mid });
        }
      }
    }
  }
  return nodes;
}
// ดัชนีตารางไฟถนน — เก็บไฟรายเซลล์ แล้วเช็คระยะจริง ≤30 ม. (เกณฑ์เดียวกับตอนให้คะแนน)
const LAMP_CS = 0.0003;
function buildLampGrid(lamps) {
  const g = new Map();
  for (const p of lamps || []) {
    const k = Math.round(p[0] / LAMP_CS) + "_" + Math.round(p[1] / LAMP_CS);
    if (!g.has(k)) g.set(k, []);
    g.get(k).push(p);
  }
  return g;
}
function lampNearGrid(grid, p) {
  if (!grid) return false;
  const gx = Math.round(p[0] / LAMP_CS), gy = Math.round(p[1] / LAMP_CS);
  for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
    const arr = grid.get((gx + dx) + "_" + (gy + dy));
    if (arr) { for (const q of arr) if (haversine(p, q) <= 30) return true; }
  }
  return false;
}
// นับ "จำนวนเสาไฟ" รอบจุด (ไม่ใช่แค่มี/ไม่มี) — ยิ่งหนาแน่น = ยิ่งสว่าง = ยิ่งควรเดิน
// ใช้ทั้งตอนให้คะแนน "ทางสว่างที่สุด" และตอน routing (ยอมอ้อมมาเกาะซอยที่ไฟเยอะกว่า)
function lampCountNearGrid(grid, p, radius = 40) {
  if (!grid) return 0;
  const gx = Math.round(p[0] / LAMP_CS), gy = Math.round(p[1] / LAMP_CS);
  const R = Math.max(1, Math.ceil(radius / (LAMP_CS * 111000 * Math.cos((p[1] * Math.PI) / 180))));
  let c = 0;
  for (let dx = -R; dx <= R; dx++) for (let dy = -R; dy <= R; dy++) {
    const arr = grid.get((gx + dx) + "_" + (gy + dy));
    if (arr) { for (const q of arr) if (haversine(p, q) <= radius) c++; }
  }
  return c;
}
// Dijkstra: cost = ระยะ × ตัวคูณ (ช่วงมืด/โดนแดด = แพง 2.2-2.6 เท่า) → เส้นยอมอ้อมเพื่อความสว่าง/ร่ม
function graphRoute(nodes, start, end, hour, lampGrid, bldgs, osm) {
  if (!nodes || !nodes.size || !start || !end) return null;
  const WTg = timeWeights(hour);
  const dtg = new Date(); if (hour != null) dtg.setHours(hour, 0, 0, 0);
  const sunG = WTg.night ? null : sunPosition(dtg, start[1], start[0]);
  const prep = WTg.night ? null : shadowPrep(shadowPerM(sunG), bldgs);
  // แดดต่ำจริงๆ เท่านั้น (elevation <8° เช่นเช้าตรู่หน้าหนาว) ค่อยเลิกไล่เงา — เงายาวพาดทั่วย่านอยู่แล้ว
  // (เดิมตั้ง <18° กว้างไป ทำให้ 07:00 หน้าร้อนใช้คนละโหมดกับ 08:00 เส้นออกตัวคนละทิศ)
  const lowSunG = !WTg.night && (!sunG || sunG.elevation < 8);
  const covered = (osm && osm.coveredWays) || [];
  // เช็ค "สว่าง/ร่ม" ทั้ง midpoint และหัว-ท้าย edge — กันช่วงยาว ~50 ม. ที่จุดกลางบังเอิญตกร่องว่างระหว่างเสาไฟ
  // ถูกตัดสินว่ามืดทั้งที่ปลายทั้งสองมีไฟ · กลางคืนถ่วง ×3.2 (เดิม 2.6) ให้เส้นยอมอ้อมมาเกาะถนนใหญ่ที่มีไฟมากขึ้น
  const bIdx = buildingIndex(bldgs);
  const factor = (mid, p1, p2) => {
    // 🚫 เส้นกราฟห้ามมุดตึก: edge ที่จุดกลางอยู่ในตัวตึก = แพง ×6 (ครอบคลุมทั้ง edge จาก OSM และ edge ที่เกิดจาก snap)
    // "เดินทะลุห้าง" มีเฉพาะเส้น Skywalk ที่วาดตามแนวทางเดินจริงเท่านั้น
    const inb = inBuilding(mid, bIdx) ? 6 : 1;
    if (WTg.night) {
      // นิยามแสงให้ตรง "ตาเห็น": ไฟถนนส่องถึงจริง ~20-30 ม. → รัศมีนับ 28 ม. (เดิม 60 — ซอยมืดข้างซอยสว่างได้เครดิตฟรี
      // ทำให้ตัวคูณเท่ากันแล้วระบบเลือกเส้นสั้นกว่าแทนเส้นที่มีไฟจริง)
      // เฉลี่ยทั้ง 3 จุด (เดิม max จุดเดียว — ท่อนมืดเกือบทั้งท่อนแต่ปลายติดไฟถูกนับสว่างทั้งท่อน)
      // ส่วนลดแบบ log ไม่ตัน (เดิมตันที่ 8 ต้น) — ซอยไฟแน่นกว่าชนะเสมอ: 0 ต้น ×1.5 · 1 ต้น ×1.15 · 3 ต้น ×0.8 · 7 ต้น ×0.45 · 13+ ต้น ×0.2
      const pts = [mid, p1, p2].filter(Boolean);
      const c = pts.reduce((s, q) => s + lampCountNearGrid(lampGrid, q, 28), 0) / pts.length;
      return inb * Math.max(0.2, 1.5 - 0.35 * Math.log2(1 + c));
    }
    // กลางวัน: นับร่มแบบ "เสียงข้างมาก" (≥2 ใน 3 จุด) — เดิมจุดเดียวร่มก็นับทั้งท่อน เส้นเลยซิกแซกไล่เก็บหย่อมเงา
    // penalty ไม่ร่มลดจาก ×2.2 → ×1.45 — ยอมอ้อมเพื่อร่มได้ ≤45% ของระยะตรง ไม่พาอ้อมเป็นเขาวงกต
    const shd = (q) => q && (underCovered(q, covered, 14) || ptShaded(q[0], q[1], prep, true));
    const nsh = (shd(mid) ? 1 : 0) + (shd(p1) ? 1 : 0) + (shd(p2) ? 1 : 0);
    if (lowSunG) return inb * (nsh >= 2 ? 1 : nsh === 1 ? 1.04 : 1.1); // แดดต่ำ: เกือบเป็นทางสั้นสุด
    return inb * (nsh >= 2 ? 1 : nsh === 1 ? 1.25 : 1.45);
  };
  // จุดเริ่ม/จบ = โหนดใกล้สุด (≤120 ม. — เดิม 250 ทำให้เกิดเส้นตรงเฉียงยาวพุ่งทะลุตึกเข้าหาหมุด)
  let sk = null, ek = null, sd = 120, ed = 120;
  for (const [k, n] of nodes) {
    const d1 = haversine(start, n.pt); if (d1 < sd) { sd = d1; sk = k; }
    const d2 = haversine(end, n.pt); if (d2 < ed) { ed = d2; ek = k; }
  }
  if (!sk || !ek || sk === ek) return null;
  const dist = new Map(), prev = new Map();
  const heap = [[0, sk]]; dist.set(sk, 0);
  const hpush = (it) => { heap.push(it); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
  const hpop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r2 = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r2 < heap.length && heap[r2][0] < heap[m][0]) m = r2; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
  while (heap.length) {
    const [cd, k] = hpop();
    if (k === ek) break;
    if (cd > (dist.get(k) ?? Infinity)) continue;
    const kp = nodes.get(k).pt;
    for (const e of nodes.get(k).edges) {
      const nd = cd + e.d * factor(e.mid, kp, nodes.get(e.to)?.pt);
      if (nd < (dist.get(e.to) ?? Infinity)) { dist.set(e.to, nd); prev.set(e.to, k); hpush([nd, e.to]); }
    }
  }
  if (!dist.has(ek)) return null;
  const pathKeys = []; let cur = ek;
  while (cur) { pathKeys.push(cur); cur = prev.get(cur); if (pathKeys.length > 5000) return null; }
  pathKeys.reverse();
  const coords = [start, ...pathKeys.map((k) => nodes.get(k).pt), end];
  let distM = 0; for (let i = 1; i < coords.length; i++) distM += haversine(coords[i - 1], coords[i]);
  if (distM < 50) return null;
  return { graphed: true, coordinates: coords, distance_m: Math.round(distM), duration_min: Math.max(1, Math.round(distM / 75)), steps: [] };
}

// เหลือทางเลือกแค่ 2 เส้น: (1) ทางร่ม/สว่างที่สุด (2) ทางเร็วที่สุด — เส้นที่ใช้ไม่ได้จริง (เช่นทะลุห้างตอนห้างปิด) ตัดทิ้งเลย
function pickRoutes(scored) {
  const usable = scored.filter((r) => !r.mallClosed);
  const pool = usable.length ? usable : scored;
  const comfort = pool.reduce((b, r) => ((r.comfort ?? -1) >= (b.comfort ?? -1) ? r : b), pool[0]); // เสมอกัน → เอาเส้นจากกราฟ (อยู่ท้ายสุด)
  const fast = pool.reduce((b, r) => ((r.duration_min ?? 1e9) < (b.duration_min ?? 1e9) ? r : b), pool[0]);
  return { comfortIdx: comfort ? comfort.index : 0, fastIdx: fast ? fast.index : 0 };
}

// พจนานุกรมสถานที่สำคัญย่านปทุมวัน (พิกัดจริงโดยประมาณ) — ใช้ก่อนถาม Nominatim เพื่อความแม่นยำ/กันชื่อกำกวม
const LANDMARKS = [
  { aliases: ["สนามกีฬาแห่งชาติ", "สนามกีฬา", "national stadium", "สนามศุภ", "ศุภชลาศัย"], coord: [100.5294, 13.7466], name: "สนามกีฬาแห่งชาติ" },
  { aliases: ["สยามพารากอน", "พารากอน", "paragon"], coord: [100.5347, 13.7462], name: "สยามพารากอน" },
  { aliases: ["สยามสแควร์", "สยาม", "siam"], coord: [100.53298, 13.74582], name: "สยาม (BTS)" },
  { aliases: ["มาบุญครอง", "mbk", "เอ็มบีเค"], coord: [100.52980, 13.74462], name: "MBK / มาบุญครอง" },
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
    // เลือกชื่อ "ตำแหน่งจริง" ที่เจาะจงก่อน (ตึก/POI/สวน) — เลี่ยง neighbourhood/suburb ที่กว้างและทำให้เข้าใจผิดว่าอยู่คนละที่
    const place = a.building || a.amenity || a.leisure || a.shop || a.mall || a.office || a.tourism || a.neighbourhood || "";
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
  const istyle = { width: "100%", boxSizing: "border-box", padding: "10px 12px", borderRadius: 10, border: "1px solid var(--bdi-line)", background: "rgba(10,4,22,.75)", color: "var(--bdi-text)", fontSize: 16, outline: "none" };
  return (
    <div style={{ position: "relative" }}>
      <input value={value} onChange={(e) => handle(e.target.value)} onFocus={() => { if (sugs.length) setOpen(true); }} onBlur={() => setTimeout(() => setOpen(false), 160)}
        onKeyDown={(e) => { if (e.key === "Enter") { setOpen(false); onEnter && onEnter(); } }} placeholder={placeholder} style={istyle} />
      {open ? (
        <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: "var(--bdi-surface-2)", border: "1px solid var(--bdi-line)", borderRadius: 10, boxShadow: "0 4px 14px rgba(0,0,0,.5)", zIndex: 1400, maxHeight: 240, overflowY: "auto", marginTop: 2 }}>
          {sugs.map((sg, i) => (
            <div key={i} onMouseDown={() => { onPick(sg); setOpen(false); }}
              style={{ padding: "9px 11px", fontSize: 14, cursor: "pointer", borderBottom: "1px solid var(--bdi-line)", display: "flex", justifyContent: "space-between", gap: 8, color: "var(--bdi-text)" }}>
              <span>{sg.name}</span><span style={{ fontSize: 11, color: "var(--bdi-text-dim)" }}>{sg.src === "landmark" ? "⭐ ที่นิยม" : "OSM"}</span>
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
  const [toilets, setToilets] = useState(null);
  const [cams, setCams] = useState(null);
  const [routeData, setRouteData] = useState(null);
  const [active, setActive] = useState(null);
  const [nav, setNav] = useState(null);
  const [voice, setVoice] = useState(true);
  const [voiceLang, setVoiceLang] = useState("th");
  const [nav3d, setNav3D] = useState(null);
  const [sFrom, setSFrom] = useState("");
  const [sTo, setSTo] = useState("");
  // chips คุมเลเยอร์แผนที่ตามดีไซน์ Figma + สถานะเปิด/ปิดแผงค้นหา ("จะไปไหนดี?")
  const [chips, setChips] = useState({ light: true, cross: false, toilet: false });
  const [searchOpen, setSearchOpen] = useState(false);
  const [routeSheetOpen, setRouteSheetOpen] = useState(false); // ดีฟอลต์พับ — กดขยายเมื่ออยากดูรายละเอียดทุกเส้น
  const [floor, setFloor] = useState("2"); // ปุ่มเลือกชั้นห้าง 2/1/M/G (Figma: Frame 59)
  const [routeHour, setRouteHour] = useState(null); // เลือกเวลาเดินทางรายชั่วโมง (null = ตอนนี้) — Figma: Frame 51

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
      // เลเยอร์คุมผ่าน "chips" ตามดีไซน์ Figma (Street light / ทางเชื่อม / ห้องน้ำ)
      const toiletsLayer = L.layerGroup();               // chip: ห้องน้ำ (เริ่มปิด)
      const cctvLayer = L.layerGroup();                  // เก็บหมุดกล้องไว้ใช้โหมด 3D (ไม่โชว์บนแผนที่หลัก)
      const lightLayer = L.layerGroup().addTo(map);      // chip: Street light (ไฟถนนจริง BMA)
      const crossLayer = L.layerGroup();                 // chip: ทางเชื่อม/skywalk (เริ่มปิด)
      const routeLayer = L.layerGroup().addTo(map);
      ctx.current.routeLayer = routeLayer;
      ctx.current.layers = { toilets: toiletsLayer, light: lightLayer, cross: crossLayer };
      const crossIcon = L.divIcon({ className: "", html: '<div class="bdi-cross-ic"></div>', iconSize: [12, 12], iconAnchor: [6, 6] });
      ctx.current.crossSeen = new Set();
      ctx.current.addCrossMarkers = (pts) => {
        for (const p of (pts || [])) {
          const k = p[0].toFixed(5) + "," + p[1].toFixed(5);
          if (ctx.current.crossSeen.has(k)) continue;
          ctx.current.crossSeen.add(k);
          L.marker([p[1], p[0]], { icon: crossIcon }).bindPopup("ทางข้าม/ทางม้าลาย (OSM)").addTo(crossLayer);
        }
      };
      // Skywalk / ทางเชื่อมมีหลังคา (จาก OSM coveredWays เช่น R-Walk สยาม–ชิดลม, ทางเชื่อม BTS) → เส้นเขียวบน chip ทางเชื่อม
      ctx.current.skySeen = new Set();
      ctx.current.addSkywalks = (ways) => {
        for (const line of (ways || [])) {
          if (!line || line.length < 2) continue;
          const k = line[0][0].toFixed(5) + "," + line[0][1].toFixed(5) + "|" + line.length;
          if (ctx.current.skySeen.has(k)) continue;
          ctx.current.skySeen.add(k);
          L.polyline(line.map(([lon, lat]) => [lat, lon]), { color: "#b48fe0", weight: 3, opacity: 0.55 }).bindPopup("Skywalk / ทางเดินมีหลังคา (OSM)").addTo(crossLayer);
        }
      };
      // ไฟถนนจริงจาก BMA เขตปทุมวัน (3,708 ต้น) — วาดด้วย canvas เพื่อความลื่น · เหลือง=ปกติ แดง=มีปัญหา
      const lampCanvas = L.canvas({ padding: 0.4 });
      (async () => {
        try {
          const res = await fetch("/data/bma_streetlight_pathumwan.json");
          if (!res.ok) return;
          const d = await res.json();
          ctx.current.lamps = (d.lamps || []).map((a) => [a[0], a[1]]);
          ctx.current.lampGrid = buildLampGrid(ctx.current.lamps); // ดัชนีไฟสำหรับ routing กลางคืน
          for (const [lon, lat, s] of (d.lamps || [])) {
            const cl = s === 1 ? "#ffd94a" : "#ff6b6b";
            const m = L.circleMarker([lat, lon], { renderer: lampCanvas, radius: 2.5, color: cl, fillColor: cl, fillOpacity: 0.85, weight: 0.5 }).addTo(lightLayer);
            if (s !== 1) m.bindPopup("ไฟถนน BMA — สถานะมีปัญหา");
          }
        } catch (e) {}
      })();
      // ── แผนผัง "ตึกที่เดินผ่าน" MBK → BTS สยาม วาดลงบนแผนที่จริง (ตาม Figma frame "route+noti" / Siam_dis_f2) ──
      // ใช้ pane แยก (z ต่ำกว่า overlay ปกติ) เพื่อให้ "เส้นทางสีฟ้า" ทับอยู่บนแผนผังเสมอ ไม่โดนพื้น/ทางเดินบัง
      map.createPane("indoor");
      map.getPane("indoor").style.zIndex = 350;
      const IP = { pane: "indoor" };
      const indoorLayer = L.layerGroup();
      ctx.current.indoorLayer = indoorLayer;
      {
        // ❌ ไม่วาด "กล่องดำ" footprint ตึกแล้ว (ตำแหน่งคลาดจากแผนที่จริง) — วาดเฉพาะโครงทางเดิน/ไอคอน
        // ทางเดินสีขาวมีขอบเข้ม (casing) ให้เด่นบนแผนที่โดยไม่ต้องมีพื้นตึก
        const label = (lat, lon, txt, color = "#35c4f0") => L.marker([lat, lon], { icon: L.divIcon({ className: "", html: `<div style="display:inline-block;background:rgba(10,6,24,.88);border:1.5px solid ${color};color:${color};font-weight:800;font-size:10px;letter-spacing:1px;padding:2px 8px;border-radius:9px;white-space:nowrap;text-align:center;box-shadow:0 2px 6px rgba(0,0,0,.5)">${txt}</div>`, iconSize: [110, 18], iconAnchor: [55, 9] }) }).addTo(indoorLayer);
        const door = (lat, lon, txt) => L.circleMarker([lat, lon], { radius: 5.5, color: "#fff", fillColor: "#b7eb3e", fillOpacity: 1, weight: 2 }).bindPopup(txt).addTo(indoorLayer);
        const corridor = (pts, w = 11) => {
          L.polyline(pts, { ...IP, color: "#3a2358", weight: w + 5, opacity: 0.85, lineCap: "butt" }).addTo(indoorLayer); // ขอบเข้ม
          return L.polyline(pts, { ...IP, color: "#f4effc", weight: w, opacity: 0.97, lineCap: "butt" }).addTo(indoorLayer);
        };
        // ไอคอนแผนผังในตึก (ตาม Figma: Siam_dis_f2) — บันไดเลื่อน / ลิฟต์ / WC / สะพานเชื่อมตึก
        const esc = (lat, lon) => L.marker([lat, lon], { icon: L.divIcon({ className: "", html: '<div class="bdi-esc"><i></i><i></i></div>', iconSize: [14, 16], iconAnchor: [7, 8] }) }).bindPopup("บันไดเลื่อน").addTo(indoorLayer);
        const lift = (lat, lon) => L.marker([lat, lon], { icon: L.divIcon({ className: "", html: '<div class="bdi-lift">⇕</div>', iconSize: [17, 17], iconAnchor: [8, 8] }) }).bindPopup("ลิฟต์").addTo(indoorLayer);
        const wc = (lat, lon) => L.marker([lat, lon], { icon: L.divIcon({ className: "", html: '<div class="bdi-wc">WC</div>', iconSize: [22, 13], iconAnchor: [11, 6] }) }).bindPopup("ห้องน้ำ").addTo(indoorLayer);
        const bridge = (pts) => L.polyline(pts, { ...IP, color: "#c85df0", weight: 9, opacity: 0.9, lineCap: "butt" }).bindPopup("ทางเชื่อมระหว่างตึก").addTo(indoorLayer);

        // ── โครงสร้างวงแหวน Skywalk แยกปทุมวัน (ตาม Figma — deck น้ำเงินเข้ม + แขน + บันไดขึ้นลง) ──
        const RC = [13.74612, 100.53072]; // ศูนย์กลางแยก
        const MLA = 110540, MLO = 111320 * Math.cos((RC[0] * Math.PI) / 180);
        const circ = (r, n = 40) => Array.from({ length: n + 1 }, (_, i) => { const a = (i / n) * 2 * Math.PI; return [RC[0] + (r * Math.sin(a)) / MLA, RC[1] + (r * Math.cos(a)) / MLO]; });
        L.polygon([circ(45), circ(24)], { ...IP, color: "#9db7e8", weight: 1.5, fillColor: "#1e2a4a", fillOpacity: 0.92 }).bindPopup("Skywalk วงแหวนแยกปทุมวัน").addTo(indoorLayer);
        const arm = (pts) => L.polyline(pts, { ...IP, color: "#1e2a4a", weight: 12, opacity: 0.92, lineCap: "butt" }).addTo(indoorLayer);
        arm([[13.74586, 100.53046], [13.74545, 100.53020]]); // แขนไปมุม MBK
        arm([[13.74646, 100.53058], [13.74665, 100.53042]]); // แขนไปฝั่ง BACC / สนามกีฬาฯ
        arm([[13.74634, 100.53094], [13.74648, 100.53096]]); // แขนตะวันออกเฉียงเหนือ → Siam Discovery
        arm([[13.74578, 100.53076], [13.74552, 100.53082]]); // แขนใต้ลง ถ.พญาไท
        const stair = (lat, lon) => L.marker([lat, lon], { icon: L.divIcon({ className: "", html: '<div style="width:16px;height:16px;border-radius:50%;background:#2fae5f;color:#fff;font-size:11px;font-weight:800;display:grid;place-items:center;box-shadow:0 1px 4px rgba(0,0,0,.5)">↑</div>', iconSize: [16, 16], iconAnchor: [8, 8] }) }).bindPopup("บันไดขึ้น-ลง Skywalk").addTo(indoorLayer);
        stair(13.74552, 100.53082); stair(13.74665, 100.53042); stair(13.74590, 100.53040);

        // MBK ชั้น 2 — โถงกลาง → โซน A (Don Don Donki) → ทางออกทางเชื่อม
        corridor([[13.74465, 100.52980], [13.74510, 100.52995], [13.74545, 100.53020]]);
        corridor([[13.74510, 100.52995], [13.74492, 100.52962]], 7); // แยกเข้าโซนร้าน Donki (ลงใต้ฝั่ง Tokyu ให้ตรงตำแหน่งจริง)
        label(13.74448, 100.52975, "MBK ชั้น 2");
        label(13.74483, 100.52950, "DON DON DONKI", "#c85df0");
        esc(13.74478, 100.52986);
        door(13.74545, 100.53020, "ออกทางเชื่อมหัวมุม MBK (โซน A ฝั่ง Don Don Donki)");

        // ── Siam Discovery ชั้น 2 (โครงทางเดินตาม Figma Siam_dis_f2 — ไม่วาดพื้นตึก) ──
        // โครงทางเดินสีขาวในตึก (ทางหลักทแยง + แยกไปลิฟต์/ห้องน้ำ + แยกใต้)
        corridor([[13.74648, 100.53096], [13.74668, 100.53120], [13.74660, 100.53150], [13.74642, 100.53176]]); // ทางหลัก: เข้า W → ออก SE
        corridor([[13.74668, 100.53120], [13.74695, 100.53135]], 7);  // แยกขึ้นไปโซนลิฟต์
        corridor([[13.74660, 100.53150], [13.74686, 100.53160]], 7);  // แยกไปห้องน้ำ
        esc(13.74663, 100.53131); esc(13.74650, 100.53164);
        lift(13.74698, 100.53138);
        wc(13.74690, 100.53164);
        door(13.74648, 100.53096, "เข้า Siam Discovery ชั้น 2 (จากสะพานข้ามแยกปทุมวัน)");
        label(13.74672, 100.53112, "SIAM<br/>DISCOVERY");
        // สะพานเชื่อม Siam Discovery → Siam Center (แถบม่วงแบบ Figma)
        bridge([[13.74642, 100.53176], [13.74634, 100.53192]]);

        // ── Siam Center ชั้น 2 — เดินต่อจากทางเชื่อม ──
        corridor([[13.74634, 100.53192], [13.74652, 100.53215], [13.74640, 100.53265], [13.74618, 100.53288]]); // ทางหลักในตึก (ชั้น 2) จบที่ฝั่งใต้เพื่อลงชั้น 1
        door(13.74634, 100.53192, "เข้า Siam Center ชั้น 2 (จากทางเชื่อม Siam Discovery)");
        corridor([[13.74652, 100.53215], [13.74672, 100.53225]], 7);  // แยกไปลิฟต์
        corridor([[13.74640, 100.53265], [13.74663, 100.53272]], 7);  // แยกไปห้องน้ำ
        esc(13.74646, 100.53242);
        lift(13.74676, 100.53228);
        wc(13.74668, 100.53276);
        label(13.74655, 100.53250, "SIAM CENTER");

        // ── ลงชั้น 1 (Starbucks) → ประตูทางออก (ฝั่ง ตอ.) → ลงบันได → เข้า BTS สยาม (จุดที่ user mark) ──
        esc(13.74620, 100.53290);  // บันไดเลื่อนลงชั้น 1 (ฝั่งใต้ SC)
        corridor([[13.74620, 100.53288], [13.74602, 100.53312], [13.74594, 100.53332], [13.74589, 100.53339]], 9); // ชั้น 1: Starbucks → ประตูทางออก → บันได → ทางเข้า BTS
        label(13.74606, 100.53312, "Starbucks<br/>ชั้น 1", "#b7eb3e");
        door(13.74594, 100.53332, "ประตูทางออก Siam Center (ชั้น 1)");
        stair(13.74589, 100.53339);  // ลูกศรเขียว = บันได/ทางเข้า BTS (จุดปลายทาง E)
        door(13.74589, 100.53339, "ทางเข้า BTS สยาม (ลงบันไดจากทางออก Siam Center ชั้น 1)");
        label(13.74581, 100.53345, "BTS สยาม", "#b7eb3e");

        // Siam Paragon — POI ข้างเคียง (เส้นทางไม่ผ่านแล้ว)
        label(13.74675, 100.53435, "SIAM PARAGON");
      }
      // แผนผังตึกโชว์เฉพาะตอน (1) เลือกเส้น Skywalk และ (2) ซูมใกล้พอ (≥16) — กันเห็นเป็น "กล่องดำ" ตอนมองภาพรวม
      ctx.current.updateIndoor = () => {
        const m = mapRef.current; if (!m || !ctx.current.indoorLayer) return;
        if (ctx.current.indoorOn && m.getZoom() >= 16) ctx.current.indoorLayer.addTo(m);
        else m.removeLayer(ctx.current.indoorLayer);
      };
      map.on("zoomend", () => ctx.current.updateIndoor?.());

      const toiletIcon = L.divIcon({ className: "", html: '<div style="font-size:12px;line-height:18px;background:#2a9d8f;color:white;border-radius:50%;width:18px;height:18px;text-align:center;font-weight:700">W</div>', iconSize: [18, 18], iconAnchor: [9, 9] });
      const camIcon = L.divIcon({ className: "", html: '<div style="font-size:11px;line-height:18px;background:#1b998b;color:white;border-radius:3px;width:18px;height:18px;text-align:center;font-weight:700">C</div>', iconSize: [18, 18], iconAnchor: [9, 9] });
      // วาดหมุดห้องน้ำ/กล้องแบบกันซ้ำ — ใช้ทั้งตอนโหลดย่าน demo และตอนค้นเส้นทางที่ออกนอกย่าน
      // เพื่อให้ "หมุด W บนแผนที่" ตรงกับ "ห้องน้ำที่ AI ตอบ" (ก่อนหน้านี้คนละชุดข้อมูลเลยไม่สัมพันธ์กัน)
      ctx.current.toiletSeen = new Set(); ctx.current.camSeen = new Set();
      ctx.current.osmToilets = []; ctx.current.osmCameras = []; // เก็บไว้ส่งให้โหมด 3D ด้วย
      ctx.current.addOsmMarkers = (osm) => {
        if (!osm) return;
        for (const t of (osm.toilets || [])) { const [lon, lat] = t.pt; const k = lon.toFixed(5) + "," + lat.toFixed(5); if (ctx.current.toiletSeen.has(k)) continue; ctx.current.toiletSeen.add(k); ctx.current.osmToilets.push(t); const name = t.tags?.name || t.tags?.["name:th"] || "ห้องน้ำสาธารณะ"; L.marker([lat, lon], { icon: toiletIcon }).bindPopup(`<b>ห้องน้ำ: ${name}</b>`).addTo(toiletsLayer); }
        for (const cpt of (osm.cameras || [])) { const [lon, lat] = cpt; const k = lon.toFixed(5) + "," + lat.toFixed(5); if (ctx.current.camSeen.has(k)) continue; ctx.current.camSeen.add(k); ctx.current.osmCameras.push(cpt); L.marker([lat, lon], { icon: camIcon }).bindPopup("กล้อง CCTV (OSM)").addTo(cctvLayer); }
        setToilets(ctx.current.toiletSeen.size); setCams(ctx.current.camSeen.size);
      };

      // ความสูงตึกจริง 374 หลัง (Google Open Buildings 2.5D — ไฟล์เดียวกับ shade demo 3D)
      // ใช้คำนวณ "% ร่มจากเงาตึก" ของแต่ละเส้นทาง
      (async () => {
        try {
          const r = await fetch("/data/walkbkk_heights_2023.geojson");
          if (!r.ok) return;
          const gj = await r.json();
          const bl = [];
          for (const f of gj.features || []) {
            const g = f.geometry; if (!g) continue;
            const h = (f.properties && (f.properties.height || f.properties.height_mean)) || 12;
            const rings = g.type === "Polygon" ? [g.coordinates[0]] : g.type === "MultiPolygon" ? g.coordinates.map((cc) => cc[0]) : [];
            for (const ring of rings) if (ring && ring.length >= 4) bl.push({ ring, h });
          }
          ctx.current.bldgs = bl;
          // กราฟทางเท้าอาจสร้างเสร็จก่อนข้อมูลตึก → rebuild เพื่อตัด snap edge ที่ลัดทะลุตึกออก แล้วคิดเส้นใหม่
          if (ctx.current.walkNetWays) { ctx.current.walkNet = buildGraph(ctx.current.walkNetWays, bl); ctx.current.refresh?.(ctx.current.lastOsm || null, false); }
        } catch (e) {}
      })();

      // โหลดโครงข่ายทางเท้า OSM มาสร้างกราฟสำหรับ routing ถ่วงน้ำหนักไฟ/ร่ม (cache ใน localStorage)
      // พร้อมเมื่อไหร่ → คำนวณเส้นทางที่ค้างอยู่ใหม่ทันที (กันกรณีผู้ใช้ค้นหาก่อนกราฟโหลดเสร็จ)
      fetchWalkNet(DEMO_BBOX).then((d) => {
        if (cancelled || !d) return;
        ctx.current.walkNetWays = d.ways; // เก็บ ways ดิบไว้ rebuild เมื่อข้อมูลตึกมาถึง (กรอง snap ทะลุตึกได้ครบ)
        ctx.current.walkNet = buildGraph(d.ways, ctx.current.bldgs);
        ctx.current.refresh?.(ctx.current.lastOsm || null, false);
      }).catch(() => {});
      ctx.current.osmPromise = fetchOSM(DEMO_BBOX).then((osm) => {
        if (cancelled) return osm;
        ctx.current.addOsmMarkers(osm); ctx.current.crossings = osm.crossings || [];
        ctx.current.addCrossMarkers?.(osm.crossings);
        ctx.current.addSkywalks?.(osm.coveredWays);
        return osm;
      });

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
        c.indoorOn = false; c.updateIndoor?.(); // ล้างแผนผังในตึกของการค้นครั้งก่อน
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
        // 🌉 Skywalk + 🛣 ถนนใหญ่ = candidate ประจำ (เส้นจากกราฟจะถูกเพิ่มสดใน refresh เพราะเปลี่ยนตามเวลา)
        const sky = skywalkRoute(start, end);
        if (sky) routes.push(sky);
        const mr = mainRoadRoute(start, end);
        if (mr) routes.push(mr);
        const nl = nightLampRoute(start, end); // 💡 เส้นไฟกลางคืน (โดนบูสต์เฉพาะโหมดกลางคืน — ดู scoreRoutes)
        if (nl) routes.push(nl);
        c.baseRoutes = routes; c.lastStart = start; c.lastEnd = end; c.sName = sName; c.eName = eName; c.note = note; c.lastOsm = null;
        c.routeKey = key;
        // หมุดปักชัดเจน: วงกลมใหญ่ขอบขาว + หางปักลงจุด + ป้ายกำกับด้านบน (start=เขียว, end=แดง)
        const pinIcon = (letter, bg, tag, glow) => L.divIcon({
          className: "",
          html: `<div style="display:flex;flex-direction:column;align-items:center;filter:drop-shadow(0 3px 5px rgba(0,0,0,.6))">
            <div style="background:${bg};color:#fff;font-weight:800;font-size:10.5px;letter-spacing:.5px;padding:2px 9px;border-radius:999px;white-space:nowrap;border:1.5px solid #fff;margin-bottom:2px">${tag}</div>
            <div style="background:${bg};color:#fff;border:3px solid #fff;border-radius:50%;width:32px;height:32px;display:grid;place-items:center;font-weight:800;font-size:16px;line-height:1;box-shadow:0 0 0 4px ${glow}">${letter}</div>
            <div style="width:0;height:0;border-left:7px solid transparent;border-right:7px solid transparent;border-top:12px solid #fff;margin-top:-1px"></div>
          </div>`,
          iconSize: [80, 68], iconAnchor: [40, 64],
        });
        // วาดหมุด+เส้นใหม่ทุกรอบ (เส้นจากกราฟเปลี่ยนรูปตามเวลา) · โชว์เฉพาะ 2 เส้นที่ถูกเลือก
        c.redrawRoutes = (cands) => {
          c.routeLayer.clearLayers();
          // 📍 หมุด S/E ปักที่ "จุดที่ผู้ใช้ค้น" เสมอ — ไม่เกาะปลายเส้น (เส้นชนะแต่ละเวลาเริ่ม/จบต่างกัน หมุดจะกระโดดไปมา)
          // ปลายเส้นจริงห่างหมุด >25 ม. → วาดเส้นประเชื่อมให้เห็นว่าเดินเข้า/ออกแนวเส้นทางอีกนิด
          const bc = (cands[c.best] && cands[c.best].coordinates) || [[start[0], start[1]], [end[0], end[1]]];
          const sPt = c.lastStart || bc[0], ePt = c.lastEnd || bc[bc.length - 1];
          const connectPin = (pin, pt) => { if (haversine(pin, pt) > 25) L.polyline([[pin[1], pin[0]], [pt[1], pt[0]]], { color: "#9db7e8", weight: 3, opacity: 0.7, dashArray: "3 7" }).addTo(c.routeLayer); };
          connectPin(sPt, bc[0]); connectPin(ePt, bc[bc.length - 1]);
          L.marker([sPt[1], sPt[0]], { icon: pinIcon("S", "#16a34a", "จุดเริ่ม", "rgba(22,163,74,.35)"), zIndexOffset: 1000 }).bindPopup("จุดเริ่ม: " + sName).addTo(c.routeLayer);
          L.marker([ePt[1], ePt[0]], { icon: pinIcon("E", "#dc2626", "ปลายทาง", "rgba(220,38,38,.35)"), zIndexOffset: 1000 }).bindPopup("ปลายทาง: " + eName).addTo(c.routeLayer);
          c.polylines = cands.map((r) => L.polyline(r.coordinates.map(([lon, lat]) => [lat, lon]), { color: "#888", weight: 4, opacity: 0.6, dashArray: "6 6" }).addTo(c.routeLayer));
          c.select = (i) => {
            c.polylines.forEach((pl, j) => {
              const shown = !c.picks || j === c.picks.comfortIdx || j === c.picks.fastIdx;
              if (!shown) { pl.setStyle({ opacity: 0 }); return; }
              if (j === i) pl.setStyle({ color: "#35c4f0", weight: 6, opacity: 1, lineCap: "round", dashArray: cands[j].skywalk ? "1 10" : null }).bringToFront();
              else pl.setStyle({ color: "#888", weight: 4, opacity: 0.5, dashArray: "6 6" });
            });
            c.indoorOn = !!cands[i]?.skywalk; c.updateIndoor?.();
            setActive(i);
          };
        };
        // คำนวณ candidates + คะแนน + วาด — ใช้ร่วมกัน 3 ทาง: ตอบเร็ว (osm=null), เติม OSM แล้ว, และตอนเลื่อนเวลา
        c.refresh = (osm, fit) => {
          const cands = c.baseRoutes.map((r, i) => ({ ...r, index: i }));
          // ต้นทาง MBK ช่วง "ห้างปิด" (ก่อน 10:00 / หลัง 22:00) → เส้นกราฟเริ่มที่ประตูระดับพื้นเสมอ
          // (เดิมเช็คแค่กลางคืน — 07:00-09:59 เลยเริ่ม "กลางห้าง" ทั้งที่ MBK ยังไม่เปิด)
          const hhG = c.routeHour ?? new Date().getHours();
          const mbkClosed = (hhG < 10 || hhG >= 22) && c.lastStart && haversine(c.lastStart, MBK_L2) < 150;
          const gStart = mbkClosed ? MBK_NIGHT_EXIT : c.lastStart;
          const g = c.walkNet ? graphRoute(c.walkNet, gStart, c.lastEnd, c.routeHour, c.lampGrid, c.bldgs, osm) : null;
          if (g) { g.index = cands.length; cands.push(g); }
          const scored = scoreRoutes(cands, osm || { ok: false, trees: [], green: [], toilets: [], cameras: [] }, c.problems, c.lamps, c.bldgs, c.routeHour);
          const picks = pickRoutes(scored);
          c.picks = picks;
          const best = picks.comfortIdx;
          c.best = best; c.scored = scored.map((r, i) => ({ ...r, recommended: i === best }));
          c.redrawRoutes(cands);
          c.select(best);
          if (fit && mapRef.current && c.polylines[best]) mapRef.current.fitBounds(c.polylines[best].getBounds().pad(0.15));
          setRouteData({ routes: scored, best, picks, graphOk: !!g, osmOk: !!(osm && osm.ok), startName: c.sName, endName: c.eName, note: c.note, scoring: !osm });
          return scored;
        };
        c.refresh(null, true); // ตอบทันที ไม่รอ OSM
        // เติมข้อมูล OSM (ร่มต้นไม้/ห้องน้ำ/ทางข้าม) เบื้องหลัง แล้วคิดใหม่
        let lons = [], lats = []; routes.forEach((r) => r.coordinates.forEach(([lo, la]) => { lons.push(lo); lats.push(la); }));
        const within = Math.min(...lats) >= DEMO_BBOX[0] && Math.min(...lons) >= DEMO_BBOX[1] && Math.max(...lats) <= DEMO_BBOX[2] && Math.max(...lons) <= DEMO_BBOX[3];
        const mg = 0.004;
        const lo0 = Math.min(...lons), la0 = Math.min(...lats), lo1 = Math.max(...lons), la1 = Math.max(...lats);
        (async () => {
          const osm = within ? await c.osmPromise : await fetchOSM([la0 - mg, lo0 - mg, la1 + mg, lo1 + mg]);
          if (c.routeKey !== key) return;
          if (osm.crossings && osm.crossings.length) { c.crossings = osm.crossings; c.addCrossMarkers?.(osm.crossings); }
          c.addSkywalks?.(osm.coveredWays);
          if (c.addOsmMarkers) c.addOsmMarkers(osm); // วาดหมุดห้องน้ำ/กล้องของย่านเส้นทางนี้
          c.lastOsm = osm;
          const full = c.refresh(osm, false);
          // เติมชื่อตึก/ย่านของห้องน้ำด้วย reverse geocode (เบื้องหลัง + cache)
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
            c.scored = full.map((r, i) => ({ ...r, recommended: i === c.best }));
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
    // ห้องน้ำใกล้สุด "ข้างหน้า" ตามแนวเดิน (ใช้ along ที่วัดแบบตั้งฉากแม่นแล้ว) — ตรงกับสถานการณ์ "เดินอยู่แล้วอยากเข้าห้องน้ำ"
    let toiletAhead = null, tbest = Infinity;
    const userAlong = n.cum[idx];
    for (const t of (n.toilets || [])) {
      if (!t || t.along == null) continue;
      const ahead = t.along - userAlong;          // ระยะตามแนวเดินถึงห้องน้ำ
      if (ahead < -10 || ahead > 300) continue;   // ผ่านไปแล้ว / ไกลเกินไป
      if ((t.off || 0) > 90) continue;            // เบี่ยงออกจากทางไกลเกิน
      const walk = Math.max(0, ahead) + (t.off || 0); // ระยะเดินจริงโดยประมาณ (เลือกอันที่ถึงเร็วสุด)
      if (walk < tbest) { tbest = walk; toiletAhead = { dist: Math.max(0, Math.round(ahead)), off: Math.round(t.off || 0), name: t.name || "ห้องน้ำ", where: [t.place, t.road].filter(Boolean).join(" · "), id: (t.pt || []).join(",") }; }
    }
    const arrived = distDest < 20;
    setNav({ active: true, instr, distTurn, distDest, hazard, arrived, cross: crossAhead, toilet: toiletAhead });
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
      if (toiletAhead && toiletAhead.dist <= 45 && c.spokenToilet && !c.spokenToilet.has(toiletAhead.id)) { c.spokenToilet.add(toiletAhead.id); const tm = rnd(toiletAhead.dist); speak(en ? `Toilet ${tm} meters ahead` : `ห้องน้ำอีก ${tm} เมตรข้างหน้า`, lang); }
      if (arrived && !c.spokenArrived) { c.spokenArrived = true; speak(en ? "You have arrived" : "ถึงปลายทางแล้ว", lang); }
    }
  }
  function onPos(pos) { updateNav([pos.coords.longitude, pos.coords.latitude]); }
  function onErr() { setNav((p) => ({ ...(p || { active: true }), instr: "เปิด GPS ไม่สำเร็จ — อนุญาตตำแหน่ง แล้วเปิดเว็บแบบ HTTPS บนมือถือ", distTurn: null, distDest: null, hazard: null })); }
  function startNav(i) {
    const c = ctx.current, L = c.L; const r = c.scored?.[i]; if (!r || !L) return;
    const coords = r.coordinates; const cum = [0];
    for (let k = 1; k < coords.length; k++) cum[k] = cum[k - 1] + haversine(coords[k - 1], coords[k]);
    c.nav = { coords, cum, steps: r.steps || [], toilets: r.toiletList || [] };
    c.spokenTurns = new Set(); c.spokenHaz = new Set(); c.spokenCross = new Set(); c.spokenToilet = new Set(); c.spokenArrived = false; c.prevPos = null; c.straightSpoken = false;
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
    c.nav = { coords, cum, steps: r.steps || [], toilets: r.toiletList || [] };
    c.spokenTurns = new Set(); c.spokenHaz = new Set(); c.spokenCross = new Set(); c.spokenToilet = new Set(); c.spokenArrived = false; c.prevPos = null; c.straightSpoken = false;
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
  function doSearch() { const f = sFrom.trim(), t = sTo.trim(); setSearchOpen(false); setRouteSheetOpen(false); try { apiRef?.current?.showRoutes?.(f || null, t || null); } catch (e) {} }
  // เปลี่ยน "เวลาเดินทาง" → คำนวณเส้นจากกราฟ + คะแนนใหม่ทั้งชุด (เส้น comfort เปลี่ยนรูปตามเวลา!)
  function rescore(h) {
    const c = ctx.current;
    c.routeHour = h;
    if (c.refresh && c.baseRoutes) c.refresh(c.lastOsm || null, false);
  }
  // เปิด/ปิดเลเยอร์บนแผนที่ตาม chip (Figma: Street_light / button_Skywalk / traffyF / buttonToilet)
  function toggleChip(k) {
    const c = ctx.current;
    setChips((p) => {
      const on = !p[k];
      if (c.layers && mapRef.current) {
        const groups = { light: [c.layers.light], cross: [c.layers.cross], toilet: [c.layers.toilets] }[k] || [];
        groups.forEach((g) => { if (!g) return; if (on) g.addTo(mapRef.current); else mapRef.current.removeLayer(g); });
      }
      return { ...p, [k]: on };
    });
  }
  const CHIP_DEFS = [
    { k: "light", label: "💡 Street light" },
    { k: "cross", label: "🚶 ทางเชื่อม /Skywalk" },
    { k: "toilet", label: "🚻 ห้องน้ำ" },
  ];

  const navTarget = active ?? (routeData && !routeData.error && !routeData.loading ? routeData.best : null);

  return (
    <div className="bdi-mapwrap" style={{ position: "relative", height: "100%", width: "100%" }}>
      <style>{`
        .wb-card{position:absolute;background:var(--bdi-surface);border:1px solid var(--bdi-line);color:var(--bdi-text);border-radius:14px;box-shadow:0 4px 18px rgba(0,0,0,.45);font-family:inherit;z-index:1000;}
        .wb-route{left:10px;right:10px;bottom:10px;padding:0 14px 12px;z-index:1300;max-height:52%;overflow:auto;}
        .wb-nav{top:0;left:0;right:0;border-radius:0;background:linear-gradient(90deg,#0e0618,#3d1d5e);color:#fff;padding:calc(12px + env(safe-area-inset-top)) 16px 12px;z-index:1700;border:none;}
        .wb-startbtn{display:block;width:100%;margin-top:8px;padding:10px;border:none;border-radius:10px;background:var(--bdi-green);color:#14081f;font-weight:800;font-size:14px;cursor:pointer;}
        .wb-search{left:10px;right:10px;top:calc(56px + env(safe-area-inset-top));padding:10px 12px;z-index:1450;}
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
              {nav.toilet ? <div style={{ marginTop: 6, background: "#0f8a8a", borderRadius: 6, padding: "5px 8px", fontWeight: 700, fontSize: 14 }}>🚻 ห้องน้ำข้างหน้า ~{nav.toilet.dist} ม.{nav.toilet.off ? ` (เบี่ยงจากทาง ~${nav.toilet.off} ม.)` : ""}{nav.toilet.where ? ` · ${nav.toilet.where}` : ""}</div> : null}
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button onClick={toggleVoiceLang} style={{ background: "rgba(255,255,255,.25)", border: "none", color: "#fff", borderRadius: 8, padding: "8px 10px", fontWeight: 700, cursor: "pointer", fontSize: 13 }}>{voiceLang === "en" ? "EN" : "ไทย"}</button>
              <button onClick={toggleVoice} style={{ background: "rgba(255,255,255,.25)", border: "none", color: "#fff", borderRadius: 8, padding: "8px 11px", fontWeight: 700, cursor: "pointer", fontSize: 16 }}>{voice ? "🔊" : "🔇"}</button>
              <button onClick={stopNav} style={{ background: "rgba(255,255,255,.25)", border: "none", color: "#fff", borderRadius: 8, padding: "8px 12px", fontWeight: 700, cursor: "pointer" }}>หยุด</button>
            </div>
          </div>
        </div>
      ) : null}

      {/* กล่องค้นหาแบบ Figma — พับเป็นแถบ "จะไปไหนดี?" กดแล้วกางเป็น ต้นทาง/ปลายทาง (SrcDectPage) */}
      {!nav?.active ? (
      <div className="wb-card wb-search">
        {!searchOpen ? (
          <div onClick={() => setSearchOpen(true)} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", padding: "3px 2px" }}>
            <span style={{ fontWeight: 700, fontSize: 14, color: sTo ? "var(--bdi-text)" : "var(--bdi-text-dim)" }}>{sTo ? `→ ${sTo}` : "จะไปไหนดี?"}</span>
            <span style={{ color: "var(--bdi-green)", fontWeight: 800, fontSize: 16 }}>⌄</span>
          </div>
        ) : (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <span style={{ fontWeight: 800, fontSize: 14 }}>จะไปไหนดี?</span>
              <span onClick={() => setSearchOpen(false)} style={{ cursor: "pointer", color: "var(--bdi-text-dim)", fontSize: 15 }}>✕</span>
            </div>
            <PlaceInput value={sFrom} onChange={setSFrom} onEnter={doSearch} onPick={async (sg) => { let coord = sg.coord; if (sg.src === "landmark" && sg.lm) { try { const r = await resolveLandmark(sg.lm); if (r?.coord) coord = r.coord; } catch (e) {} } setSFrom(sg.name); ctx.current.placeCache[sg.name] = { coord, name: sg.name }; }} placeholder="⦿ ต้นทาง (Current Location)" />
            <div style={{ height: 6 }} />
            <PlaceInput value={sTo} onChange={setSTo} onEnter={doSearch} onPick={async (sg) => { let coord = sg.coord; if (sg.src === "landmark" && sg.lm) { try { const r = await resolveLandmark(sg.lm); if (r?.coord) coord = r.coord; } catch (e) {} } setSTo(sg.name); ctx.current.placeCache[sg.name] = { coord, name: sg.name }; }} placeholder="📍 ปลายทาง (เช่น BTS สยาม)" />
            <button className="bdi-btn" style={{ marginTop: 8 }} onClick={doSearch}>ค้นหาเส้นทาง</button>
          </>
        )}
      </div>
      ) : null}

      {/* Chips เปิด/ปิดเลเยอร์ ตาม Figma (Frame 20) */}
      {!nav?.active ? (
        <div className="bdi-chips" style={{ top: `calc(${searchOpen ? 246 : 106}px + env(safe-area-inset-top))` }}>
          {CHIP_DEFS.map((c) => (
            <button type="button" key={c.k} className={"bdi-chip" + (chips[c.k] ? " on" : "")} onClick={() => toggleChip(c.k)}>{c.label}</button>
          ))}
        </div>
      ) : null}

      {/* แผงล่าง: การ์ดสไลเดอร์เวลา (แยกเดี่ยว เห็นตลอด) + ชีตรายละเอียดเส้นทาง (พับได้ ดีฟอลต์พับ) */}
      {routeData && !nav?.active ? (
        <div style={{ position: "absolute", left: 10, right: 10, bottom: 10, zIndex: 1300, display: "flex", flexDirection: "column", gap: 8 }}>
          {!routeData.loading && !routeData.error && routeData.routes?.length ? (
            <div className="bdi-card" style={{ padding: "10px 14px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12.5, color: "var(--bdi-text-dim)", marginBottom: 2 }}>
                <span>🕐 เวลาเดินทาง: <b style={{ color: "var(--bdi-text)", fontSize: 14 }}>{String(routeHour ?? new Date().getHours()).padStart(2, "0")}:00</b> {(routeHour ?? new Date().getHours()) >= 7 && (routeHour ?? new Date().getHours()) < 18 ? "☀️" : "🌙"}</span>
                <span onClick={() => { setRouteHour(null); rescore(null); }} style={{ color: "var(--bdi-green)", cursor: "pointer", fontWeight: 700, fontSize: 12 }}>⟳ ตอนนี้</span>
              </div>
              <input type="range" min={0} max={23} step={1} value={routeHour ?? new Date().getHours()}
                onChange={(e) => { const v = parseInt(e.target.value, 10); setRouteHour(v); rescore(v); }}
                style={{ width: "100%", accentColor: "var(--bdi-green)", cursor: "pointer" }} />
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--bdi-text-dim)" }}>
                <span>00</span><span>06</span><span>12</span><span>18</span><span>23</span>
              </div>
              {routeData.graphOk === false ? <div style={{ fontSize: 11, color: "#f4b860", marginTop: 4 }}>⏳ โครงข่ายทางเท้า OSM กำลังโหลด — เส้นแนะนำจะแม่นขึ้นอัตโนมัติเมื่อพร้อม</div> : null}
              {/* เส้นบนแผนที่ = เส้นคะแนนสูงสุดของเวลานั้นเสมอ */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 7, fontSize: 13 }}>
                <span style={{ color: "var(--bdi-text-dim)" }}>เส้นที่ดีที่สุดเวลานี้: <b style={{ color: "var(--bdi-green)" }}>{routeData.routes[routeData.best]?.skywalk ? "🌉 ทางร่ม Skywalk" : routeData.routes[routeData.best]?.night ? "💡 ทางสว่างที่สุด" : "⛱ ทางร่มที่สุด"}</b>{routeData.picks && routeData.picks.comfortIdx === routeData.picks.fastIdx ? <span style={{ color: "var(--bdi-text-dim)" }}> (เส้นเดียวกับ ⚡ เร็วที่สุด)</span> : null}</span>
                <b style={{ color: "var(--bdi-green)", fontSize: 17 }}>{routeData.routes[routeData.best]?.comfort ?? ""}</b>
              </div>
            </div>
          ) : null}

          <div className="bdi-card" style={{ maxHeight: "38vh", overflow: "auto", padding: "0 14px 10px" }}>
          <div className="bdi-sheet-handle" onClick={() => setRouteSheetOpen((v) => !v)} style={{ position: "sticky", top: 0, background: "var(--bdi-surface)", margin: "0 -14px", padding: "12px 16px", zIndex: 1 }}>
            <span>{routeData.loading ? "กำลังหาเส้นทาง…" : `รายละเอียดเส้นทาง (${routeData.picks ? new Set([routeData.picks.comfortIdx, routeData.picks.fastIdx]).size : routeData.routes?.length || 0} เส้น)`}</span>
            <span style={{ color: "var(--bdi-green)", fontSize: 15 }}>{routeSheetOpen ? "⌄" : "⌃"}</span>
          </div>
          {routeSheetOpen ? (routeData.loading ? <div style={{ fontSize: 13, color: "var(--bdi-text-dim)" }}>กำลังคำนวณเส้นทาง…</div> : routeData.error ? <div style={{ fontSize: 12, color: "var(--bdi-danger)" }}>ใช้ไม่ได้: {routeData.error}</div> : (
            <div>
              <div style={{ fontSize: 12.5, color: "var(--bdi-text-dim)", marginBottom: 6 }}>{routeData.startName || "สยาม"} → {routeData.endName || "จุฬาฯ"}</div>
              {/* 🌉 เส้นที่เลือกเป็นทางเชื่อม → banner "ออกทางเชื่อม" + เปิดแผนผังชั้น (Figma: route+noti) */}
              {routeData.routes[navTarget]?.skywalk && !routeData.routes[navTarget]?.mallClosed ? (
                <div onClick={() => { if (mapRef.current) mapRef.current.setView([13.74616, 100.53228], 18); }} style={{ background: "rgba(183,235,62,.13)", border: "1px solid var(--bdi-green)", borderRadius: 12, padding: "10px 12px", margin: "2px 0 8px", cursor: "pointer" }}>
                  <div style={{ fontWeight: 800, fontSize: 13, color: "var(--bdi-green)" }}>🌉 ออกทางเชื่อม: ไปยังชั้น 2 ของ MBK เดินมาที่โซน A (ฝั่ง Don Don Donki)</div>
                  <div style={{ fontSize: 11.5, color: "var(--bdi-text-dim)", marginTop: 2 }}>Skywalk → Siam Discovery → Siam Center → Paragon → BTS สยาม · แตะเพื่อซูมดูแผนผังในตึก</div>
                </div>
              ) : null}
              {/* โชว์แค่ 2 ตัวเลือก: ทางร่ม/สว่างที่สุด + ทางเร็วที่สุด (ถ้าเป็นเส้นเดียวกันจะเห็นใบเดียว 2 ป้าย) */}
              {[...new Set([routeData.picks?.comfortIdx ?? routeData.best, routeData.picks?.fastIdx].filter((x) => x != null && routeData.routes[x]))].map((idx) => {
                const r = routeData.routes[idx];
                const isComfort = idx === (routeData.picks?.comfortIdx ?? routeData.best);
                const isFast = idx === routeData.picks?.fastIdx;
                return (
                  <button key={r.index} onClick={() => ctx.current.select(r.index)} className={"bdi-route-opt" + (active === r.index ? " on" : "")}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {isComfort ? <span className="bdi-badge">{r.skywalk ? "🌉 ทางร่ม Skywalk" : r.night ? "💡 ทางสว่างที่สุด" : "⛱ ทางร่มที่สุด"}</span> : null}
                        {isFast ? <span className="bdi-badge" style={isComfort ? { background: "rgba(255,255,255,.15)", color: "var(--bdi-text)" } : {}}>⚡ เร็วที่สุด</span> : null}
                      </span>
                      {r.comfort != null ? <span style={{ fontWeight: 800, fontSize: 18, color: "var(--bdi-green)" }}>{r.comfort}</span> : null}
                    </div>
                    <div className="bdi-stats">
                      {r.shade != null ? <span>⛱ ร่ม {r.shade}%</span> : null}
                      {r.light != null ? <span>💡 สว่าง {r.light}%</span> : null}
                      <span>📏 {(r.distance_m / 1000).toFixed(2)} KM</span>
                      <span>🔥 {Math.round(r.distance_m * 0.053)} kcal</span>
                      <span>⏱ {r.duration_min} MINS</span>
                    </div>
                    {r.skywalk ? <div style={{ fontSize: 11.5, color: "var(--bdi-green)", marginTop: 3 }}>เดินใต้หลังคา/ทะลุห้างเกือบตลอดเส้น — หลบแดดได้</div> : null}
                    {r.mainroad ? <div style={{ fontSize: 11.5, color: "var(--bdi-text-dim)", marginTop: 3 }}>เดินเลียบพระราม 1 ไม่มุดซอย — % สว่างนับเฉพาะเสาไฟ กทม.</div> : null}
                    {r.nightlamp ? <div style={{ fontSize: 11.5, color: "var(--bdi-green)", marginTop: 3 }}>💡 เลาะแนวเสาไฟ BMA หนาแน่น (~14 ต้นตลอดแนว) — ทางสว่าง ไม่เปลี่ยว ยอมอ้อมนิดเพื่อเดินใต้ไฟ</div> : null}
                    {r.graphed ? <div style={{ fontSize: 11.5, color: "var(--bdi-green)", marginTop: 3 }}>🧭 คำนวณจากโครงข่ายทางเท้าจริง — เลือกเดินช่วงที่{r.night ? "มีไฟถนน BMA" : "อยู่ในเงาตึก/ใต้หลังคา"}</div> : null}
                  </button>
                );
              })}
              {navTarget != null ? (
                <div style={{ marginTop: 8 }}>
                  <button className="wb-startbtn" onClick={() => { unlockSpeech(); startNav(navTarget); }}>▶ เริ่มนำทาง (GPS)</button>
                  <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                    <button className="wb-startbtn bdi-btn ghost" style={{ marginTop: 0, background: "rgba(255,255,255,.1)", color: "var(--bdi-text)" }} onClick={() => { unlockSpeech(); const r = ctx.current.scored?.[navTarget]; if (r) setNav3D({ route: r, problems: ctx.current.problems, toilets: ctx.current.osmToilets, cameras: ctx.current.osmCameras, destName: routeData?.endName || "ปลายทาง" }); }}>🧭 นำทาง 3D</button>
                    <button className="wb-startbtn" style={{ marginTop: 0, background: "rgba(255,255,255,.1)", color: "var(--bdi-text)" }} onClick={() => { unlockSpeech(); startSim(navTarget); }}>🧪 จำลอง 2D</button>
                  </div>
                </div>
              ) : null}
              {routeData.note ? <div style={{ fontSize: 11, color: "#f4b860", marginTop: 4 }}>{routeData.note}</div> : null}
              {routeData.routes[0]?.timeMode ? <div style={{ fontSize: 11, color: "var(--bdi-text-dim)", marginTop: 4 }}>โหมดเวลา: {routeData.routes[0].timeMode}</div> : null}
              {routeData.scoring ? <div style={{ fontSize: 11, color: "var(--bdi-text-dim)" }}>กำลังเติมคะแนนร่ม/สวน/ห้องน้ำ…</div> : null}
            </div>
          )) : null}
          </div>
        </div>
      ) : null}

      {/* ปุ่มเลือกชั้น 2/1/M/G ลอยซ้ายแบบ Figma — โชว์เมื่อเลือกเส้น Skywalk */}
      {routeData?.routes?.[navTarget]?.skywalk && !nav?.active ? (
        <div style={{ position: "absolute", left: 10, top: "34%", zIndex: 1200, display: "flex", flexDirection: "column", gap: 8 }}>
          {["2", "1", "M", "G"].map((f) => (
            <button key={f} onClick={() => setFloor(f)}
              style={{ width: 38, height: 38, borderRadius: 12, border: "none", cursor: "pointer", fontWeight: 800, fontSize: 14, boxShadow: "0 3px 10px rgba(0,0,0,.45)", background: floor === f ? "var(--bdi-green)" : "#c85df0", color: floor === f ? "#14081f" : "#fff" }}>
              {f}
            </button>
          ))}
        </div>
      ) : null}

      {/* ปุ่ม relocate แบบ Figma — กลับไปมุมมองเส้นทาง/กลางย่าน */}
      {!nav?.active ? (
        <button onClick={() => { const c = ctx.current; const r = c.scored?.[navTarget]; if (r && mapRef.current && c.L) mapRef.current.fitBounds(c.L.polyline(r.coordinates.map(([lo, la]) => [la, lo])).getBounds().pad(0.2)); else if (mapRef.current) mapRef.current.setView(CENTER, ZOOM); }}
          style={{ position: "absolute", right: 12, bottom: routeData ? (routeSheetOpen ? "58%" : 224) : 120, zIndex: 1200, width: 46, height: 46, borderRadius: "50%", border: "none", background: "var(--bdi-green)", color: "#14081f", fontSize: 20, fontWeight: 800, cursor: "pointer", boxShadow: "0 4px 14px rgba(0,0,0,.5)" }}>◎</button>
      ) : null}

      {nav3d ? <Nav3D route={nav3d.route} problems={nav3d.problems} toilets={nav3d.toilets} cameras={nav3d.cameras} destName={nav3d.destName} onClose={() => setNav3D(null)} /> : null}
    </div>
  );
}
