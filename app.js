/* =============================================================================
   🌊 JAL-NETRA — Frontend (Notice Board Update)
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
  const fmtMr = (ymd) => { if(!ymd)return""; const parts = ymd.split("-"); if(parts.length!==3) return ymd; return `${parseInt(parts[2], 10)} ${MONTHS_MR[parseInt(parts[1], 10) - 1]} ${parts[0]}`; };

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

  function show(id) { ["screenLogin", "screenForcePwd", "screenInspector", "screenOfficer"].forEach((s) => { $(s).style.display = s === id ? "" : "none"; }); const inApp = (id === "screenInspector" || id === "screenOfficer"); $("topbar").style.display = inApp ? "" : "none"; }
  
  async function loadPublicSettings() { 
    try { 
      const r = await api("getPublicSettings", {}, { timeout: 15000 }); 
      if (r && r.success) { 
        state.settings = r; 
        if (r.tagline) $("splashTagline").textContent = r.tagline; 
        if (r.subtitle) $("splashSubtitle").textContent = r.subtitle; 
        if ($("tabRegisterItem")) $("tabRegisterItem").style.display = r.registrationOpen ? "" : "none"; 
        const sel = $("regTaluka"); if (sel && r.talukas) sel.innerHTML = '<option value="">निवडा</option>' + r.talukas.map((t) => `<option value="${t.en}">${t.mr}</option>`).join(""); 
        
        // 🔹 डेटा आल्यावर फळा रंगवा
        window.JN.renderNoticeBoard("noticeIns");
        window.JN.renderNoticeBoard("noticeOff");
      } 
    } catch (e) {} 
  }

  const roleLabel = (r) => ({ INSPECTOR: "Team Member", TALUKA_MONITOR: "Taluka Monitoring Officer", AGENCY_HEAD: "Agency Head", DISTRICT_CELL: "Dist. Monitoring Cell", COLLECTOR: "Hon Dist Collector", TEAM_COORD: "Team Co-ordinator", OPERATOR: "Operator", SUPER_ADMIN: "Super Admin" }[r] || r);
   window.JN = { api, state, toast, busy, fmtMr, todayStr, STATUS_MR, MONTHS_MR, roleLabel, show, $, loadPublicSettings };

  // 🔹 सूचना फलक
  window.JN.renderNoticeBoard = function(containerId) {
    const el = $(containerId); if(!el) return;
    const notice = state.settings?.collectorNotice || "";
    const date = state.settings?.collectorNoticeDate || "";
    if(notice.trim() === "") {
        el.innerHTML = `<div class="chalkboard-wrap" style="margin-bottom:10px;"><div class="chalk-empty">मा. जिल्हाधिकारी यांच्याकडून सध्या कोणतीही सूचना नाही.</div></div>`;
    } else {
        el.innerHTML = `<div class="chalkboard-wrap"><div class="chalk-header"><span><i class="bi bi-megaphone-fill"></i> मा. जिल्हाधिकारी यांची सूचना</span><span>${fmtMr(date)}</span></div><div class="chalk-body">${notice}</div></div>`;
    }
  };

  window.JN.loadLiveFeed = async function(containerId, date) {
    const el = $(containerId); if(!el) return; el.innerHTML = '<div class="loading">लाईव्ह फीड लोड होत आहे…</div>';
    try {
      const r = await api("getLiveFeed", { date }); if (!r.success) { el.innerHTML = `<div class="empty">${r.message}</div>`; return; }
      if (!r.feed.length) { el.innerHTML = '<div class="empty">या तारखेला कोणतीही नोंद झालेली नाही.</div>'; return; }
      el.innerHTML = r.feed.map(f => `<div class="feed-msg"><div class="feed-head"><span class="feed-name"><i class="bi bi-person-circle"></i> ${f.officerName}</span><span>${f.time}</span></div><div class="feed-wb">${f.wbName} <small class="text-muted">(${f.taluka})</small></div><span class="feed-status fs-${f.status}">${STATUS_MR[f.status]}</span>${f.photo ? `<img src="${f.photo}" class="feed-img">` : ""}<div class="feed-text">${f.remark} ${f.action ? `<br><b style="color:#8a6400">कारवाई:</b> ${f.action}` : ""}</div></div>`).join("");
    } catch(e) { el.innerHTML = '<div class="empty">नेटवर्क त्रुटी</div>'; }
  };

  function enterApp() {
    $("topbarUser").innerHTML = `<span style="color:#ffd54f;font-size:14.5px;">${state.user.name}</span><br><small style="font-size:11px;opacity:0.9">${state.user.id} · ${roleLabel(state.user.role)}</small>`;
    if (state.user.role === "INSPECTOR") { show("screenInspector"); initInspector(); } else { show("screenOfficer"); if (window.JN && window.JN.officer) window.JN.officer.init(); }
  }

  function restoreSession() { const tk = store.get("jn_token"), us = store.get("jn_user"); if (tk && us) { try { state.token = tk; state.user = JSON.parse(us); return true; } catch (e) {} } return false; }

  document.addEventListener("DOMContentLoaded", async () => {
    $("appVersion").textContent = CFG.APP_VERSION || ""; 
    runSplash(); updateNet(); loadPublicSettings(); 
    $("loginForm").addEventListener("submit", async (e) => { e.preventDefault(); const btn = $("loginBtn"); btn.disabled = true; btn.textContent = "तपासत आहे…"; try { const r = await api("login", { id: $("loginId").value.trim(), pwd: $("loginPwd").value }); if (!r.success) { Swal.fire("लॉगिन झाले नाही", r.message, "error"); return; } state.token = r.token; state.user = r.user; store.set("jn_token", r.token); store.set("jn_user", JSON.stringify(r.user)); if (r.settings) { state.settings = r.settings; } if (r.mustChangePassword) show("screenForcePwd"); else enterApp(); } catch (err) { Swal.fire("नेटवर्क त्रुटी", err.message, "error"); } finally { btn.disabled = false; btn.textContent = "लॉगिन करा"; } });
    $("togglePwd").addEventListener("click", () => { const i = $("loginPwd"), ic = $("togglePwd").querySelector("i"), showing = i.type === "text"; i.type = showing ? "password" : "text"; ic.className = showing ? "bi bi-eye" : "bi bi-eye-slash"; });
    $("savePwdBtn").addEventListener("click", async () => { const p1 = $("newPwd1").value, p2 = $("newPwd2").value; if (p1.length < 4 || p1 !== p2) return Swal.fire("तपासा", "पासवर्ड जुळत नाहीत.", "warning"); busy("सेव्ह होत आहे…"); try { const r = await api("changePassword", { newPwd: p1 }); Swal.close(); if (r.success) { toast("success", "पासवर्ड बदलला"); enterApp(); } else Swal.fire("त्रुटी", r.message, "error"); } catch (err) {} });
    $("registerForm").addEventListener("submit", async (e) => { 
  e.preventDefault(); const f = e.target; busy("नोंदणी होत आहे…"); 
  try { 
    const r = await api("register", { 
      form: { 
        name: f.name.value, 
        mobile: f.mobile.value, 
        email: f.email.value,              // 🔹 नवीन
        designation: f.designation.value,  // 🔹 नवीन
        taluka: f.taluka.value, 
        role: f.role.value, 
        agency: f.agency.value, 
        reportsTo: f.reportsTo.value 
      } 
    }); 
    Swal.close(); 
    if (r.success) { Swal.fire({ icon: "success", title: "नोंदणी झाली", html: r.message }); f.reset(); $("tabLogin").click(); } 
    else Swal.fire("त्रुटी", r.message, "error"); 
  } catch (err) {} 
});
     $("btnLogout").addEventListener("click", () => Swal.fire({ title: "लॉगआउट करायचे?", icon: "question", showCancelButton: true, confirmButtonText: "होय" }).then((r) => { if (r.isConfirmed) doLogout(); }));
    if (restoreSession()) enterApp(); else show("screenLogin"); setTimeout(showInstallGate, 3500);
  });

  function doLogout(silent) { if (state.token && !silent) api("logout", {}).catch(() => {}); state.token = null; state.user = null; store.del("jn_token"); store.del("jn_user"); show("screenLogin"); if (!silent) toast("info", "लॉगआउट झाले"); }
  function isMobileDevice() { return (/Android|iPhone|iPad|iPod/i.test(navigator.userAgent || "")) && (("ontouchstart" in window) || navigator.maxTouchPoints > 1) && window.innerWidth <= 900; }

  // ───────────────────────── Inspector Logic ─────────────────────────
  function addDays(ymd, days) { const d = new Date(ymd); d.setDate(d.getDate() + days); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
  let currentInsDate = todayStr();

  $("btnRefresh").addEventListener("click", () => { toast("info", "रिफ्रेश होत आहे…"); loadInspectorData(); window.JN.loadPublicSettings(); });

  async function initInspector() { 
    $("desktopGuard").style.display = isMobileDevice() ? "none" : ""; 
    await refreshOfflineBanner(); 
    
    const fDate = $("dashDateIns");
    if(fDate) {
       fDate.value = currentInsDate; fDate.max = todayStr();
       const newFDate = fDate.cloneNode(true); fDate.parentNode.replaceChild(newFDate, fDate);
       newFDate.addEventListener("change", () => { currentInsDate = newFDate.value; loadInspectorData(); });
       
       const btnPrev = $("dashPrevIns"), newPrev = btnPrev.cloneNode(true); btnPrev.parentNode.replaceChild(newPrev, btnPrev);
       newPrev.addEventListener("click", () => { currentInsDate = addDays(currentInsDate, -1); newFDate.value = currentInsDate; loadInspectorData(); });
       
       const btnNext = $("dashNextIns"), newNext = btnNext.cloneNode(true); btnNext.parentNode.replaceChild(newNext, btnNext);
       newNext.addEventListener("click", () => { if(currentInsDate < todayStr()) { currentInsDate = addDays(currentInsDate, 1); newFDate.value = currentInsDate; loadInspectorData(); } });
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
    const list = $("wbList"); if (!isRetry) list.innerHTML = '<div class="loading">जलसाठे लोड होत आहेत…</div>';
    try {
      const r = await api("getMyWaterBodies", { date: currentInsDate }); if (!r.success) { list.innerHTML = `<div class="empty">${r.message}</div>`; return; }
      state.waterBodies = r.waterBodies || [];
      if (!state.waterBodies.length && !isRetry) { list.innerHTML = '<div class="loading">पुन्हा तपासत आहे…</div>'; await new Promise((res) => setTimeout(res, 2000)); return loadWaterBodies(true); }
      store.set("jn_wbs", JSON.stringify(state.waterBodies));
    } catch (e) {
      const cached = store.get("jn_wbs"); state.waterBodies = cached ? JSON.parse(cached) : [];
      if (!state.waterBodies.length) { list.innerHTML = `<div class="empty">इंटरनेट नाही आणि जुनी यादीही नाही.</div>`; return; } toast("warning", "ऑफलाइन — शेवटची यादी दाखवत आहे");
    }
    renderWaterBodies(); fillCalFilter();
  }

  function renderWaterBodies() {
    const list = $("wbList"), mobile = isMobileDevice(), pendingLocal = window.__jnQueueWbIds || {};
    if (!state.waterBodies.length) { list.innerHTML = `<div class="empty">तुम्हाला जलसाठा नेमून दिलेला नाही.</div>`; return; }
    let done = 0;
    const bad = state.waterBodies.filter((w) => w.locationStatus === "DISAPPROVED");
    const banner = bad.length ? `<div class="alert-earth" style="background:#fdecea;border:1px solid #c1292e;color:#8a1c1f;margin-bottom:10px;"><i class="bi bi-exclamation-triangle-fill"></i> <b>${bad.length} जलसाठ्याचे स्थळ अप्रूव्ह झालेले नाही.</b> कृपया पुन्हा भेट देऊन स्थळाचा फोटो व GPS सह नोंद करा — जेणेकरून स्थळ दुरुस्त होईल.</div>` : "";
    list.innerHTML = banner + state.waterBodies.map((w) => {
      const entries = w.todayList || []; if (entries.length) done++; const queued = pendingLocal[w.wbId];
      const dis = w.locationStatus === "DISAPPROVED";
      let badges = entries.map(t => `<span class="wb-badge ${t.status}" style="margin-right:4px;">${STATUS_MR[t.status]} (${t.time})</span>`).join("");
      if(!entries.length) badges = queued ? `<span class="wb-badge pending queued">⏳ पाठवणे बाकी</span>` : `<span class="wb-badge pending">आज बाकी</span>`;
      const btnText = dis ? (entries.length ? 'आणखी नोंद करा' : 'स्थळ दुरुस्त करा') : (entries.length ? 'आणखी नोंद करा' : 'नोंद करा');
      const btn = !mobile ? "" : `<button class="btn btn-water" data-wb="${w.wbId}">${btnText}</button>`;
      const geo = dis
        ? `<span style="color:#c1292e;font-weight:600;"><i class="bi bi-exclamation-triangle"></i> स्थळ अप्रूव्ह झालेले नाही${w.locationNote ? " — " + w.locationNote : ""}</span>`
        : `<i class="bi bi-geo"></i> ${w.lat ? "नोंदवलेले स्थळ" : "GPS अद्याप नाही"}`;
      return `<div class="wb-card ${entries.length ? "done-" + entries[entries.length-1].status : ""}"${dis ? ' style="border:1px solid #c1292e;"' : ""}><div class="wb-card-top"><div><div class="wb-name">${w.name}</div><div class="wb-meta">${w.project} · ${w.talukaMr}</div></div></div><div style="margin-top:8px;">${badges}</div><div class="wb-geo">${geo}</div><div class="wb-actions">${btn}</div></div>`;
    }).join("");
    $("todayDone").textContent = done; $("todayTotal").textContent = state.waterBodies.length;
    list.querySelectorAll("button[data-wb]").forEach((b) => b.addEventListener("click", () => openEntry(b.dataset.wb)));
  }

  // ───────────────────────── Calendar Logic ─────────────────────────
  function fillCalFilter() { const sel = $("calWbFilter"); if(sel) { sel.innerHTML = '<option value="">सर्व जलसाठे</option>' + state.waterBodies.map((w) => `<option value="${w.wbId}">${w.name}</option>`).join(""); } }
  $("calWbFilter").addEventListener("change", (e) => { state.cal.wbId = e.target.value; loadCalendar(); }); 
  $("calPrev").addEventListener("click", () => { state.cal.month--; if (state.cal.month < 1) { state.cal.month = 12; state.cal.year--; } loadCalendar(); }); 
  $("calNext").addEventListener("click", () => { state.cal.month++; if (state.cal.month > 12) { state.cal.month = 1; state.cal.year++; } loadCalendar(); }); 
  $("tabCal").addEventListener("shown.bs.tab", loadCalendar);
  
  async function loadCalendar() { 
    const { year, month, wbId } = state.cal; 
    $("calTitle").textContent = `${MONTHS_MR[month - 1]} ${year}`; 
    const grid = $("calGrid"); 
    grid.innerHTML = DOW_MR.map((d) => `<div class="cal-dow">${d}</div>`).join("") + '<div class="loading" style="grid-column:1/-1">लोड होत आहे…</div>'; 
    let days = {}, stats = { reportedDays: 0, redDays: 0 }; 
    try { const r = await api("getInspectorCalendar", { year, month, wbId }); if (r.success) { days = r.days; stats = r; } } catch (e) {} 
    const first = new Date(year, month - 1, 1).getDay(), dim = new Date(year, month, 0).getDate(), today = todayStr(); 
    let html = DOW_MR.map((d) => `<div class="cal-dow">${d}</div>`).join(""); 
    for (let i = 0; i < first; i++) html += '<div class="cal-day empty-cell"></div>'; 
    for (let d = 1; d <= dim; d++) { 
       const ymd = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`; 
       const info = days[ymd]; const future = ymd > today; 
       let cls = "cal-day" + (ymd === today ? " today" : "") + (future ? " future" : ""); 
       if (info) cls += " " + info.status + (info.photo ? " has-photo" : ""); 
       html += `<div class="${cls}" data-ymd="${ymd}">${d}</div>`; 
    } 
    grid.innerHTML = html; 
    grid.querySelectorAll(".cal-day[data-ymd]").forEach((el) => el.addEventListener("click", () => { 
       const info = days[el.dataset.ymd]; if (!info || info.status === "NOT_REPORTED") return; 
       Swal.fire({ title: fmtMr(el.dataset.ymd), html: `<b>${STATUS_MR[info.status]}</b>${info.photo ? `<br><img src="${info.photo}" style="max-width:100%;border-radius:12px;margin-top:10px">` : ""}`, confirmButtonText: "बंद" }); 
    })); 
    $("calStats").innerHTML = `<div>नोंद: <b>${stats.reportedDays || 0}</b> दिवस</div><div>उपसा: <b style="color:#c1292e">${stats.redDays || 0}</b> दिवस</div>`; 
  }

  // ───────────────────────── PWA Install ─────────────────────────
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); state.deferredInstall = e; });
  window.addEventListener("appinstalled", () => { store.set("jn_installed", "1"); if(state.token) api("recordAppInstall", {}).catch(()=>{}); Swal.fire({ icon: "success", title: "अ‍‍ॅप इन्स्टॉल झाले ✅", html: "आता हा ब्राउझर टॅब <b>बंद करा</b> आणि होम स्क्रीनवरील <b>JAL-NETRA</b> आयकॉनवरून अ‍ॅप उघडा.", confirmButtonText: "समजले", allowOutsideClick: false }); });
  async function showInstallGate() {
    if (isStandalone() || store.get("jn_installed") === "1") return;
    if (!state.deferredInstall) await new Promise((r) => setTimeout(r, 1500));
    const canPrompt = !!state.deferredInstall, manual = isIOS() ? "Safari मध्ये खालचे <b>Share (⬆️)</b> बटन → <b>Add to Home Screen</b> → Add" : "Chrome च्या वरच्या उजव्या <b>⋮</b> मेनूत → <b>Add to Home screen</b> / <b>Install app</b> → Install";
    const r = await Swal.fire({ imageUrl: "icons/icon-192.png", imageWidth: 84, imageHeight: 84, title: "प्रथम अ‍‍ॅप इन्स्टॉल करा", html: `<div style="text-align:left;line-height:1.7;font-size:15px;color:#c1292e;font-weight:600;margin-bottom:10px;">हे ॲप ब्राउझरमध्ये चालणार नाही.</div><div style="text-align:left;line-height:1.6;font-size:14px">कॅमेरा व लोकेशनसाठी ॲप इन्स्टॉल करणे बंधनकारक आहे.<br><br>${canPrompt ? "खालील बटन दाबा — एका टॅपमध्ये इन्स्टॉल होईल." : "या फोनवर स्वयंचलित बटन नाही, त्यामुळे:<br>" + manual}</div>`, showCancelButton: !canPrompt, cancelButtonText: "मी इन्स्टॉल केले आहे", confirmButtonText: canPrompt ? "📲 अ‍ॅप इन्स्टॉल करा" : "समजले", allowOutsideClick: false, allowEscapeKey: false, reverseButtons: true });
    if (canPrompt && r.isConfirmed) { state.deferredInstall.prompt(); await state.deferredInstall.userChoice; state.deferredInstall = null; } else if (!canPrompt && r.dismiss === Swal.DismissReason.cancel) { store.set("jn_installed", "1"); }
  }
})();
