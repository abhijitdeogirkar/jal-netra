/* =============================================================================
   🌊 JAL-NETRA — officer.js (Notice Board Update)
   ============================================================================= */
(function () {
  "use strict";
  const JN = window.JN; if (!JN) return;
  const { api, state, toast, busy, fmtMr, todayStr, STATUS_MR, roleLabel, $ } = JN;
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const ICON = { SAFE: "🟢", ILLEGAL_PUMPING: "🔴", ACTION_TAKEN: "🟡", NOT_REPORTED: "⚪" };
  const COLOR = { SAFE: "#2e7d32", ILLEGAL_PUMPING: "#c1292e", ACTION_TAKEN: "#e0a100", NOT_REPORTED: "#9c9185" };
  
  const O = { date: todayStr(), dash: null, map: null, layer: null, satellite: false, markers: [], mapData: null, team: null, users: null, wbs: null, inited: false };

  const formatYMD = (d) => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  const addDays = (ymd, days) => { const d = new Date(ymd); d.setDate(d.getDate() + days); return formatYMD(d); };

  function contactBtns(mobile, wbNames) {
    if (!mobile) return ""; const m = mobile.replace(/\D/g, "").slice(-10); const msg = encodeURIComponent(`नमस्कार, JAL-NETRA मध्ये आज (${fmtMr(O.date)}) ${wbNames ? wbNames + " या जलसाठ्याची" : "आपली"} दैनिक नोंद प्रलंबित आहे. कृपया तात्काळ भेट देऊन नोंद करावी. — ${state.user.name}`);
    return `<div class="contact-btns"><a class="cb cb-call" href="tel:${m}"><i class="bi bi-telephone-fill"></i></a><a class="cb cb-wa" href="https://wa.me/91${m}?text=${msg}" target="_blank" rel="noopener"><i class="bi bi-whatsapp"></i></a></div>`;
  }

  function init() {
    if (!O.inited) {
      O.inited = true;
      
      const oDate = $("offDate");
      if(oDate) {
         oDate.value = O.date; oDate.max = todayStr();
         oDate.addEventListener("change", () => { O.date = oDate.value || todayStr(); loadDashboard(); if (O.map) loadMap(); });
      }

      const btnRef = $("offRefresh");
      if(btnRef) {
         btnRef.addEventListener("click", () => { 
            toast("info", "रिफ्रेश होत आहे…"); 
            loadDashboard(); if (O.map) loadMap(); 
            if($("feedDateOff")) window.JN.loadLiveFeed("feedListOff", $("feedDateOff").value); 
            window.JN.loadPublicSettings(); // 🔹 सूचना रिफ्रेश करा
            O.team = null; 
         });
      }
      
      const fDate = $("feedDateOff");
      if(fDate) {
         fDate.value = todayStr(); fDate.max = todayStr();
         fDate.addEventListener("change", () => window.JN.loadLiveFeed("feedListOff", fDate.value));
         $("feedPrevOff").addEventListener("click", () => { fDate.value = addDays(fDate.value, -1); window.JN.loadLiveFeed("feedListOff", fDate.value); });
         $("feedNextOff").addEventListener("click", () => { if(fDate.value < todayStr()) { fDate.value = addDays(fDate.value, 1); window.JN.loadLiveFeed("feedListOff", fDate.value); } });
      }

      if($("tabOffFeed")) $("tabOffFeed").addEventListener("shown.bs.tab", () => { if(fDate) window.JN.loadLiveFeed("feedListOff", fDate.value); });
      if($("tabMap")) $("tabMap").addEventListener("shown.bs.tab", () => { ensureMap(); loadMap(); });
      if($("tabTeam")) $("tabTeam").addEventListener("shown.bs.tab", loadTeam);
      if($("tabAdmin")) $("tabAdmin").addEventListener("shown.bs.tab", loadAdmin);
      
      ["mapAgency", "mapTaluka", "mapStatus"].forEach((id) => { if($(id))$(id).addEventListener("change", renderMarkers); });
      if($("mapLayerBtn")) $("mapLayerBtn").addEventListener("click", toggleLayer);
      if($("admUserSearch")) $("admUserSearch").addEventListener("input", renderUsers); 
      if($("admWbSearch")) $("admWbSearch").addEventListener("input", renderWbs);
    }

    if($("offRoleLabel")) $("offRoleLabel").textContent = roleLabel(state.user.role);
    const isCellOrColl = state.user.role === "DISTRICT_CELL" || state.user.role === "COLLECTOR" || state.user.role === "SUPER_ADMIN";
    if($("tabAdminItem")) $("tabAdminItem").style.display = (isCellOrColl || state.user.role === "AGENCY_HEAD" || state.user.role === "TALUKA_MONITOR") ? "" : "none";
    if($("admSettingsTab")) $("admSettingsTab").style.display = isCellOrColl ? "" : "none";
    
    // 🔹 सूचना फलक कंट्रोल (फक्त जिल्हाधिकारी व सेलसाठी)
    if(isCellOrColl && $("noticeEditCard")) {
        $("noticeEditCard").style.display = "flex";
        $("admNoticeText").value = state.settings?.collectorNotice || "";
        
        $("btnSaveNotice").onclick = async () => {
           const txt = $("admNoticeText").value.trim();
           if(!txt) return toast("warning", "काहीतरी टाईप करा!");
           busy("सेव्ह होत आहे...");
           const r = await api("admin_saveNotice", { text: txt }); Swal.close();
           if(r.success) { toast("success", r.message); window.JN.loadPublicSettings(); } else { Swal.fire("त्रुटी", r.message, "error"); }
        };
        
        $("btnClearNotice").onclick = async () => {
           const c = await Swal.fire({title:"सूचना काढायची?", icon:"warning", showCancelButton:true, confirmButtonText:"काढा"});
           if(c.isConfirmed) {
              busy("काढत आहे...");
              const r = await api("admin_saveNotice", { text: "" }); Swal.close();
              if(r.success) { $("admNoticeText").value = ""; toast("info", r.message); window.JN.loadPublicSettings(); }
           }
        };
    }

    if($("feedDateOff")) window.JN.loadLiveFeed("feedListOff", $("feedDateOff").value || todayStr());
    loadDashboard(); loadTrend();
  }

  async function loadDashboard() {
    const grid = $("kpiGrid"); if(!grid) return; grid.innerHTML = '<div class="loading"><span class="spinner-border spinner-border-sm"></span> डॅशबोर्ड लोड होत आहे…</div>';
    try { const r = await api("getMonitorDashboard", { date: O.date }); if (!r.success) { grid.innerHTML = `<div class="empty">${esc(r.message)}</div>`; return; } O.dash = r; if($("offScope")) $("offScope").textContent = r.scopeLabel; renderKpi(r); renderRed(r); renderPending(r); renderBreakdown(r); } catch (e) { grid.innerHTML = `<div class="empty">नेटवर्क त्रुटी</div>`; }
  }

  function renderKpi(r) {
    const k = r.kpi, dateLbl = r.isToday ? "आज" : fmtMr(r.date); const grid = $("kpiGrid"); if(!grid) return;
    grid.innerHTML = `<div class="kpi kpi-main"><div class="kpi-val">${k.reportedPct}%</div><div class="kpi-lbl">${dateLbl} तपासणी<br><small>${k.reported} / ${k.total} जलसाठे</small></div><div class="kpi-bar"><i style="width:${k.reportedPct}%"></i></div></div><div class="kpi kpi-main" style="border-top-color:#1b998b"><div class="kpi-val">${k.installedUsers || 0}/${k.totalUsers || 0}</div><div class="kpi-lbl">तुमच्या अधिकाऱ्यांचे<br>ॲप इन्स्टॉलेशन्स</div></div><div class="kpi kpi-red"><div class="kpi-val">${k.red}</div><div class="kpi-lbl">उपसा</div></div><div class="kpi kpi-grey"><div class="kpi-val">${k.pending}</div><div class="kpi-lbl">नोंद बाकी</div></div><div class="kpi kpi-yellow"><div class="kpi-val">${k.yellow}</div><div class="kpi-lbl">कारवाई</div></div><div class="kpi kpi-green"><div class="kpi-val">${k.safe}</div><div class="kpi-lbl">सुरक्षित</div></div>`;
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

                async function loadAdmin() {
    if (!O.users) { try { const r = await api("admin_listUsers"); O.users = r.success ? r.users : []; } catch (e) {} }
    if (!O.wbs) { try { const r = await api("admin_listWaterBodies"); O.wbs = r.success ? r.waterBodies : []; } catch (e) {} }
    renderUsers(); renderWbs();
  }

  function contactRow(mobile, email) {
    const m = mobile ? String(mobile).replace(/\D/g, "").slice(-10) : "";
    let out = "";
    if (m) out += `<a class="cb cb-call" href="tel:${m}" title="कॉल"><i class="bi bi-telephone-fill"></i></a><a class="cb cb-wa" href="https://wa.me/91${m}" target="_blank" rel="noopener" title="WhatsApp"><i class="bi bi-whatsapp"></i></a>`;
    if (email) out += `<a class="cb" href="mailto:${esc(email)}" title="ईमेल" style="background:#0b4f6c;color:#fff;"><i class="bi bi-envelope-fill"></i></a>`;
    return out ? `<div class="contact-btns" style="margin-top:6px;">${out}</div>` : "";
  }

  function wbsForAgency(agency) {
    const list = (O.wbs || []).filter((w) => !agency || (w.agency || "") === agency);
    return list.length ? list : (O.wbs || []);
  }
  const uCap = (v) => (v === undefined || v === null || v === "") ? "-" : esc(v) + " TCM";

  function buildTree() {
    const users = O.users || [];
    const reportsTo = {};
    users.forEach((u) => { reportsTo[u.id] = u.reportsTo; });
    const descOf = (rootId) => {
      const out = {}; let changed = true;
      while (changed) { changed = false; users.forEach((u) => { if (out[u.id] || u.id === rootId) return; const p = reportsTo[u.id]; if (p === rootId || out[p]) { out[u.id] = true; changed = true; } }); }
      return out;
    };
    return { descOf };
  }

  function userCard(u, canManage) {
    const mList = u.mappings || [];
    const mapped = {}; mList.forEach((m) => mapped[m.wbId] = true);
    const maps = mList.map((m) => `<span class="chip">${esc(m.wbName)}<small>${esc(m.project || "")}${m.village ? " &middot; " + esc(m.village) : ""}</small>${canManage && u.role === "INSPECTOR" ? ` <a href="#" data-map="${esc(m.mappingId)}" title="काढा" style="color:#c1292e;text-decoration:none;">&times;</a>` : ""}</span>`).join("");
    const wbOpts = wbsForAgency(u.agency).filter((w) => !mapped[w.wbId]).map((w) => `<option value="${esc(w.wbId)}">${esc(w.name)} &middot; ${esc(w.project || "")}${w.village ? " &middot; " + esc(w.village) : ""}</option>`).join("");
    let btns = "";
    if (canManage) btns += `<button class="btn btn-sm btn-outline-secondary" data-edit="${esc(u.id)}">माहिती संपादित करा</button><button class="btn btn-sm btn-outline-secondary" data-reset="${esc(u.id)}">पासवर्ड रिसेट</button><button class="btn btn-sm ${u.active ? "btn-outline-danger" : "btn-outline-success"}" data-active="${esc(u.id)}" data-ok="${u.active ? "0" : "1"}">${u.active ? "निष्क्रिय करा" : "सक्रिय करा"}</button>`;
    if (canManage && u.approval === "PENDING") btns += `<button class="btn btn-sm btn-success" data-appr="${esc(u.id)}" data-ok="1">मंजूर</button><button class="btn btn-sm btn-outline-danger" data-appr="${esc(u.id)}" data-ok="0">नाकारा</button>`;
    return `<div class="ucard">
      <div class="ucard-top"><div>
        <b>${esc(u.name)}</b> <small class="text-muted">${esc(u.id)}</small>
        <div class="tcard-meta">${esc(u.roleMr)}${u.designation ? " &middot; " + esc(u.designation) : ""} &middot; ${esc(u.taluka)} &middot; ${u.active ? "सक्रिय" : "<span class='text-danger'>निष्क्रिय</span>"}${u.approval === "PENDING" ? " &middot; <span class='text-warning'>मंजुरी बाकी</span>" : ""} &middot; ${u.installed ? "<b class='text-success'>App Installed</b>" : "<span class='text-warning'>App Not Installed</span>"}</div>
        ${u.mobile ? `<div class="tcard-meta"><i class="bi bi-telephone"></i> ${esc(u.mobile)}${u.email ? " &middot; " + esc(u.email) : ""}</div>` : ""}
        ${contactRow(u.mobile, u.email)}
        <div class="tcard-meta" style="margin-top:6px;"><b>मॅप केलेले जलसाठे:</b></div>
        <div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:4px;">${maps || "<span class='text-muted'>मॅप केलेले नाही</span>"}</div>
      </div></div>
      ${btns ? `<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:8px;">${btns}</div>` : ""}
      ${canManage && u.role === "INSPECTOR" ? `<div style="display:flex;gap:6px;margin-top:6px;"><select class="form-select form-select-sm" data-wbsel="${esc(u.id)}"><option value="">जलसाठा निवडा</option>${wbOpts}</select><button class="btn btn-sm btn-water" data-addmap="${esc(u.id)}">मॅप करा</button></div>` : ""}
    </div>`;
  }

  function renderGrouped(el, list, canManage) {
    const { descOf } = buildTree();
    const agMap = {};
    list.forEach((u) => { const a = u.agency || "—"; (agMap[a] = agMap[a] || []).push(u); });
    let html = "";
    Object.keys(agMap).sort().forEach((ag, ai) => {
      const agUsers = agMap[ag];
      const heads = agUsers.filter((u) => u.role === "AGENCY_HEAD");
      const covered = {};
      heads.forEach((h) => { const d = descOf(h.id); Object.keys(d).forEach((k) => covered[k] = true); });
      const loose = agUsers.filter((u) => u.role !== "AGENCY_HEAD" && !covered[u.id]);
      html += `<div>
        <div data-ag="${ai}" style="display:flex;justify-content:space-between;align-items:center;background:#0b4f6c;color:#fff;padding:10px 12px;border-radius:12px;margin:10px 0 6px;cursor:pointer;font-weight:600;">
          <span><i class="bi bi-diagram-3"></i> ${esc(ag)}</span><span style="font-size:13px;opacity:.9;">एकूण ${agUsers.length} अधिकारी <i class="bi bi-chevron-down"></i></span>
        </div>
        <div id="ag-body-${ai}" style="display:none;">`;
      heads.forEach((h, hi) => {
        const d = descOf(h.id);
        const subs = agUsers.filter((u) => d[u.id]);
        html += `<div style="margin:6px 0 6px 8px;">
          <div data-ah="${ai}-${hi}" style="display:flex;justify-content:space-between;align-items:center;background:#e8f1f5;color:#0b4f6c;padding:8px 12px;border-radius:10px;cursor:pointer;font-weight:600;">
            <span><i class="bi bi-person-badge"></i> ${esc(h.name)}</span><span style="font-size:12.5px;">अंतर्गत ${subs.length} अधिकारी <i class="bi bi-chevron-down"></i></span>
          </div>
          <div id="ah-body-${ai}-${hi}" style="display:none;margin-top:6px;">
            ${userCard(h, canManage)}
            ${subs.length ? `<div data-others="${ai}-${hi}" style="display:inline-block;background:#f0f7f4;color:#0b4f6c;padding:6px 12px;border-radius:20px;margin:6px 0;cursor:pointer;font-size:13px;border:1px dashed #1b998b;">इतर ${subs.length} अधिकारी <i class="bi bi-chevron-down"></i></div><div id="others-${ai}-${hi}" style="display:none;">${subs.map((u) => userCard(u, canManage)).join("")}</div>` : `<div class="text-muted" style="margin:6px 0;">अंतर्गत इतर अधिकारी नाहीत.</div>`}
          </div>
        </div>`;
      });
      if (loose.length) html += `<div style="margin:6px 0 6px 8px;"><div data-others="loose-${ai}" style="display:inline-block;background:#f0f7f4;color:#0b4f6c;padding:6px 12px;border-radius:20px;margin:6px 0;cursor:pointer;font-size:13px;border:1px dashed #1b998b;">इतर ${loose.length} अधिकारी (एजन्सी प्रमुखांशिवाय) <i class="bi bi-chevron-down"></i></div><div id="others-loose-${ai}" style="display:none;">${loose.map((u) => userCard(u, canManage)).join("")}</div></div>`;
      html += `</div></div>`;
    });
    el.innerHTML = html || `<div class="empty">कोणताही अधिकारी सापडला नाही.</div>`;
  }

  function renderUsers() {
    const q = ($("admUserSearch") ? $("admUserSearch").value : "").trim().toLowerCase();
    const el = $("admUserList"); if (!el) return;
    let list = (O.users || []).filter((u) => !q || [u.name, u.id, u.mobile, u.designation].join(" ").toLowerCase().includes(q));
    const canManage = state.user.role === "AGENCY_HEAD" || state.user.role === "SUPER_ADMIN";
    if (state.user.role === "TALUKA_MONITOR") { const d = buildTree().descOf(state.user.id); list = list.filter((u) => d[u.id]); }
    const grouped = (state.user.role === "COLLECTOR" || state.user.role === "DISTRICT_CELL" || state.user.role === "SUPER_ADMIN") && !q;
    if (grouped) renderGrouped(el, list, canManage);
    else el.innerHTML = list.length ? list.map((u) => userCard(u, canManage)).join("") : `<div class="empty">कोणताही अधिकारी सापडला नाही.</div>`;
    wireCards(el); wireToggles(el);
  }

  function wireCards(el) {
    el.querySelectorAll("[data-edit]").forEach((b) => b.onclick = () => editUser(b.dataset.edit));
    el.querySelectorAll("[data-reset]").forEach((b) => b.onclick = () => userAction("admin_resetPassword", { targetId: b.dataset.reset }, "पासवर्ड रिसेट करायचा?"));
    el.querySelectorAll("[data-appr]").forEach((b) => b.onclick = () => userAction("admin_approveUser", { targetId: b.dataset.appr, approve: b.dataset.ok === "1" }, "हा युजर मंजूर किंवा नाकारायचा?"));
    el.querySelectorAll("[data-active]").forEach((b) => b.onclick = () => userAction("admin_setActive", { targetId: b.dataset.active, active: b.dataset.ok === "1" }, "स्थिती बदलायची?"));
    el.querySelectorAll("[data-map]").forEach((b) => b.onclick = (e) => { e.preventDefault(); closeMapping(b.dataset.map); });
    el.querySelectorAll("[data-addmap]").forEach((b) => b.onclick = () => { const sel = el.querySelector(`[data-wbsel="${b.dataset.addmap}"]`), wbId = sel && sel.value; if (!wbId) return toast("warning", "जलसाठा निवडा"); addMapping(b.dataset.addmap, wbId); });
  }

  function wireToggles(el) {
    el.querySelectorAll("[data-ag]").forEach((b) => b.onclick = () => { const t = el.querySelector("#ag-body-" + b.dataset.ag); if (t) t.style.display = t.style.display === "none" ? "" : "none"; });
    el.querySelectorAll("[data-ah]").forEach((b) => b.onclick = () => { const t = el.querySelector("#ah-body-" + b.dataset.ah); if (t) t.style.display = t.style.display === "none" ? "" : "none"; });
    el.querySelectorAll("[data-others]").forEach((b) => b.onclick = () => { const t = el.querySelector("#others-" + b.dataset.others); if (t) t.style.display = t.style.display === "none" ? "" : "none"; });
  }

  function renderWbs() {
    const q = ($("admWbSearch") ? $("admWbSearch").value : "").toLowerCase(), el = $("admWbList"); if (!el) return;
    const list = (O.wbs || []).filter((w) => !q || [w.name, w.project, w.village, w.wbId].join(" ").toLowerCase().includes(q));
    if (!list.length) { el.innerHTML = `<div class="empty">कोणताही जलसाठा सापडला नाही.</div>`; return; }
    el.innerHTML = list.map((w) => `<div class="ucard"><div>
        <b>${esc(w.name)}</b> <small class="text-muted">${esc(w.wbId)}</small>
        <div class="tcard-meta">प्रकल्प: ${esc(w.project || "-")} &middot; एजन्सी: ${esc(w.agency || "-")}</div>
        <div class="tcard-meta">गाव: ${esc(w.village || "-")} &middot; तालुका: ${esc(w.taluka || "-")} &middot; प्रकार: ${esc(w.typeLabel || w.type || "-")}</div>
        <div class="tcard-meta">डिझाईन क्षमता: <b>${uCap(w.designCapacity)}</b> &middot; मृत साठा: <b>${uCap(w.deadStock)}</b> &middot; लाईव्ह साठा: <b>${uCap(w.liveStock)}</b></div>
        <div class="tcard-meta">${w.locationStatus === "APPROVED" ? "<span class='text-success'>स्थळ अप्रूव्ह झाले</span>" : "<span class='text-warning'>स्थळ अप्रूव्ह बाकी</span>"}${w.lat && w.lng ? " &middot; " + w.lat + ", " + w.lng : " &middot; GPS नाही"}</div>
        <button class="btn btn-sm btn-earth mt-1" data-loc="${esc(w.wbId)}">स्थळ पहा व अप्रूव्ह करा</button>
      </div></div>`).join("");
    el.querySelectorAll("[data-loc]").forEach((b) => b.onclick = () => openLocation(b.dataset.loc));
  }

  const DESIG_LIST = ["मा. जिल्हाधिकारी", "निवासी उपजिल्हाधिकारी", "कार्यकारी अभियंता", "उप अभियंता", "कनिष्ठ/ शाखा अभियंता", "शाखा अभियंता", "मंडळ अधिकारी", "पोलीस उप निरीक्षक", "ग्रामपंचायत अधिकारी", "जल सुरक्षक"];
  async function editUser(id) {
    const u = (O.users || []).find((x) => x.id === id); if (!u) return;
    const tal = (state.settings && state.settings.talukas) || [];
    const dOpt = DESIG_LIST.map((d) => `<option ${d === u.designation ? "selected" : ""}>${d}</option>`).join("");
    const tOpt = tal.map((t) => `<option value="${t.en}" ${t.en === u.talukaEn ? "selected" : ""}>${t.mr}</option>`).join("");
    const mapped = {}; (u.mappings || []).forEach((m) => mapped[m.wbId] = true);
    const wbOpt = wbsForAgency(u.agency).filter((w) => !mapped[w.wbId]).map((w) => `<option value="${esc(w.wbId)}">${esc(w.name)} &middot; ${esc(w.project || "")}${w.village ? " &middot; " + esc(w.village) : ""}</option>`).join("");
    const curMap = (u.mappings || []).map((m) => `<span class="chip">${esc(m.wbName)}<small>${esc(m.project || "")}${m.village ? " &middot; " + esc(m.village) : ""}</small></span>`).join("") || "<span class='text-muted'>मॅप केलेले नाही</span>";
    const res = await Swal.fire({
      title: "माहिती संपादित करा",
      html: `<div style="text-align:left;font-size:14px;">
        <label class="form-label">नाव</label><input id="eu-name" class="form-control mb-2" value="${esc(u.name)}">
        <label class="form-label">पद (Designation)</label><select id="eu-desig" class="form-select mb-2">${dOpt}</select>
        <label class="form-label">ईमेल</label><input id="eu-email" class="form-control mb-2" value="${esc(u.email || "")}">
        <label class="form-label">मोबाईल</label><input id="eu-mobile" class="form-control mb-2" value="${esc(u.mobile || "")}">
        <label class="form-label">तालुका</label><select id="eu-taluka" class="form-select mb-2">${tOpt}</select>
        <label class="form-label">सध्याचे मॅप केलेले जलसाठे</label>
        <div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:8px;">${curMap}</div>
        ${u.role === "INSPECTOR" ? `<label class="form-label">नवीन जलसाठा मॅप करा (${esc(u.agency || "विभाग")})</label><select id="eu-wb" class="form-select"><option value="">— निवडा —</option>${wbOpt}</select>` : ""}
      </div>`,
      showCancelButton: true, confirmButtonText: "सेव्ह करा", cancelButtonText: "रद्द",
      preConfirm: () => {
        const name = document.getElementById("eu-name").value.trim();
        if (!name) { Swal.showValidationMessage("नाव आवश्यक आहे."); return false; }
        const wbEl = document.getElementById("eu-wb");
        return { name, designation: document.getElementById("eu-desig").value, email: document.getElementById("eu-email").value.trim(), mobile: document.getElementById("eu-mobile").value.trim(), taluka: document.getElementById("eu-taluka").value, _wb: wbEl ? wbEl.value : "" };
      }
    });
    if (!res.isConfirmed || !res.value) return;
    const f = res.value, wbId = f._wb; delete f._wb;
    busy("सेव्ह होत आहे…");
    try {
      const r = await api("admin_updateUser", { targetId: id, fields: f });
      if (!r.success) { Swal.close(); return Swal.fire("त्रुटी", r.message, "error"); }
      if (wbId) { const r2 = await api("admin_addMapping", { inspectorId: id, wbId }); if (!r2.success) { Swal.close(); return Swal.fire("माहिती सेव्ह झाली", r2.message, "warning"); } }
      Swal.close(); toast("success", "झाले"); O.users = null; loadAdmin();
    } catch (e) { Swal.close(); toast("error", "नेटवर्क त्रुटी"); }
  }

  async function userAction(action, payload, title) {
    const c = await Swal.fire({ title: title || "नक्की?", icon: "question", showCancelButton: true, confirmButtonText: "होय" });
    if (!c.isConfirmed) return;
    busy("कृती करत आहे…");
    try { const r = await api(action, payload); Swal.close(); if (r.success) { Swal.fire({ icon: "success", title: r.message || "झाले", confirmButtonText: "ठीक" }); O.users = null; loadAdmin(); } else Swal.fire("त्रुटी", r.message, "error"); } catch (e) { Swal.close(); toast("error", "नेटवर्क त्रुटी"); }
  }

  async function addMapping(inspectorId, wbId) {
    busy("मॅप करत आहे…");
    try { const r = await api("admin_addMapping", { inspectorId, wbId }); Swal.close(); if (r.success) { toast("success", "मॅप झाले"); O.users = null; loadAdmin(); } else Swal.fire("त्रुटी", r.message, "error"); } catch (e) { Swal.close(); toast("error", "नेटवर्क त्रुटी"); }
  }

  async function closeMapping(mappingId) {
    const c = await Swal.fire({ title: "हे मॅपिंग काढायचे?", icon: "warning", showCancelButton: true, confirmButtonText: "काढा" });
    if (!c.isConfirmed) return;
    busy("काढत आहे…");
    try { const r = await api("admin_closeMapping", { mappingId }); Swal.close(); if (r.success) { toast("success", "काढले"); O.users = null; loadAdmin(); } else Swal.fire("त्रुटी", r.message, "error"); } catch (e) { Swal.close(); toast("error", "नेटवर्क त्रुटी"); }
  }

  async function openLocation(wbId) {
    const w = (O.wbs || []).find((x) => x.wbId === wbId); if (!w) return;
    const hasLoc = w.lat != null && w.lng != null && w.lat !== "" && w.lng !== "";
    const lat0 = hasLoc ? w.lat : "", lng0 = hasLoc ? w.lng : "";
    const mapHtml = hasLoc
      ? `<iframe id="locMap" src="https://www.google.com/maps?q=${lat0},${lng0}&z=17&output=embed" style="width:100%;height:300px;border:0;border-radius:12px;margin-bottom:8px;"></iframe>`
      : `<div class="text-muted mb-2">या जलसाठ्यासाठी लॅटिट्यूड / लाँगिट्यूड भरलेले नाहीत — खाली भरा.</div>`;
    const res = await Swal.fire({
      title: esc(w.name),
      width: 520,
      html: `<div style="text-align:left;font-size:14px;">
        ${mapHtml}
        <div class="tcard-meta mb-2">${esc(w.project || "")} &middot; ${esc(w.taluka || "")}${w.village ? " &middot; " + esc(w.village) : ""}</div>
        <div style="display:flex;gap:6px;">
          <div style="flex:1;"><label class="form-label">Latitude</label><input id="loc-lat" class="form-control" value="${lat0}"></div>
          <div style="flex:1;"><label class="form-label">Longitude</label><input id="loc-lng" class="form-control" value="${lng0}"></div>
        </div>
        <button type="button" id="locPreview" class="btn btn-sm btn-outline-secondary mt-2"><i class="bi bi-arrow-repeat"></i> नकाशा पुन्हा पहा</button>
      </div>`,
      showCancelButton: true, confirmButtonText: "स्थळ अप्रूव्ह करा", cancelButtonText: "बंद",
      didOpen: () => {
        const btn = document.getElementById("locPreview");
        if (btn) btn.onclick = () => {
          const la = document.getElementById("loc-lat").value.trim(), ln = document.getElementById("loc-lng").value.trim();
          const fr = document.getElementById("locMap");
          if (fr && la && ln) fr.src = `https://www.google.com/maps?q=${la},${ln}&z=17&output=embed`;
        };
      },
      preConfirm: () => {
        const la = document.getElementById("loc-lat").value.trim(), ln = document.getElementById("loc-lng").value.trim();
        if (!la || !ln) { Swal.showValidationMessage("Latitude व Longitude आवश्यक."); return false; }
        return { lat: parseFloat(la), lng: parseFloat(ln) };
      }
    });
    if (!res.isConfirmed || !res.value) return;
    busy("अप्रूव्ह करत आहे…");
    try { const r = await api("admin_approveLocation", { wbId, lat: res.value.lat, lng: res.value.lng }); Swal.close(); if (r.success) { toast("success", "अप्रूव्ह झाले"); O.wbs = null; loadAdmin(); } else Swal.fire("त्रुटी", r.message, "error"); } catch (e) { Swal.close(); toast("error", "नेटवर्क त्रुटी"); }
  }

  window.JN.officer = { init, history: showHistory };
})();
