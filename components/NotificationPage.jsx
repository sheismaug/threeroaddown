"use client";

import { useEffect, useState } from "react";

const ICON = { rain: "🌧️", coupon: "🎟️", traffy: "📍" };

// หน้า NOTIFICATION ตาม Figma (notificationPage 149:790) — ดึงจาก /api/notifications (mock backend)
export default function NotificationPage() {
  const [items, setItems] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    fetch("/api/notifications").then((r) => r.json()).then((d) => setItems(d.notifications || [])).catch((e) => setErr(String(e)));
  }, []);

  if (err) return <div className="bdi-page">โหลดข้อมูลไม่สำเร็จ: {err}</div>;
  if (!items) return <div className="bdi-page" style={{ color: "var(--bdi-text-dim)" }}>กำลังโหลด…</div>;

  return (
    <div className="bdi-page">
      {items.map((n) => (
        <div className="bdi-noti" key={n.id}>
          <div className="t"><span>{ICON[n.type] || "🔔"}</span>{n.title}</div>
          <div className="d">{n.detail}</div>
          <div className="m">
            <span>{n.time}</span>
            {n.source ? <span style={{ color: "var(--bdi-green)" }}>{n.source} &gt;</span> : null}
          </div>
        </div>
      ))}
    </div>
  );
}
