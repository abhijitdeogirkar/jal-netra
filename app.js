/* =============================================================================
   🌊 JAL-NETRA — Frontend (टप्पा २)
   splash · login · force-password · inspector home · entry form (GPS + camera +
   canvas overlay) · IndexedDB offline queue · calendar · PWA install
   ============================================================================= */
(function () {
  "use strict";
  const CFG = window.JALNETRA_CONFIG || {};
  const $ = (id) => document.getElementById(id);
  const STATUS_MR = { SAFE: "सुरक्षित", ILLEGAL_PUMPING: "बेकायदेशीर उपसा", ACTION_TAKEN: "कारवाई केली", NOT_REPORTED: "नोंद नाही" };
  const MONTHS_MR = ["जानेवारी", "फेब्रुवारी", "मार्च", "एप्रिल", "मे", "जून", "जुलै", "ऑगस्ट", "सप्टेंबर", "ऑक्टोबर", "नोव्हेंबर", "डिसेंबर"];
  const DOW_MR = ["रवि", "सोम", "मंगळ", "बुध", "गुरु", "शुक्र", "शनि"];

  // ───────────────────────── State ─────────────────────────
  const state = {
    token: null, user: null, settings: null,
    waterBodies: [], currentWb: null,
    gps: null, photoData: null,
    cal: { year: new Date().getFullYear(), month: new Date().getMonth() + 1, wbId: "" },
    deferredInstall: null
  };
  const store = {
    get: (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} },
    del: (k) => { try { localStorage.removeItem(k); } catch (e) {} }
  };
  const todayStr = () => { const d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };
  const fmtMr = (ymd) => { const [y, m, d] = ymd.split("-"); return `${parseInt(d, 10)} ${MONTHS_MR[parseInt(m, 10) - 1]} ${y}`; };

  // ───────────────────────── API ─────────────────────────
  async function api(action, data, opts) {
    if (!CFG.API_URL || CFG.API_URL.indexOf("PASTE_") === 0) throw new Error("config.js मध्ये API_URL सेट केलेली नाही.");
    const body = Object.assign({ action }, data || {});
    if (state.token && !body.token) body.token = state.token;
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), (opts && opts.timeout) || 60000);
    try {
      // 🔸 महत्त्वाचे: Content-Type हेडर नाही (text/plain) + redirect follow → Apps Script CORS साठी
      const res = await fetch(CFG.API_URL, { method: "POST", redirect: "follow", body: JSON.stringify(body), signal: ctrl.signal });
      const json = await res.json();
      if (json && json.code === "AUTH") { doLogout(true); throw new Error(json.message); }
      return json;
    } finally { clearTimeout(t); }
  }
  const toast = (icon, title) => Swal.fire({ toast: true, position: "top", icon, title, showConfirmButton: false, timer: 2200 });
  const busy = (title) => Swal.fire({ title, allowOutsideClick: false, showConfirmButton: false, didOpen: () => Swal.showLoading() });

  // ───────────────────────── Logo fallback (icons/ न सापडल्यास inline SVG) ─────────────────────────
  const LOGO_SVG = "data:image/svg+xml;utf8," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect x="4" y="4" width="92" height="92" rx="22" fill="#5a3a1c"/><path d="M50 14 C62 32 76 44 76 60 a26 26 0 0 1 -52 0 C24 44 38 32 50 14z" fill="#0b4f6c"/><ellipse cx="50" cy="60" rx="17" ry="9" fill="#fdfaf4"/><circle cx="50" cy="60" r="7.5" fill="#1b998b"/><circle cx="50" cy="60" r="3.3" fill="#161210"/><circle cx="53" cy="57" r="1.5" fill="#fff"/></svg>');
  document.querySelectorAll("img.jn-logo").forEach((img) => {
    img.addEventListener("error", () => { img.src = LOGO_SVG; }, { once: true });
    if (img.complete && img.naturalWidth === 0) img.src = LOGO_SVG; // आधीच तुटले असेल तर
  });

  const isStandalone = () => window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true || document.referrer.includes("android-app://");
  const isIOS = () => /iPhone|iPad|iPod/i.test(navigator.userAgent);

  // ───────────────────────── Splash ─────────────────────────
  function runSplash() {
    const s = $("splash");
    setTimeout(() => s.classList.add("open"), 1500);
    setTimeout(() => { s.style.display = "none"; }, 3100);
  }

  // ───────────────────────── Network indicator ─────────────────────────
  function updateNet() {
    const el = $("netState"); if (!el) return;
    el.className = "net-dot " + (navigator.onLine ? "on" : "off");
    el.textContent = navigator.onLine ? "ऑनलाइन" : "ऑफलाइन";
  }
  window.addEventListener("online", () => { updateNet(); refreshOfflineBanner(); });
  window.addEventListener("offline", updateNet);

  // ───────────────────────── Screens ─────────────────────────
  function show(id) {
    ["screenLogin", "screenForcePwd", "screenInspector", "screenOfficer"].forEach((s) => { $(s).style.display = s === id ? "" : "none"; });
    const inApp = (id === "screenInspector" || id === "screenOfficer");
    $("topbar").style.display = inApp ? "" : "none";
    $("appFooter").style.display = inApp ? "" : "none";
  }

  async function loadPublicSettings() {
    try {
      const r = await api("getPublicSettings", {}, { timeout: 15000 });
      if (r && r.success) applySettings(r);
    } catch (e) { /* ऑफलाइन — डिफॉल्ट ठेवा */ }
  }
  function applySettings(s) {
    state.settings = s;
    if (s.tagline) $("splashTagline").textContent = s.tagline;
    if (s.subtitle) $("splashSubtitle").textContent = s.subtitle;
    $("tabRegisterItem").style.display = s.registrationOpen ? "" : "none";
    const sel = $("regTaluka");
    if (sel && s.talukas) sel.innerHTML = '<option value="">निवडा</option>' + s.talukas.map((t) => `<option value="${t.en}">${t.mr}</option>`).join("");
  }

  // ───────────────────────── Auth ─────────────────────────
  function restoreSession() {
    const tk = store.get("jn_token"), us = store.get("jn_user");
    if (tk && us) { try { state.token = tk; state.user = JSON.parse(us); return true; } catch (e) {} }
    return false;
  }
