// API route: ห้องน้ำสาธารณะย่านปทุมวัน จาก OSM (ไม่ต้องใช้ key)
// ลองหลาย mirror + timeout นานขึ้น เพื่อความทนทาน ถ้าล้มเหลวคืนว่าง
const OVERPASS_MIRRORS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];
const BBOX = "13.720,100.520,13.755,100.548"; // south,west,north,east
const QUERY = `[out:json][timeout:25];(node["amenity"="toilets"](${BBOX});way["amenity"="toilets"](${BBOX}););out center;`;

async function fetchOverpass() {
  for (const url of OVERPASS_MIRRORS) {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 18000);
    try {
      const res = await fetch(url, {
        method: "POST",
        body: "data=" + encodeURIComponent(QUERY),
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

export async function GET() {
  const json = await fetchOverpass();
  if (!json) {
    return Response.json({ count: 0, geojson: { type: "FeatureCollection", features: [] }, error: "overpass ไม่ตอบ" });
  }
  const features = (json.elements || [])
    .map((el) => {
      const lat = el.lat ?? el.center?.lat;
      const lon = el.lon ?? el.center?.lon;
      if (lat == null || lon == null) return null;
      const tags = el.tags || {};
      return {
        type: "Feature",
        geometry: { type: "Point", coordinates: [lon, lat] },
        properties: {
          name: tags.name || tags["name:th"] || "ห้องน้ำสาธารณะ",
          fee: tags.fee,
          wheelchair: tags.wheelchair,
          opening_hours: tags.opening_hours,
        },
      };
    })
    .filter(Boolean);
  return Response.json(
    { count: features.length, geojson: { type: "FeatureCollection", features } },
    { headers: { "Cache-Control": "s-maxage=3600, stale-while-revalidate" } }
  );
}
