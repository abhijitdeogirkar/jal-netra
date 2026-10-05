/* =============================================================================
   🌊 JAL-NETRA — officer.js (टप्पा ३.२ - Officer Dashboard)
   ============================================================================= */
(function () {
  "use strict";
  const JN = window.JN; if (!JN) return;
  const { api, state, toast, busy, fmtMr, todayStr, STATUS_MR, roleLabel, $ } = JN;
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const ICON = { SAFE: "🟢", ILLEGAL_PUMPING: "🔴", ACTION_TAKEN: "🟡", NOT_REPORTED: "⚪" };
  const COLOR = { SAFE: "#2e7d32", ILLEGAL_PUMPING: "#c1292e", ACTION_TAKEN: "#e0a100", NOT_REPORTED: "#9c9185" };
  
  const O = { date: todayStr(), dash: null, map: null, layer: null, satellite: false, markers: [], mapData: null, team: null, users: null, wbs: null, inited: false };

  // 🔹 तारखा बदलण्यासाठी सुरक्षित फंक्शन्स
  const formatYMD = (d) => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  const addDays = (ymd, days) => { const d = new Date(ymd); d.setDate(d.getDate() + days); return formatYMD(d); };

  function contactBtns(mobile, wbNames) {
    if (!mobile) return ""; const m = mobile.replace(/\D/g, "").slice(-10); const msg = encodeURIComponent(`नमस्कार, JAL-NETRA मध्ये आज (${fmtMr(O.date)}) ${wbNames ? wbNames + " या जलसाठ्याची" : "आपली"} दैनिक नोंद प्रलंबित आहे. कृपया तात्काळ भेट देऊन नोंद करावी. — ${state.user.name}`);
    return `<div class="contact-btns"><a class="cb cb-call" href="tel:${m}"><i class="bi bi-telephone-fill"></i></a><a class="cb cb-wa" href="https://wa.me/91${m}?text=${msg}" target="_blank" rel="noopener"><i class="bi bi-whatsapp"></i></a></div>`;
  }

  function init() {
    if (!O.inited) {
      O.inited = true;
      
      // 🔹 १. मुख्य डॅशबोर्डची तारीख व्यवस्था
      const oDate = $("offDate");
      if(oDate) {
         oDate.value = O.date; oDate.max = todayStr();
         oDate.addEventListener("change", () => { O.date = oDate.value || todayStr(); loadDashboard(); if (O.map) loadMap(); });
      }

      // 🔹 २. रिफ्रेश बटन
      const btnRef = $("offRefresh");
      if(btnRef) {
         btnRef.addEventListener("click", () => { 
            toast("info", "रिफ्रेश होत आहे…"); 
            loadDashboard(); 
            if (O.map) loadMap(); 
            if($("feedDateOff")) window.JN.loadLiveFeed("feedListOff", $("feedDateOff").value); 
            O.team = null; 
         });
      }
      
      // 🔹 ३. फीडची तारीख व बाण (Arrows)
      const fDate = $("feedDateOff");
      if(fDate) {
         fDate.value = todayStr(); fDate.max = todayStr();
         fDate.addEventListener("change", () => window.JN.loadLiveFeed("feedListOff", fDate.value));
         $("feedPrevOff").addEventListener("click", () => { fDate.value = addDays(fDate.value, -1); window.JN.loadLiveFeed("feedListOff", fDate.value); });
         $("feedNextOff").addEventListener("click", () => { if(fDate.value < todayStr()) { fDate.value = addDays(fDate.value, 1); window.JN.loadLiveFeed("feedListOff", fDate.value); } });
      }

      // 🔹 ४. टॅब्स जोडणी (बटणे ॲक्टिव्हेट करणे)
      if($("tabOffFeed")) $("tabOffFeed").addEventListener("shown.bs.tab", () => { if(fDate) window.JN.loadLiveFeed("feedListOff", fDate.value); });
      if($("tabMap")) $("tabMap").addEventListener("shown.bs.tab", () => { ensureMap(); loadMap(); });
      if($("tabTeam")) $("tabTeam").addEventListener("shown.bs.tab", loadTeam);
      if($("tabAdmin")) $("tabAdmin").addEventListener("shown.bs.tab", loadAdmin);
      
      // 🔹 ५. नकाशा आणि अ‍ॅडमिन फिल्टर्स
      ["mapAgency", "mapTaluka", "mapStatus"].forEach((id) => { if($(id))$(id).addEventListener("change", renderMarkers); });
      if($("mapLayerBtn")) $("mapLayerBtn").addEventListener("click", toggleLayer);
      if($("admUserSearch")) $("admUserSearch").addEventListener("input", renderUsers); 
      if($("admWbSearch")) $("admWbSearch").addEventListener("input", renderWbs);
    }

    // 🔹 ६. भूमिका आणि अधिकार तपासणी
    if($("offRoleLabel")) $("offRoleLabel").textContent = roleLabel(state.user.role);
    const isCell = state.user.role === "DISTRICT_CELL" || state.user.role === "COLLECTOR";
    if($("tabAdminItem")) $("tabAdminItem").style.display = (isCell || state.user.role === "AGENCY_HEAD" || state.user.role === "TALUKA_MONITOR") ? "" : "none";
    if($("admSettingsTab")) $("admSettingsTab").style.display = (state.user.role === "DISTRICT_CELL") ? "" : "none";
    
    // 🔹 ७. माहिती लोड करणे
    if($("feedDateOff")) window.JN.loadLiveFeed("feedListOff", $("feedDateOff").value || todayStr());
    loadDashboard(); 
    loadTrend();
  }

  async function loadDashboard() {
    const grid = $("kpiGrid"); if(!grid) return;
    grid.innerHTML = '<div class="loading"><span class="spinner-border spinner-border-sm"></span> डॅशबोर्ड लोड होत आहे…</div>';
    try { 
        const r = await api("getMonitorDashboard", { date: O.date }); 
        if (!r.success) { grid.innerHTML = `<div class="empty">${esc(r.message)}</div>`; return; } 
        O.dash = r; 
        if($("offScope")) $("offScope").textContent = r.scopeLabel; 
        renderKpi(r); renderRed(r); renderPending(r); renderBreakdown(r); 
    } catch (e) { grid.innerHTML = `<div class="empty">नेटवर्क त्रुटी</div>`; }
  }

  function renderKpi(r) {
    const k = r.kpi, dateLbl = r.isToday ? "आज" : fmtMr(r.date);
    const grid = $("kpiGrid"); if(!grid) return;
    grid.innerHTML = `
      <div class="kpi kpi-main"><div class="kpi-val">${k.reportedPct}%</div><div class="kpi-lbl">${dateLbl} तपासणी<br><small>${k.reported} / ${k.total} जलसाठे</small></div><div class="kpi-bar"><i style="width:${k.reportedPct}%"></i></div></div>
      <div class="kpi kpi-main" style="border-top-color:#1b998b"><div class="kpi-val">${k.installedUsers || 0}/${k.totalUsers || 0}</div><div class="kpi-lbl">तुमच्या अधिकाऱ्यांचे<br>ॲप इन्स्टॉलेशन्स</div></div>
      <div class="kpi kpi-red"><div class="kpi-val">${k.red}</div><div class="kpi-lbl">उपसा</div></div>
      <div class="kpi kpi-grey"><div class="kpi-val">${k.pending}</div><div class="kpi-lbl">नोंद बाकी</div></div>
      <div class="kpi kpi-yellow"><div class="kpi-val">${k.yellow}</div><div class="kpi-lbl">कारवाई</div></div>
      <div class="kpi kpi-green"><div class="kpi-val">${k.safe}</div><div class="kpi-lbl">सुरक्षित</div></div>`;
  }

  function wbCard(it, cls) { return `<div class="rcard ${cls}"><div class="rcard-top"><div><div class="rcard-name">${ICON[it.status] || ""} ${esc(it.name)}</div><div class="rcard-meta">${esc(it.project)} · ${esc(it.talukaMr)}</div></div></div>${it.remark ? `<div class="rcard-remark">“${esc(it.remark)}”</div>` : ""}${it.action ? `<div class="rcard-remark"><b>कारवाई:</b> ${esc(it.action)}</div>` : ""}<div class="rcard-foot"><span><i class="bi bi-person"></i> ${it.inspectors && it.inspectors.length ? esc(it.inspectors[0].name) : "निरीक्षक नाही"}</span><button class="btn btn-sm btn-link p-0" data-hist="${esc(it.wbId)}">इतिहास</button></div></div>`; }
  function renderRed(r) { const el = $("redSection"); if(!el) return; if (!r.red.length && !r.yellow.length) { el.innerHTML = `<div class="ok-strip"><i class="bi bi-shield-check"></i> बेकायदेशीर उपसा नाही.</div>`; return; } el.innerHTML = (r.red.length ? `<h3 class="sec-title sec-red">🔴 बेकायदेशीर उपसा — ${r.red.length}</h3>` + r.red.map((it) => wbCard(it, "rc-red")).join("") : "") + (r.yellow.length ? `<h3 class="sec-title sec-yellow">🟡 कारवाई केली — ${r.yellow.length}</h3>` + r.yellow.map((it) => wbCard(it, "rc-yellow")).join("") : ""); el.querySelectorAll("[data-hist]").forEach((b) => b.addEventListener("click", () => showHistory(b.dataset.hist))); }
  function renderPending(r) { const el = $("pendingSection"); if(!el) return; if (!r.pending.length) { el.innerHTML = `<div class="ok-strip"><i class="bi bi-check2-all"></i> सर्व जलसाठ्यांची नोंद झाली आहे.</div>`; return; } el.innerHTML = `<h3 class="sec-title sec-grey">⚪ नोंद बाकी — ${r.kpi.pending} जलसाठे</h3>` + r.pending.map((p) => `<div class="pcard"><div class="pcard-top"><div><div class="pcard-name">${esc(p.name)}</div><div class="pcard-meta">${p.id ? esc(p.id) + " · " : ""}${p.mobile ? esc(p.mobile) : ""}</div></div>${contactBtns(p.mobile, p.wbs.map((w) => w.name).join(", "))}</div><div class="pcard-wbs">${p.wbs.map((w) => `<span class="chip">${esc(w.name)} <small>${esc(w.taluka)}</small></span>`).join("")}</div></div>`).join(""); }
  function renderBreakdown(r) { const el = $("breakdownSection"); if(!el) return; const role = state.user.role; if (role === "TALUKA_MONITOR") { el.innerHTML = ""; return; } const table = (title, obj) => { const keys = Object.keys(obj).sort((a, b) => (obj[b].red - obj[a].red) || ((obj[a].reported / obj[a].total) - (obj[b].reported / obj[b].total))); if (keys.length < 2) return ""; return `<h3 class="sec-title">${title}</h3><div class="bd-table">${keys.map((k) => { const v = obj[k], pct = v.total ? Math.round(v.reported * 100 / v.total) : 0; return `<div class="bd-row"><div class="bd-name">${esc(k)}</div><div class="bd-bar"><i style="width:${pct}%"></i></div><div class="bd-num">${pct}%</div><div class="bd-red">${v.red ? "🔴 " + v.red : ""}</div></div>`; }).join("")}</div>`; }; el.innerHTML = table("तालुकानिहाय", r.byTaluka) + (role !== "AGENCY_HEAD" ? table("एजन्सीनिहाय", r.byAgency) : ""); }
  
  async function loadTrend() { try { const r = await api("getTrend", { days: 7 }); if (!r.success) return; const s = r.series; if($("trendBars")) $("trendBars").innerHTML = s.map((d) => `<div class="tb"><div class="tb-col"><i style="height:${d.pct||0}%;background:${d.red ? "#c1292e" : "#1b998b"}"></i></div><div class="tb-val">${d.pct||0}</div><div class="tb-lbl">${d.date.slice(8, 10)}</div></div>`).join(""); const valid = s.filter((d) => d.pct != null), avg = valid.length ? Math.round(valid.reduce((a, d) => a + d.pct, 0) / valid.length) : null; if($("trendAvg")) $("trendAvg").textContent = avg == null ? "" : `सरासरी ${avg}%`; if($("trendCard")) $("trendCard").style.display = ""; } catch (e) {} }
  
  async function showHistory(wbId) { busy("लोड..."); try { const r = await api("getWbHistory", { wbId, days: 30 }); Swal.close(); if (!r.success) return Swal.fire("त्रुटी", r.message, "error"); const rows = r.history.map((h) => `<tr><td>${fmtMr(h.date).replace(/ \d{4}$/, "")}</td><td>${ICON[h.status] || "⚪"} ${STATUS_MR[h.status] || "नोंद नाही"}</td><td>${esc(h.inspector || "")}</td><td>${h.photo ? `<a href="${esc(h.photo)}" target="_blank"><i class="bi bi-image"></i></a>` : ""}</td></tr>`).join(""); Swal.fire({ title: r.wb.name, html: `<div class="hist-wrap"><table class="hist">${rows || "<tr><td colspan=4>३० दिवसांत नोंद नाही</td></tr>"}</table></div>`, confirmButtonText: "बंद" }); } catch (e) {} }

  function ensureMap() { if (O.map || typeof L === "undefined") return; O.map = L.map("leafletMap", { zoomControl: true, attributionControl: true }).setView([20.11, 77.13], 10); O.layers = { map: L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19 }), sat: L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", { maxZoom: 19 }) }; const def = (state.settings && state.settings.mapDefault === "SATELLITE"); O.satellite = def; (def ? O.layers.sat : O.layers.map).addTo(O.map); setTimeout(() => O.map.invalidateSize(), 300); }
  function toggleLayer() { if (!O.map) return; O.map.removeLayer(O.satellite ? O.layers.sat : O.layers.map); O.satellite = !O.satellite; (O.satellite ? O.layers.sat : O.layers.map).addTo(O.map); if($("mapLayerBtn")) $("mapLayerBtn").innerHTML = O.satellite ? '<i class="bi bi-map"></i>' : '<i class="bi bi-globe-americas"></i>'; }
  async function loadMap() { if (!O.map) return; try { const r = await api("getMapData", { date: O.date }); if (!r.success) return toast("error", r.message); O.mapData = r; const fill = (id, list, label) => { const sel = $(id); if(!sel) return; const cur = sel.value; sel.innerHTML = `<option value="">${label}</option>` + list.map((x) => `<option ${x === cur ? "selected" : ""}>${esc(x)}</option>`).join(""); }; fill("mapAgency", r.agencies, "सर्व एजन्सी"); fill("mapTaluka", r.talukas, "सर्व तालुके"); renderMarkers(); setTimeout(() => O.map.invalidateSize(), 200); } catch (e) {} }
  function renderMarkers() { if (!O.map || !O.mapData) return; O.markers.forEach((m) => O.map.removeLayer(m)); O.markers = []; const fa = $("mapAgency")?$("mapAgency").value:"", ft = $("mapTaluka")?$("mapTaluka").value:"", fs = $("mapStatus")?$("mapStatus").value:""; const pts = O.mapData.markers.filter((m) => (!fa || m.agency === fa) && (!ft || m.taluka === ft) && (!fs || m.status === fs)); pts.forEach((m) => { const mk = L.circleMarker([m.lat, m.lng], { radius: m.status === "ILLEGAL_PUMPING" ? 11 : 8, color: "#fff", weight: 2, fillColor: COLOR[m.status] || COLOR.NOT_REPORTED, fillOpacity: 0.95 }); mk.bindPopup(`<div class="popup"><div class="popup-name">${ICON[m.status] || ""} ${esc(m.name)}</div><div class="popup-status" style="color:${COLOR[m.status]}">${STATUS_MR[m.status] || "नोंद नाही"}</div></div>`, { maxWidth: 200 }); mk.addTo(O.map); O.markers.push(mk); }); if (pts.length) { const b = L.latLngBounds(pts.map((p) => [p.lat, p.lng])); O.map.fitBounds(b.pad(0.15), { maxZoom: 14 }); } }

  async function loadTeam() { if (O.team) return; const el = $("teamList"); if(!el) return; el.innerHTML = '<div class="loading">लोड होत आहे…</div>'; try { const r = await api("getSubordinates"); if (!r.success) return; O.team = r.subordinates; if (!O.team.length) { el.innerHTML = `<div class="empty">कोणीही अधिकारी मॅप केलेले नाहीत.</div>`; return; } el.innerHTML = O.team.map((s) => `<div class="tcard"><div class="tcard-top"><div><span class="tcard-rank">${s.rank}</span> <b>${esc(s.name)}</b><div class="tcard-meta">${esc(s.roleMr)}${s.pwdChanged ? "" : " · <span class='text-danger'>लॉगिन नाही</span>"}</div></div>${contactBtns(s.mobile, s.pendingNames.join(", "))}</div><div class="tcard-stats"><div><b>${s.total}</b><span>जलसाठे</span></div><div class="${s.todayPct >= 90 ? "good" : "bad"}"><b>${s.todayPct}%</b><span>आज</span></div></div></div>`).join(""); } catch (e) {} }

  async function loadAdmin() { if (!O.users) { try { const r = await api("admin_listUsers"); O.users = r.success ? r.users : []; } catch (e) {} renderUsers(); } if (!O.wbs) { try { const r = await api("admin_listWaterBodies"); O.wbs = r.success ? r.waterBodies : []; } catch (e) {} renderWbs(); } }
  function renderUsers() { const q = ($("admUserSearch")?$("admUserSearch").value:"").toLowerCase(), el = $("admUserList"); if(!el) return; const list = (O.users || []).filter((u) => !q || [u.name, u.id, u.mobile].join(" ").toLowerCase().includes(q)); el.innerHTML = list.map((u) => `<div class="ucard"><div class="ucard-top"><div><b>${esc(u.name)}</b> <small class="text-muted">${esc(u.id)}</small><div class="tcard-meta">${esc(u.roleMr)} · ${u.installed ? "<b class='text-success'>App Installed</b>" : "<span class='text-warning'>App Not Installed</span>"}</div></div></div></div>`).join(""); }
  function renderWbs() { const q = ($("admWbSearch")?$("admWbSearch").value:"").toLowerCase(), el = $("admWbList"); if(!el) return; const list = (O.wbs || []).filter((w) => !q || [w.name, w.project].join(" ").toLowerCase().includes(q)); el.innerHTML = list.map((w) => `<div class="ucard"><div><b>${esc(w.name)}</b><div class="tcard-meta">${esc(w.project)} · ${esc(w.taluka)}</div></div></div>`).join(""); }

  window.JN.officer = { init, history: showHistory };
})();
