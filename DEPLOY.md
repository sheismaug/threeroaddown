# 🚀 คู่มือ Deploy ขึ้น Vercel (สำหรับมือใหม่)

เป้าหมาย: เอาโปรเจกต์ `walkbkk` ขึ้นเว็บจริง มี URL กดดูได้ (เช่น `walkbkk.vercel.app`)
และต่อไปแก้โค้ดแล้ว push ขึ้น GitHub มันจะ deploy ให้เองอัตโนมัติ

ภาพรวม 3 ก้าว: **เอาโค้ดขึ้น GitHub → ต่อ Vercel เข้ากับ GitHub → กด Deploy**

---

## ก้าวที่ 1 — เอาโค้ดขึ้น GitHub

> ทำครั้งเดียว ครั้งต่อไปแค่ push

### วิธีง่ายสุด: ใช้ GitHub Desktop (เป็น GUI ไม่ต้องพิมพ์คำสั่ง)
1. โหลด **GitHub Desktop** จาก https://desktop.github.com ติดตั้ง แล้วล็อกอินด้วยบัญชี GitHub ที่มี
2. เมนู **File → Add Local Repository** → เลือกโฟลเดอร์ `D:\claude\walkbkk`
3. มันจะบอกว่าโฟลเดอร์นี้ยังไม่ใช่ git repo → กดลิงก์ **"create a repository"** → กด **Create Repository**
4. กดปุ่ม **Publish repository** (มุมขวาบน)
   - ตั้งชื่อ repo เช่น `walkbkk`
   - จะเลือก **Private** (เห็นคนเดียว) หรือ Public ก็ได้ — Vercel ใช้ได้ทั้งคู่
   - กด **Publish**
5. เสร็จ! โค้ดขึ้น GitHub แล้ว

> ✅ ไฟล์ `.env.local` และ `node_modules` จะ **ไม่ถูกอัปขึ้น** เพราะมีอยู่ใน `.gitignore` แล้ว (ดีแล้ว — key ต้องไม่ขึ้น git)
> ⚠️ ก่อนทำ ลบโฟลเดอร์ `walkbkk\node_modules` ที่ค้างอยู่ทิ้งใน File Explorer ก่อน เพื่อความสะอาด

### หรือถ้าถนัด command line:
```bash
cd D:\claude\walkbkk
git init
git add .
git commit -m "init: walk bkk map + traffy pins"
# สร้าง repo เปล่าบน github.com ก่อน แล้วเอา URL มาวาง:
git remote add origin https://github.com/<ชื่อคุณ>/walkbkk.git
git branch -M main
git push -u origin main
```

---

## ก้าวที่ 2 — ต่อ Vercel เข้ากับ GitHub

1. ไปที่ https://vercel.com → **Sign Up** (หรือ Log In)
2. เลือก **Continue with GitHub** → กด **Authorize Vercel** (อนุญาตให้ Vercel เห็น repo)
3. เข้าหน้า Dashboard แล้ว → กด **Add New…** → **Project**
4. หา repo `walkbkk` ในรายการ → กด **Import**
   - ถ้าไม่เห็น repo ให้กด **Adjust GitHub App Permissions** แล้วเลือกให้สิทธิ์ repo นี้

---

## ก้าวที่ 3 — ตั้งค่า + กด Deploy

1. หน้า Configure Project: Vercel จะ **ตรวจเจอ Next.js เอง** (Framework Preset = Next.js) — ปล่อยค่า default ไว้ทั้งหมด ไม่ต้องแก้
2. **Environment Variables** (ส่วนนี้ข้ามไปก่อนได้!)
   - แผนที่ + หมุด Traffy **ทำงานได้เลยโดยไม่ต้องใส่ key** (CKAN ไม่ต้องใช้ key)
   - ค่อยมาเพิ่ม key ทีหลังตอนทำ B3 (routing) / B6 (แชต) — ดูหัวข้อล่าง
3. กด **Deploy** → รอ ~1–2 นาที
4. ได้ URL จริง เช่น `https://walkbkk.vercel.app` — กดเข้าไปดูแผนที่ปทุมวันได้เลย 🎉

---

## หลังจากนี้: แก้โค้ดแล้วขึ้นเองอัตโนมัติ
- แก้โค้ดในเครื่อง → push ขึ้น GitHub (กดปุ่ม **Push origin** ใน GitHub Desktop)
- Vercel จะ **deploy ใหม่ให้เองทุกครั้ง** ที่ push เข้า branch `main`
- ถ้า push เข้า branch อื่น จะได้ **Preview URL** แยก (เอาไว้ลองก่อน merge)

---

## วิธีเพิ่ม API key ทีหลัง (ตอนทำ B3 / B6)
1. ใน Vercel เปิดโปรเจกต์ → **Settings → Environment Variables**
2. เพิ่มทีละตัว:
   | Name | Value | Environment |
   |---|---|---|
   | `ORS_API_KEY` | (token จาก openrouteservice.org) | Production + Preview |
   | `TYPHOON_API_KEY` | (key จาก opentyphoon.ai) | Production + Preview |
3. กด **Save** → ไปแท็บ **Deployments** → จุด `…` ที่ deploy ล่าสุด → **Redeploy** (เพื่อให้ค่าใหม่มีผล)

> key พวกนี้อยู่ฝั่ง server เท่านั้น **ห้ามตั้งชื่อขึ้นต้นด้วย `NEXT_PUBLIC_`** ไม่งั้นจะหลุดไปฝั่ง browser

---

## free tier เหลือเฟือสำหรับ demo
100GB bandwidth, 100k function calls/เดือน, deploy ไม่จำกัด — งาน hackathon สบายๆ
