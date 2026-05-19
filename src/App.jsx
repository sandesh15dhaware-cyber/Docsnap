import { useState, useEffect, useRef, useCallback } from "react";

const PDFLIB_CDN = "https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js";
const PDFJS_CDN = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.mjs";
const PDFJS_WORKER = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.mjs";

const C = {
  bg: "#0B0D11", surface: "#151820", surface2: "#1E2230", border: "#282D3E",
  accent: "#2563EB", accentLight: "#3B82F6", text: "#F0F1F5", muted: "#6B7194",
  danger: "#DC2626", white: "#fff",
};

// ── IndexedDB ──
const DB_NAME = "docsnap_db";
const STORE = "pages";
function openDB() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains(STORE)) r.result.createObjectStore(STORE, { keyPath: "id" }); };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function dbSave(pages) { const db = await openDB(); const tx = db.transaction(STORE, "readwrite"); const s = tx.objectStore(STORE); s.clear(); pages.forEach(p => s.put(p)); return new Promise((r, e) => { tx.oncomplete = r; tx.onerror = () => e(tx.error); }); }
async function dbLoad() { const db = await openDB(); const tx = db.transaction(STORE, "readonly"); const req = tx.objectStore(STORE).getAll(); return new Promise((r, e) => { req.onsuccess = () => r(req.result || []); req.onerror = () => e(req.error); }); }
async function dbClear() { const db = await openDB(); const tx = db.transaction(STORE, "readwrite"); tx.objectStore(STORE).clear(); return new Promise(r => { tx.oncomplete = r; }); }

