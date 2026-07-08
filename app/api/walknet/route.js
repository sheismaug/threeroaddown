// โครงข่ายทางเท้า OSM (Overpass) ผ่านเซิร์ฟเวอร์ — เสถียร/เร็วกว่าเรียกจากเบราว์เซอร์ตรง + cache ใน memory
// ใช้สร้างกราฟสำหรับ routing ถ่วงน้ำหนักไฟ (กลางคืน) / เงาตึก (กลางวัน)
export const dynamic = "force-dynamic";

const MIRRORS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"];
const g = globalThis;
if (!g.__walknetCache) g.__walknetCache = new Map();

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const bbox = (searchParams.get("bbox") || "").trim();
  if (!/^[\d.,\s-]+$/.test(bbox)) return Response.json({ error: "bbox ไม่ถูกต้อง" }, { status: 400 });
  const ck = "v3:" + bbox; // เปลี่ยน version เมื่อ query เปลี่ยน — กัน cache ชุดเก่าค้าง
  if (g.__walknetCache.has(ck)) return Response.json(g.__walknetCache.get(ck));

  // ต้องมี service ด้วย — ซอยภายในสยามสแควร์จำนวนมาก tag เป็น highway=service
  // ต้องมีถนนใหญ่ (primary/secondary/tertiary + _link) ด้วย — เสาไฟ BMA เกาะถนนใหญ่ (เช่นพระราม 1) เป็นหลัก
  // ถ้าไม่มีถนนใหญ่ในกราฟ เส้นทางกลางคืนจะเกาะไฟไม่ได้ ต้องอ้อมเข้าซอยมืดแทน
  const q = `[out:json][timeout:20];way["highway"~"footway|path|pedestrian|living_street|residential|unclassified|service|steps|primary|secondary|tertiary|primary_link|secondary_link|tertiary_link"](${bbox});out geom;`;
  for (const url of MIRRORS) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: "data=" + encodeURIComponent(q),
        signal: AbortSignal.timeout(20000),
      });
      if (!res.ok) continue;
      const j = await res.json();
      const ways = [];
      for (const el of j.elements || []) {
        if (el.type === "way" && Array.isArray(el.geometry) && el.geometry.length > 1) {
          ways.push(el.geometry.map((p) => [p.lon, p.lat]));
        }
      }
      if (!ways.length) continue;
      const out = { ways, count: ways.length };
      g.__walknetCache.set(ck, out);
      return Response.json(out, { headers: { "Cache-Control": "public, max-age=86400" } });
    } catch (e) {}
  }
  return Response.json({ error: "Overpass ไม่ตอบสนอง ลองใหม่อีกครั้ง" }, { status: 502 });
}
