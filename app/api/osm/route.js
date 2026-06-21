// API route: ดึงข้อมูล OSM (ห้องน้ำ, กล้อง CCTV, ต้นไม้, สวน/น้ำ, ทางม้าลาย) ฝั่งเซิร์ฟเวอร์
// ทำบน Vercel แทนการดึงจากมือถือผู้ใช้ตรงๆ → เสถียรกว่ามาก + cache ได้
const OVERPASS_MIRRORS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
];
const DEFAULT_BBOX = [13.724, 100.527, 13.751, 100.542]; // south,west,north,east

function buildQuery(b) {
  const bb = b.join(",");
  // ชุดที่ 1 (จุด/พื้นที่) -> out center · ชุดที่ 2 (เส้นร่ม: ทางมีหลังคา/skywalk/แนวต้นไม้) -> out geom (ต้องใช้ geometry คำนวณฝั่งเงา)
  return `[out:json][timeout:25];(node["natural"="tree"](${bb});node["amenity"="toilets"](${bb});way["amenity"="toilets"](${bb});way["leisure"="park"](${bb});way["landuse"="grass"](${bb});way["natural"="water"](${bb});way["natural"="wood"](${bb});node["man_made"="surveillance"](${bb});node["highway"="crossing"](${bb}););out center;(way["natural"="tree_row"](${bb});way["highway"]["covered"~"yes|arcade"](${bb});way["highway"="footway"]["bridge"](${bb});way["man_made"="bridge"](${bb}););out geom;`;
}

async function fetchOverpass(query) {
  for (const url of OVERPASS_MIRRORS) {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 22000);
    try {
      const res = await fetch(url, {
        method: "POST",
        body: "data=" + encodeURIComponent(query),
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        signal: controller.signal,
      });
      clearTimeout(t);
      if (!res.ok) continue;
      return await res.json();
    } catch (e) {
      clearTimeout(t);
      continue;
    }
  }
  return null;
}

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  let bbox = DEFAULT_BBOX;
  const raw = searchParams.get("bbox");
  if (raw) {
    const parts = raw.split(",").map(Number);
    if (parts.length === 4 && parts.every((x) => Number.isFinite(x))) bbox = parts;
  }
  const json = await fetchOverpass(buildQuery(bbox));
  if (!json) {
    return Response.json({ ok: false, trees: [], buildings: [], toilets: [], green: [], cameras: [], crossings: [], treeRows: [], coveredWays: [], error: "overpass ไม่ตอบ" });
  }
  const trees = [], buildings = [], toilets = [], green = [], cameras = [], crossings = [], treeRows = [], coveredWays = [];
  for (const el of json.elements || []) {
    const tg = el.tags || {};
    // เส้น (out geom): แนวต้นไม้ / ทางมีหลังคา-skywalk → เก็บเป็น polyline [[lon,lat],...]
    if (el.type === "way" && Array.isArray(el.geometry)) {
      const line = el.geometry.map((g) => [g.lon, g.lat]).filter((p) => p[0] != null && p[1] != null);
      if (line.length < 2) continue;
      if (tg.natural === "tree_row") treeRows.push(line);
      else if (tg.covered === "yes" || tg.covered === "arcade" || tg.bridge || tg.man_made === "bridge") coveredWays.push(line);
      continue;
    }
    const lat = el.lat ?? el.center?.lat, lon = el.lon ?? el.center?.lon;
    if (lat == null || lon == null) continue;
    const pt = [lon, lat];
    if (tg.highway === "crossing") crossings.push(pt);
    else if (tg.man_made === "surveillance") cameras.push(pt);
    else if (tg.natural === "tree") { trees.push(pt); green.push(pt); }
    else if (tg.amenity === "toilets") toilets.push({ pt, tags: tg });
    else if (tg.building) buildings.push(pt);
    else if (tg.leisure === "park" || tg.landuse === "grass" || tg.natural === "wood" || tg.natural === "water") green.push(pt);
  }
  return Response.json(
    { ok: true, trees, buildings, toilets, green, cameras, crossings, treeRows, coveredWays, count: { toilets: toilets.length, cameras: cameras.length, crossings: crossings.length, trees: trees.length, treeRows: treeRows.length, coveredWays: coveredWays.length } },
    { headers: { "Cache-Control": "s-maxage=3600, stale-while-revalidate=86400" } }
  );
}