export default function DocSnap() {
  const [pdfLib, setPdfLib] = useState(null);
  const [pdfjs, setPdfjs] = useState(null);
  const [pages, setPages] = useState([]);
  const [activeIdx, setActiveIdx] = useState(null);
  const [mode, setMode] = useState("gallery");
  const [cameraStream, setCameraStream] = useState(null);
  const [filter, setFilter] = useState("original");
  const [brightness, setBrightness] = useState(100);
  const [contrast, setContrast] = useState(100);
  const [processing, setProcessing] = useState(false);
  const [processingMsg, setProcessingMsg] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const videoRef = useRef(null);
  const fileRef = useRef(null);
  const saveTimer = useRef(null);

  // Load libraries
  useEffect(() => {
    const s = document.createElement("script");
    s.src = PDFLIB_CDN;
    s.onload = () => setPdfLib(window.PDFLib);
    document.head.appendChild(s);
    import(PDFJS_CDN).then(mod => {
      mod.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
      setPdfjs(mod);
    }).catch(() => {});
  }, []);

  // Load saved pages
  useEffect(() => {
    dbLoad().then(saved => { if (saved.length) setPages(saved); setLoaded(true); }).catch(() => setLoaded(true));
  }, []);

  // Auto-save
  useEffect(() => {
    if (!loaded) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => { dbSave(pages).catch(() => {}); }, 500);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, [pages, loaded]);

  // Styles
  useEffect(() => {
    const s = document.createElement("style");
    s.textContent = `
      @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
      * { box-sizing: border-box; margin: 0; padding: 0; -webkit-tap-highlight-color: transparent; }
      html, body { overscroll-behavior: none; }
      ::-webkit-scrollbar { width: 0; }
      @keyframes spin { to { transform: rotate(360deg); } }
      @keyframes fadeIn { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }
      @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:0.5; } }
      .ds-btn { font-family: 'Inter', sans-serif; cursor: pointer; transition: all 0.15s; border: none; outline: none; -webkit-user-select: none; user-select: none; }
      .ds-btn:active { transform: scale(0.96); opacity: 0.85; }
      .ds-card { transition: all 0.2s; }
      .ds-card:active { transform: scale(0.97); }
      input[type=range] { -webkit-appearance: none; background: ${C.border}; height: 4px; border-radius: 2px; outline: none; width: 100%; }
      input[type=range]::-webkit-slider-thumb { -webkit-appearance: none; width: 20px; height: 20px; background: ${C.accent}; border-radius: 50%; cursor: pointer; border: 2px solid ${C.white}; box-shadow: 0 2px 8px #0004; }
    `;
    document.head.appendChild(s);
    return () => document.head.removeChild(s);
  }, []);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment", width: { ideal: 1920 }, height: { ideal: 1080 } } });
      setCameraStream(stream);
      setMode("camera");
      setTimeout(() => { if (videoRef.current) { videoRef.current.srcObject = stream; videoRef.current.play(); } }, 100);
    } catch { alert("Camera unavailable. Use Upload instead."); }
  };

  const stopCamera = useCallback(() => {
    if (cameraStream) { cameraStream.getTracks().forEach(t => t.stop()); setCameraStream(null); }
    setMode("gallery");
  }, [cameraStream]);

  const capturePhoto = () => {
    if (!videoRef.current) return;
    const v = videoRef.current;
    const c = document.createElement("canvas");
    c.width = v.videoWidth; c.height = v.videoHeight;
    c.getContext("2d").drawImage(v, 0, 0);
    setPages(p => [...p, { id: Date.now(), src: c.toDataURL("image/jpeg", 0.9), rotation: 0, filter: "original", brightness: 100, contrast: 100, label: `Scan ${p.length + 1}`, ts: Date.now() }]);
  };

  // Handle both image and PDF uploads
  const handleFileUpload = async (fileList) => {
    const files = Array.from(fileList);
    const imageFiles = files.filter(f => f.type.startsWith("image/"));
    const pdfFiles = files.filter(f => f.type === "application/pdf");

    // Process images
    for (const file of imageFiles) {
      const dataUrl = await new Promise((res) => {
        const r = new FileReader();
        r.onload = () => res(r.result);
        r.readAsDataURL(file);
      });
      setPages(p => [...p, { id: Date.now() + Math.random(), src: dataUrl, rotation: 0, filter: "original", brightness: 100, contrast: 100, label: file.name.replace(/\.[^.]+$/, ""), ts: Date.now() }]);
    }
                </div>
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                <span style={{ fontSize: 12, color: C.muted, fontWeight: 500 }}>Contrast</span>
                <span style={{ fontSize: 12, color: C.text, fontWeight: 600 }}>{contrast}%</span>
              </div>
              <input type="range" min="30" max="200" value={contrast} onChange={e => setContrast(+e.target.value)} />
            </div>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button className="ds-btn" onClick={() => rotatePage(activeIdx)} style={{ flex: 1, padding: "12px", background: C.surface2, color: C.text, borderRadius: 10, fontSize: 14, fontWeight: 500, border: `1px solid ${C.border}` }}>↻ Rotate</button>
            <button className="ds-btn" onClick={() => deletePage(activeIdx)} style={{ flex: 1, padding: "12px", background: "#1C1015", color: C.danger, borderRadius: 10, fontSize: 14, fontWeight: 500, border: "1px solid #3D1A1A" }}>✕ Delete</button>
          </div>
        </div>
      </div>
    );
  }

  // ── GALLERY ──
  return (
    <div style={{ minHeight: "100vh", background: C.bg, fontFamily: font, display: "flex", flexDirection: "column" }}>
      {processingOverlay}

      {/* Header */}
      <header style={{ padding: "14px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: `1px solid ${C.border}`, background: `${C.bg}ee`, position: "sticky", top: 0, zIndex: 50, backdropFilter: "blur(12px)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: `linear-gradient(135deg, ${C.accent}, ${C.accentLight})`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 800, color: C.white }}>DS</div>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, color: C.text, letterSpacing: -0.5 }}>DocSnap</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {pages.length > 0 && (
            <>
              <button className="ds-btn" onClick={() => setShowClearConfirm(true)} style={{ background: C.surface2, color: C.muted, width: 36, height: 36, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, border: `1px solid ${C.border}` }}>🗑</button>
              <button className="ds-btn" onClick={exportPDF} disabled={processing} style={{ background: C.accent, color: C.white, padding: "9px 18px", borderRadius: 10, fontSize: 13, fontWeight: 600 }}>
                Export ({pages.length})
              </button>
            </>
          )}
        </div>
      </header>

      <input ref={fileRef} type="file" accept="image/*,application/pdf" multiple style={{ display: "none" }} onChange={e => { handleFileUpload(e.target.files); e.target.value = ""; }} />

      {/* Clear confirm */}
      {showClearConfirm && (
        <div style={{ position: "fixed", inset: 0, background: "#000b", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }} onClick={() => setShowClearConfirm(false)}>
          <div style={{ background: C.surface, borderRadius: 20, padding: 28, maxWidth: 320, width: "100%", border: `1px solid ${C.border}` }} onClick={e => e.stopPropagation()}>
            <p style={{ fontSize: 18, fontWeight: 700, color: C.text, marginBottom: 8 }}>Delete all scans?</p>
            <p style={{ fontSize: 14, color: C.muted, lineHeight: 1.6, marginBottom: 24 }}>This removes all {pages.length} pages from this device permanently.</p>
            <div style={{ display: "flex", gap: 10 }}>
              <button className="ds-btn" onClick={() => setShowClearConfirm(false)} style={{ flex: 1, padding: "12px", background: C.surface2, color: C.text, borderRadius: 12, fontSize: 14, fontWeight: 500, border: `1px solid ${C.border}` }}>Cancel</button>
              <button className="ds-btn" onClick={clearAll} style={{ flex: 1, padding: "12px", background: C.danger, color: C.white, borderRadius: 12, fontSize: 14, fontWeight: 600 }}>Delete All</button>
            </div>
          </div>
        </div>
      )}

      {/* Empty state */}
      {pages.length === 0 ? (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 32 }}>
          <div style={{ width: 88, height: 88, borderRadius: 24, background: `linear-gradient(135deg, ${C.accent}22, ${C.accentLight}11)`, border: `1px solid ${C.accent}33`, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 24 }}>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke={C.accent} strokeWidth="1.5">
              <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" />
              <circle cx="12" cy="13" r="4" />
            </svg>
          </div>
          <p style={{ fontSize: 22, fontWeight: 700, color: C.text, marginBottom: 8 }}>Snap your documents</p>
          <p style={{ fontSize: 14, color: C.muted, textAlign: "center", maxWidth: 300, lineHeight: 1.7, marginBottom: 32 }}>
            Scan contracts, deeds, reports. Upload images or PDFs. Export as clean PDF.
          </p>
          <div style={{ display: "flex", gap: 12, width: "100%", maxWidth: 320 }}>
            <button className="ds-btn" onClick={startCamera} style={{ flex: 1, background: C.accent, color: C.white, padding: "16px", borderRadius: 14, fontSize: 15, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" /><circle cx="12" cy="13" r="4" /></svg>
              Camera
            </button>
            <button className="ds-btn" onClick={() => fileRef.current?.click()} style={{ flex: 1, background: C.surface2, color: C.text, padding: "16px", borderRadius: 14, fontSize: 15, fontWeight: 500, border: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" /></svg>
              Upload
            </button>
          </div>
          <p style={{ fontSize: 11, color: C.muted, marginTop: 16 }}>Supports JPG, PNG, PDF files</p>
        </div>
      ) : (
        <>
          {/* Page grid */}
          <div style={{ flex: 1, padding: 16, overflowY: "auto" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(105px, 1fr))", gap: 10 }}>
              {pages.map((pg, idx) => (
                <div key={pg.id} className="ds-card" onClick={() => openEdit(idx)} style={{
                  background: C.surface, borderRadius: 12, overflow: "hidden", border: `1px solid ${C.border}`,
                  animation: `fadeIn 0.25s ease ${Math.min(idx * 0.03, 0.5)}s both`,
                }}>
                  <div style={{ width: "100%", aspectRatio: "3/4", overflow: "hidden", background: C.surface2, display: "flex", alignItems: "center", justifyContent: "center", position: "relative" }}>
                    <img src={pg.src} style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "cover", transform: `rotate(${pg.rotation}deg)`, filter: getFilter(pg) }} />
                    {pg.rotation > 0 && <span style={{ position: "absolute", top: 4, right: 4, background: "#000b", color: C.white, fontSize: 9, padding: "2px 5px", borderRadius: 4 }}>{pg.rotation}°</span>}
                    {pg.filter !== "original" && <span style={{ position: "absolute", top: 4, left: 4, background: `${C.accent}cc`, color: C.white, fontSize: 8, padding: "2px 5px", borderRadius: 4, fontWeight: 600 }}>{pg.filter === "grayscale" ? "B&W" : pg.filter === "highcontrast" ? "DOC" : "SHARP"}</span>}
                  </div>
                  <div style={{ padding: "6px 8px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: C.text }}>{idx + 1}</span>
                    <span style={{ fontSize: 9, color: C.muted, maxWidth: 60, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{pg.label}</span>
                  </div>
                </div>
              ))}

              {/* Add card */}
              <div className="ds-card" onClick={() => fileRef.current?.click()} style={{
                borderRadius: 12, border: `2px dashed ${C.border}`, display: "flex", flexDirection: "column",
                alignItems: "center", justifyContent: "center", minHeight: 140, cursor: "pointer",
              }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={C.muted} strokeWidth="2"><path d="M12 5v14M5 12h14" /></svg>
                <span style={{ fontSize: 10, color: C.muted, marginTop: 6 }}>Add</span>
              </div>
            </div>
          </div>

          {/* Bottom bar */}
          <div style={{ padding: "12px 16px 20px", borderTop: `1px solid ${C.border}`, display: "flex", gap: 10, background: C.surface, position: "sticky", bottom: 0 }}>
            <button className="ds-btn" onClick={startCamera} style={{ flex: 1, padding: "14px", background: C.accent, color: C.white, borderRadius: 12, fontSize: 14, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" /><circle cx="12" cy="13" r="4" /></svg>
              Scan
            </button>
            <button className="ds-btn" onClick={() => fileRef.current?.click()} style={{ flex: 1, padding: "14px", background: C.surface2, color: C.text, borderRadius: 12, fontSize: 14, fontWeight: 500, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, border: `1px solid ${C.border}` }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" /></svg>
              Upload
            </button>
          </div>
        </>
      )}
    </div>
  );
                                                                     }
