"use client";

import { useEffect, useRef, useState } from "react";

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
function speak(text) { try { if (!window.speechSynthesis) return; const u = new SpeechSynthesisUtterance(text); u.lang = "th-TH"; u.rate = 1; window.speechSynthesis.speak(u); } catch (e) {} }

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
  const b = bbox.join(",");
  const q = `[out:json][timeout:25];(node["natural"="tree"](${b});node["amenity"="toilets"](${b});way["leisure"="park"](${b});way["landuse"="grass"](${b});way["natural"="water"](${b});way["natural"="wood"](${b});node["man_made"="surveillance"](${b}););out center;`;
  for (const url of OVERPASS_MIRRORS) {
    const controller = new AbortController(); const t = setTimeout(() => controller.abort(), 25000);
    try {
      const res = await fetch(url, { method: "POST", body: "data=" + encodeURIComponent(q), headers: { "Content-Type": "application/x-www-form-urlencoded" }, signal: controller.signal });
      clearTimeout(t); if (!res.ok) continue;
      const json = await res.json();
      const trees = [], buildings = [], toilets = [], green = [], cameras = [];
      for (const el of json.elements || []) {
        const lat = el.lat ?? el.center?.lat, lon = el.lon ?? el.center?.lon; if (lat == null || lon == null) continue;
        const pt = [lon, lat], tg = el.tags || {};
        if (tg.man_made === "surveillance") cameras.push(pt);
        else if (tg.natural === "tree") { trees.push(pt); green.push(pt); }
        else if (tg.amenity === "toilets") toilets.push({ pt, tags: tg });
        else if (tg.building) buildings.push(pt);
        else if (tg.leisure === "park" || tg.landuse === "grass" || tg.natural === "wood" || tg.natural === "water") green.push(pt);
      }
      return { trees, buildings, toilets, green, cameras, ok: true };
    } catch (e) { clearTimeout(t); continue; }
  }
  return { ok: false, trees: [], buildings: [], toilets: [], green: [], cameras: [] };
}
function scoreRoutes(routes, osm, problems) {
  const shadePts = osm.trees;
  const toiletPts = osm.toilets.map((t) => t.pt);
  const allHaz = problems.map((p) => p.pt);
  const floodPts = problems.filter((p) => p.cat === "flood").map((p) => p.pt);
  const darkPts = problems.filter((p) => p.cat === "light").map((p) => p.pt);
  return routes.map((r) => {
    const samples = sampleLine(r.coordinates, 25);
    const hazards = countNear(samples, allHaz, 30);
    const cams = countNear(samples, osm.cameras, 40);
    const floodN = countNear(samples, floodPts, 30);
    const darkN = countNear(samples, darkPts, 30);
    const shadeR = ratioNear(samples, shadePts, 25);
    const greenR = ratioNear(samples, osm.green, 40);
    const toiletsN = countNear(samples, toiletPts, 150);
    const safe = Math.max(0, Math.min(100, Math.round(100 * Math.exp(-hazards / 12)) + Math.min(15, cams * 3)));
    const shade = shadeR == null ? null : Math.round(shadeR * 100);
    const green = greenR == null ? null : Math.round(greenR * 100);
    const toilet = osm.ok ? Math.min(100, toiletsN * 34) : null;
    let num = 0, den = 0; const add = (v, w) => { if (v != null) { num += v * w; den += w; } };
    add(safe, W.safe); add(shade, W.shade); add(green, W.green); add(toilet, W.toilet);
    const comfort = den ? Math.round(num / den) : null;
    return { ...r, hazards, cameras: cams, floodN, darkN, safe, shade, green, toilet, toiletsNear: toiletsN, comfort };
  });
}
function comfortColor(v) { if (v == null) return "#888"; if (v >= 70) return "#2a9d54"; if (v >= 45) return "#e9a23b"; return "#c1121f"; }
function popupHtml(p) {
  const photo = p.photo ? `<img src="${p.photo}" alt="" style="width:100%;max-width:240px;border-radius:8px;margin-top:6px"/>` : "";
  const date = (p.timestamp || "").slice(0, 16); const lbl = CAT[p.cat]?.label || p.type || "ปัญหา";
  return `<div style="max-width:240px;font-family:system-ui"><div style="font-weight:700;color:${catColor(p.cat)}">${lbl}</div><div style="font-size:13px;margin:4px 0;white-space:pre-wrap">${(p.comment || "").slice(0, 240)}</div><div style="font-size:12px;color:#555">สถานะ: <b>${p.state || "-"}</b></div><div style="font-size:11px;color:#888">${date}</div>${photo}</div>`;
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

export default function MapView({ apiRef }) {
  const mapEl = useRef(null);
  const mapRef = useRef(null);
  const ctx = useRef({ L: null, routeLayer: null, problems: [], osmPromise: null, select: () => {}, scored: null });
  const [info, setInfo] = useState({ count: 0, source: "", loading: true });
  const [toilets, setToilets] = useState(null);
  const [cams, setCams] = useState(null);
  const [routeData, setRouteData] = useState(null);
  const [active, setActive] = useState(null);
  const [nav, setNav] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = await loadLeaflet();
      if (cancelled || mapRef.current) return;
      ctx.current.L = L;
      const map = L.map(mapEl.current).setView(CENTER, ZOOM);
      mapRef.current = map;
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap" }).addTo(map);
      const problemsLayer = L.layerGroup().addTo(map);
      const toiletsLayer = L.layerGroup().addTo(map);
      const cctvLayer = L.layerGroup().addTo(map);
      const routeLayer = L.layerGroup().addTo(map);
      ctx.current.routeLayer = routeLayer;
      L.control.layers(null, { "เส้นทางเดิน": routeLayer, "จุดร้องเรียน (Traffy)": problemsLayer, "ห้องน้ำ (OSM)": toiletsLayer, "กล้อง CCTV (OSM)": cctvLayer }, { collapsed: true }).addTo(map);
      const toiletIcon = L.divIcon({ className: "", html: '<div style="font-size:12px;line-height:18px;background:#2a9d8f;color:white;border-radius:50%;width:18px;height:18px;text-align:center;font-weight:700">W</div>', iconSize: [18, 18], iconAnchor: [9, 9] });
      const camIcon = L.divIcon({ className: "", html: '<div style="font-size:11px;line-height:18px;background:#1b998b;color:white;border-radius:3px;width:18px;height:18px;text-align:center;font-weight:700">C</div>', iconSize: [18, 18], iconAnchor: [9, 9] });

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
        for (const t of osm.toilets) { const [lon, lat] = t.pt; const name = t.tags?.name || t.tags?.["name:th"] || "ห้องน้ำสาธารณะ"; L.marker([lat, lon], { icon: toiletIcon }).bindPopup(`<b>ห้องน้ำ: ${name}</b>`).addTo(toiletsLayer); }
        for (const c of osm.cameras) { const [lon, lat] = c; L.marker([lat, lon], { icon: camIcon }).bindPopup("กล้อง CCTV (OSM)").addTo(cctvLayer); }
        setToilets(osm.toilets.length); setCams(osm.cameras.length);
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
        let sName = "สยาม (BTS)", eName = "รพ.จุฬาฯ", sCoord = null, eCoord = null, note = null;
        if (from) { const g = await geocodeNominatim(from); if (g) { sCoord = g.coord; sName = g.name; } else note = `หา "${from}" ไม่เจอ ใช้จุดเริ่มต้นเดิม`; }
        if (to) { const g = await geocodeNominatim(to); if (g) { eCoord = g.coord; eName = g.name; } else note = (note ? note + " · " : "") + `หา "${to}" ไม่เจอ ใช้ปลายทางเดิม`; }
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
        const osm = within ? await c.osmPromise : await fetchOSM([Math.min(...lats) - mg, Math.min(...lons) - mg, Math.max(...lats) + mg, Math.max(...lons) + mg]);
        const scored = scoreRoutes(routes, osm, c.problems);
        const best = scored.reduce((bi, r, i, a) => ((r.comfort ?? -1) > (a[bi].comfort ?? -1) ? i : bi), 0);
        c.select(best);
        if (mapRef.current) mapRef.current.fitBounds(polylines[best].getBounds().pad(0.15));
        c.routeKey = key; c.best = best; c.scored = scored.map((r, i) => ({ ...r, recommended: i === best }));
        setRouteData({ routes: scored, best, osmOk: osm.ok, startName: sName, endName: eName, note });
        return c.scored;
      },
    };
  }, [apiRef]);

  // ---------- โหมดนำทาง GPS ----------
  function updateNav(u) {
    const c = ctx.current, n = c.nav; if (!n) return;
    c.userMarker?.setLatLng([u[1], u[0]]);
    if (mapRef.current) mapRef.current.setView([u[1], u[0]], Math.max(mapRef.current.getZoom(), 17), { animate: true });
    let idx = 0, bd = Infinity;
    for (let k = 0; k < n.coords.length; k++) { const d = haversine(u, n.coords[k]); if (d < bd) { bd = d; idx = k; } }
    const distDest = Math.max(0, Math.round(n.cum[n.cum.length - 1] - n.cum[idx]));
    let k = n.steps.findIndex((st) => idx <= st.wpEnd); if (k < 0) k = n.steps.length - 1;
    const cur = n.steps[k]; const nextTurn = n.steps[k + 1] || null;
    const distTurn = cur ? Math.max(0, Math.round(n.cum[cur.wpEnd] - n.cum[idx])) : 0;
    const instr = nextTurn ? thaiInstr(nextTurn) : "ตรงไปยังปลายทาง";
    let hazard = null, hbest = Infinity, hid = null;
    for (const p of c.problems) {
      if (haversine(u, p.pt) > 80) continue;
      let pidx = 0, pbd = Infinity; for (let k2 = 0; k2 < n.coords.length; k2++) { const dd = haversine(p.pt, n.coords[k2]); if (dd < pbd) { pbd = dd; pidx = k2; } }
      if (pbd > 35 || pidx < idx - 2) continue;
      const along = Math.max(0, Math.round(n.cum[pidx] - n.cum[idx]));
      if (along < hbest) { hbest = along; hazard = { label: CAT[p.cat]?.label || "จุดเสี่ยง", dist: along }; hid = p.pt.join(","); }
    }
    const arrived = distDest < 20;
    setNav({ active: true, instr, distTurn, distDest, hazard, arrived });
    if (nextTurn && distTurn < 30 && !c.spokenTurns.has(k + 1)) { c.spokenTurns.add(k + 1); speak(`อีก ${distTurn} เมตร ${instr}`); }
    if (hazard && hazard.dist < 60 && !c.spokenHaz.has(hid)) { c.spokenHaz.add(hid); speak(`ระวัง ${hazard.label} อีกประมาณ ${hazard.dist} เมตร`); }
    if (arrived && !c.spokenArrived) { c.spokenArrived = true; speak("ถึงปลายทางแล้ว"); }
  }
  function onPos(pos) { updateNav([pos.coords.longitude, pos.coords.latitude]); }
  function onErr() { setNav((p) => ({ ...(p || { active: true }), instr: "เปิด GPS ไม่สำเร็จ — อนุญาตตำแหน่ง แล้วเปิดเว็บแบบ HTTPS บนมือถือ", distTurn: null, distDest: null, hazard: null })); }
  function startNav(i) {
    const c = ctx.current, L = c.L; const r = c.scored?.[i]; if (!r || !L) return;
    const coords = r.coordinates; const cum = [0];
    for (let k = 1; k < coords.length; k++) cum[k] = cum[k - 1] + haversine(coords[k - 1], coords[k]);
    c.nav = { coords, cum, steps: r.steps || [] };
    c.spokenTurns = new Set(); c.spokenHaz = new Set(); c.spokenArrived = false;
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
    c.spokenTurns = new Set(); c.spokenHaz = new Set(); c.spokenArrived = false;
    if (!c.userMarker) c.userMarker = L.marker([coords[0][1], coords[0][0]], { icon: L.divIcon({ className: "", html: '<div style="width:18px;height:18px;border-radius:50%;background:#1d6fb8;border:3px solid #fff;box-shadow:0 0 6px rgba(0,0,0,.6)"></div>', iconSize: [18, 18], iconAnchor: [9, 9] }) }).addTo(mapRef.current);
    setNav({ active: true, instr: "เริ่มเดิน (โหมดจำลอง)", distTurn: null, distDest: Math.round(cum[cum.length - 1]), hazard: null, arrived: false });
    let d = 0; const total = cum[cum.length - 1];
    c.simTimer = setInterval(() => {
      d += 20; if (d > total) d = total;
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

  const navTarget = active ?? (routeData && !routeData.error && !routeData.loading ? routeData.best : null);

  return (
    <div style={{ position: "relative", height: "100vh", width: "100%" }}>
      <style>{`
        .wb-card{position:absolute;background:#fff;border-radius:10px;box-shadow:0 2px 8px rgba(0,0,0,.2);font-family:system-ui;z-index:1000;}
        .wb-info{top:12px;left:12px;max-width:280px;padding:10px 14px;}
        .wb-route{top:12px;right:12px;width:300px;padding:10px 14px;}
        .wb-legend{bottom:16px;left:12px;padding:8px 12px;font-size:12px;column-count:2;column-gap:14px;}
        .wb-nav{top:0;left:0;right:0;border-radius:0;background:#1d6fb8;color:#fff;padding:12px 16px;z-index:1600;}
        .wb-startbtn{display:block;width:100%;margin-top:8px;padding:10px;border:none;border-radius:8px;background:#1d6fb8;color:#fff;font-weight:800;font-size:15px;cursor:pointer;}
        @media (max-width:640px){
          .wb-info{max-width:54vw;padding:7px 9px;font-size:12px;top:8px;left:8px;}
          .wb-route{width:auto;left:8px;right:8px;top:auto;bottom:78px;max-height:44vh;overflow:auto;}
          .wb-legend{display:none;}
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
              {nav.hazard ? <div style={{ marginTop: 6, background: "#c1121f", borderRadius: 6, padding: "5px 8px", fontWeight: 700, fontSize: 14 }}>⚠️ ระวัง {nav.hazard.label} อีก ~{nav.hazard.dist} ม.</div> : null}
            </div>
            <button onClick={stopNav} style={{ background: "rgba(255,255,255,.25)", border: "none", color: "#fff", borderRadius: 8, padding: "8px 12px", fontWeight: 700, cursor: "pointer" }}>หยุด</button>
          </div>
        </div>
      ) : null}

      <div className="wb-card wb-info">
        <div style={{ fontWeight: 800, fontSize: 16 }}>เดินกรุงเทพ — ปทุมวัน</div>
        <div style={{ fontSize: 13, color: "#444", marginTop: 4 }}>จุดร้องเรียนที่<b>ยังไม่แก้</b> (ทางเท้า/น้ำท่วม/แสงสว่าง/กล้อง)</div>
        <div style={{ fontSize: 13, marginTop: 6 }}>{info.loading ? "กำลังโหลด…" : `${info.count} จุด · Traffy ${info.source === "live" ? "(สด)" : "(cache)"}`}</div>
        {toilets != null ? <div style={{ fontSize: 13, color: "#444" }}>ห้องน้ำ {toilets} · กล้อง CCTV {cams ?? 0} (OSM)</div> : null}
      </div>

      {routeData && !nav?.active ? (
        <div className="wb-card wb-route">
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 6 }}>เส้นทางเดิน {routeData.startName || "สยาม"} → {routeData.endName || "จุฬาฯ"}</div>
          {routeData.loading ? <div style={{ fontSize: 13, color: "#888" }}>กำลังคำนวณเส้นทาง…</div> : routeData.error ? <div style={{ fontSize: 12, color: "#c1121f" }}>ใช้ไม่ได้: {routeData.error}</div> : (
            <div>
              {routeData.routes.map((r) => (
                <button key={r.index} onClick={() => ctx.current.select(r.index)}
                  style={{ display: "block", width: "100%", textAlign: "left", cursor: "pointer", margin: "5px 0", padding: "8px 10px", borderRadius: 8, fontSize: 13, border: active === r.index ? "2px solid #2a9d54" : "1px solid #ddd", background: active === r.index ? "#eaf7ee" : "white" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <b>เส้น {r.index + 1}{r.index === routeData.best ? " · ✓ แนะนำ" : ""}</b>
                    {r.comfort != null ? <span style={{ fontWeight: 800, fontSize: 18, color: comfortColor(r.comfort) }}>{r.comfort}</span> : null}
                  </div>
                  <div style={{ color: "#555" }}>{(r.distance_m / 1000).toFixed(2)} กม. · {r.duration_min} นาที</div>
                  <div style={{ fontSize: 12, color: "#666", marginTop: 2 }}>ปลอดภัย {r.safe}{r.shade != null ? ` · ร่ม ${r.shade}` : ""}{r.green != null ? ` · สวน ${r.green}` : ""}{r.toiletsNear != null ? ` · ห้องน้ำ ${r.toiletsNear}` : ""}</div>
                </button>
              ))}
              {routeData.note ? <div style={{ fontSize: 11, color: "#b5651d", marginTop: 4 }}>{routeData.note}</div> : null}
              {navTarget != null ? (
                <>
                  <button className="wb-startbtn" onClick={() => startNav(navTarget)}>▶ เริ่มนำทาง (GPS จริง)</button>
                  <button className="wb-startbtn" style={{ background: "#2a9d54", marginTop: 6 }} onClick={() => startSim(navTarget)}>🧪 ทดลองเดิน (จำลอง)</button>
                </>
              ) : null}
            </div>
          )}
        </div>
      ) : null}

      <div className="wb-card wb-legend">
        {Object.values(CAT).map((c) => <Legend key={c.label} color={c.color} label={c.label} />)}
        <Legend color="#2a9d8f" label="ห้องน้ำ (W)" />
        <Legend color="#1b998b" label="กล้อง CCTV (C)" />
        <Legend color="#2a9d54" label="เส้นแนะนำ" />
      </div>
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
