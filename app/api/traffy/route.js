// API route: คืนจุดร้องเรียน "ทางเท้า + ยังไม่แก้" ในปทุมวัน เป็น GeoJSON
//
// ทำงาน 2 ชั้น:
//   1) พยายามดึงสดจาก CKAN ของ data.bangkok.go.th (ข้อมูลล่าสุด)
//   2) ถ้าเน็ตล่ม/บล็อก -> ใช้ไฟล์ที่ cache ไว้ (public/data/unresolved_pathumwan.geojson)
//      ซึ่งก็เป็นข้อมูลจริง (ดึงครั้งล่าสุด) ตามหลัก fallback ใน Phase C
//
// หมายเหตุ: เรียกจากฝั่ง server เท่านั้น เลี่ยงปัญหา CORS ของ frontend

import { readFile } from "fs/promises";
import path from "path";

// resource_id ของไฟล์ traffy ปี พ.ศ.2569 (2026) บน data.bangkok.go.th
const RESOURCE_ID = "3d759b36-9944-4f16-abb0-14c35520ff98";
const CKAN_SQL = "https://data.bangkok.go.th/api/3/action/datastore_search_sql";

// SQL กรองฝั่งเซิร์ฟเวอร์: ปทุมวัน + ยังไม่แก้ + ประเภทเกี่ยวกับการเดิน
const SQL = `
  SELECT ticket_id, type, comment, coords, state, district,
         address, timestamp, photo, problemtype_tag, star
  FROM "${RESOURCE_ID}"
  WHERE district LIKE '%ปทุมวัน%'
    AND state NOT IN ('เสร็จสิ้น', 'ไม่ใช่ปัญหา')
    AND (
      type LIKE '%ทางเท้า%' OR type LIKE '%ถนน%' OR type LIKE '%น้ำท่วม%'
      OR type LIKE '%กีดขวาง%' OR type LIKE '%ท่อระบายน้ำ%'
      OR type LIKE '%แสงสว่าง%' OR type LIKE '%ทางข้าม%' OR type LIKE '%สะพานลอย%'
    )
  LIMIT 2000
`;

// coords ของ Traffy เก็บเป็น "lon,lat" -> คืน [lon, lat] (มาตรฐาน GeoJSON)
function coordsToLonLat(s) {
  if (!s) return null;
  const parts = String(s).replace(/"/g, "").split(",");
  let lon = parseFloat(parts[0]);
  let lat = parseFloat(parts[1]);
  if (Number.isNaN(lon) || Number.isNaN(lat)) return null;
  if (lat > 90) [lon, lat] = [lat, lon]; // กันสลับ
  return [lon, lat];
}

function rowsToGeoJSON(rows) {
  const features = [];
  for (const r of rows) {
    const c = coordsToLonLat(r.coords);
    if (!c) continue;
    features.push({
      type: "Feature",
      geometry: { type: "Point", coordinates: c },
      properties: r,
    });
  }
  return { type: "FeatureCollection", features };
}

async function fetchLive() {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 8000);
  try {
    const url = CKAN_SQL + "?sql=" + encodeURIComponent(SQL.replace(/\s+/g, " ").trim());
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error("CKAN HTTP " + res.status);
    const json = await res.json();
    if (!json.success) throw new Error("CKAN not success");
    const records = json.result.records || [];
    if (records.length === 0) throw new Error("CKAN 0 records");
    return rowsToGeoJSON(records);
  } finally {
    clearTimeout(t);
  }
}

async function fetchCached() {
  const p = path.join(process.cwd(), "public", "data", "unresolved_pathumwan.geojson");
  const txt = await readFile(p, "utf-8");
  return JSON.parse(txt);
}

export async function GET() {
  let data, source;
  try {
    data = await fetchLive();
    source = "live"; // ดึงสดจาก data.bangkok.go.th
  } catch (e) {
    data = await fetchCached();
    source = "cached"; // ใช้ข้อมูลจริงที่ cache ไว้
  }
  return Response.json(
    { source, count: data.features.length, geojson: data },
    { headers: { "Cache-Control": "s-maxage=600, stale-while-revalidate" } }
  );
}
