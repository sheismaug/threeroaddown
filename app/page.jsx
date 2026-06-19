"use client";

import dynamic from "next/dynamic";

// โหลดแผนที่แบบ client-only (Leaflet ใช้ window จึงต้องปิด SSR)
const MapView = dynamic(() => import("../components/MapView"), {
  ssr: false,
  loading: () => (
    <div style={{ padding: 24, fontSize: 18 }}>กำลังโหลดแผนที่…</div>
  ),
});

export default function Page() {
  return <MapView />;
}
