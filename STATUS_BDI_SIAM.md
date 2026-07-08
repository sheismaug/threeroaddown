# 🚶 Walk BKK × BDI Siam — สรุปสถานะ (เปิดแชทใหม่ใช้ไฟล์นี้เป็น context)

> อัปเดตล่าสุด: ก.ค. 2026 · รอบพัฒนา "เชื่อม Figma BDI-Siam เข้าแอปจริง"
> Figma: https://www.figma.com/design/YqhzIGC22TUDMaAouFUTTl/BDI-Siam

---

## 1. แอปตอนนี้คืออะไร

Next.js 14 (App Router) — แอปเดินเท้าย่านสยาม/ปทุมวัน หน้าตาตามดีไซน์ Figma "BDI-Siam"
**จุดขาย: เส้นทางร่ม (หลบแดดผ่าน Skywalk/ในห้าง) กลางวัน + เส้นทางสว่าง (ไฟถนนจริง BMA) กลางคืน**
บนคอมแสดงเป็นกรอบ iPhone 430×932 กลางจอ (มี Dynamic Island จำลอง) · มือถือเต็มจอ

## 2. โครงหน้า (ตาม Figma)

- **Shell 3 แท็บ** (`app/page.jsx`): EXPLORE / MISSION / NOTIFICATION + top bar (avatar + ป้าย 🔥streak `TopStats` มุมขวา กดไป MISSION)
- **EXPLORE** (`components/MapView.jsx` — ไฟล์หลัก ~1,200 บรรทัด):
  - แถบค้นหา "จะไปไหนดี?" พับ/กาง (ต้นทาง/ปลายทาง + autocomplete)
  - chips 3 ตัว: 💡 Street light (เปิดดีฟอลต์) / 🚶 ทางเชื่อม·Skywalk / 🚻 ห้องน้ำ
  - แผงล่าง 2 การ์ด: **การ์ดสไลเดอร์เวลา 00–23 น.** (เห็นตลอด, ปุ่ม "⟳ ตอนนี้", บรรทัด "เส้นที่ดีที่สุดเวลานี้") + **"รายละเอียดเส้นทาง" พับดีฟอลต์**
  - ปุ่มชั้น 2/1/M/G ลอยซ้าย (โชว์เมื่อเลือกเส้น Skywalk) + ปุ่ม ◎ relocate
- **MISSION**: โปรไฟล์ USER1, ระยะรวม/คูปอง, การ์ด streak, ประวัติคูปอง, แคมเพน — mock จาก `/api/missions`
- **NOTIFICATION**: แจ้งเตือนฝน/คูปอง/Traffy — mock จาก `/api/notifications`
- ตัดออกแล้ว: AI ChatBox (Typhoon), legend สัญลักษณ์, การ์ด info, Traffy (ทั้ง markers และคะแนน), FloorPlan.jsx overlay เต็มจอ (ไฟล์ยังอยู่แต่ไม่ถูก import)

## 3. ระบบคะแนน + เส้นทาง (หัวใจของแอป)

