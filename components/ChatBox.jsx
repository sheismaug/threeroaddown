"use client";

import { useState, useRef, useEffect } from "react";

const SUGGESTIONS = [
  "ตอนนี้กลางคืน เดินเส้นไหนปลอดภัยสุด",
  "แถวสามย่านมีจุดเสี่ยงน้ำท่วมไหม",
  "ทางเท้าจากสยามไปจุฬาเป็นยังไง",
];

export default function ChatBox({ mapApi }) {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState([
    { role: "bot", text: "สวัสดีค่ะ ฉันคือ AI ผู้ช่วยเดิน (Typhoon ThaiLLM) ถามเรื่องความปลอดภัย จุดน้ำท่วม ทางเท้า หรือขอคำแนะนำเส้นทางได้เลย — ตอบจากข้อมูลร้องเรียนจริงย่านปทุมวัน" },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs, open]);

  // แจ้งแผนที่ว่าแชตเปิดอยู่ เพื่อซ่อนแผงเส้นทางบนมือถือ (กันซ้อนทับ)
  useEffect(() => {
    try { document.body.classList.toggle("wb-chatopen", open); } catch (e) {}
    return () => { try { document.body.classList.remove("wb-chatopen"); } catch (e) {} };
  }, [open]);

  async function send(text) {
    const q = (text ?? input).trim();
    if (!q || busy) return;
    setInput("");
    setMsgs((m) => [...m, { role: "user", text: q }]);
    setBusy(true);
    try {
      // สั่งแผนที่คำนวณ+โชว์เส้นทางก่อน แล้วเอาสรุปไปให้ผู้ช่วย
      let routes = null;
      let mt = q.match(/จาก\s*(.+?)\s*(?:ไปยัง|ไปที่|ไป|->|→|สู่|ถึง)\s*(.+?)[\s?]*$/);
      if (!mt) mt = q.match(/^\s*(.{2,}?)\s*(?:->|→|ไปยัง|ไปที่|ไป|สู่|ถึง)\s*(.{2,}?)[\s?]*$/);
      const from = mt ? mt[1].trim() : null;
      const to = mt ? mt[2].trim() : null;
      // ถามเป็นคำถามทั่วไป (ไม่มีจาก/ไป) → ใช้เส้นทางที่กำลังแสดงอยู่ ไม่คำนวณใหม่/ไม่รีเซ็ตเป็นเส้น default
      if (from && to) {
        try { routes = await mapApi?.current?.showRoutes?.(from, to); } catch (e) {}
      } else {
        try { routes = mapApi?.current?.getRoutes?.() || null; } catch (e) {}
      }
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: q, routes }),
      });
      const data = await res.json();
      const text = data.answer || ("ขออภัย เกิดข้อผิดพลาด: " + (data.error || "ไม่ทราบสาเหตุ"));
      setMsgs((m) => [...m, { role: "bot", text }]);
    } catch (e) {
      setMsgs((m) => [...m, { role: "bot", text: "เชื่อมต่อไม่สำเร็จ: " + String(e) }]);
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: "absolute", right: 14, bottom: 158, zIndex: 1200,
          background: "var(--bdi-green)", color: "#14081f", border: "none", cursor: "pointer",
          padding: "11px 16px", borderRadius: 24, fontSize: 14, fontWeight: 800,
          boxShadow: "0 3px 10px rgba(0,0,0,.3)",
        }}
      >
        🤖 ถาม AI ผู้ช่วย
      </button>
    );
  }

  return (
    <div
      style={{
        position: "absolute", right: 14, bottom: 78, zIndex: 1350, width: 340, maxWidth: "92%",
        height: 460, maxHeight: "52vh", background: "white", borderRadius: 14,
        boxShadow: "0 4px 20px rgba(0,0,0,.3)", display: "flex", flexDirection: "column", overflow: "hidden",
      }}
    >
      <div style={{ background: "linear-gradient(90deg,#0e0618,#3d1d5e)", color: "white", padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <b>🤖 AI ผู้ช่วยเดิน · Typhoon ThaiLLM</b>
        <span onClick={() => setOpen(false)} style={{ cursor: "pointer", fontSize: 18 }}>✕</span>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: 12, background: "#f7f8fa" }}>
        {msgs.map((m, i) => (
          <div key={i} style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start", margin: "6px 0" }}>
            <div
              style={{
                maxWidth: "80%", padding: "8px 11px", borderRadius: 12, fontSize: 14, lineHeight: 1.45, whiteSpace: "pre-wrap",
                background: m.role === "user" ? "#1d6fb8" : "white",
                color: m.role === "user" ? "white" : "#222",
                border: m.role === "user" ? "none" : "1px solid #e2e2e2",
              }}
            >
              {m.text}
            </div>
          </div>
        ))}
        {busy ? <div style={{ fontSize: 13, color: "#888", margin: "6px 2px" }}>กำลังคิด…</div> : null}
        {msgs.length <= 1 ? (
          <div style={{ marginTop: 8 }}>
            {SUGGESTIONS.map((s) => (
              <button key={s} onClick={() => send(s)}
                style={{ display: "block", width: "100%", textAlign: "left", margin: "4px 0", padding: "7px 10px", borderRadius: 10, border: "1px solid #cfe0ef", background: "white", cursor: "pointer", fontSize: 13, color: "#1d6fb8" }}>
                {s}
              </button>
            ))}
          </div>
        ) : null}
        <div ref={endRef} />
      </div>

      <div style={{ display: "flex", gap: 6, padding: 10, borderTop: "1px solid #eee" }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") send(); }}
          placeholder="ถาม เช่น เส้นไหนปลอดภัยสุด…"
          style={{ flex: 1, padding: "9px 11px", borderRadius: 10, border: "1px solid #ccc", fontSize: 14, outline: "none" }}
        />
        <button onClick={() => send()} disabled={busy}
          style={{ background: "#1d6fb8", color: "white", border: "none", borderRadius: 10, padding: "0 16px", cursor: "pointer", fontWeight: 700 }}>
          ส่ง
        </button>
      </div>
    </div>
  );
}
