// API route (สำรวจ): หา endpoint น้ำท่วมเรียลไทม์ของสำนักการระบายน้ำ กทม.
// เซิร์ฟเวอร์ Vercel ดึง http ของ กทม. ได้ (ฝั่ง server ไม่ติด mixed-content)
// เปิด /api/flood เพื่อดูว่า endpoint ไหนตอบ + ข้อมูลหน้าตาเป็นยังไง แล้วค่อยทำตัวจริง

export const dynamic = "force-dynamic";
export const revalidate = 0;

const BASE = "http://weather.bangkok.go.th/dds_webservices/api";
const CANDIDATES = [
  "/rain/lastdata",
  "/flood/lastdata",
  "/floodstreet/lastdata",
  "/floodpoint/lastdata",
  "/waterlevel/lastdata",
  "/canal/lastdata",
  "/pipe/lastdata",
  "/pump/lastdata",
  "/wl/lastdata",
];

async function probe(path) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetch(BASE + path, { signal: controller.signal, headers: { Accept: "application/json" } });
    clearTimeout(t);
    const text = await res.text();
    let shape = null;
    try {
      const j = JSON.parse(text);
      const arr = Array.isArray(j) ? j : (j.data || j.result || j.stations || j.records || null);
      shape = {
        topKeys: Array.isArray(j) ? "(array)" : Object.keys(j).slice(0, 12),
        firstItemKeys: Array.isArray(arr) && arr[0] ? Object.keys(arr[0]) : null,
        count: Array.isArray(arr) ? arr.length : null,
        sampleItem: Array.isArray(arr) && arr[0] ? arr[0] : null,
      };
    } catch (e) {}
    return { path, ok: res.ok, status: res.status, len: text.length, shape, sample: shape ? null : text.slice(0, 300) };
  } catch (e) {
    clearTimeout(t);
    return { path, ok: false, error: String(e) };
  }
}

export async function GET() {
  const results = [];
  for (const p of CANDIDATES) results.push(await probe(p));
  return Response.json({ base: BASE, results }, { headers: { "Cache-Control": "no-store" } });
}
