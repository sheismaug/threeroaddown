# 🚶 เดินกรุงเทพ — Walk BKK

แอพช่วยให้คนเดินกรุงเทพได้ประสบการณ์ดีที่สุด — ปลอดภัย / ร่ม / สบาย
ย่าน demo: **สยาม → รพ.จุฬาฯ (เขตปทุมวัน)** · ข้อมูลจริงทั้งหมด ไม่มี mock

## สถานะตอนนี้
- ✅ **B1** แผนที่ Leaflet center ปทุมวัน + OSM tiles
- ✅ **B2** หมุดปัญหาทางเท้าจริงจาก Traffy Fondue (215 จุดที่ยังไม่แก้) + popup
- ⏳ B3 routing เดิน (รอ key OpenRouteService)
- ⏳ B6 แชต Typhoon (รอ key Typhoon)

## รัน local
ต้องมี Node.js 18+ ติดตั้งก่อน
```bash
npm install
npm run dev
```
เปิด http://localhost:3000 — จะเห็นแผนที่ปทุมวันพร้อมหมุดแดง/ส้ม/น้ำเงิน

## ข้อมูลมาจากไหน
- หมุดปัญหา: **Traffy Fondue** ผ่าน `app/api/traffy/route.js`
  - พยายามดึง**สด**จาก CKAN ของ data.bangkok.go.th
  - ถ้าเน็ตล่ม ใช้ไฟล์ cache `public/data/unresolved_pathumwan.geojson` (ข้อมูลจริงที่กรองไว้)
- เกณฑ์กรอง: เขตปทุมวัน + ประเภทเกี่ยวกับการเดิน (ทางเท้า/ถนน/น้ำท่วม/กีดขวาง/ท่อ) + สถานะ ≠ เสร็จสิ้น

## API key (สำหรับ B3/B6)
1. คัดลอก `.env.local.example` เป็น `.env.local`
2. ใส่ค่า:
   - `TYPHOON_API_KEY` — สมัครที่ https://opentyphoon.ai
   - `ORS_API_KEY` — สมัครที่ https://openrouteservice.org
3. **อย่า commit `.env.local`** (อยู่ใน .gitignore แล้ว) — บน Vercel ใส่ใน Project Settings → Environment Variables

## deploy ขึ้น Vercel
push ขึ้น GitHub แล้ว import ใน Vercel → ใส่ env variables → deploy

## หมายเหตุสำคัญ (จาก build plan)
- หมุดคือ "ตำแหน่งที่เคยมีการแจ้งและยังค้างในระบบ" ไม่ใช่การรับประกันว่ายังพังอยู่ ณ ตอนนี้
- จุดที่เงียบ ≠ ทางเท้าดี (Traffy เป็นข้อมูลที่คนแจ้งเอง)