function enterApp() {
    $("topbarUser").textContent = `${state.user.name} · ${state.user.id}`;
    if (state.user.role === "INSPECTOR") { 
        show("screenInspector"); 
        initInspector(); 
    } else { 
        show("screenOfficer"); 
        // 🔹 हा बदल सर्वात महत्त्वाचा आहे:
        if (window.JN && window.JN.officer) {
            window.JN.officer.init(); 
        } else {
             console.error("officer.js लोड झालेले नाही!");
        }
    }
  }

  // 🔹 इतर मॉड्यूल्ससाठी (officer.js) window.JN ऑब्जेक्ट उपलब्ध करून द्या
  // १. आधी roleLabel ची व्याख्या करा
const roleLabel = (r) => ({ INSPECTOR: "निरीक्षक", TALUKA_MONITOR: "तालुका मॉनिटर", AGENCY_HEAD: "एजन्सी प्रमुख (जिल्हा)", DISTRICT_CELL: "जिल्हा मॉनिटरिंग सेल", COLLECTOR: "जिल्हाधिकारी" }[r] || r);

// २. त्यानंतर window.JN मध्ये ते वापरा
window.JN = { api, state, toast, busy, fmtMr, todayStr, STATUS_MR, MONTHS_MR, roleLabel, show, $ };
   
  $("loginForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const id = $("loginId").value.trim(), pwd = $("loginPwd").value;
    const btn = $("loginBtn"); btn.disabled = true; btn.textContent = "तपासत आहे…";
    try {
      const r = await api("login", { id, pwd });
      if (!r.success) { Swal.fire("लॉगिन झाले नाही", r.message, "error"); return; }
      state.token = r.token; state.user = r.user;
      store.set("jn_token", r.token); store.set("jn_user", JSON.stringify(r.user));
      if (r.settings) applySettings(r.settings);
      if (r.mustChangePassword) show("screenForcePwd"); else enterApp();
    } catch (err) { Swal.fire("नेटवर्क त्रुटी", err.message, "error"); }
    finally { btn.disabled = false; btn.textContent = "लॉगिन करा"; }
  });

  $("togglePwd").addEventListener("click", () => {
    const i = $("loginPwd"), ic = $("togglePwd").querySelector("i");
    const showing = i.type === "text"; i.type = showing ? "password" : "text";
    ic.className = showing ? "bi bi-eye" : "bi bi-eye-slash";
  });

  $("savePwdBtn").addEventListener("click", async () => {
    const p1 = $("newPwd1").value, p2 = $("newPwd2").value;
    if (p1.length < 4 || p1 !== p2) { Swal.fire("तपासा", "पासवर्ड जुळत नाहीत किंवा ४ अक्षरांपेक्षा लहान आहे.", "warning"); return; }
    busy("सेव्ह होत आहे…");
    try {
      const r = await api("changePassword", { newPwd: p1 });
      Swal.close();
      if (r.success) { toast("success", "पासवर्ड बदलला"); enterApp(); } else Swal.fire("त्रुटी", r.message, "error");
    } catch (err) { Swal.fire("नेटवर्क त्रुटी", err.message, "error"); }
  });

  $("registerForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.target, form = { name: f.name.value, mobile: f.mobile.value, taluka: f.taluka.value, role: f.role.value, agency: f.agency.value, reportsTo: f.reportsTo.value };
    busy("नोंदणी होत आहे…");
    try {
      const r = await api("register", { form });
      Swal.close();
      if (r.success) { Swal.fire({ icon: "success", title: "नोंदणी झाली", html: `<div style="text-align:left">${r.message}</div>` }); f.reset(); $("tabLogin").click(); }
      else Swal.fire("नोंदणी झाली नाही", r.message, "error");
    } catch (err) { Swal.fire("नेटवर्क त्रुटी", err.message, "error"); }
  });

  function doLogout(silent) {
    if (state.token && !silent) api("logout", {}).catch(() => {});
    state.token = null; state.user = null; store.del("jn_token"); store.del("jn_user");
    show("screenLogin");
    if (!silent) toast("info", "लॉगआउट झाले");
  }
  $("btnLogout").addEventListener("click", () => Swal.fire({ title: "लॉगआउट करायचे?", icon: "question", showCancelButton: true, confirmButtonText: "होय", cancelButtonText: "नाही" }).then((r) => { if (r.isConfirmed) doLogout(); }));

  // ───────────────────────── Device guard ─────────────────────────
  function isMobileDevice() {
    const ua = navigator.userAgent || "";
    const mobileUA = /Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(ua);
    const touch = ("ontouchstart" in window) || navigator.maxTouchPoints > 1;
    return mobileUA && touch && window.innerWidth <= 900;
  }

  // ───────────────────────── Inspector home ─────────────────────────
  $("btnRefresh").addEventListener("click", () => { toast("info", "रिफ्रेश होत आहे…"); loadWaterBodies(); });
  async function initInspector() {
    $("todayLabel").textContent = fmtMr(todayStr());
    const mobile = isMobileDevice();
    $("desktopGuard").style.display = mobile ? "none" : "";
    await refreshOfflineBanner();
    await loadWaterBodies();
  }

  async function loadWaterBodies(isRetry) {
    const list = $("wbList");
    if (!isRetry) list.innerHTML = '<div class="loading"><span class="spinner-border spinner-border-sm"></span> जलसाठे लोड होत आहेत…</div>';
    try {
      const r = await api("getMyWaterBodies");
      if (!r.success) { list.innerHTML = `<div class="empty">${r.message}</div>`; return; }
      state.waterBodies = r.waterBodies || [];
      console.log("getMyWaterBodies meta:", r.meta);
      // सर्व्हरने रिकामी यादी दिली पण मॅपिंग अस्तित्वात आहे → एकदा आपोआप पुन्हा प्रयत्न
      if (!state.waterBodies.length && !isRetry) { list.innerHTML = '<div class="loading">पुन्हा तपासत आहे…</div>'; await new Promise((res) => setTimeout(res, 2000)); return loadWaterBodies(true); }
      store.set("jn_wbs", JSON.stringify(state.waterBodies));
    } catch (e) {
      // ऑफलाइन → शेवटची यादी वापरा
      const cached = store.get("jn_wbs");
      state.waterBodies = cached ? JSON.parse(cached) : [];
      if (!state.waterBodies.length) { list.innerHTML = `<div class="empty">इंटरनेट नाही आणि जुनी यादीही नाही.<br>एकदा ऑनलाइन येऊन उघडा.</div>`; return; }
      toast("warning", "ऑफलाइन — शेवटची यादी दाखवत आहे");
    }
    renderWaterBodies();
    fillCalFilter();
  }

  function renderWaterBodies() {
    const list = $("wbList"), mobile = isMobileDevice();
    const pendingLocal = window.__jnQueueWbIds || {};
    if (!state.waterBodies.length) { list.innerHTML = `<div class="empty">तुम्हाला अद्याप कोणताही जलसाठा नेमून दिलेला नाही.<br>कृपया तालुका मॉनिटरशी संपर्क साधा.</div>`; return; }
    let done = 0;
    list.innerHTML = state.waterBodies.map((w) => {
      const t = w.today; if (t) done++;
      const queued = pendingLocal[w.wbId];
      const badge = t ? `<span class="wb-badge ${t.status}">${STATUS_MR[t.status] || t.status}</span>` : queued ? `<span class="wb-badge pending queued">⏳ पाठवणे बाकी</span>` : `<span class="wb-badge pending">आज बाकी</span>`;
      const geo = w.lat ? `<div class="wb-geo"><i class="bi bi-geo"></i> नोंदवलेले स्थळ: ${w.lat.toFixed(5)}, ${w.lng.toFixed(5)} · त्रिज्या ${w.geofenceM} मी.${w.locationStatus === "PROPOSED" ? " (मंजुरी बाकी)" : ""}</div>` : `<div class="wb-geo"><i class="bi bi-geo"></i> स्थळाचे GPS अद्याप नाही — तुमच्या पहिल्या नोंदीचे GPS नोंदवले जाईल</div>`;
      const btn = !mobile ? "" : t ? `<button class="btn btn-outline-secondary" data-wb="${w.wbId}" data-edit="1">नोंद बदला</button>` : `<button class="btn btn-water" data-wb="${w.wbId}">नोंद करा</button>`;
      const photo = t && t.photo ? `<a class="btn btn-outline-secondary" href="${t.photo}" target="_blank" rel="noopener"><i class="bi bi-image"></i> फोटो</a>` : "";
      return `<div class="wb-card ${t ? "done-" + t.status : ""}">
        <div class="wb-card-top"><div><div class="wb-name">${w.name}</div><div class="wb-meta">${w.project} · ${w.typeLabel} · ${w.talukaMr}${w.village ? " · " + w.village : ""}</div></div>${badge}</div>
        ${geo}
        <div class="wb-actions">${btn}${photo}</div>
      </div>`;
    }).join("");
    $("todayDone").textContent = done; $("todayTotal").textContent = state.waterBodies.length;
    list.querySelectorAll("button[data-wb]").forEach((b) => b.addEventListener("click", () => openEntry(b.dataset.wb, !!b.dataset.edit)));
  }

  // ───────────────────────── Entry form ─────────────────────────
  function openEntry(wbId, isEdit) {
    const w = state.waterBodies.find((x) => x.wbId === wbId); if (!w) return;
    state.currentWb = w; state.gps = null; state.photoData = null;
    $("entryWbName").textContent = w.name;
    $("entryWbMeta").textContent = `${w.project} · ${w.talukaMr} · ${fmtMr(todayStr())}` + (isEdit ? " · (आजची नोंद बदलत आहात)" : "");
    $("entryForm").reset(); $("actionField").style.display = "none";
    $("gpsMsg").textContent = ""; $("gpsMsg").className = "gps-msg";
    $("btnGps").innerHTML = '<i class="bi bi-geo-alt"></i> लोकेशन मिळवा'; $("btnGps").disabled = false;
    $("photoPreview").style.display = "none"; $("btnPhoto").style.display = "";
    $("entrySheet").style.display = ""; window.scrollTo(0, 0);
    history.pushState({ sheet: true }, "");
  }
  function closeEntry() { $("entrySheet").style.display = "none"; }
  $("entryClose").addEventListener("click", () => history.back());
  window.addEventListener("popstate", () => { if ($("entrySheet").style.display !== "none") closeEntry(); });

  document.querySelectorAll('input[name="status"]').forEach((r) => r.addEventListener("change", () => {
    const v = document.querySelector('input[name="status"]:checked').value;
    $("actionField").style.display = v === "ACTION_TAKEN" ? "" : "none";
    const ph = { SAFE: "उदा. परिसर शांत, पंप/पाइप आढळले नाहीत", ILLEGAL_PUMPING: "उदा. पूर्वेकडील काठावर २ विद्युत पंप सुरू, ३ शेतकरी", ACTION_TAKEN: "उदा. पंप बंद करून जप्ती केली" }[v];
    $("entryRemark").placeholder = ph;
  }));

  // GPS
  $("btnGps").addEventListener("click", () => {
    const btn = $("btnGps"), msg = $("gpsMsg");
    if (!navigator.geolocation) { msg.textContent = "या डिव्हाइसवर GPS उपलब्ध नाही."; msg.className = "gps-msg err"; return; }
    btn.disabled = true; btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> शोधत आहे…';
    msg.textContent = "कृपया उघड्यावर थांबा, GPS घेत आहे…"; msg.className = "gps-msg";
    navigator.geolocation.getCurrentPosition((pos) => {
      state.gps = { lat: pos.coords.latitude, lng: pos.coords.longitude, acc: Math.round(pos.coords.accuracy || 0) };
      btn.className = "btn btn-outline-success w-100"; btn.innerHTML = '<i class="bi bi-check-circle"></i> लोकेशन मिळाले'; btn.disabled = false;
      let txt = `${state.gps.lat.toFixed(6)}, ${state.gps.lng.toFixed(6)} (अचूकता ±${state.gps.acc} मी.)`;
      const w = state.currentWb;
      if (w && w.lat) { const d = haversine(state.gps.lat, state.gps.lng, w.lat, w.lng); txt += d <= w.geofenceM ? ` · स्थळापासून ${d} मी. ✅` : ` · ⚠️ स्थळापासून ${d} मी. दूर (मर्यादा ${w.geofenceM})`; }
      msg.textContent = txt; msg.className = "gps-msg ok";
    }, (err) => {
      btn.disabled = false; btn.className = "btn btn-earth w-100"; btn.innerHTML = '<i class="bi bi-arrow-repeat"></i> पुन्हा प्रयत्न करा';
      msg.textContent = { 1: "GPS परवानगी नाकारली. सेटिंग्जमध्ये Location चालू करा.", 2: "GPS सिग्नल नाही. मोबाईलचे Location चालू आहे का तपासा.", 3: "वेळ संपला. उघड्यावर जाऊन पुन्हा प्रयत्न करा." }[err.code] || "लोकेशन मिळाले नाही.";
      msg.className = "gps-msg err";
    }, { enableHighAccuracy: true, timeout: CFG.GPS_TIMEOUT_MS || 30000, maximumAge: 0 });
  });
  function haversine(a, b, c, d) { const R = 6371000, r = Math.PI / 180, dl = (c - a) * r, dn = (d - b) * r; const h = Math.sin(dl / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin(dn / 2) ** 2; return Math.round(R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h))); }

  // Photo: कॅमेरा → compress → overlay
  $("btnPhoto").addEventListener("click", () => { $("photoInput").value = ""; $("photoInput").click(); });
  $("btnRetake").addEventListener("click", () => { $("photoInput").value = ""; $("photoInput").click(); });
  $("photoInput").addEventListener("change", async (e) => {
    const file = e.target.files && e.target.files[0]; if (!file) return;
    if (!state.gps) { Swal.fire("आधी GPS", "फोटोवर लोकेशन छापण्यासाठी आधी 'लोकेशन मिळवा' करा.", "warning"); return; }
    const status = (document.querySelector('input[name="status"]:checked') || {}).value;
    if (!status) { Swal.fire("आधी स्थिती निवडा", "फोटोवर स्थिती छापली जाते, म्हणून आधी स्थिती निवडा.", "warning"); return; }
    busy("फोटोवर माहिती छापत आहे…");
    try {
      state.photoData = await stampPhoto(file, { status, remark: $("entryRemark").value.trim() });
      $("photoImg").src = state.photoData; $("photoPreview").style.display = ""; $("btnPhoto").style.display = "none";
      Swal.close();
    } catch (err) { Swal.fire("फोटो त्रुटी", err.message, "error"); }
  });

  function stampPhoto(file, meta) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("फोटो वाचता आला नाही."));
      reader.onload = (ev) => {
        const img = new Image();
        img.onerror = () => reject(new Error("फोटो उघडता आला नाही."));
        img.onload = () => {
          const MAX = CFG.PHOTO_MAX_PX || 1000;
          let w = img.width, h = img.height;
          if (w > h && w > MAX) { h = Math.round(h * MAX / w); w = MAX; } else if (h >= w && h > MAX) { w = Math.round(w * MAX / h); h = MAX; }
          const c = document.createElement("canvas"); c.width = w; c.height = h;
          const ctx = c.getContext("2d"); ctx.drawImage(img, 0, 0, w, h);

          const wb = state.currentWb, u = state.user;
          const now = new Date();
          const dt = now.toLocaleDateString("mr-IN", { day: "2-digit", month: "2-digit", year: "numeric" }) + " " + now.toLocaleTimeString("mr-IN", { hour: "2-digit", minute: "2-digit" });
          const lines = [
            { t: "JAL-NETRA (जलनेत्र) · वाशिम जिल्हा", c: "#ffd54f", f: `bold ${Math.round(w * 0.028)}px sans-serif` },
            { t: `💧 ${wb.name} · ${wb.project}`, c: "#fff" },
            { t: `📍 ता. ${wb.talukaMr}, जि. वाशिम · ${dt}`, c: "#fff" },
            { t: `👤 ${u.name} (${u.id})`, c: "#fff" },
            { t: `${meta.status === "SAFE" ? "🟢" : meta.status === "ILLEGAL_PUMPING" ? "🔴" : "🟡"} ${STATUS_MR[meta.status]}${meta.remark ? " — " + meta.remark : ""}`, c: meta.status === "ILLEGAL_PUMPING" ? "#ff8a80" : meta.status === "SAFE" ? "#b9f6ca" : "#ffe082", wrap: true },
            { t: `🛰 GPS ${state.gps.lat.toFixed(6)}, ${state.gps.lng.toFixed(6)}`, c: "#80deea" }
          ];
          const base = Math.round(w * 0.024), lh = Math.round(base * 1.45), pad = Math.round(w * 0.02);
          ctx.font = `bold ${base}px sans-serif`;
          const out = [];
          lines.forEach((L) => { if (L.wrap) wrapText(ctx, L.t, w - pad * 2).slice(0, 2).forEach((s) => out.push(Object.assign({}, L, { t: s }))); else out.push(L); });
          const boxH = out.length * lh + pad * 2;
          ctx.fillStyle = "rgba(0,0,0,0.68)"; ctx.fillRect(0, h - boxH, w, boxH);
          ctx.fillStyle = "#1b998b"; ctx.fillRect(0, h - boxH, w, 4);
          let y = h - boxH + pad + base;
          out.forEach((L) => { ctx.font = L.f || `bold ${base}px sans-serif`; ctx.fillStyle = L.c; ctx.fillText(L.t, pad, y); y += lh; });
          resolve(c.toDataURL("image/jpeg", CFG.PHOTO_QUALITY || 0.7));
        };
        img.src = ev.target.result;
      };
      reader.readAsDataURL(file);
    });
  }
  function wrapText(ctx, text, maxW) {
    const words = text.split(" "), lines = []; let cur = "";
    words.forEach((wd) => { const test = cur ? cur + " " + wd : wd; if (ctx.measureText(test).width > maxW && cur) { lines.push(cur); cur = wd; } else cur = test; });
    if (cur) lines.push(cur); return lines;
  }

  // Submit → network test → online / offline
  $("entryForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const status = (document.querySelector('input[name="status"]:checked') || {}).value;
    if (!status) return Swal.fire("स्थिती निवडा", "", "warning");
    const remark = $("entryRemark").value.trim(), action = $("entryAction").value.trim();
    if (!remark) return Swal.fire("शेरा लिहा", "", "warning");
    if (status === "ACTION_TAKEN" && !action) return Swal.fire("कारवाईचा तपशील लिहा", "", "warning");
    if (!state.gps) return Swal.fire("GPS आवश्यक", "आधी 'लोकेशन मिळवा' करा.", "warning");
    if (!state.photoData) return Swal.fire("फोटो आवश्यक", "कॅमेऱ्याने स्थळाचा फोटो काढा.", "warning");

    const payload = {
      wbId: state.currentWb.wbId, status, remark, actionDetails: action,
      lat: state.gps.lat, lng: state.gps.lng, photoData: state.photoData,
      reportDate: todayStr(), deviceInfo: navigator.userAgent.slice(0, 120), overwrite: false
    };
    const q = { id: "Q" + Date.now(), wbName: state.currentWb.name, createdAt: new Date().toISOString(), payload };

    busy("नेटवर्क तपासत आहे…");
    const good = await testNetwork();
    Swal.close();
    if (good) {
      const r = await Swal.fire({ icon: "success", title: "इंटरनेट उपलब्ध आहे", text: "नोंद आत्ताच सर्व्हरवर पाठवायची का?", showCancelButton: true, confirmButtonText: "🚀 आता पाठवा", cancelButtonText: "💾 नंतर पाठवा", confirmButtonColor: "#2e7d32" });
      if (r.isConfirmed) await uploadEntry(q, true); else await saveOffline(q);
    } else {
      await Swal.fire({ icon: "warning", title: "नेटवर्क कमकुवत/नाही", text: "नोंद मोबाईलमध्ये सेव्ह होईल. रेंजमध्ये आल्यावर 'आता पाठवा' दाबा.", confirmButtonText: "💾 सेव्ह करा" });
      await saveOffline(q);
    }
  });

  // नेटवर्क चाचणी: स्वतःच्याच साईटवरील छोटी फाईल (Apps Script नव्हे — ते नेहमीच ३–४ से. घेते)
  async function testNetwork() {
    if (!navigator.onLine) return false;
    const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), CFG.NETWORK_TEST_TIMEOUT_MS || 4000);
    try { const r = await fetch("manifest.json?ping=" + Date.now(), { cache: "no-store", signal: ctrl.signal }); return r.ok; }
    catch (e) { return false; } finally { clearTimeout(t); }
  }

  async function uploadEntry(q, fromForm) {
    busy("सर्व्हरवर पाठवत आहे…");
    try {
      let r = await api("submitDailyLog", { payload: q.payload });
      if (!r.success && r.code === "DUPLICATE") {
        const c = await Swal.fire({ icon: "question", title: "आधीची नोंद आहे", text: r.message, showCancelButton: true, confirmButtonText: "होय, बदला", cancelButtonText: "नको" });
        if (!c.isConfirmed) return false;
        busy("सर्व्हरवर पाठवत आहे…");
        r = await api("submitDailyLog", { payload: Object.assign({}, q.payload, { overwrite: true }) });
      }
      Swal.close();
      if (!r.success) { Swal.fire("नोंद झाली नाही", r.message, "error"); return false; }
      let extra = "";
      if (r.withinGeofence === "N") extra = `<br><span style="color:#c1292e">⚠️ तुम्ही स्थळापासून ${r.distanceM} मी. दूर होता (मर्यादा ${r.geofenceM} मी.). ही नोंद वरिष्ठांना फ्लॅग दिसेल.</span>`;
      if (r.locationProposed) extra = "<br>📍 या जलसाठ्याचे स्थळ तुमच्या GPS वरून नोंदवले गेले (मंजुरी बाकी).";
      // ✅ तात्काळ कार्ड अपडेट (सर्व्हरची वाट न पाहता), मग पार्श्वभूमीत ताजी यादी
      if (r.reportDate === todayStr()) {
        const w = state.waterBodies.find((x) => x.wbId === q.payload.wbId);
        if (w) { w.today = { status: q.payload.status, entryId: r.entryId, photo: r.photoUrl }; if (!w.lat && r.locationProposed) { w.lat = q.payload.lat; w.lng = q.payload.lng; w.locationStatus = "PROPOSED"; } }
        store.set("jn_wbs", JSON.stringify(state.waterBodies));
        renderWaterBodies();
      }
      if (fromForm) { closeEntry(); history.replaceState(null, ""); }
      await Swal.fire({ icon: "success", title: r.message, html: `${fmtMr(r.reportDate)} · ${q.wbName}${extra}` });
      loadWaterBodies(true).catch(() => {});
      return true;
    } catch (err) {
      Swal.close();
      if (fromForm) { await Swal.fire({ icon: "warning", title: "पाठवता आले नाही", text: "नेटवर्क अडचण. नोंद मोबाईलमध्ये सेव्ह करत आहे.", confirmButtonText: "ठीक" }); await saveOffline(q); }
      return false;
    }
  }

  // ───────────────────────── IndexedDB offline queue ─────────────────────────
  const DB_NAME = "jalnetra", DB_STORE = "queue";
  function openDb() {
    return new Promise((res, rej) => {
      const rq = indexedDB.open(DB_NAME, 1);
      rq.onupgradeneeded = () => { rq.result.createObjectStore(DB_STORE, { keyPath: "id" }); };
      rq.onsuccess = () => res(rq.result); rq.onerror = () => rej(rq.error);
    });
  }
  async function qAll() { const db = await openDb(); return new Promise((res, rej) => { const r = db.transaction(DB_STORE).objectStore(DB_STORE).getAll(); r.onsuccess = () => res(r.result || []); r.onerror = () => rej(r.error); }); }
  async function qPut(item) { const db = await openDb(); return new Promise((res, rej) => { const t = db.transaction(DB_STORE, "readwrite"); t.objectStore(DB_STORE).put(item); t.oncomplete = res; t.onerror = () => rej(t.error); }); }
  async function qDel(id) { const db = await openDb(); return new Promise((res, rej) => { const t = db.transaction(DB_STORE, "readwrite"); t.objectStore(DB_STORE).delete(id); t.oncomplete = res; t.onerror = () => rej(t.error); }); }

  async function saveOffline(q) {
    try {
      await qPut(q);
      await Swal.fire({ icon: "info", title: "मोबाईलमध्ये सेव्ह झाले 💾", html: `${q.wbName}<br><small>रेंजमध्ये आल्यावर वरच्या पिवळ्या पट्टीतील <b>आता पाठवा</b> दाबा.</small>` });
      closeEntry(); history.replaceState(null, "");
      await refreshOfflineBanner(); renderWaterBodies();
    } catch (e) { Swal.fire("सेव्ह झाले नाही", "मोबाईलची मेमरी भरली असू शकते. आधीच्या नोंदी पाठवा.", "error"); }
  }

  async function refreshOfflineBanner() {
    let items = []; try { items = await qAll(); } catch (e) {}
    window.__jnQueueWbIds = {}; items.forEach((i) => { window.__jnQueueWbIds[i.payload.wbId] = true; });
    $("offlineBanner").style.display = items.length ? "" : "none";
    $("offlineCount").textContent = items.length;
    $("btnSyncNow").disabled = !navigator.onLine;
  }
  $("btnSyncNow").addEventListener("click", async () => {
    const items = await qAll(); if (!items.length) return;
    let ok = 0, fail = 0;
    for (const q of items) {
      busy(`पाठवत आहे… ${ok + fail + 1}/${items.length}`);
      try {
        let r = await api("submitDailyLog", { payload: q.payload });
        if (!r.success && r.code === "DUPLICATE") {
          const c = await Swal.fire({ icon: "question", title: q.wbName, text: r.message, showCancelButton: true, confirmButtonText: "बदला", cancelButtonText: "ही सोडून द्या" });
          if (c.isConfirmed) r = await api("submitDailyLog", { payload: Object.assign({}, q.payload, { overwrite: true }) }); else { await qDel(q.id); continue; }
        }
        if (r.success) { await qDel(q.id); ok++; } else { fail++; console.warn(q.id, r.message); }
      } catch (e) { fail++; }
    }
    Swal.close();
    await refreshOfflineBanner(); await loadWaterBodies();
    Swal.fire(fail ? "अंशतः पूर्ण" : "सर्व नोंदी पाठवल्या ✅", `${ok} यशस्वी${fail ? `, ${fail} पुन्हा प्रयत्न करा` : ""}`, fail ? "warning" : "success");
  });

  // ───────────────────────── Calendar ─────────────────────────
  function fillCalFilter() {
    const sel = $("calWbFilter");
    sel.innerHTML = '<option value="">सर्व जलसाठे (सर्वात गंभीर स्थिती)</option>' + state.waterBodies.map((w) => `<option value="${w.wbId}">${w.name}</option>`).join("");
  }
  $("calWbFilter").addEventListener("change", (e) => { state.cal.wbId = e.target.value; loadCalendar(); });
  $("calPrev").addEventListener("click", () => { state.cal.month--; if (state.cal.month < 1) { state.cal.month = 12; state.cal.year--; } loadCalendar(); });
  $("calNext").addEventListener("click", () => { state.cal.month++; if (state.cal.month > 12) { state.cal.month = 1; state.cal.year++; } loadCalendar(); });
  $("tabCal").addEventListener("shown.bs.tab", loadCalendar);

  async function loadCalendar() {
    const { year, month, wbId } = state.cal;
    $("calTitle").textContent = `${MONTHS_MR[month - 1]} ${year}`;
    const grid = $("calGrid"); grid.innerHTML = DOW_MR.map((d) => `<div class="cal-dow">${d}</div>`).join("") + '<div class="loading" style="grid-column:1/-1">लोड होत आहे…</div>';
    let days = {}, stats = { reportedDays: 0, redDays: 0 };
    try { const r = await api("getInspectorCalendar", { year, month, wbId }); if (r.success) { days = r.days; stats = r; } } catch (e) { toast("warning", "कॅलेंडर लोड झाले नाही"); }
    const first = new Date(year, month - 1, 1).getDay(), dim = new Date(year, month, 0).getDate(), today = todayStr();
    let html = DOW_MR.map((d) => `<div class="cal-dow">${d}</div>`).join("");
    for (let i = 0; i < first; i++) html += '<div class="cal-day empty-cell"></div>';
    for (let d = 1; d <= dim; d++) {
      const ymd = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      const info = days[ymd]; const future = ymd > today;
      let cls = "cal-day" + (ymd === today ? " today" : "") + (future ? " future" : "");
      if (info) cls += " " + info.status + (info.photo ? " has-photo" : "");
      const title = info ? `${fmtMr(ymd)}: ${STATUS_MR[info.status] || info.status}` : fmtMr(ymd);
      html += `<div class="${cls}" title="${title}" data-ymd="${ymd}">${d}</div>`;
    }
    grid.innerHTML = html;
    grid.querySelectorAll(".cal-day[data-ymd]").forEach((el) => el.addEventListener("click", () => {
      const info = days[el.dataset.ymd]; if (!info || info.status === "NOT_REPORTED") return;
      Swal.fire({ title: fmtMr(el.dataset.ymd), html: `<b>${STATUS_MR[info.status]}</b>${info.within === "N" ? '<br><span style="color:#c1292e">⚠️ स्थळापासून दूर</span>' : ""}${info.photo ? `<br><img src="${info.photo}" style="max-width:100%;border-radius:12px;margin-top:10px">` : ""}`, confirmButtonText: "बंद" });
    }));
    $("calStats").innerHTML = `<div>नोंद झालेले दिवस<b>${stats.reportedDays || 0}</b></div><div>उपसा आढळलेले दिवस<b style="color:#c1292e">${stats.redDays || 0}</b></div>`;
  }

  // ───────────────────────── PWA install (लॉगिनपूर्वी मोठा पॉपअप) + SW ─────────────────────────
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); state.deferredInstall = e; if ($("installBtn")) $("installBtn").disabled = false; });
  window.addEventListener("appinstalled", () => {
    store.set("jn_installed", "1"); $("installBanner").style.display = "none";
    Swal.fire({ icon: "success", title: "अ‍ॅप इन्स्टॉल झाले ✅", html: "<div style='text-align:left;line-height:1.7'>आता:<br>1️⃣ हा ब्राउझर (Chrome) टॅब <b>बंद करा</b><br>2️⃣ होम स्क्रीनवरील <b>JAL-NETRA</b> आयकॉनवरून अ‍ॅप उघडा<br><small>ब्राउझरमध्ये नव्हे, अ‍ॅपमधूनच वापरल्यास कॅमेरा, GPS आणि ऑफलाइन नोंदी नीट चालतात.</small></div>", confirmButtonText: "समजले", allowOutsideClick: false });
  });

  async function showInstallGate() {
    if (isStandalone() || store.get("jn_install_skip") === "1") return;
    // beforeinstallprompt थोड्या वेळाने येतो — १.५ से. थांबा
    if (!state.deferredInstall) await new Promise((r) => setTimeout(r, 1500));
    const canPrompt = !!state.deferredInstall;
    const manual = isIOS()
      ? "Safari मध्ये खालचे <b>Share (⬆️)</b> बटन → <b>Add to Home Screen</b> → Add"
      : "Chrome च्या वरच्या उजव्या <b>⋮</b> मेनूत → <b>Add to Home screen</b> / <b>Install app</b> → Install";
    const r = await Swal.fire({
      imageUrl: "icons/icon-192.png", imageWidth: 84, imageHeight: 84,
      title: "प्रथम अ‍ॅप इन्स्टॉल करा",
      html: `<div style="text-align:left;line-height:1.7;font-size:15px">
        JAL-NETRA हे <b>ब्राउझरमध्ये नव्हे, तर इन्स्टॉल केलेले अ‍ॅप म्हणून</b> वापरायचे आहे.<br>
        इन्स्टॉल झाल्यावर <b>ब्राउझर बंद करून</b> होम स्क्रीनवरील आयकॉनवरून उघडा.<br><br>
        ${canPrompt ? "खालील बटन दाबा — एका टॅपमध्ये इन्स्टॉल होईल." : "या फोनवर स्वयंचलित इन्स्टॉल बटन उपलब्ध नाही, म्हणून:<br>" + manual}
      </div>`,
      showCancelButton: true, confirmButtonText: canPrompt ? "📲 अ‍ॅप इन्स्टॉल करा" : "समजले, मी इन्स्टॉल करतो",
      cancelButtonText: "ब्राउझरमध्येच पुढे जा", confirmButtonColor: "#0b4f6c", cancelButtonColor: "#8a5a30",
      allowOutsideClick: false, allowEscapeKey: false, reverseButtons: true
    });
    if (r.isConfirmed && canPrompt) {
      state.deferredInstall.prompt(); const c = await state.deferredInstall.userChoice; state.deferredInstall = null;
      if (c.outcome !== "accepted") toast("info", "नंतर ⋮ मेनूतून Install करू शकता");
    } else if (r.dismiss === Swal.DismissReason.cancel) {
      store.set("jn_install_skip", "1"); // पुन्हा त्रास नको; खालचा छोटा बॅनर राहील
      if (state.deferredInstall) $("installBanner").style.display = "";
    }
  }
  $("installBtn").addEventListener("click", async () => { if (!state.deferredInstall) return; state.deferredInstall.prompt(); await state.deferredInstall.userChoice; state.deferredInstall = null; $("installBanner").style.display = "none"; });
  $("installClose").addEventListener("click", () => { $("installBanner").style.display = "none"; store.set("jn_hide_install", "1"); });
  if ("serviceWorker" in navigator) window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));

  // ───────────────────────── Boot ─────────────────────────
  document.addEventListener("DOMContentLoaded", async () => {
    $("appVersion").textContent = CFG.APP_VERSION || "";
    document.querySelectorAll(".appVersion2").forEach((el) => { el.textContent = CFG.APP_VERSION || ""; });
    runSplash(); updateNet();
    loadPublicSettings();
    if (restoreSession()) enterApp(); else show("screenLogin");
    setTimeout(showInstallGate, 3200); // पडदा उघडल्यानंतर लगेच
  });
})();
