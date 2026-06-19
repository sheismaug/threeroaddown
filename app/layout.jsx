export const metadata = {
  title: "เดินกรุงเทพ — Walk BKK",
  description: "แอพช่วยให้คนเดินกรุงเทพได้ประสบการณ์ดีที่สุด — ปลอดภัย ร่ม สบาย",
};

export default function RootLayout({ children }) {
  return (
    <html lang="th">
      <head>
        {/* Leaflet CSS จาก CDN */}
        <link
          rel="stylesheet"
          href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
          integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY="
          crossOrigin=""
        />
      </head>
      <body style={{ margin: 0, fontFamily: "system-ui, 'Segoe UI', sans-serif" }}>
        {children}
      </body>
    </html>
  );
}
