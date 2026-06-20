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
  return `[out:json][timeout:25];(node["natural"="tree"](${bb});node["amenity"="toilets"](${bb});way["amenity"="toilets"](${bb});way["leisure"="park"](${bb});way["landuse"="grass"](${bb});way["natural"="water"](${bb});way["natural"="wood"](${bb});node["man_made"="surveillance"](${bb});node["highway"="crossing"](${bb}););out center;`;
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
    return Response.json({ ok: false, trees: [], buildings: [], toilets: [], green: [], cameras: [], crossings: [], error: "overpass ไม่ตอบ" });
  }
  const trees = [], buildings = [], toilets = [], green = [], cameras = [], crossings = [];
  for (const el of json.elements || []) {
    const lat = el.lat ?? el.center?.lat, lon = el.lon ?? el.center?.lon;
    if (lat == null || lon == null) continue;
    const pt = [lon, lat], tg = el.tags || {};
    if (tg.highway === "crossing") crossings.push(pt);
    else if (tg.man_made === "surveillance") cameras.push(pt);
    else if (tg.natural === "tree") { trees.push(pt); green.push(pt); }
    else if (tg.amenity === "toilets") toilets.push({ pt, tags: tg });
    else if (tg.building) buildings.push(pt);
    else if (tg.leisure === "park" || tg.landuse === "grass" || tg.natural === "wood" || tg.natural === "water") green.push(pt);
  }
  return Response.json(
    { ok: true, trees, buildings, toilets, green, cameras, crossings, count: { toilets: toilets.length, cameras: cameras.length, crossings: crossings.length, trees: trees.length } },
    { headers: { "Cache-Control": "s-maxage=3600, stale-while-revalidate=86400" } }
  );
}
