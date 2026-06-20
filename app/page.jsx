"use client";

import { useRef } from "react";
import dynamic from "next/dynamic";

const MapView = dynamic(() => import("../components/MapView"), {
  ssr: false,
  loading: () => <div style={{ padding: 24, fontSize: 18 }}>กำลังโหลดแผนที่…</div>,
});
const ChatBox = dynamic(() => import("../components/ChatBox"), { ssr: false });

export default function Page() {
  const mapApi = useRef(null);
  return (
    <>
      <MapView apiRef={mapApi} />
      <ChatBox mapApi={mapApi} />
    </>
  );
}
