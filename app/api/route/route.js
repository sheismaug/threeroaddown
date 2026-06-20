// API route: เส้นทางเดิน (B3) — รับพิกัดต้นทาง/ปลายทางตรงๆ (geocode ทำฝั่งเบราว์เซอร์)
const ORS_DIR = "https://api.openrouteservice.org/v2/directions/foot-walking/geojson";
const DEF_START = [100.5331, 13.7456]; // สยาม
const DEF_END = [100.5366, 13.7295];   // รพ.จุฬาฯ

function parseCoord(lon, lat, fallback) {
  const a = parseFloat(lon), b = parseFloat(lat);
  if (Number.isFinite(a) && Number.isFinite(b)) return [a, b];
  return fallback;
}

export async function GET(req) {
  const key = process.env.ORS_API_KEY;
  if (!key) return Response.json({ error: "ไม่พบ ORS_API_KEY ใน .env.local" }, { status: 500 });

  const { searchParams } = new URL(req.url);
  const start = parseCoord(searchParams.get("slon"), searchParams.get("slat"), DEF_START);
  const end = parseCoord(searchParams.get("elon"), searchParams.get("elat"), DEF_END);

  let fc;
  try {
    const res = await fetch(ORS_DIR, {
      method: "POST",
      headers: { Authorization: key, "Content-Type": "application/json" },
      body: JSON.stringify({
        coordinates: [start, end],
        alternative_routes: { target_count: 3, weight_factor: 1.6, share_factor: 0.6 },
        instructions: true,
      }),
    });
    if (!res.ok) {
      const txt = await res.text();
      return Response.json({ error: "ORS " + res.status, detail: txt.slice(0, 200) }, { status: 502 });
    }
    fc = await res.json();
  } catch (err) {
    return Response.json({ error: "เรียก ORS ไม่สำเร็จ: " + String(err) }, { status: 502 });
  }

  const feats = fc.features || [];
  if (feats.length === 0) return Response.json({ error: "ORS ไม่คืนเส้นทาง" }, { status: 502 });

  const routes = feats.map((f, i) => {
    const sum = f.properties.summary || {};
    const steps = [];
    for (const seg of f.properties.segments || []) {
      for (const st of seg.steps || []) {
        steps.push({ type: st.type, distance: Math.round(st.distance || 0), name: st.name && st.name !== "-" ? st.name : "", wpStart: (st.way_points || [0, 0])[0], wpEnd: (st.way_points || [0, 0])[1] });
      }
    }
    return { index: i, coordinates: f.geometry.coordinates, distance_m: Math.round(sum.distance || 0), duration_min: Math.round((sum.duration || 0) / 60), steps };
  });

  return Response.json({ start, end, routes }, { headers: { "Cache-Control": "no-store" } });
}