- **candidates ต่อการค้น 1 ครั้ง**: ORS foot-walking ≤3 เส้น (`/api/route`) + 🌉 Skywalk (`SKYWALK_PATH` hardcode MBK→Donki→วงแหวนแยกปทุมวัน→Siam Discovery ชั้น2→สะพานม่วง→Siam Center→Paragon→ทางขึ้น BTS ฝั่งเหนือ ไม่ข้ามถนน) + 🛣 ถนนใหญ่ (`MAINROAD_PATH` เลียบพระราม 1) + 🧭 **เส้นจากกราฟ** (ดูข้อ 4)
- **เกณฑ์ขั้วเดียวต่อช่วงเวลา**: กลางวัน 07–17:59 = **ร่มล้วน** (ไม่คิด/ไม่โชว์สว่าง) · กลางคืน = **สว่างล้วน** (ไม่คิด/ไม่โชว์ร่ม)
- **ร่ม** = เงาตึกจริง 374 หลัง (Google Open Buildings, `public/data/walkbkk_heights_2023.geojson`; sun position → shadowPerM/shadowPrep/ptShaded — ย้ายมาจาก `shade_demo_3d.html`) + coveredWays/ต้นไม้ OSM · Skywalk ได้ขั้นต่ำ 95 (เฉพาะกลางวัน)
- **สว่าง** = เสาไฟ BMA 3,708 ต้น (`public/data/bma_streetlight_pathumwan.json` แปลงจาก `bma_streetlight_ปทุมวัน.csv`) · **คะแนนดู "ความหนาแน่นไฟ" ไม่ใช่แค่ %จุดที่ใกล้ไฟ ≥1 ต้น** (`lampDensityScore`: เฉลี่ยต่อจุด, ไฟ ≥3 ต้นใน 35 ม.=เต็ม) → "ทางสว่างที่สุด" = ซอยที่ไฟหนาแน่นจริง ไม่ใช่ถนนที่ลิตพอแต่ไฟบาง · Skywalk ช่วงห้างเปิดได้ขั้นต่ำ 90 (ไฟอาคาร) · **ถนนใหญ่ไม่ boost แล้ว** (user ต้องการให้ตรงข้อมูลจุดเหลืองบนแผนที่)
- **ห้างเปิด 10:00–22:00** — นอกเวลา เส้น Skywalk `mallClosed` → ถูกตัดออกจากตัวเลือก (ไม่แสดงเลย)
- **แสดงแค่ 2 ตัวเลือก** (`pickRoutes`): ① ทางร่ม/สว่างที่สุด (comfort สูงสุด, เสมอกันเอาเส้นกราฟ) ② ⚡ เร็วที่สุด — เส้นเดียวกัน = การ์ดเดียว 2 ป้าย · เส้นอื่นซ่อนจากแผนที่ (opacity 0)
- **สไลเดอร์เวลา** → `rescore(h)` → `c.refresh(c.lastOsm, false)` คำนวณใหม่หมดรวมถึง**รูปร่างเส้นกราฟ** (ไม่เรียก ORS ซ้ำ)

## 4. 🧭 Routing เอง (งานล่าสุด — **ยังรอ user ยืนยันว่าเวิร์ก**)

- `fetchWalkNet(DEMO_BBOX)`: ทางเท้า OSM ผ่าน 3 ชั้น — localStorage (`walknet5:`) → `/api/walknet` (server proxy + memory cache key `v3:bbox`) → Overpass ตรง · highway = footway|path|pedestrian|living_street|residential|unclassified|**service**|steps|**primary|secondary|tertiary(+_link)** (service สำคัญ — ซอยสยามสแควร์ · **ถนนใหญ่สำคัญ — เสาไฟ BMA เกาะถนนใหญ่ ถ้าไม่มีในกราฟ เส้นกลางคืนเกาะไฟไม่ได้**)
- `buildGraph`: โหนดจากพิกัดปัด 5 ตำแหน่ง, **แบ่ง edge ยาวเป็นท่อน ≤50 ม.**
- `graphRoute`: Dijkstra + binary heap · cost = ระยะ × factor · **กลางคืน "ดูดเข้าหาความหนาแน่นไฟ"** (สูตรสุดท้ายที่เวิร์ก): `factor = max(0.3, 1.5 − 0.15·min(count,10))` รัศมีนับ **60 ม.** → ไฟ 0 ต้น ×1.5 · 3 ต้น ×1.05 · 5 ต้น ×0.75 · 8+ ต้น ×0.3 (ต่ำกว่า 1 = "ดูด") · **กุญแจ: อย่าลงโทษความมืดหนัก** (เดิมใช้ ×5 → ไล่เส้นออกจากสยามสแควร์ที่ไฟเยอะแต่มีจุดมืดคั่น ทำให้ไปเกาะพระราม 1 ที่มืดกว่าแต่ต่อเนื่อง) · รัศมี 60 ม. ทำให้ทั้งย่านเป็น "แอ่งสว่าง" ดูดเส้นเข้า · buildGraph มี node-snap ≤16 ม. เชื่อมซอยที่ปลายไม่ต่อกัน · กลางวัน โดนแดด ×2.2
- โหลดกราฟเสร็จ → auto `c.refresh()` · `routeData.graphOk` → hint "⏳ โครงข่ายกำลังโหลด"
- **สถานะ debug**: user รายงานเส้นยังไม่อ้อมเข้าซอยไฟเยอะ (เทียบ Figma) — แก้ไปแล้ว: เกณฑ์ไฟ 30 ม. ให้ตรงกับตอน scoring, แบ่ง edge, เพิ่ม service, ล้าง cache ทุกชั้น, **ใส่ `console.log("[walkbkk] ...")` ใน refresh** โชว์คะแนนทุกเส้น — **นัดให้ user ส่ง console log มาดูรอบถัดไป** · เทสต์สังเคราะห์ผ่าน (ยอมอ้อม +110 ม. หาไฟ)

