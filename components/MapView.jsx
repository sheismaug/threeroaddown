"use client";

import { useEffect, useRef, useState } from "react";

// ศูนย์กลางย่าน demo (ปทุมวัน) ตาม build plan
const CENTER = [13.7375, 100.5348];
const ZOOM = 15;

// โหลด Leaflet JS จาก CDN ครั้งเดียว แล้วคืน window.L
function loadLeaflet() {
  return new Promise((resolve, reject) => {
    if (window.L) return resolve(window.L);
    const s = document.createElement("script");
    s.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    s.integrity = "sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=";
    s.crossOrigin = "";
    s.onload = () => resolve(window.L);
    s.onerror = reject;
    document.body.appendChild(s);
  });
}

// สีตามประเภทปัญหา (B7: legend)
function colorFor(type = "") {
  if (type.includes("ทางเท้า")) return "#e63946";   // แดง = ทางเท้า
  if (type.includes("น้ำท่วม")) return "#1d6fb8";   // น้ำเงิน = น้ำท่วม
  if (type.includes("ถนน")) return "#f4a261";       // ส้ม = ถนน
  return "#6a4c93";                                  // ม่วง = อื่นๆ (กีดขวาง/ท่อ)
}

function popupHtml(p) {
  const photo = p.photo
    ? `<img src="${p.photo}" alt="" style="width:100%;max-width:240px;border-radius:8px;margin-top:6px"/>`
    : "";
  const date = (p.timestamp || "").slice(0, 16);
  return `
    <div style="max-width:260px;font-family:system-ui">
      <div style="font-weight:700;color:${colorFor(p.type)}">${p.type || "ปัญหา"}</div>
      <div style="font-size:13px;margin:4px 0;white-space:pre-wrap">${(p.comment || "").slice(0, 300)}</div>
      <div style="font-size:12px;color:#555">สถานะ: <b>${p.state || "-"}</b></div>
      <div style="font-size:12px;color:#555">${p.address || ""}</div>
      <div style="font-size:11px;color:#888">${date}</div>
      ${photo}
    </div>`;
}

export default function MapView() {
  const mapEl = useRef(null);
  const mapRef = useRef(null);
  const [info, setInfo] = useState({ count: 0, source: "", loading: true });

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const L = await loadLeaflet();
      if (cancelled || mapRef.current) return;

      const map = L.map(mapEl.current).setView(CENTER, ZOOM);
      mapRef.current = map;

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "© OpenStreetMap",
      }).addTo(map);

      // B2: ดึงหมุด Traffy จริงผ่าน API route (ซ่อน logic ฝั่ง server)
      try {
        const res = await fetch("/api/traffy");
        const data = await res.json();
        const layer = L.layerGroup().addTo(map);
        for (const f of data.geojson.features) {
          const [lon, lat] = f.geometry.coordinates; // GeoJSON = [lon,lat]
          L.circleMarker([lat, lon], {              // Leaflet = [lat,lon]
            radius: 7,
            color: colorFor(f.properties.type),
            fillColor: colorFor(f.properties.type),
            fillOpacity: 0.8,
            weight: 1,
          })
            .bindPopup(popupHtml(f.properties))
            .addTo(layer);
        }
        if (!cancelled) setInfo({ count: data.count, source: data.source, loading: false });
      } catch (e) {
        if (!cancelled) setInfo({ count: 0, source: "error", loading: false });
      }
    })();

    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  return (
    <div style={{ position: "relative", height: "100vh", width: "100%" }}>
      <div ref={mapEl} style={{ height: "100%", width: "100%" }} />

      {/* แผงหัวเรื่อง + สถานะข้อมูล (B7) */}
      <div
        style={{
          position: "absolute", top: 12, left: 12, zIndex: 1000,
          background: "white", padding: "10px 14px", borderRadius: 10,
          boxShadow: "0 2px 8px rgba(0,0,0,.2)", maxWidth: 280,
        }}
      >
        <div style={{ fontWeight: 800, fontSize: 16 }}>🚶 เดินกรุงเทพ — ปทุมวัน</div>
        <div style={{ fontSize: 13, color: "#444", marginTop: 4 }}>
          ตำแหน่งที่เคยมีการแจ้ง และ<b>ยังไม่ถูกแก้ไข</b>
        </div>
        <div style={{ fontSize: 13, marginTop: 6 }}>
          {info.loading
            ? "กำลังโหลดข้อมูล…"
            : `${info.count} จุด · ข้อมูลจาก Traffy Fondue ${
                info.source === "live" ? "(สด)" : info.source === "cached" ? "(cache)" : ""
              }`}
        </div>
      </div>

      {/* Legend สีหมุด (B7) */}
      <div
        style={{
          position: "absolute", bottom: 20, left: 12, zIndex: 1000,
          background: "white", padding: "8px 12px", borderRadius: 10,
          boxShadow: "0 2px 8px rgba(0,0,0,.2)", fontSize: 12,
        }}
      >
        <Legend color="#e63946" label="ทางเท้า" />
        <Legend color="#f4a261" label="ถนน" />
        <Legend color="#1d6fb8" label="น้ำท่วม" />
        <Legend color="#6a4c93" label="อื่นๆ (กีดขวาง/ท่อ)" />
      </div>
    </div>
  );
}

function Legend({ color, label }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, margin: "2px 0" }}>
      <span style={{ width: 12, height: 12, borderRadius: "50%", background: color, display: "inline-block" }} />
      <span>{label}</span>
    </div>
  );
}
