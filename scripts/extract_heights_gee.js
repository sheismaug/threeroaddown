/* =====================================================================
 * WalkBKK — ดึง "ความสูงตึกจริง" (วัดจากดาวเทียม) สำหรับย่าน demo ปทุมวัน
 * แหล่งข้อมูล: Google Open Buildings 2.5D Temporal V1
 *   - band `building_height` (เมตร, 0–100), จาก Sentinel-2, ~4 ม., ปี 2016–2023
 *   - ครอบคลุมเอเชียตะวันออกเฉียงใต้รวมไทย · License CC-BY 4.0 / ODbL
 *
 * วิธีรัน (ครั้งเดียว — เบราว์เซอร์/แอปดึงสดไม่ได้ ต้องประมวลผลที่นี่):
 *   1. สมัครบัญชีฟรี Google Earth Engine: https://code.earthengine.google.com
 *   2. เปิด Code Editor → วางสคริปต์นี้ทั้งไฟล์ → กด Run
 *   3. ไปแท็บ "Tasks" → กด RUN ที่งาน export → ไฟล์ GeoJSON จะไปอยู่ใน Google Drive
 *   4. ดาวน์โหลดไฟล์ walkbkk_heights_2023.geojson แล้วโหลดเข้า shade_demo_3d.html
 *      (ปุ่ม "📐 โหลดความสูงจริง") หรือเอาไปป้อน /api/osm ในแอปจริง
 * ===================================================================== */

// 1) พื้นที่ = Centerpoint Siam Square → MBK (เลียบถนนพระราม 1, ปทุมวัน)
//    [West, South, East, North]
var aoi = ee.Geometry.Rectangle([100.5270, 13.7420, 100.5360, 13.7480]);
Map.centerObject(aoi, 16);

// 2) raster ความสูงตึก — เลือกปีล่าสุด (2023)
var year = 2023;
var temporal = ee.ImageCollection('GOOGLE/Research/open-buildings-temporal/v1')
  .filter(ee.Filter.date(year + '-01-01', (year + 1) + '-01-01'))
  .filter(ee.Filter.bounds(aoi));
var proj = temporal.first().projection();                 // เก็บ UTM projection (หน่วยเมตร)
var mosaic = temporal.mosaic().setDefaultProjection(proj);
var bands = mosaic.select(['building_presence', 'building_height']);

// 3) footprint อาคาร (Open Buildings V3 polygons) ในพื้นที่
var polys = ee.FeatureCollection('GOOGLE/Research/open-buildings/v3/polygons')
  .filter(ee.Filter.bounds(aoi));

// 4) Zonal stats: ความสูง "เฉลี่ย" และ "สูงสุด" ของพิกเซลในแต่ละ footprint
//    - mean = ความสูงเฉลี่ยทั้งตึก
//    - max  = จุดสูงสุด (เหมาะกับการคิด "ความยาวเงา" มากกว่า เพราะยอดตึกทอดเงายาวสุด)
var reducer = ee.Reducer.mean().combine({reducer2: ee.Reducer.max(), sharedInputs: true});
var withH = bands.reduceRegions({
  collection: polys, reducer: reducer, scale: 4, tileScale: 16
});

// 5) กรองให้เหลือเฉพาะตึกที่ "มีอยู่จริงในปีนั้น" + มีค่าความสูง
//    หลัง combine: property จะชื่อ building_height_mean / building_height_max / building_presence_mean ...
var clean = withH
  .filter(ee.Filter.gt('building_presence_mean', 0.5))
  .filter(ee.Filter.notNull(['building_height_max']))
  // เก็บไว้ทั้ง mean และ max + ตั้งชื่อ `height` = max (ใช้ในเดโม)
  .map(function (f) {
    var hmax = ee.Number(f.get('building_height_max'));
    var hmean = ee.Number(f.get('building_height_mean'));
    return f.set({ height: hmax, height_mean: hmean })
            .select(['height', 'height_mean']);
  });

print('จำนวนตึกที่ได้ความสูง:', clean.size());
Map.addLayer(bands.select('building_height').clip(aoi),
  {min: 0, max: 50, palette: ['1d4877','1b8a5a','fbb021','f68838','ee3e32']}, 'ความสูง (raster)');
Map.addLayer(clean, {color: '00e5ff'}, 'footprint + ความสูง');

// 6) Export → Google Drive (GeoJSON: polygon + property `height`/`height_mean`)
Export.table.toDrive({
  collection: clean,
  description: 'walkbkk_heights_' + year,
  folder: 'earthengine',
  fileNamePrefix: 'walkbkk_heights_' + year,
  fileFormat: 'GeoJSON'
});