## 5. แผนผังในตึก (Figma: Siam_dis_f2) — วาดบนแผนที่จริง

- เลเยอร์ `indoorLayer` ใน **pane "indoor" z=350** (ใต้เส้นทางเสมอ — เคยมีบั๊กบังเส้นฟ้า) · โชว์เมื่อ (เลือกเส้น Skywalk) และ (zoom ≥16) ผ่าน `updateIndoor` + zoomend
- **ไม่วาดพื้นตึกดำแล้ว** (user บอกตำแหน่งคลาด) — เหลือ: ทางเดินขาวขอบเข้ม (`corridor`), วงแหวน Skywalk แยกปทุมวัน (โดนัท r45/24 + แขน 4 ทิศ + บันได ↑ เขียว), บันไดเลื่อน/ลิฟต์/WC ม่วง, จุดเข้า-ออกเขียว (ทุกทางเข้าสม่ำเสมอ — ไม่มี glow "ตำแหน่งฉัน" แล้ว), ป้ายชื่อแบบแคปซูลพื้นเข้ม (MBK ชั้น 2, DON DON DONKI, SIAM DISCOVERY, SIAM CENTER, SIAM PARAGON, BTS สยาม)
- เส้นเดิน: MBK โถงกลาง→โซน A (Donki)→หัวมุม→ข้ามพญาไทตั้งฉาก→**เดินตามวงแหวน**→เข้า Siam Discovery→ทะลุตึก→สะพานม่วง→Siam Center→ออกตะวันออก→Paragon→BTS ฝั่งเหนือ

## 6. ไฟล์ที่แตะในรอบนี้

