# Roadmap — เดินกรุงเทพ / Walk BKK

## ฟีเจอร์ในอนาคต: AR นำทางกล้องจริง (แบบ AMAP)
เป้าหมาย: กล้องถ่ายถนนจริงเป็นพื้นหลัง + ลูกศร 3D chevron ลอยติดพื้น + แบนเนอร์ "ตรงไป X ม." + มินิแมพมุมล่าง

ทำได้บนเว็บมือถือ (เวอร์ชันเชิงทิศทาง):
- กล้องหลัง: navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } }) — ต้อง HTTPS
- ทิศ/การเอียง: DeviceOrientationEvent (iOS ต้องกด requestPermission() จาก user gesture; Android Chrome ใช้ได้เลย)
- ลูกศร: วาง chevron บนระนาบพื้นแบบเพอร์สเปคทีฟ หมุน yaw = (bearing เส้นทาง − heading เข็มทิศ)
- รวมกับ route/steps ที่มีอยู่แล้ว + มินิแมพ Leaflet ย่อ

ข้อจำกัดเทียบ AMAP:
- AMAP ใช้ VPS/SLAM (จำพิกัดจากภาพถนนจริง) ลูกศรเลยล็อกพื้นเป๊ะ — ของเราอิงเข็มทิศ+GPS จะ "ชี้ถูกทิศ" แต่ไม่ล็อกพื้นเป๊ะตอนขยับเร็ว
- ความแม่นเข็มทิศมือถือแกว่งได้ ควรมี smoothing (low-pass filter)
- WebXR AR ยังไม่รองรับบน iOS Safari → ใช้ camera + CSS/Canvas overlay แทน

ทำเป็นปุ่มโหมดใหม่ "AR กล้องจริง" แยกจากโหมด 3D (จำลอง) ที่มีอยู่ เพื่อไม่ให้กระทบของเดิม
