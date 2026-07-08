// Mock backend สำหรับหน้า NOTIFICATION — โครงตาม Figma (แจ้งเตือนฝน/คูปอง/Traffy)
// TODO(prod): ต่อข้อมูลจริง เช่น กรมอุตุฯ API + ระบบคูปอง

export const dynamic = "force-dynamic";

const MOCK = [
  { id: "n1", type: "rain", title: "คาดการณ์ฝนตกในเส้นทาง", detail: "แยกปทุมวันอาจมีฝนตกปรอย ๆ ประมาณ 70%", time: "18:00 | 17 มิ.ย. 69", source: "ที่มา" },
  { id: "n2", type: "coupon", title: "แลกรับส่วนลดแว่นตา 50%", detail: "สามารถนำประวัติการเดินไปแลกได้ถึง 21 มิ.ย. 69", time: "12:00 | 16 มิ.ย. 69" },
  { id: "n3", type: "rain", title: "คาดการณ์ฝนตกในเส้นทาง", detail: "แยกปทุมวันอาจมีฝนตกปรอย ๆ ประมาณ 40%", time: "15:00 | 15 มิ.ย. 69", source: "ที่มา" },
  { id: "n4", type: "traffy", title: "Traffy Fondue", detail: "มีจุดร้องเรียนใหม่ใกล้เส้นทางที่คุณใช้ประจำ", time: "09:00 | 15 มิ.ย. 69" },
];

export async function GET() {
  return Response.json({ notifications: MOCK }, { headers: { "Cache-Control": "no-store" } });
}
