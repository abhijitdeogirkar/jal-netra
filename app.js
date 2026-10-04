/* =============================================================================
   🌊 JAL-NETRA — Frontend (टप्पा ३.२)
   ============================================================================= */
(function () {
  "use strict";
  const CFG = window.JALNETRA_CONFIG || {};
  const $ = (id) => document.getElementById(id);
  const STATUS_MR = { SAFE: "सुरक्षित", ILLEGAL_PUMPING: "बेकायदेशीर उपसा", ACTION_TAKEN: "कारवाई केली", NOT_REPORTED: "नोंद नाही" };
  const MONTHS_MR = ["जानेवारी", "फेब्रुवारी", "मार्च", "एप्रिल", "मे", "जून", "जुलै", "ऑगस्ट", "सप्टेंबर", "ऑक्टोबर", "नोव्हेंबर", "डिसेंबर"];
  const DOW_MR = ["रवि", "सोम", "मंगळ", "बुध", "गुरु", "शुक्र", "शनि"];

  const state = { token: null, user: null, settings: null, waterBodies: [], currentWb: null, gps: null, photoData: null, cal: { year: new Date().getFullYear(), month: new Date().getMonth() + 1, wbId: "" }, deferredInstall: null };
  const store = { get: (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} }, del: (k) => { try { localStorage.removeItem(k); } catch (e) {} } };
  const todayStr = () => { const d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };
  const fmtMr = (ymd) => { const [y, m, d] = ymd.split("-"); return `${parseInt(d, 10)} ${MONTHS_MR[parseInt(m, 10) - 1]} ${y}`; };

  async function api(action, data, opts) {
    const body = Object.assign({ action }, data || {}); if (state.token && !body.token) body.token = state.token;
    const ctrl = new AbortController(), t = setTimeout(() => ctrl.abort(), (opts && opts.timeout) || 60000);
    try { const res = await fetch(CFG.API_URL, { method: "POST", redirect: "follow", body: JSON.stringify(body), signal: ctrl.signal }); const json = await res.json(); if (json && json.code === "AUTH") { doLogout(true); throw new Error(json.message); } return json; } finally { clearTimeout(t); }
  }
  const toast = (icon, title) => Swal.fire({ toast: true, position: "top", icon, title, showConfirmButton: false, timer: 2200 });
  const busy = (title) => Swal.fire({ title, allowOutsideClick: false, showConfirmButton: false, didOpen: () => Swal.showLoading() });

  const isStandalone = () => window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true || document.referrer.includes("android-app://");
  const isIOS = () => /iPhone|iPad|iPod/i.test(navigator.userAgent);

  function runSplash() { const s = $("splash"); setTimeout(() => s.classList.add("open"), 1500); setTimeout(() => { s.style.display = "none"; }, 3100); }
  function updateNet() { const el = $("netState"); if (el) { el.className = "net-dot " + (navigator.onLine ? "on" : "off"); el.textContent = navigator.onLine ? "ऑनलाइन" : "ऑफलाइन"; } }
  window.addEventListener("online", () => { updateNet(); refreshOfflineBanner(); }); window.addEventListener("offline", updateNet);

  function show(id) { ["screenLogin", "screenForcePwd", "screenInspector", "screenOfficer"].forEach((s) => { $(s).style.display = s === id ? "" : "none"; }); const inApp = (id === "screenInspector" || id === "screenOfficer"); $("topbar").style.display = inApp ? "" : "none"; $("appFooter").style.display = inApp ? "" : "none"; }
  async function loadPublicSettings() { try { const r = await api("getPublicSettings", {}, { timeout: 15000 }); if (r && r.success) { state.settings = r; if (r.tagline) $("splashTagline").textContent = r.tagline; if (r.subtitle) $("splashSubtitle").textContent = r.subtitle; $("tabRegisterItem").style.display = r.registrationOpen ? "" : "none"; const sel = $("regTaluka"); if (sel && r.talukas) sel.innerHTML = '<option value="">निवडा</option>' + r.talukas.map((t) => `<option value="${t.en}">${t.mr}</option>`).join(""); } } catch (e) {} }

  // 🔹 आधी roleLabel ची व्याख्या
  const roleLabel = (r) => ({ INSPECTOR: "निरीक्षक", TALUKA_MONITOR: "तालुका मॉनिटर", AGENCY_HEAD: "एजन्सी प्रमुख (जिल्हा)", DISTRICT_CELL: "जिल्हा मॉनिटरिंग सेल", COLLECTOR: "जिल्हाधिकारी" }[r] || r);
  
  // 🔹 मग window.JN
  window.JN = { api, state, toast, busy, fmtMr, todayStr, STATUS_MR, MONTHS_MR, roleLabel, show, $ };

  // 🔹 Live Feed Function
  window.JN.loadLiveFeed = async function(containerId, date) {
    const el = $(containerId); el.innerHTML = '<div class="loading"><span class="spinner-border spinner-border-sm"></span> लाईव्ह फीड लोड होत आहे…</div>';
    try {
      const r = await api("getLiveFeed", { date });
      if (!r.success) { el.innerHTML = `<div class="empty">त्रुटी: ${r.message}</div>`; return; }
      if (!r.feed.length) { el.innerHTML = '<div class="empty">या तारखेला अद्याप कोणतीही नोंद झालेली नाही.</div>'; return; }
      el.innerHTML = r.feed.map(f => `
        <div class="feed-msg">
          <div class="feed-head"><span class="feed-name"><i class="bi bi-person-circle"></i> ${f.officerName}</span><span>${f.time}</span></div>
          <div class="feed-wb">${f.wbName} <small class="text-muted">(${f.taluka})</small></div>
          <span class="feed-status fs-${f.status}">${STATUS_MR[f.status]}</span>
          ${f.photo ? `<img src="${f.photo}" class="feed-img">` : ""}
          <div class="feed-text">${f.remark} ${f.action ? `<br><b style="color:#8a6400">कारवाई:</b> ${f.action}` : ""}</div>
        </div>
      `).join("");
    } catch(e) { el.innerHTML = '<div class="empty">नेटवर्क त्रुटी</div>'; }
  };

  function enterApp() {
    // 🔹 हेडरमध्ये ठळक नाव आणि खाली भूमिका
    $("topbarUser").innerHTML = `<span style="color:#ffd54f;font-size:14.5px;">${state.user.name}</span><br><small style="font-size:11px;opacity:0.9">${state.user.id} · ${roleLabel(state.user.role)}</small>`;
    
    if (state.user.role === "INSPECTOR") { show("screenInspector"); initInspector(); }
    else { show("screenOfficer"); if (window.JN && window.JN.officer) window.JN.officer.init(); else console.error("officer.js missed"); }
  }

  function restoreSession() { const tk = store.get("jn_token"), us = store.get("jn_user"); if (tk && us) { try { state.token = tk; state.user = JSON.parse(us); return true; } catch (e) {} } return false; }

  $("loginForm").addEventListener("submit", async (e) => { e.preventDefault(); const btn = $("loginBtn"); btn.disabled = true; btn.textContent = "तपासत आहे…"; try { const r = await api("login", { id: $("loginId").value.trim(), pwd: $("loginPwd").value }); if (!r.success) { Swal.fire("लॉगिन झाले नाही", r.message, "error"); return; } state.token = r.token; state.user = r.user; store.set("jn_token", r.token); store.set("jn_user", JSON.stringify(r.user)); if (r.settings) { state.settings = r.settings; } if (r.mustChangePassword) show("screenForcePwd"); else enterApp(); } catch (err) { Swal.fire("नेटवर्क त्रुटी", err.message, "error"); } finally { btn.disabled = false; btn.textContent = "लॉगिन करा"; } });
  $("togglePwd").addEventListener("click", () => { const i = $("loginPwd"), ic = $("togglePwd").querySelector("i"), showing = i.type === "text"; i.type = showing ? "password" : "text"; ic.className = showing ? "bi bi-eye" : "bi bi-eye-slash"; });
  $("savePwdBtn").addEventListener("click", async () => { const p1 = $("newPwd1").value, p2 = $("newPwd2").value; if (p1.length < 4 || p1 !== p2) return Swal.fire("तपासा", "पासवर्ड जुळत नाहीत किंवा ४ अक्षरांपेक्षा लहान आहे.", "warning"); busy("सेव्ह होत आहे…"); try { const r = await api("changePassword", { newPwd: p1 }); Swal.close(); if (r.success) { toast("success", "पासवर्ड बदलला"); enterApp(); } else Swal.fire("त्रुटी", r.message, "error"); } catch (err) { Swal.fire("नेटवर्क त्रुटी", err.message, "error"); } });
  $("registerForm").addEventListener("submit", async (e) => { e.preventDefault(); const f = e.target; busy("नोंदणी होत आहे…"); try { const r = await api("register", { form: { name: f.name.value, mobile: f.mobile.value, taluka: f.taluka.value, role: f.role.value, agency: f.agency.value, reportsTo: f.reportsTo.value } }); Swal.close(); if (r.success) { Swal.fire({ icon: "success", title: "नोंदणी झाली", html: `<div style="text-align:left">${r.message}</div>` }); f.reset(); $("tabLogin").click(); } else Swal.fire("नोंदणी झाली नाही", r.message, "error"); } catch (err) { Swal.fire("नेटवर्क त्रुटी", err.message, "error"); } });
  function doLogout(silent) { if (state.token && !silent) api("logout", {}).catch(() => {}); state.token = null; state.user = null; store.del("jn_token"); store.del("jn_user"); show("screenLogin"); if (!silent) toast("info", "लॉगआउट झाले"); }
  $("btnLogout").addEventListener("click", () => Swal.fire({ title: "लॉगआउट करायचे?", icon: "question", showCancelButton: true, confirmButtonText: "होय", cancelButtonText: "नाही" }).then((r) => { if (r.isConfirmed) doLogout(); }));

  function isMobileDevice() { return (/Android|iPhone|iPad|iPod/i.test(navigator.userAgent || "")) && (("ontouchstart" in window) || navigator.maxTouchPoints > 1) && window.innerWidth <= 900; }

 $("btnRefresh").addEventListener("click", () => { 
    toast("info", "रिफ्रेश होत आहे…"); 
    loadWaterBodies(); 
    const d = $("feedDateIns") ? $("feedDateIns").value : todayStr();
    window.JN.loadLiveFeed("feedListIns", d); 
  });

   let currentInsDate = todayStr();

  $("btnRefresh").addEventListener("click", () => { toast("info", "रिफ्रेश होत आहे…"); loadInspectorData(); });
  
  async function initInspector() { 
    $("desktopGuard").style.display = isMobileDevice() ? "none" : ""; 
    await refreshOfflineBanner(); 
    
    const fDate = $("dashDateIns");
    if(fDate) {
       fDate.value = currentInsDate; fDate.max = todayStr();
       fDate.addEventListener("change", () => { currentInsDate = fDate.value; loadInspectorData(); });
       $("dashPrevIns").addEventListener("click", () => { let d = new Date(currentInsDate); d.setDate(d.getDate() - 1); currentInsDate = fmtDate(d); fDate.value = currentInsDate; loadInspectorData(); });
       $("dashNextIns").addEventListener("click", () => { let d = new Date(currentInsDate); d.setDate(d.getDate() + 1); if(fmtDate(d) <= todayStr()) { currentInsDate = fmtDate(d); fDate.value = currentInsDate; loadInspectorData(); } });
    }
    
    $("tabFeedIns").addEventListener("shown.bs.tab", () => window.JN.loadLiveFeed("feedListIns", currentInsDate)); 
    await loadInspectorData(); 
  }

  async function loadInspectorData() {
    $("todayDoneLbl").textContent = currentInsDate === todayStr() ? "आज नोंद केलेले" : "नोंद झालेले";
    window.JN.loadLiveFeed("feedListIns", currentInsDate);
    await loadWaterBodies();
  }

  async function loadWaterBodies(isRetry) {
    const list = $("wbList"); if (!isRetry) list.innerHTML = '<div class="loading"><span class="spinner-border spinner-border-sm"></span> जलसाठे लोड होत आहेत…</div>';
    try {
      const r = await api("getMyWaterBodies", { date: currentInsDate }); if (!r.success) { list.innerHTML = `<div class="empty">${r.message}</div>`; return; }
      state.waterBodies = r.waterBodies || [];
      if (!state.waterBodies.length && !isRetry) { list.innerHTML = '<div class="loading">पुन्हा तपासत आहे…</div>'; await new Promise((res) => setTimeout(res, 2000)); return loadWaterBodies(true); }
      store.set("jn_wbs", JSON.stringify(state.waterBodies));
    } catch (e) {
      const cached = store.get("jn_wbs"); state.waterBodies = cached ? JSON.parse(cached) : [];
      if (!state.waterBodies.length) { list.innerHTML = `<div class="empty">इंटरनेट नाही आणि जुनी यादीही नाही.</div>`; return; } toast("warning", "ऑफलाइन — शेवटची यादी दाखवत आहे");
    }
    renderWaterBodies(); 
  }

  function renderWaterBodies() {
    const list = $("wbList"), mobile = isMobileDevice(), pendingLocal = window.__jnQueueWbIds || {};
    if (!state.waterBodies.length) { list.innerHTML = `<div class="empty">तुम्हाला अद्याप कोणताही जलसाठा नेमून दिलेला नाही.</div>`; return; }
    let done = 0;
    list.innerHTML = state.waterBodies.map((w) => {
      // 🔹 Multiple entries logic
      const entries = w.todayList || [];
      if (entries.length) done++;
      const queued = pendingLocal[w.wbId];
      
      let badges = entries.map(t => `<span class="wb-badge ${t.status}" style="margin-right:4px;">${STATUS_MR[t.status]} (${t.time})</span>`).join("");
      if(!entries.length) badges = queued ? `<span class="wb-badge pending queued">⏳ पाठवणे बाकी</span>` : `<span class="wb-badge pending">आज बाकी</span>`;

      const geo = w.lat ? `<div class="wb-geo"><i class="bi bi-geo"></i> नोंदवलेले स्थळ: ${w.lat.toFixed(5)}, ${w.lng.toFixed(5)} · त्रिज्या ${w.geofenceM} मी.</div>` : `<div class="wb-geo"><i class="bi bi-geo"></i> स्थळाचे GPS अद्याप नाही</div>`;
      const btn = !mobile ? "" : `<button class="btn btn-water" data-wb="${w.wbId}">${entries.length ? 'आणखी नोंद करा' : 'नोंद करा'}</button>`;
      
      return `<div class="wb-card ${entries.length ? "done-" + entries[entries.length-1].status : ""}">
        <div class="wb-card-top"><div><div class="wb-name">${w.name}</div><div class="wb-meta">${w.project} · ${w.typeLabel} · ${w.talukaMr}</div></div></div>
        <div style="margin-top:8px;">${badges}</div>
        ${geo}
        <div class="wb-actions">${btn}</div>
      </div>`;
    }).join("");
    $("todayDone").textContent = done; $("todayTotal").textContent = state.waterBodies.length;
    list.querySelectorAll("button[data-wb]").forEach((b) => b.addEventListener("click", () => openEntry(b.dataset.wb)));
  }

  function openEntry(wbId) { const w = state.waterBodies.find((x) => x.wbId === wbId); if (!w) return; state.currentWb = w; state.gps = null; state.photoData = null; $("entryWbName").textContent = w.name; $("entryWbMeta").textContent = `${w.project} · ${w.talukaMr} · ${fmtMr(todayStr())}`; $("entryForm").reset(); $("actionField").style.display = "none"; $("gpsMsg").textContent = ""; $("gpsMsg").className = "gps-msg"; $("btnGps").innerHTML = '<i class="bi bi-geo-alt"></i> लोकेशन मिळवा'; $("btnGps").disabled = false; $("photoPreview").style.display = "none"; $("btnPhoto").style.display = ""; $("entrySheet").style.display = ""; window.scrollTo(0, 0); history.pushState({ sheet: true }, ""); }
  function closeEntry() { $("entrySheet").style.display = "none"; }
  $("entryClose").addEventListener("click", () => history.back()); window.addEventListener("popstate", () => { if ($("entrySheet").style.display !== "none") closeEntry(); });

  document.querySelectorAll('input[name="status"]').forEach((r) => r.addEventListener("change", () => { const v = document.querySelector('input[name="status"]:checked').value; $("actionField").style.display = v === "ACTION_TAKEN" ? "" : "none"; $("entryRemark").placeholder = { SAFE: "उदा. परिसर शांत, पंप/पाइप आढळले नाहीत", ILLEGAL_PUMPING: "उदा. पूर्वेकडील काठावर २ विद्युत पंप सुरू", ACTION_TAKEN: "उदा. पंप बंद करून जप्ती केली" }[v]; }));
  $("btnGps").addEventListener("click", () => { const btn = $("btnGps"), msg = $("gpsMsg"); if (!navigator.geolocation) { msg.textContent = "GPS उपलब्ध नाही."; msg.className = "gps-msg err"; return; } btn.disabled = true; btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> शोधत आहे…'; navigator.geolocation.getCurrentPosition((pos) => { state.gps = { lat: pos.coords.latitude, lng: pos.coords.longitude, acc: Math.round(pos.coords.accuracy || 0) }; btn.className = "btn btn-outline-success w-100"; btn.innerHTML = '<i class="bi bi-check-circle"></i> लोकेशन मिळाले'; btn.disabled = false; let txt = `${state.gps.lat.toFixed(6)}, ${state.gps.lng.toFixed(6)}`; const w = state.currentWb; if (w && w.lat) { const d = haversine(state.gps.lat, state.gps.lng, w.lat, w.lng); txt += d <= w.geofenceM ? ` · स्थळापासून ${d} मी. ✅` : ` · ⚠️ दूर (${d} मी.)`; } msg.textContent = txt; msg.className = "gps-msg ok"; }, (err) => { btn.disabled = false; btn.className = "btn btn-earth w-100"; btn.innerHTML = '<i class="bi bi-arrow-repeat"></i> पुन्हा प्रयत्न'; msg.textContent = "लोकेशन मिळाले नाही."; msg.className = "gps-msg err"; }, { enableHighAccuracy: true, timeout: CFG.GPS_TIMEOUT_MS || 30000, maximumAge: 0 }); });
  function haversine(a, b, c, d) { const R = 6371000, r = Math.PI / 180, dl = (c - a) * r, dn = (d - b) * r, h = Math.sin(dl / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin(dn / 2) ** 2; return Math.round(R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h))); }

  $("btnPhoto").addEventListener("click", () => { $("photoInput").value = ""; $("photoInput").click(); }); $("btnRetake").addEventListener("click", () => { $("photoInput").value = ""; $("photoInput").click(); });
  $("photoInput").addEventListener("change", async (e) => { const file = e.target.files && e.target.files[0]; if (!file) return; if (!state.gps) return Swal.fire("आधी GPS", "आधी लोकेशन मिळवा.", "warning"); const status = (document.querySelector('input[name="status"]:checked') || {}).value; if (!status) return Swal.fire("आधी स्थिती निवडा", "", "warning"); busy("फोटो बनवत आहे…"); try { state.photoData = await stampPhoto(file, { status, remark: $("entryRemark").value.trim() }); $("photoImg").src = state.photoData; $("photoPreview").style.display = ""; $("btnPhoto").style.display = "none"; Swal.close(); } catch (err) { Swal.fire("फोटो त्रुटी", err.message, "error"); } });

  function stampPhoto(file, meta) { return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onerror = () => reject(new Error("वाचता आला नाही.")); reader.onload = (ev) => { const img = new Image(); img.onerror = () => reject(new Error("उघडता आला नाही.")); img.onload = () => { const MAX = CFG.PHOTO_MAX_PX || 1000; let w = img.width, h = img.height; if (w > h && w > MAX) { h = Math.round(h * MAX / w); w = MAX; } else if (h >= w && h > MAX) { w = Math.round(w * MAX / h); h = MAX; } const c = document.createElement("canvas"); c.width = w; c.height = h; const ctx = c.getContext("2d"); ctx.drawImage(img, 0, 0, w, h); const wb = state.currentWb, u = state.user, now = new Date(), dt = now.toLocaleDateString("mr-IN") + " " + now.toLocaleTimeString("mr-IN"); const lines = [ { t: "JAL-NETRA · वाशिम", c: "#ffd54f" }, { t: `💧 ${wb.name}`, c: "#fff" }, { t: `📍 ${wb.talukaMr} · ${dt}`, c: "#fff" }, { t: `👤 ${u.name}`, c: "#fff" }, { t: `${STATUS_MR[meta.status]}`, c: meta.status === "ILLEGAL_PUMPING" ? "#ff8a80" : meta.status === "SAFE" ? "#b9f6ca" : "#ffe082" }, { t: `GPS ${state.gps.lat.toFixed(6)}, ${state.gps.lng.toFixed(6)}`, c: "#80deea" } ]; const base = Math.round(w * 0.024), lh = Math.round(base * 1.45), pad = Math.round(w * 0.02); ctx.font = `bold ${base}px sans-serif`; const boxH = lines.length * lh + pad * 2; ctx.fillStyle = "rgba(0,0,0,0.68)"; ctx.fillRect(0, h - boxH, w, boxH); let y = h - boxH + pad + base; lines.forEach((L) => { ctx.fillStyle = L.c; ctx.fillText(L.t, pad, y); y += lh; }); resolve(c.toDataURL("image/jpeg", CFG.PHOTO_QUALITY || 0.7)); }; img.src = ev.target.result; }; reader.readAsDataURL(file); }); }

  $("entryForm").addEventListener("submit", async (e) => { e.preventDefault(); const status = (document.querySelector('input[name="status"]:checked') || {}).value; if (!status) return Swal.fire("स्थिती निवडा", "", "warning"); const remark = $("entryRemark").value.trim(), action = $("entryAction").value.trim(); if (!remark) return Swal.fire("शेरा लिहा", "", "warning"); if (!state.gps) return Swal.fire("GPS आवश्यक", "", "warning"); if (!state.photoData) return Swal.fire("फोटो आवश्यक", "", "warning"); const payload = { wbId: state.currentWb.wbId, status, remark, actionDetails: action, lat: state.gps.lat, lng: state.gps.lng, photoData: state.photoData, reportDate: currentInsDate, deviceInfo: navigator.userAgent.slice(0, 100) }; const q = { id: "Q" + Date.now(), wbName: state.currentWb.name, createdAt: new Date().toISOString(), payload }; busy("नेटवर्क तपासत आहे…"); const good = await testNetwork(); Swal.close(); if (good) { const r = await Swal.fire({ icon: "success", title: "इंटरनेट आहे", text: "नोंद सर्व्हरवर पाठवायची का?", showCancelButton: true, confirmButtonText: "🚀 आता पाठवा", cancelButtonText: "💾 नंतर पाठवा" }); if (r.isConfirmed) await uploadEntry(q, true); else await saveOffline(q); } else { await Swal.fire({ icon: "warning", title: "नेटवर्क नाही", text: "नोंद सेव्ह होत आहे.", confirmButtonText: "ठीक" }); await saveOffline(q); } });
  async function testNetwork() { if (!navigator.onLine) return false; const ctrl = new AbortController(), t = setTimeout(() => ctrl.abort(), 4000); try { const r = await fetch("manifest.json?ping=" + Date.now(), { cache: "no-store", signal: ctrl.signal }); return r.ok; } catch (e) { return false; } finally { clearTimeout(t); } }

  async function uploadEntry(q, fromForm) { busy("पाठवत आहे…"); try { let r = await api("submitDailyLog", { payload: q.payload }); Swal.close(); if (!r.success) { Swal.fire("त्रुटी", r.message, "error"); return false; } if (r.reportDate === todayStr()) { const w = state.waterBodies.find((x) => x.wbId === q.payload.wbId); if (w) { if(!w.todayList) w.todayList = []; w.todayList.push({ status: q.payload.status, time: new Date().toLocaleTimeString('mr-IN').slice(0,5), photo: r.photoUrl }); if (!w.lat && r.locationProposed) { w.lat = q.payload.lat; w.lng = q.payload.lng; w.locationStatus = "PROPOSED"; } } store.set("jn_wbs", JSON.stringify(state.waterBodies)); renderWaterBodies(); } if (fromForm) { closeEntry(); history.replaceState(null, ""); } await Swal.fire({ icon: "success", title: r.message, html: q.wbName }); loadWaterBodies(true).catch(() => {}); window.JN.loadLiveFeed("feedListIns", todayStr()); return true; } catch (err) { Swal.close(); if (fromForm) { await Swal.fire({ icon: "warning", title: "पाठवता आले नाही", text: "मोबाईलमध्ये सेव्ह केले.", confirmButtonText: "ठीक" }); await saveOffline(q); } return false; } }

  const DB_NAME = "jalnetra", DB_STORE = "queue"; function openDb() { return new Promise((res, rej) => { const rq = indexedDB.open(DB_NAME, 1); rq.onupgradeneeded = () => { rq.result.createObjectStore(DB_STORE, { keyPath: "id" }); }; rq.onsuccess = () => res(rq.result); rq.onerror = () => rej(rq.error); }); } async function qAll() { const db = await openDb(); return new Promise((res, rej) => { const r = db.transaction(DB_STORE).objectStore(DB_STORE).getAll(); r.onsuccess = () => res(r.result || []); r.onerror = () => rej(r.error); }); } async function qPut(item) { const db = await openDb(); return new Promise((res, rej) => { const t = db.transaction(DB_STORE, "readwrite"); t.objectStore(DB_STORE).put(item); t.oncomplete = res; t.onerror = () => rej(t.error); }); } async function qDel(id) { const db = await openDb(); return new Promise((res, rej) => { const t = db.transaction(DB_STORE, "readwrite"); t.objectStore(DB_STORE).delete(id); t.oncomplete = res; t.onerror = () => rej(t.error); }); }
  async function saveOffline(q) { try { await qPut(q); await Swal.fire({ icon: "info", title: "मोबाईलमध्ये सेव्ह झाले", text: "रेंजमध्ये आल्यावर आता पाठवा दाबा." }); closeEntry(); history.replaceState(null, ""); await refreshOfflineBanner(); renderWaterBodies(); } catch (e) { Swal.fire("त्रुटी", "मेमरी फुल", "error"); } }
  async function refreshOfflineBanner() { let items = []; try { items = await qAll(); } catch (e) {} window.__jnQueueWbIds = {}; items.forEach((i) => { window.__jnQueueWbIds[i.payload.wbId] = true; }); $("offlineBanner").style.display = items.length ? "" : "none"; $("offlineCount").textContent = items.length; $("btnSyncNow").disabled = !navigator.onLine; }
  $("btnSyncNow").addEventListener("click", async () => { const items = await qAll(); if (!items.length) return; let ok = 0, fail = 0; for (const q of items) { busy(`पाठवत आहे… ${ok + fail + 1}/${items.length}`); try { let r = await api("submitDailyLog", { payload: q.payload }); if (r.success) { await qDel(q.id); ok++; } else { fail++; } } catch (e) { fail++; } } Swal.close(); await refreshOfflineBanner(); await loadWaterBodies(); Swal.fire("पूर्ण झाले", `${ok} यशस्वी, ${fail} राहिले`, fail ? "warning" : "success"); });

  
  // 🔹 FORCE PWA INSTALL LOGIC
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); state.deferredInstall = e; });
  window.addEventListener("appinstalled", () => {
    store.set("jn_installed", "1");
    if(state.token) api("recordAppInstall", {}).catch(()=>{}); // सर्व्हरला कळवा
    Swal.fire({ icon: "success", title: "अ‍ॅप इन्स्टॉल झाले ✅", html: "आता हा ब्राउझर टॅब <b>बंद करा</b> आणि होम स्क्रीनवरील <b>JAL-NETRA</b> आयकॉनवरून अ‍ॅप उघडा.", confirmButtonText: "समजले", allowOutsideClick: false });
  });

  async function showInstallGate() {
    if (isStandalone() || store.get("jn_installed") === "1") return;
    if (!state.deferredInstall) await new Promise((r) => setTimeout(r, 1500));
    const canPrompt = !!state.deferredInstall;
    const manual = isIOS() ? "Safari मध्ये खालचे <b>Share (⬆️)</b> बटन → <b>Add to Home Screen</b> → Add" : "Chrome च्या वरच्या उजव्या <b>⋮</b> मेनूत → <b>Add to Home screen</b> / <b>Install app</b> → Install";
    
    // ⚠️ येथे Cancel पर्याय पूर्णपणे बंद केला आहे.
    const r = await Swal.fire({
      imageUrl: "icons/icon-192.png", imageWidth: 84, imageHeight: 84,
      title: "प्रथम अ‍‍ॅप इन्स्टॉल करा",
      html: `<div style="text-align:left;line-height:1.7;font-size:15px;color:#c1292e;font-weight:600;margin-bottom:10px;">हे ॲप ब्राउझरमध्ये चालणार नाही.</div>
             <div style="text-align:left;line-height:1.6;font-size:14px">कॅमेरा व लोकेशनसाठी ॲप इन्स्टॉल करणे बंधनकारक आहे.<br><br>${canPrompt ? "खालील बटन दाबा — एका टॅपमध्ये इन्स्टॉल होईल." : "या फोनवर स्वयंचलित बटन नाही, त्यामुळे:<br>" + manual}</div>`,
      showCancelButton: !canPrompt,
      cancelButtonText: "मी इन्स्टॉल केले आहे",
      confirmButtonText: canPrompt ? "📲 अ‍ॅप इन्स्टॉल करा" : "समजले",
      allowOutsideClick: false, allowEscapeKey: false, reverseButtons: true
    });
    
    if (canPrompt && r.isConfirmed) {
      state.deferredInstall.prompt(); await state.deferredInstall.userChoice; state.deferredInstall = null;
    } else if (!canPrompt && r.dismiss === Swal.DismissReason.cancel) {
      store.set("jn_installed", "1"); // iOS user manually claims installation
    }
  }

  if ("serviceWorker" in navigator) window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
  document.addEventListener("DOMContentLoaded", async () => { $("appVersion").textContent = CFG.APP_VERSION || ""; document.querySelectorAll(".appVersion2").forEach((el) => { el.textContent = CFG.APP_VERSION || ""; }); runSplash(); updateNet(); loadPublicSettings(); if (restoreSession()) enterApp(); else show("screenLogin"); setTimeout(showInstallGate, 3500); });
})();
