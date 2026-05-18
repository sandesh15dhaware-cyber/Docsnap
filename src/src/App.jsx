import { useState, useEffect, useRef, useCallback } from "react";

const PDFLIB_CDN = "https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js";
const C = {
  bg: "#101114", surface: "#1B1D24", surface2: "#24272F", border: "#2F3340",
  accent: "#2A7AE4", accentHover: "#3B8BF5", text: "#E4E5EA", muted: "#6E7285",
  danger: "#C0392B", success: "#27AE60", white: "#fff",
};

// â”€â”€ IndexedDB helpers â”€â”€
const DB_NAME = "docsnap_db";
const STORE_NAME = "pages";
const DB_VERSION = 1;

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function dbSavePages(pages) {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, "readwrite");
  const store = tx.objectStore(STORE_NAME);
  store.clear();
  pages.forEach(p => store.put(p));
  return new Promise((resolve, reject) => {
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

async function dbLoadPages() {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, "readonly");
  const store = tx.objectStore(STORE_NAME);
  const req = store.getAll();
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

async function dbClearPages() {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, "readwrite");
  tx.objectStore(STORE_NAME).clear();
  return new Promise((resolve, reject) => {
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

export default function DocSnap() {
  const [pdfLib, setPdfLib] = useState(null);
  const [pages, setPages] = useState([]);
  const [activeIdx, setActiveIdx] = useState(null);
  const [mode, setMode] = useState("gallery");
  const [cameraStream, setCameraStream] = useState(null);
  const [filter, setFilter] = useState("original");
  const [brightness, setBrightness] = useState(100);
  const [contrast, setContrast] = useState(100);
  const [processing, setProcessing] = useState(false);
  const [dragIdx, setDragIdx] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const videoRef = useRef(null);
  const fileRef = useRef(null);
  const saveTimer = useRef(null);

  // Load pdf-lib
  useEffect(() => {
    const s = document.createElement("script");
    s.src = PDFLIB_CDN;
    s.onload = () => setPdfLib(window.PDFLib);
    document.head.appendChild(s);
  }, []);

  // Load saved pages on startup
  useEffect(() => {
    dbLoadPages().then(saved => {
      if (saved.length > 0) setPages(saved);
      setLoaded(true);
    }).catch(() => setLoaded(true));
  }, []);

  // Auto-save pages to IndexedDB on change (debounced)
  useEffect(() => {
    if (!loaded) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      dbSavePages(pages).catch(e => console.error("Save failed:", e));
    }, 500);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, [pages, loaded]);

  // Inject styles
  useEffect(() => {
    const s = document.createElement("style");
    s.textContent = `
      @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=DM+Mono:wght@400;500&display=swap');
      * { box-sizing: border-box; margin: 0; padding: 0; }
      ::-webkit-scrollbar { width: 5px; height: 5px; }
      ::-webkit-scrollbar-thumb { background: ${C.border}; border-radius: 3px; }
      @keyframes spin { to { transform: rotate(360deg); } }
      @keyframes slideUp { from { opacity:0; transform:translateY(16px); } to { opacity:1; transform:translateY(0); } }
      .ds-btn { font-family: 'DM Sans', sans-serif; cursor: pointer; transition: all 0.15s; border: none; outline: none; }
      .ds-btn:active { transform: scale(0.97); }
      input[type=range] { -webkit-appearance: none; background: ${C.border}; height: 4px; border-radius: 2px; outline: none; }
      input[type=range]::-webkit-slider-thumb { -webkit-appearance: none; width: 16px; height: 16px; background: ${C.accent}; border-radius: 50%; cursor: pointer; }
    `;
    document.head.appendChild(s);
    return () => document.head.removeChild(s);
  }, []);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1920 }, height: { ideal: 1080 } }
      });
      setCameraStream(stream);
      setMode("camera");
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play();
        }
      }, 100);
    } catch {
      alert("Camera access denied or unavailable. Use file upload instead.");
    }
  };

  const stopCamera = useCallback(() => {
    if (cameraStream) {
      cameraStream.getTracks().forEach(t => t.stop());
      setCameraStream(null);
    }
    setMode("gallery");
  }, [cameraStream]);

  const capturePhoto = () => {
    if (!videoRef.current) return;
    const v = videoRef.current;
    const c = document.createElement("canvas");
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    c.getContext("2d").drawImage(v, 0, 0);
    const dataUrl = c.toDataURL("image/jpeg", 0.92);
    setPages(p => [...p, { id: Date.now(), src: dataUrl, rotation: 0, filter: "original", brightness: 100, contrast: 100, label: "", createdAt: new Date().toISOString() }]);
  };

  const handleFileUpload = (fileList) => {
    Array.from(fileList).forEach(file => {
      if (!file.type.startsWith("image/")) return;
      const reader = new FileReader();
      reader.onload = (e) => {
        setPages(p => [...p, {
          id: Date.now() + Math.random(),
          src: e.target.result,
          rotation: 0, filter: "original", brightness: 100, contrast: 100,
          label: file.name.replace(/\.[^.]+$/, ""),
          createdAt: new Date().toISOString()
        }]);
      };
      reader.readAsDataURL(file);
    });
  };

  const openEdit = (idx) => {
    setActiveIdx(idx);
    const pg = pages[idx];
    setFilter(pg.filter);
    setBrightness(pg.brightness);
    setContrast(pg.contrast);
    setMode("edit");
  };

  const saveEdit = () => {
    if (activeIdx === null) return;
    setPages(p => p.map((pg, i) => i === activeIdx ? { ...pg, filter, brightness, contrast } : pg));
    setMode("gallery");
    setActiveIdx(null);
  };

  const rotatePage = (idx) => {
    setPages(p => p.map((pg, i) => i === idx ? { ...pg, rotation: (pg.rotation + 90) % 360 } : pg));
  };

  const deletePage = (idx) => {
    setPages(p => p.filter((_, i) => i !== idx));
    if (mode === "edit") { setMode("gallery"); setActiveIdx(null); }
  };

  const clearAllPages = async () => {
    setPages([]);
    await dbClearPages();
    setShowClearConfirm(false);
  };

  const onDragStart = (i) => setDragIdx(i);
  const onDragOver = (e, i) => {
    e.preventDefault();
    if (dragIdx === null || dragIdx === i) return;
    setPages(prev => {
      const n = [...prev]; const [item] = n.splice(dragIdx, 1); n.splice(i, 0, item); return n;
    });
    setDragIdx(i);
  };
  const onDragEnd = () => setDragIdx(null);

  const getFilter = (pg) => {
    let f = `brightness(${pg.brightness}%) contrast(${pg.contrast}%)`;
    if (pg.filter === "grayscale") f += " grayscale(1)";
    if (pg.filter === "highcontrast") f += " grayscale(1) contrast(200%) brightness(120%)";
    if (pg.filter === "sharpen") f += " contrast(130%) brightness(105%)";
    return f;
  };

  const exportPDF = async () => {
    if (!pdfLib || pages.length === 0) return;
    setProcessing(true);
    try {
      const { PDFDocument } = pdfLib;
      const doc = await PDFDocument.create();

      for (const pg of pages) {
        const img = new Image();
        await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = pg.src; });

        const c = document.createElement("canvas");
        const isRotated = pg.rotation === 90 || pg.rotation === 270;
        c.width = isRotated ? img.height : img.width;
        c.height = isRotated ? img.width : img.height;
        const ctx = c.getContext("2d");
        ctx.filter = getFilter(pg);
        ctx.translate(c.width / 2, c.height / 2);
        ctx.rotate((pg.rotation * Math.PI) / 180);
        ctx.drawImage(img, -img.width / 2, -img.height / 2);

        const jpegData = await fetch(c.toDataURL("image/jpeg", 0.88)).then(r => r.arrayBuffer());
        const embedded = await doc.embedJpg(new Uint8Array(jpegData));

        const pWidth = 595.28;
        const pHeight = 841.89;
        const page = doc.addPage([pWidth, pHeight]);
        const scale = Math.min(pWidth / embedded.width, pHeight / embedded.height);
        const w = embedded.width * scale;
        const h = embedded.height * scale;
        page.drawImage(embedded, { x: (pWidth - w) / 2, y: (pHeight - h) / 2, width: w, height: h });
      }

      const bytes = await doc.save();
      const blob = new Blob([bytes], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `docsnap_${new Date().toISOString().slice(0, 10)}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
      alert("PDF export failed.");
    }
    setProcessing(false);
  };

  const activePage = activeIdx !== null ? pages[activeIdx] : null;
  const mono = "'DM Mono', monospace";

  // Loading state
  if (!loaded) {
    return (
      <div style={{ height: "100vh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'DM Sans', sans-serif" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ width: 32, height: 32, border: `3px solid ${C.border}`, borderTopColor: C.accent, borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto 16px" }} />
          <p style={{ color: C.muted, fontSize: 13 }}>Loading saved scans...</p>
        </div>
      </div>
    );
  }

  // â”€â”€ CAMERA MODE â”€â”€
  if (mode === "camera") {
    return (
      <div style={{ height: "100vh", background: "#000", display: "flex", flexDirection: "column", fontFamily: "'DM Sans', sans-serif" }}>
        <video ref={videoRef} autoPlay playsInline muted style={{ flex: 1, objectFit: "cover", width: "100%" }} />
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
          <div style={{ width: "82%", height: "70%", border: `2px solid ${C.accent}88`, borderRadius: 12, boxShadow: `0 0 0 9999px #00000055` }} />
        </div>
        <div style={{ position: "absolute", top: 16, left: 16, right: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <button className="ds-btn" onClick={stopCamera}
            style={{ background: "#000a", color: C.white, padding: "8px 16px", borderRadius: 8, fontSize: 14, backdropFilter: "blur(8px)" }}>
            âœ• Close
          </button>
          <span style={{ background: "#000a", color: C.muted, padding: "6px 14px", borderRadius: 8, fontSize: 12, fontFamily: mono, backdropFilter: "blur(8px)" }}>
            {pages.length} snapped
          </span>
        </div>
        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "24px 0 36px", display: "flex", justifyContent: "center", alignItems: "center", gap: 24, background: "linear-gradient(transparent, #000c)" }}>
          <button className="ds-btn" onClick={capturePhoto}
            style={{ width: 72, height: 72, borderRadius: "50%", background: C.white, border: `4px solid ${C.accent}`, boxShadow: `0 0 0 4px #0008` }}>
          </button>
        </div>
      </div>
    );
  }

  // â”€â”€ EDIT MODE â”€â”€
  if (mode === "edit" && activePage) {
    return (
      <div style={{ height: "100vh", background: C.bg, display: "flex", flexDirection: "column", fontFamily: "'DM Sans', sans-serif" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 20px", borderBottom: `1px solid ${C.border}` }}>
          <button className="ds-btn" onClick={() => { setMode("gallery"); setActiveIdx(null); }}
            style={{ background: "none", color: C.muted, fontSize: 14, padding: "6px 12px" }}>
            â† Back
          </button>
          <span style={{ fontSize: 13, color: C.muted, fontFamily: mono }}>Page {activeIdx + 1}/{pages.length}</span>
          <button className="ds-btn" onClick={saveEdit}
            style={{ background: C.accent, color: C.white, padding: "8px 20px", borderRadius: 8, fontSize: 13, fontWeight: 600 }}>
            Apply
          </button>
        </div>

        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", padding: 16 }}>
          <img
            src={activePage.src}
            style={{
              maxWidth: "90%", maxHeight: "100%", objectFit: "contain", borderRadius: 4,
              transform: `rotate(${activePage.rotation}deg)`,
              filter: (() => {
                let f = `brightness(${brightness}%) contrast(${contrast}%)`;
                if (filter === "grayscale") f += " grayscale(1)";
                if (filter === "highcontrast") f += " grayscale(1) contrast(200%) brightness(120%)";
                if (filter === "sharpen") f += " contrast(130%) brightness(105%)";
                return f;
              })(),
              transition: "filter 0.2s, transform 0.3s",
            }}
          />
        </div>

        <div style={{ padding: "16px 20px 24px", borderTop: `1px solid ${C.border}`, background: C.surface }}>
          <div style={{ display: "flex", gap: 8, marginBottom: 16, overflowX: "auto", paddingBottom: 4 }}>
            {[
              { key: "original", label: "Original" },
              { key: "grayscale", label: "B&W" },
              { key: "highcontrast", label: "Document" },
              { key: "sharpen", label: "Sharp" },
            ].map(f => (
              <button key={f.key} className="ds-btn" onClick={() => setFilter(f.key)}
                style={{
                  padding: "8px 18px", borderRadius: 20, fontSize: 12, fontWeight: 500, whiteSpace: "nowrap",
                  background: filter === f.key ? C.accent : C.surface2,
                  color: filter === f.key ? C.white : C.muted,
                }}>
                {f.label}
              </button>
            ))}
          </div>
          <div style={{ display: "flex", gap: 24, alignItems: "center" }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ fontSize: 11, color: C.muted }}>Brightness</span>
                <span style={{ fontSize: 11, color: C.text, fontFamily: mono }}>{brightness}%</span>
              </div>
              <input type="range" min="30" max="200" value={brightness} onChange={e => setBrightness(+e.target.value)} style={{ width: "100%" }} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ fontSize: 11, color: C.muted }}>Contrast</span>
                <span style={{ fontSize: 11, color: C.text, fontFamily: mono }}>{contrast}%</span>
              </div>
              <input type="range" min="30" max="200" value={contrast} onChange={e => setContrast(+e.target.value)} style={{ width: "100%" }} />
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
            <button className="ds-btn" onClick={() => rotatePage(activeIdx)}
              style={{ flex: 1, padding: "10px", background: C.surface2, color: C.text, borderRadius: 8, fontSize: 13 }}>
              â†» Rotate
            </button>
            <button className="ds-btn" onClick={() => deletePage(activeIdx)}
              style={{ flex: 1, padding: "10px", background: "#2A1515", color: C.danger, borderRadius: 8, fontSize: 13 }}>
              âœ• Delete
            </button>
          </div>
        </div>
      </div>
    );
  }

  // â”€â”€ GALLERY MODE â”€â”€
  return (
    <div style={{ minHeight: "100vh", background: C.bg, fontFamily: "'DM Sans', sans-serif", display: "flex", flexDirection: "column" }}>
      <header style={{ padding: "16px 20px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 34, height: 34, borderRadius: 8,
            background: `linear-gradient(135deg, ${C.accent}, #5BA0F5)`,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 13, fontWeight: 800, color: C.white, letterSpacing: -0.5,
          }}>DS</div>
          <div>
            <div style={{ fontSize: 17, fontWeight: 700, letterSpacing: -0.3, color: C.text }}>DocSnap</div>
            <div style={{ fontSize: 10, color: C.muted, fontFamily: mono, letterSpacing: 1 }}>SCAN &amp; EXPORT</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {pages.length > 0 && (
            <>
              <button className="ds-btn" onClick={() => setShowClearConfirm(true)}
                style={{ background: "none", color: C.muted, padding: "8px", borderRadius: 8, fontSize: 12 }}>
                ðŸ—‘
              </button>
              <button className="ds-btn" onClick={exportPDF} disabled={processing}
                style={{
                  background: C.accent, color: C.white, padding: "9px 20px",
                  borderRadius: 8, fontSize: 13, fontWeight: 600, opacity: processing ? 0.6 : 1,
                }}>
                {processing ? "Exportingâ€¦" : `Export PDF (${pages.length})`}
              </button>
            </>
          )}
        </div>
      </header>

      <input ref={fileRef} type="file" accept="image/*" multiple capture="environment"
        style={{ display: "none" }} onChange={e => { handleFileUpload(e.target.files); e.target.value = ""; }} />

      {/* Clear all confirmation */}
      {showClearConfirm && (
        <div style={{ position: "fixed", inset: 0, background: "#000b", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}
          onClick={() => setShowClearConfirm(false)}>
          <div style={{ background: C.surface, borderRadius: 16, padding: 24, maxWidth: 320, width: "100%", border: `1px solid ${C.border}` }}
            onClick={e => e.stopPropagation()}>
            <p style={{ fontSize: 16, fontWeight: 600, color: C.text, marginBottom: 8 }}>Delete all scans?</p>
            <p style={{ fontSize: 13, color: C.muted, lineHeight: 1.5, marginBottom: 20 }}>This will permanently remove all {pages.length} scanned pages from this device.</p>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="ds-btn" onClick={() => setShowClearConfirm(false)}
                style={{ flex: 1, padding: "10px", background: C.surface2, color: C.text, borderRadius: 8, fontSize: 13, border: `1px solid ${C.border}` }}>
                Cancel
              </button>
              <button className="ds-btn" onClick={clearAllPages}
                style={{ flex: 1, padding: "10px", background: C.danger, color: C.white, borderRadius: 8, fontSize: 13, fontWeight: 600 }}>
 Delete All
              </button>
            </div>
          </div>
        </div>
      )}

      {pages.length === 0 ? (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 32 }}>
          <div style={{ width: 80, height: 80, borderRadius: 20, background: C.surface, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 20 }}>
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke={C.accent} strokeWidth="1.5">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <path d="M21 15l-5-5L5 21" />
            </svg>
          </div>
          <p style={{ fontSize: 18, fontWeight: 600, color: C.text, marginBottom: 6 }}>Snap your documents</p>
          <p style={{ fontSize: 13, color: C.muted, textAlign: "center", maxWidth: 280, lineHeight: 1.6, marginBottom: 28 }}>
            Capture contracts, deeds, inspection reports â€” export as clean PDFs. Your scans are saved on this device.
          </p>
          <div style={{ display: "flex", gap: 12 }}>
            <button className="ds-btn" onClick={startCamera}
              style={{ background: C.accent, color: C.white, padding: "14px 28px", borderRadius: 10, fontSize: 14, fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" />
                <circle cx="12" cy="13" r="4" />
              </svg>
              Camera
            </button>
            <button className="ds-btn" onClick={() => fileRef.current?.click()}
              style={{ background: C.surface2, color: C.text, padding: "14px 28px", borderRadius: 10, fontSize: 14, fontWeight: 500, border: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 8 }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" />
              </svg>
              Upload
            </button>
          </div>
        </div>
      ) : (
        <>
          <div style={{ flex: 1, padding: 16, overflowY: "auto" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 12 }}>
              {pages.map((pg, idx) => (
                <div
                  key={pg.id}
                  draggable
                  onDragStart={() => onDragStart(idx)}
                  onDragOver={(e) => onDragOver(e, idx)}
                  onDragEnd={onDragEnd}
                  onClick={() => openEdit(idx)}
                  style={{
                    background: C.surface, borderRadius: 10, overflow: "hidden",
                    border: `1px solid ${C.border}`, cursor: "pointer",
                    transition: "all 0.2s", opacity: dragIdx === idx ? 0.4 : 1,
                    animation: `slideUp 0.25s ease ${idx * 0.03}s both`,
                  }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = C.accent; e.currentTarget.style.transform = "translateY(-2px)"; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.transform = "none"; }}
                >
                  <div style={{ width: "100%", aspectRatio: "3/4", overflow: "hidden", background: C.surface2, display: "flex", alignItems: "center", justifyContent: "center", position: "relative" }}>
                    <img src={pg.src} style={{
                      maxWidth: "100%", maxHeight: "100%", objectFit: "cover",
                      transform: `rotate(${pg.rotation}deg)`,
                      filter: getFilter(pg),
                    }} />
                    {pg.rotation > 0 && (
                      <span style={{ position: "absolute", top: 6, right: 6, background: "#000b", color: C.white, fontSize: 9, padding: "2px 6px", borderRadius: 4, fontFamily: mono }}>{pg.rotation}Â°</span>
                    )}
                    {pg.filter !== "original" && (
                      <span style={{ position: "absolute", top: 6, left: 6, background: `${C.accent}cc`, color: C.white, fontSize: 9, padding: "2px 6px", borderRadius: 4 }}>{pg.filter}</span>
                    )}
                  </div>
                  <div style={{ padding: "8px 10px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: C.text }}>{idx + 1}</span>
                    <span style={{ fontSize: 10, color: C.muted }}>tap to edit</span>
                  </div>
                </div>
              ))}

              <div
                onClick={() => fileRef.current?.click()}
                style={{
                  background: "transparent", borderRadius: 10, border: `2px dashed ${C.border}`,
                  display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                  cursor: "pointer", minHeight: 180, transition: "all 0.2s",
                }}
                onMouseEnter={e => e.currentTarget.style.borderColor = C.accent}
                onMouseLeave={e => e.currentTarget.style.borderColor = C.border}
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={C.muted} strokeWidth="2"><path d="M12 5v14M5 12h14" /></svg>
                <span style={{ fontSize: 11, color: C.muted, marginTop: 8 }}>Add page</span>
              </div>
            </div>
          </div>

          <div style={{ padding: "12px 16px", borderTop: `1px solid ${C.border}`, display: "flex", gap: 8, background: C.surface }}>
            <button className="ds-btn" onClick={startCamera}
              style={{ flex: 1, padding: "12px", background: C.surface2, color: C.text, borderRadius: 8, fontSize: 13, fontWeight: 500, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, border: `1px solid ${C.border}` }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" />
                <circle cx="12" cy="13" r="4" />
              </svg>
              Scan
            </button>
            <button className="ds-btn" onClick={() => fileRef.current?.click()}
              style={{ flex: 1, padding: "12px", background: C.surface2, color: C.text, borderRadius: 8, fontSize: 13, fontWeight: 500, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, border: `1px solid ${C.border}` }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" />
              </svg>
              Upload
            </button>
          </div>
        </>
      )}
    </div>
  );
}
