import { useState, useEffect, useRef, useCallback } from "react";

const PDFLIB_CDN = "https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js";
const PDFJS_CDN = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.mjs";
const PDFJS_WORKER = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.mjs";

const C = {
  bg: "#0B0D11", surface: "#151820", surface2: "#1E2230", border: "#282D3E",
  accent: "#2563EB", accentLight: "#3B82F6", text: "#F0F1F5", muted: "#6B7194",
  danger: "#DC2626", white: "#fff",
};

// â”€â”€ IndexedDB â”€â”€
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
              <div style={{ position: "absolute", bottom: -1, left: -1, width: 28, height: 28, borderBottom: `3px solid ${C.accent}`, borderLeft: `3px solid ${C.accent}`, borderRadius: "0 0 0 16px" }} />
            <div style={{ position: "absolute", bottom: -1, right: -1, width: 28, height: 28, borderBottom: `3px solid ${C.accent}`, borderRight: `3px solid ${C.accent}`, borderRadius: "0 0 16px 0" }} />
          </div>
        </div>
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, padding: "16px 20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <button className="ds-btn" onClick={stopCamera} style={{ background: "#111a", backdropFilter: "blur(12px)", color: C.white, padding: "10px 18px", borderRadius: 12, fontSize: 14, fontWeight: 500 }}>âœ• Close</button>
          <div style={{ background: "#111a", backdropFilter: "blur(12px)", color: C.white, padding: "8px 16px", borderRadius: 12, fontSize: 13, fontWeight: 600 }}>{pages.length} pages</div>
        </div>
        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "20px 0 40px", display: "flex", justifyContent: "center", background: "linear-gradient(transparent, #000a)" }}>
          <button className="ds-btn" onClick={capturePhoto} style={{ width: 76, height: 76, borderRadius: "50%", background: C.white, border: `4px solid ${C.accent}`, boxShadow: "0 4px 20px #0006" }} />
        </div>
      </div>
    );
}
"highcontrast" ? "DOC" : "SHARP"}</span>}
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
