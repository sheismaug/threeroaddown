// Mock backend สำหรับหน้า MISSION (gamification) — โครง response ออกแบบไว้ให้สลับเป็น DB จริงได้ภายหลัง
// TODO(prod): ต่อ database จริง (เช่น Supabase) + ผูกกับ user id จากระบบ login

export const dynamic = "force-dynamic";

const MOCK = {
  user: { name: "USER1", email: "user01@gmail.com" },
  stats: {
    totalKm: 124.8,          // ระยะทางรวม (km.)
    couponCount: 6,          // จำนวนคูปองทั้งหมด
    streakDays: 5,           // 🔥 เดินกี่วันติด
    kmToNextCoupon: 2.4,     // อีกกี่ กม. เพื่อรับคูปองถัดไป
    nextCouponLabel: "คูปองส่วนลด",
    todayKm: 1.6,
    progressPct: 70,         // % ของ mission ปัจจุบัน
  },
  couponHistory: [
    { id: "c1", shop: "ร้านกาแฟ TRY", title: "ส่วนลด 10.-", exp: "31 ก.ค. 69", usable: false },
    { id: "c2", shop: "ร้านกาแฟ DIU", title: "ส่วนลด 15.-", exp: "31 ก.ค. 69", usable: true },
  ],
  campaigns: [
    { id: "m1", shop: "บริการร้านนวด", title: "ส่วนลด 20%", cond: "*เมื่อเดินครบ 15 km.", exp: "19 ก.ค. 69", icon: "💆" },
    { id: "m2", shop: "ร้านกาแฟย่านบางรัก", title: "ส่วนลด 50.-", cond: "*เมื่อเดินครบ 5 km.", exp: "19 ก.ค. 69", icon: "☕" },
  ],
};

export async function GET() {
  return Response.json(MOCK, { headers: { "Cache-Control": "no-store" } });
}