| ไฟล์ | สถานะ |
|---|---|
| `app/page.jsx` | เขียนใหม่ — shell 3 แท็บ + TopStats |
| `app/layout.jsx` | + import globals.css |
| `app/globals.css` | ใหม่ — design tokens BDI (ม่วง #3d1d5e-#150b26, เขียว #b7eb3e, ฟ้า #35c4f0, ม่วงไอคอน #c85df0) + กรอบ iPhone + map filter ม่วง + คลาส bdi-* |
| `components/MapView.jsx` | แก้หนักสุด — ทุกอย่างข้อ 3-5 |
| `components/MissionPage.jsx` / `NotificationPage.jsx` | ใหม่ (mock UI) |
| `components/ChatBox.jsx` | ปรับธีมแต่**ไม่ถูก render แล้ว** |
| `components/FloorPlan.jsx` | ไม่ใช้แล้ว ลบได้ |
| `app/api/missions|notifications/route.js` | ใหม่ — mock (โครงพร้อมต่อ DB) |
| `app/api/walknet/route.js` | ใหม่ — Overpass proxy + cache |
| `public/data/bma_streetlight_pathumwan.json` | ใหม่ (3,708 ต้น จาก CSV ที่ user วางไว้ root) |
| `public/data/walkbkk_heights_2023.geojson` | copy มาจาก root |
| `public/data/_wtest` | ไฟล์ขยะว่าง ลบได้ |

API เดิมที่ยังใช้: `/api/route` (ORS), `/api/osm` · ไม่ใช้แล้ว: `/api/traffy`, `/api/floodrisk`, `/api/chat`, `/api/toilets`

## 7. สคริปต์เดโมให้กรรมการ

1. ค้น "MBK → สยาม" ตอนกลางวัน → 🌉 ทางร่ม Skywalk ~94-95 ชนะ → แตะ banner "ออกทางเชื่อม: ชั้น 2 MBK โซน A (Don Don Donki)" → ซูมเห็นแผนผังในตึก + ปุ่มชั้น
2. ลากสไลเดอร์ 12:00→เที่ยงเส้นถนนร่มตก Skywalk ยังร่ม 95 → 22:00 ขึ้นไปห้างปิด เส้น Skywalk หายเอง เกณฑ์สลับเป็นสว่างล้วน → เส้นย้ายไปเกาะซอยจุดไฟเหลือง (เปิด chip 💡 ประกอบ)
3. เล่า: เงาตึกจากดาวเทียม 374 หลัง + ไฟ กทม. 3,708 ต้น + เวลาห้างเปิด + routing ถ่วงน้ำหนักเอง — "ข้อมูลเปิดตรงไหนมีช่องว่าง เราเติมด้วยสมมติฐานที่ประกาศชัด"

## 8. งานค้าง / ประเด็นถัดไป

1. **[แก้ 2 รอบแล้ว รอ user ยืนยันบนเครื่องจริง] เส้นกลางคืนเกาะไฟหนาแน่น**
   - รอบ A (เกาะไฟไม่ได้เลย): root cause = walknet query ไม่ดึงถนนใหญ่ (primary/secondary/tertiary) → เสาไฟ BMA เกาะถนนใหญ่แต่ไม่อยู่ในกราฟ → อ้อมเข้าซอยมืด · แก้: เพิ่มถนนใหญ่ใน 2 query (server `v3:` + client `walknet5:`), factor เช็คหัว/ท้าย edge
   - รอบ B (เกาะไฟแล้วแต่ไม่ไปทางที่ไฟเยอะสุด): root cause = คะแนน+cost เป็น binary (ใกล้ไฟ 1 ต้น = 20 ต้น เท่ากัน) เลยเลือกทางลิตพอแต่สั้นกว่า · แก้: เปลี่ยนเป็น **density-aware** ทั้ง cost (`lampCountNearGrid`) และคะแนน (`lampDensityScore`) → ยิ่งไฟเยอะยิ่งถูก/ยิ่งสว่าง
   - **ยืนยันด้วย Node harness บนข้อมูลไฟจริง 3,708 ต้น**: curve ถูก (dense≈×1.2, 1ต้น×2.1, มืด×3.4), router เลือกซอยไฟหนาแน่นเมื่ออ้อมพอประมาณ, ไม่อ้อมเกินเหตุ (ปฏิเสธ 3.2×), density score จัดอันดับ dense>sparse ถูก · helpers ผ่าน `node --check`
   - **[✅ เวิร์กแล้ว บนเครื่องจริง]** รอบ C (ไปเกาะพระราม 1 ไม่ยอมเข้าสยามสแควร์): ไล่ด้วยแผงดีบักบนจอ (`routeData.dbg`) พบว่า กราฟเชื่อมกันดี (12250/12317), โหนดไฟเยอะ 1811 เข้าถึงได้ครบ, **สาเหตุจริง = penalty มืดสูง (×5) ไล่เส้นออกจากย่านไฟเยอะที่มีจุดมืดคั่น** · แก้ = เปลี่ยนเป็นสูตร "ดูดเข้าหาไฟ" (ข้อ 3) → ดีบักยืนยัน เส้นกราฟอยู่บนพระราม 1 ลดจาก ~70% เหลือ **5%** = ลงมาเกาะสยามสแควร์แล้ว
   - **⚠️ ยังค้าง: ลบของชั่วคราวออก** — แผงดีบัก 🐞 บนจอ (`dbg` ใน refresh + ที่ render, ~บรรทัด v9-path) และ `console.log("[walkbkk]...")` เป็นของ debug ต้องลบก่อน production
2. ลบ console.log debug เมื่อจูนเสร็จ
3. นำทางจริง (GPS) — user บอก "อย่าเพิ่งทำ"
4. Login/OTP/Register + coupon flow เต็ม (Figma มีแล้ว) — ยัง mock
5. mount ของ sandbox อ่านไฟล์ที่ Claude แก้แล้วเป็นเวอร์ชันเก่า — เวลา verify ให้เขียน copy ผ่านโฟลเดอร์ outputs แล้วค่อย esbuild/node ทดสอบ (Next build ใน sandbox รันไม่ได้ — SWC crash)

## 9. รันยังไง

```powershell
cd D:\claude\walkbkk
npm run dev   # เปิด http://localhost:3000 · ต้องมี .env.local (ORS_API_KEY)
```
