// API route: ผู้ช่วยเดินปทุมวัน (B6) — ตอบทั่วไปแบบ Gemini อิงข้อมูลจริง
// ค้นหาชื่อ model ที่ใช้ได้จาก /v1/models เอง (กัน "Model not found" เวลา API เปลี่ยนรุ่น)
import { readFile } from "fs/promises";
import path from "path";

const BASE = "https://api.opentyphoon.ai/v1";
const FALLBACK_MODELS = [
  "typhoon-v2.5-30b-a3b-instruct",
  "typhoon-v2.1-12b-instruct",
  "typhoon-v2-70b-instruct",
  "typhoon-v2-8b-instruct",
];
const CAT_TH = { sidewalk: "ทางเท้าชำรุด", road: "ถนน", flood: "น้ำท่วม", light: "แสงสว่าง/จุดมืด", obstruct: "สิ่งกีดขวางทางเดิน", cctv_broken: "กล้อง CCTV เสีย" };

async function loadComplaints() {
  try {
    const p = path.join(process.cwd(), "public", "data", "unresolved_pathumwan.geojson");
    const j = JSON.parse(await readFile(p, "utf-8"));
    return (j.features || []).map((f) => f.properties);
  } catch (e) { return []; }
}

// ถามรายชื่อ model ที่ใช้ได้ แล้วเลือกตัว instruct ที่ใหม่สุด
async function pickModel(key) {
  try {
    const r = await fetch(BASE + "/models", { headers: { Authorization: "Bearer " + key } });
    if (r.ok) {
      const j = await r.json();
      const ids = (j.data || []).map((m) => m.id);
      const chat = ids.filter((id) => /instruct/i.test(id) && !/ocr|asr|embed/i.test(id));
      if (chat.length) {
        chat.sort().reverse(); // เอาเวอร์ชันใหม่ก่อน (v2.5 > v2.1)
        return { model: chat[0], all: ids };
      }
      if (ids.length) return { model: ids[0], all: ids };
    }
  } catch (e) {}
  return { model: null, all: [] };
}

