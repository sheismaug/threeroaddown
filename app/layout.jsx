import "./globals.css";

export const metadata = {
  title: "เดินกรุงเทพ — Walk BKK",
  description: "แอพช่วยให้คนเดินกรุงเทพได้ประสบการณ์ดีที่สุด — ปลอดภัย ร่ม สบาย",
};

const FONT = "'Inter', 'Noto Sans Thai', system-ui, sans-serif";

export default function RootLayout({ children }) {
  return (
    <html lang="th">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Noto+Sans+Thai:wght@400;500;600;700;800&display=swap" />
        <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=" crossOrigin="" />
        <style>{`
          html, body { font-family: 'Inter','Noto Sans Thai',system-ui,sans-serif; -webkit-font-smoothing: antialiased; }
          button, input, textarea { font-family: 'Inter','Noto Sans Thai',system-ui,sans-serif; }
          .leaflet-container, .maplibregl-map { font-family: 'Inter','Noto Sans Thai',system-ui,sans-serif; }
        `}</style>
      </head>
      <body style={{ margin: 0, fontFamily: FONT, fontSize: 15.5 }}>
        {children}
      </body>
    </html>
  );
}
