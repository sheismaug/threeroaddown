// API route: จุดเสี่ยงน้ำท่วม กทม. (สำนักการระบายน้ำ ปี 2566) — ไม่มีพิกัด
// คืนรายการ + "ข้อความสำหรับ geocode" (ฝั่งเบราว์เซอร์จะแปลงเป็นพิกัดแล้ว cache)
import { readFile } from "fs/promises";
import path from "path";

function parseCSV(text) {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
  const head = lines[0].split(",");
  const idx = (n) => head.findIndex((h) => h.trim() === n);
  const iDist = idx("District"), iArea = idx("area"), iId = idx("risk_id"), iGroup = idx("risk_group");
  const rows = [];
  for (let k = 1; k < lines.length; k++) {
    // area อาจมีคอมมา? ชุดนี้ไม่มี quote ฟิลด์ area เป็นช่องท้ายสุด เลย join ที่เหลือ
    const parts = lines[k].split(",");
    const id = parts[iId];
    const district = (parts[iDist] || "").trim();
    const area = parts.slice(iArea).join(",").trim();
    const group = parts[iGroup];
    // ข้อความ geocode: เอาชื่อถนน (ก่อนคำว่า จาก/ช่วง/บริเวณ) + เขต + กรุงเทพ
    const road = area.split(/จาก|ช่วง|บริเวณ|ตั้งแต่/)[0].trim();
    const query = `${road} ${district} กรุงเทพ`.replace(/\s+/g, " ").trim();
    rows.push({ id, district, area, group, query });
  }
  return rows;
}

export async function GET() {
  try {
    const p = path.join(process.cwd(), "public", "data", "flood_risk.csv");
    const txt = await readFile(p, "utf-8");
    const rows = parseCSV(txt);
    return Response.json({ count: rows.length, rows }, { headers: { "Cache-Control": "s-maxage=86400" } });
  } catch (e) {
    return Response.json({ count: 0, rows: [], error: String(e) });
  }
}