export async function POST(req) {
  const key = process.env.TYPHOON_API_KEY;
  if (!key) return Response.json({ error: "ไม่พบ TYPHOON_API_KEY ใน .env.local" });

  let message = "", routes = null;
  try {
    const body = await req.json();
    message = (body.message || "").toString().slice(0, 500);
    routes = Array.isArray(body.routes) ? body.routes : null;
  } catch (e) {}
  if (!message.trim()) return Response.json({ error: "ไม่มีคำถาม" });

  const all = await loadComplaints();
  const byCat = {};
  for (const p of all) byCat[p.cat] = (byCat[p.cat] || 0) + 1;
  const catSummary = Object.entries(byCat).map(([c, n]) => `- ${CAT_TH[c] || c}: ${n} จุด`).join("\n");

  const kw = message.replace(/[?？]/g, "").split(/\s+/).filter((w) => w.length >= 2);
  const scored = all.map((p) => {
    const blob = `${p.type || ""} ${p.comment || ""} ${p.address || ""} ${CAT_TH[p.cat] || ""}`;
    const hit = kw.reduce((n, w) => (blob.includes(w) ? n + 1 : n), 0);
    return { p, hit };
  });
  scored.sort((a, b) => b.hit - a.hit);
  const sample = scored.slice(0, 25).map(({ p }, i) => `${i + 1}. [${CAT_TH[p.cat] || p.cat}] ${(p.comment || "").replace(/\s+/g, " ").slice(0, 110)}`).join("\n");

  let routeLines = "(ยังไม่มีข้อมูลเส้นทาง)";
  if (routes && routes.length) {
    routeLines = routes.map((r) => `เส้น ${r.index + 1}: ${(r.distance_m / 1000).toFixed(2)} กม. ~${r.duration_min} นาที | คะแนนรวม ${r.comfort ?? "-"} (ปลอดภัย ${r.safe ?? "-"}, ร่ม ${r.shade ?? "-"}, สวน ${r.green ?? "-"}, ห้องน้ำ ${r.toiletsNear ?? "-"}, กล้อง ${r.cameras ?? "-"}, จุดมืด ${r.darkN ?? "-"}, น้ำท่วม ${r.floodN ?? "-"})${r.recommended ? " ⭐แนะนำ" : ""}`).join("\n");
  }

  // รายชื่อห้องน้ำจริงใกล้แต่ละเส้นทาง (จากข้อมูล OSM ที่ฝั่งแผนที่คำนวณมาให้) — ใช้ตอบคำถามเรื่องห้องน้ำโดยไม่ต้องเดา
  let toiletLines = "(ไม่มีข้อมูลห้องน้ำบนเส้นทาง)";
  if (routes && routes.length) {
    toiletLines = routes.map((r) => {
      const tag = r.recommended ? " ⭐แนะนำ" : "";
      const list = Array.isArray(r.toiletList) ? r.toiletList : [];
      if (!list.length) return `เส้น ${r.index + 1}${tag}: ไม่พบห้องน้ำใกล้เส้นทาง`;
      const items = list.slice(0, 6).map((t) => {
        const where = [t.place, t.road].filter(Boolean).join(" · ");
        return `${t.name}${where ? ` [${where}]` : ""} (~กม.${(t.along / 1000).toFixed(2)} จากต้นทาง, ห่างเส้นทาง ~${t.off} ม.)`;
      }).join("; ");
      return `เส้น ${r.index + 1}${tag}: ${items}`;
    }).join("\n");
  }

  // แยกประเภทคำถาม: ถ้าเป็นเรื่อง 'ห้องน้ำ' ใช้พรอมป์เฉพาะ กันโมเดลสลับไปตอบรูปแบบเปรียบเทียบเส้นทาง (เพราะเจอคำว่า 'เส้นทาง')
  const isToiletQ = /ห้องน้ำ|สุขา|toilet|restroom|\bwc\b/i.test(message);
  const system = isToiletQ
    ? ("คุณคือผู้ช่วยเดินย่านปทุมวัน ผู้ใช้กำลังถามเรื่อง 'ห้องน้ำ' โดยเฉพาะ ตอบภาษาไทยสั้นๆ " +
       "ใช้เฉพาะข้อมูลในหัวข้อ [ห้องน้ำใกล้แต่ละเส้นทาง] ที่ให้มาเท่านั้น ห้ามใช้ความรู้อื่นและห้ามเดาชื่อห้าง/สถานที่ " +
       "ถ้าผู้ใช้ระบุเส้นไหน ให้ตอบเฉพาะเส้นนั้น ถ้าไม่ได้ระบุให้ใช้เส้นที่มี ⭐แนะนำ " +
       "ตอบเป็นรายการสั้นๆ ทีละจุด: ชื่อห้องน้ำ + ระบุตึก/ถนนที่อยู่ในวงเล็บ [] ถ้ามี + อยู่ประมาณ กม.X จากต้นทาง (ใส่ระยะห่างจากเส้นทางเป็นเมตรถ้ามี) " +
       "ถ้าเส้นนั้นขึ้นว่า 'ไม่พบห้องน้ำใกล้เส้นทาง' ให้ตอบตรงๆ ว่า 'ไม่พบห้องน้ำใกล้เส้นทางนี้' " +
       "ห้ามตอบเป็นรูปแบบเปรียบเทียบเส้นทาง 1/2/3 เด็ดขาด")
    : ("คุณคือผู้ช่วยวางแผนการเดินเท้าย่านปทุมวัน ของแอป 'เดินกรุงเทพ' ตอบภาษาไทย " +
       "ตอบ 'สั้นที่สุด' เท่าที่ตอบคำถามได้ ห้ามแจกแจงคะแนนย่อยหรือตัวเลขทุกเส้นถ้าผู้ใช้ไม่ได้ถาม " +
       "เมื่อผู้ใช้ถามเรื่องเส้นทาง ให้ตอบตามรูปแบบนี้เท่านั้น และห้ามยาวเกิน 6 บรรทัด:\n" +
       "บรรทัดเปิด 1 ประโยคสั้น (มีกี่เส้น ระยะ~เวลาโดยรวม)\n" +
       "• เส้น 1: <สั้นมาก เช่น สั้นสุดแต่ผ่านจุดเสี่ยงเยอะ>\n" +
       "• เส้น 2: <สั้นมาก>\n" +
       "• เส้น 3: <สั้นมาก>\n" +
       "ปิดท้าย: 'แนะนำ เส้น X' + เหตุผลสั้น 1 ประโยค " +
       "ถ้าเป็นคำถามทั่วไป (ไม่ใช่เส้นทาง) ตอบ 1-3 ประโยคพอ ยึดข้อมูลจริงที่ให้ ห้ามแต่งเพิ่ม ถ้าไม่มีข้อมูลบอกตรงๆ");
  const user =
    `คำถาม: ${message}\n\n[เส้นทางที่คำนวณไว้ (ตามต้นทาง/ปลายทางที่ผู้ใช้ถาม)]\n${routeLines}\n\n[ห้องน้ำใกล้แต่ละเส้นทาง]\n${toiletLines}\n\n[สรุปจุดร้องเรียนยังไม่แก้ในปทุมวัน]\n${catSummary}\n\n[ตัวอย่างคำร้องเรียนที่เกี่ยวข้อง]\n${sample || "(ไม่มี)"}`;

  const { model, all: allModels } = await pickModel(key);
  const candidates = model ? [model, ...FALLBACK_MODELS.filter((m) => m !== model)] : FALLBACK_MODELS;

  let lastErr = "";
  for (const mdl of candidates) {
    try {
      const res = await fetch(BASE + "/chat/completions", {
        method: "POST",
        headers: { Authorization: "Bearer " + key.trim(), "Content-Type": "application/json" },
        body: JSON.stringify({
          model: mdl,
          messages: [{ role: "system", content: system }, { role: "user", content: user }],
          max_tokens: 350, temperature: 0.6, top_p: 0.95, repetition_penalty: 1.05, stream: false,
        }),
      });
      const text = await res.text();
      if (res.ok) {
        const json = JSON.parse(text);
        const answer = json.choices?.[0]?.message?.content || "(ไม่มีคำตอบ)";
        return Response.json({ answer, model: mdl });
      }
      lastErr = `${mdl}: ${res.status} ${text.slice(0, 150)}`;
      if (!/not found|does not exist/i.test(text)) break; // error อื่นที่ไม่ใช่ชื่อ model ผิด -> หยุด
    } catch (e) {
      lastErr = `${mdl}: ${String(e)}`;
    }
  }
  return Response.json({ error: "เรียก Typhoon ไม่สำเร็จ — " + lastErr + (allModels.length ? ` | models ที่มี: ${allModels.join(", ").slice(0, 200)}` : "") });
}
