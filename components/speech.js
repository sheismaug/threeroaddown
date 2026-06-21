// ระบบออกเสียงนำทาง — โมดูลกลางใช้ร่วมกันทั้งโหมด 2D (MapView) และ 3D (Nav3D)
// รวมไว้ที่เดียวเพื่อกันโค้ดซ้ำ/พฤติกรรมต่างกัน + มี watchdog และ voice cache ชุดเดียว
// เทคนิคกันบั๊กเสียงบน Chrome/มือถือ:
//   - เก็บ reference ของ utterance กัน GC ตัดเสียงกลางประโยค ("พูดไม่จบ/เป็นคำๆ")
//   - watchdog เรียก resume() ทุก 3 วิ กัน Chrome หยุดพูดเองหลัง ~15 วิ
//   - ถ้าสถานะ speaking ค้าง >12 วิ แล้ว cancel รีเซ็ต (กันเงียบสนิท)
//   - urgent = ตัดของเดิมแล้วพูดทันที, ไม่งั้นข้ามถ้ากำลังพูดอยู่

let _voices = [];
let _refs = [];   // reference utterance กัน GC ตัดเสียง
let _last = 0;    // เวลาเริ่มพูดล่าสุด ใช้ตรวจสถานะค้าง
let _watch = null;

export function loadVoices() {
  try { _voices = (window.speechSynthesis && window.speechSynthesis.getVoices()) || []; } catch (e) {}
  return _voices;
}
// โหลด voice + ลงทะเบียน onvoiceschanged ครั้งเดียวตอน import (กันชนกันหลายไฟล์)
try {
  if (typeof window !== "undefined" && window.speechSynthesis) {
    loadVoices();
    window.speechSynthesis.onvoiceschanged = () => loadVoices();
  }
} catch (e) {}

export function hasThaiVoice() { if (!_voices.length) loadVoices(); return _voices.some((v) => /^th/i.test(v.lang)); }
export function pickVoice(lang) { if (!_voices.length) loadVoices(); const re = lang === "en" ? /^en/i : /^th/i; return _voices.find((v) => re.test(v.lang)) || null; }

function _watchdog() {
  if (_watch) return;
  _watch = setInterval(() => {
    try {
      const ss = window.speechSynthesis; if (!ss) return;
      if (ss.paused) ss.resume();
      if (ss.speaking && Date.now() - _last > 12000) ss.cancel();
      if (!ss.speaking && !ss.pending) _refs = [];
    } catch (e) {}
  }, 3000);
}

// speak(text, lang, { urgent }) — urgent=true ตัดของเดิมพูดทันที, ไม่งั้นข้ามถ้ากำลังพูด (เว้นแต่ค้างนานเกิน)
export function speak(text, lang, opts) {
  try {
    const ss = window.speechSynthesis; if (!ss || !text) return;
    const urgent = !!(opts && opts.urgent);
    if (ss.paused) ss.resume();
    if (urgent) ss.cancel();
    else if (ss.speaking || ss.pending) { if (Date.now() - _last > 12000) ss.cancel(); else return; }
    const u = new SpeechSynthesisUtterance(text);
    const v = pickVoice(lang || "th"); if (v) u.voice = v;
    u.lang = lang === "en" ? "en-US" : "th-TH"; u.rate = 1;
    u.onend = u.onerror = () => { _refs = _refs.filter((x) => x !== u); };
    _refs.push(u); _last = Date.now(); _watchdog();
    ss.speak(u);
  } catch (e) {}
}
export function speakNow(text, lang) { speak(text, lang, { urgent: true }); }

// ปลดล็อกเสียงบนมือถือ: ต้องเรียกตอนผู้ใช้แตะปุ่ม (user gesture) ไม่งั้น iOS/Android บล็อกเสียง
export function unlockSpeech() {
  try {
    if (!window.speechSynthesis) return;
    loadVoices();
    const u = new SpeechSynthesisUtterance(" "); u.volume = 0.01;
    window.speechSynthesis.speak(u);
    _watchdog();
  } catch (e) {}
}
