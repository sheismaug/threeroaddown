// probe_shade_data.mjs — นับข้อมูล OSM ในย่าน demo (ปทุมวัน) เพื่อยืนยันความพร้อมก่อนทำเฟส "ร่ม"
// รัน:  node scripts/probe_shade_data.mjs
// (ต้องรันบนเครื่องที่ออกเน็ตได้ — เช่นเครื่อง dev; sandbox ของผู้ช่วยออก Overpass ไม่ได้)

const MIRRORS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
];
const BBOX = [13.724, 100.527, 13.751, 100.542].join(","); // S,W,N,E (= DEMO_BBOX)

async function overpass(query) {
  for (const url of MIRRORS) {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), 40000);
    try {
      const res = await fetch(url, {
        method: "POST",
        body: "data=" + encodeURIComponent(query),
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        signal: c.signal,
      });
      clearTimeout(t);
      if (!res.ok) continue;
      const j = await res.json();
      return j;
    } catch {
      clearTimeout(t);
      continue;
    }
  }
  throw new Error("ทุก mirror ไม่ตอบ");
}

// out count; คืน element เดียวที่มี tags.total
function countOf(json) {
  const e = (json.elements || [])[0];
  if (e && e.tags && e.tags.total != null) return Number(e.tags.total);
  return (json.elements || []).length;
}

const B = `(${BBOX})`;
const QUERIES = {
  "buildings_total":  `[out:json][timeout:40];(way["building"]${B};relation["building"]${B};);out count;`,
  "buildings_height": `[out:json][timeout:40];(way["building"]["height"]${B};relation["building"]["height"]${B};);out count;`,
  "buildings_levels": `[out:json][timeout:40];(way["building"]["building:levels"]${B};relation["building"]["building:levels"]${B};);out count;`,
  "tree_node":        `[out:json][timeout:40];(node["natural"="tree"]${B};);out count;`,
  "tree_row":         `[out:json][timeout:40];(way["natural"="tree_row"]${B};);out count;`,
  "footway_total":    `[out:json][timeout:40];(way["highway"="footway"]${B};);out count;`,
  "footway_covered":  `[out:json][timeout:40];(way["highway"]["covered"~"yes|arcade"]${B};);out count;`,
  "footway_bridge":   `[out:json][timeout:40];(way["highway"="footway"]["bridge"]${B};);out count;`,
  "man_made_bridge":  `[out:json][timeout:40];(way["man_made"="bridge"]${B};relation["man_made"="bridge"]${B};);out count;`,
};

const res = {};
for (const [k, q] of Object.entries(QUERIES)) {
  try {
    const j = await overpass(q);
    res[k] = countOf(j);
  } catch (e) {
    res[k] = `ERR: ${e.message}`;
  }
  console.log(`${k.padEnd(18)} -> ${res[k]}`);
  await new Promise((r) => setTimeout(r, 1000)); // เคารพ rate limit
}

// สรุปความพร้อม
const pct = (a, b) => (typeof a === "number" && typeof b === "number" && b > 0 ? Math.round((a / b) * 100) : "?");
console.log("\n=== สรุปความพร้อมข้อมูล (ย่าน demo ปทุมวัน) ===");
console.log(`อาคารทั้งหมด: ${res.buildings_total}`);
console.log(`  - มี height: ${res.buildings_height} (${pct(res.buildings_height, res.buildings_total)}%)`);
console.log(`  - มี building:levels: ${res.buildings_levels} (${pct(res.buildings_levels, res.buildings_total)}%)`);
console.log(`  - มีความสูง (height หรือ levels อย่างน้อยหนึ่ง): ดูจากผลรวมข้างบน`);
console.log(`ต้นไม้: tree=${res.tree_node}, tree_row=${res.tree_row}`);
console.log(`footway ทั้งหมด: ${res.footway_total}`);
console.log(`  - covered (yes/arcade): ${res.footway_covered}`);
console.log(`  - bridge (skywalk): ${res.footway_bridge}`);
console.log(`man_made=bridge: ${res.man_made_bridge}`);

console.log("\nJSON:");
console.log(JSON.stringify(res, null, 2));
