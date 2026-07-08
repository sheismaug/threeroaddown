"use client";

import { useEffect, useState } from "react";

// หน้า MISSION ตาม Figma (missionPage 65:1730) — ดึงข้อมูลจาก /api/missions (mock backend)
export default function MissionPage() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    fetch("/api/missions").then((r) => r.json()).then(setData).catch((e) => setErr(String(e)));
  }, []);

  if (err) return <div className="bdi-page">โหลดข้อมูลไม่สำเร็จ: {err}</div>;
  if (!data) return <div className="bdi-page" style={{ color: "var(--bdi-text-dim)" }}>กำลังโหลด…</div>;

  const { user, stats, couponHistory, campaigns } = data;
  return (
    <div className="bdi-page">
      {/* โปรไฟล์ */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 6 }}>
        <div style={{ width: 52, height: 52, borderRadius: "50%", background: "radial-gradient(circle at 35% 30%, #6b4d97, #2a1547)", border: "2px solid rgba(255,255,255,.35)", display: "grid", placeItems: "center", fontSize: 26 }}>👤</div>
        <div>
          <div style={{ fontWeight: 800, fontSize: 16 }}>{user.name}</div>
          <div style={{ fontSize: 12.5, color: "var(--bdi-text-dim)" }}>{user.email}</div>
        </div>
      </div>

      {/* สถิติ */}
      <div className="bdi-stat-tiles">
        <div className="bdi-tile"><b>{stats.totalKm}</b><span>ระยะทางรวม (km.)</span></div>
        <div className="bdi-tile"><b>{stats.couponCount}</b><span>จำนวนคูปองทั้งหมด</span></div>
      </div>

      {/* streak รายวัน (ย้ายมาจาก HUD บนแผนที่) */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, borderRadius: 14, padding: "12px 14px", background: "var(--bdi-surface-2)", border: "1px solid rgba(183,235,62,.35)" }}>
        <div style={{ width: 46, height: 46, flex: "none", borderRadius: "50%", display: "grid", placeItems: "center", background: `conic-gradient(var(--bdi-green) ${stats.progressPct}%, rgba(255,255,255,.12) 0)` }}>
          <div style={{ width: 36, height: 36, borderRadius: "50%", background: "#14081f", display: "grid", placeItems: "center", fontSize: 17 }}>🔥</div>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 800, fontSize: 14 }}>เดิน {stats.streakDays} วันติด</div>
          <div style={{ fontSize: 12, color: "var(--bdi-text-dim)" }}>อีก {stats.kmToNextCoupon} กม. เพื่อรับ{stats.nextCouponLabel}</div>
        </div>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontWeight: 800, fontSize: 19, color: "var(--bdi-green)" }}>{stats.todayKm}</div>
          <div style={{ fontSize: 10, color: "var(--bdi-text-dim)", letterSpacing: 1 }}>KM วันนี้</div>
        </div>
      </div>

      {/* ประวัติการใช้คูปอง */}
      <div className="bdi-h3"><span>ประวัติการใช้คูปอง</span><a href="#">ดูทั้งหมด</a></div>
      {couponHistory.map((c) => (
        <div className="bdi-coupon" key={c.id}>
          <div className="body">
            <div style={{ fontSize: 12.5, color: "var(--bdi-text-dim)" }}>{c.shop}</div>
            <div style={{ fontWeight: 800, fontSize: 16, color: "var(--bdi-green)" }}>{c.title}</div>
          </div>
          <div className="foot">
            <span>EXP: {c.exp}</span>
            {c.usable ? <button className="use">ใช้เลย</button> : null}
          </div>
        </div>
      ))}

      {/* แคมเพนที่เข้าร่วมได้ */}
      <div className="bdi-h3"><span>แคมเพนที่เข้าร่วมได้</span><a href="#">ดูทั้งหมด</a></div>
      {campaigns.map((m) => (
        <div className="bdi-coupon" key={m.id}>
          <div className="body" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
            <div>
              <div style={{ fontSize: 12.5, color: "var(--bdi-text-dim)" }}>{m.shop}</div>
              <div style={{ fontWeight: 800, fontSize: 16, color: "var(--bdi-green)" }}>{m.title}</div>
              <div style={{ fontSize: 11.5, color: "var(--bdi-text-dim)", marginTop: 2 }}>{m.cond}</div>
            </div>
            <div style={{ fontSize: 30 }}>{m.icon}</div>
          </div>
          <div className="foot">
            <span>EXP: {m.exp}</span>
            <button className="use">เข้าร่วม</button>
          </div>
        </div>
      ))}
    </div>
  );
}
