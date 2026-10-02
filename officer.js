/* =============================================================================
   🌊 JAL-NETRA — officer.js (टप्पा ३)
   TALUKA_MONITOR · AGENCY_HEAD · DISTRICT_CELL · COLLECTOR
   आढावा (KPI, लाल यादी, पेंडिंग + कॉल/SMS/WhatsApp, ट्रेंड, एजन्सी/तालुका) ·
   Leaflet नकाशा · अधिकारी रँकिंग · अ‍ॅडमिन (युजर्स, जलसाठे, सेटिंग्ज)
   ============================================================================= */
(function () {
  "use strict";
  const JN = window.JN; if (!JN) return;
  const { api, state, toast, busy, fmtMr, todayStr, STATUS_MR, roleLabel, $ } = JN;
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const ICON = { SAFE: "🟢", ILLEGAL_PUMPING: "🔴", ACTION_TAKEN: "🟡", NOT_REPORTED: "⚪" };
  const COLOR = { SAFE: "#2e7d32", ILLEGAL_PUMPING: "#c1292e", ACTION_TAKEN: "#e0a100", NOT_REPORTED: "#9c9185" };
  const O = { date: todayStr(), dash: null, map: null, layer: null, satellite: false, markers: [], mapData: null, team: null, users: null, wbs: null, inited: false };

  // ───────────────────────── संपर्क बटने ─────────────────────────
  function contactBtns(mobile, wbNames) {
    if (!mobile) return "";
    const m = mobile.replace(/\D/g, "").slice(-10);
    const msg = encodeURIComponent(`नमस्कार, JAL-NETRA मध्ये आज (${fmtMr(O.date)}) ${wbNames ? wbNames + " या जलसाठ्याची" : "आपली"} दैनिक नोंद प्रलंबित आहे. कृपया तात्काळ भेट देऊन नोंद करावी. — ${state.user.name}`);
    return `<div class="contact-btns">
      <a class="cb cb-call" href="tel:${m}" title="कॉल"><i class="bi bi-telephone-fill"></i></a>
      <a class="cb cb-sms" href="sms:${m}?body=${msg}" title="SMS"><i class="bi bi-chat-dots-fill"></i></a>
      <a class="cb cb-wa" href="https://wa.me/91${m}?text=${msg}" target="_blank" rel="noopener" title="WhatsApp"><i class="bi bi-whatsapp"></i></a>
    </div>`;
  }

  // ───────────────────────── Init ─────────────────────────
  function init() {
    if (!O.inited) {
      O.inited = true;
      $("offDate").value = O.date; $("offDate").max = todayStr();
      $("offDate").addEventListener("change", () => { O.date = $("offDate").value || todayStr(); loadDashboard(); if (O.map) loadMap(); });
      $("offRefresh").addEventListener("click", () => { toast("info", "रिफ्रेश…"); loadDashboard(); if (O.map) loadMap(); O.team = null; });
      $("tabMap").addEventListener("shown.bs.tab", () => { ensureMap(); loadMap(); });
      $("tabTeam").addEventListener("shown.bs.tab", loadTeam);
      $("tabAdmin").addEventListener("shown.bs.tab", loadAdmin);
      ["mapAgency", "mapTaluka", "mapStatus"].forEach((id) => $(id).addEventListener("change", renderMarkers));
      $("mapLayerBtn").addEventListener("click", toggleLayer);
      $("admUserSearch").addEventListener("input", renderUsers);
      $("admWbSearch").addEventListener("input", renderWbs);
    }
    $("offRoleLabel").textContent = roleLabel(state.user.role);
    const isCell = state.user.role === "DISTRICT_CELL";
    $("tabAdminItem").style.display = (isCell || state.user.role === "AGENCY_HEAD" || state.user.role === "TALUKA_MONITOR") ? "" : "none";
    $("admSettingsTab").style.display = isCell ? "" : "none";
    loadDashboard(); loadTrend();
  }

  // ───────────────────────── आढावा ─────────────────────────
  async function loadDashboard() {
    const grid = $("kpiGrid");
    grid.innerHTML = '<div class="loading"><span class="spinner-border spinner-border-sm"></span> डॅशबोर्ड लोड होत आहे…</div>';
    try {
      const r = await api("getMonitorDashboard", { date: O.date });
      if (!r.success) { grid.innerHTML = `<div class="empty">${esc(r.message)}</div>`; return; }
      O.dash = r; $("offScope").textContent = r.scopeLabel;
      renderKpi(r); renderRed(r); renderPending(r); renderBreakdown(r);
    } catch (e) { grid.innerHTML = `<div class="empty">नेटवर्क त्रुटी: ${esc(e.message)}</div>`; }
  }

  function renderKpi(r) {
    const k = r.kpi, dateLbl = r.isToday ? "आज" : fmtMr(r.date);
    $("kpiGrid").innerHTML = `
      <div class="kpi kpi-main"><div class="kpi-val">${k.reportedPct}%</div><div class="kpi-lbl">${dateLbl} तपासणी पूर्ण<br><small>${k.reported} / ${k.total} जलसाठे</small></div><div class="kpi-bar"><i style="width:${k.reportedPct}%"></i></div></div>
      <div class="kpi kpi-red"><div class="kpi-val">${k.red}</div><div class="kpi-lbl">बेकायदेशीर उपसा</div></div>
      <div class="kpi kpi-grey"><div class="kpi-val">${k.pending}</div><div class="kpi-lbl">नोंद बाकी</div></div>
      <div class="kpi kpi-yellow"><div class="kpi-val">${k.yellow}</div><div class="kpi-lbl">कारवाई केली</div></div>
      <div class="kpi kpi-green"><div class="kpi-val">${k.safe}</div><div class="kpi-lbl">सुरक्षित</div></div>
      ${k.outsideGeofence ? `<div class="kpi kpi-warn"><div class="kpi-val">${k.outsideGeofence}</div><div class="kpi-lbl">⚠️ स्थळापासून दूर नोंद</div></div>` : ""}
      ${k.unmapped ? `<div class="kpi kpi-warn"><div class="kpi-val">${k.unmapped}</div><div class="kpi-lbl">निरीक्षक नेमलेला नाही</div></div>` : ""}`;
  }

  function wbCard(it, cls) {
    const insp = it.inspectors.length ? it.inspectors.map((o) => esc(o.name)).join(", ") : "निरीक्षक नेमलेला नाही";
    const mob = it.inspectors.length ? it.inspectors[0].mobile : "";
    return `<div class="rcard ${cls}">
      <div class="rcard-top"><div><div class="rcard-name">${ICON[it.status] || ""} ${esc(it.name)}</div><div class="rcard-meta">${esc(it.project)} · ${esc(it.talukaMr)} · ${esc(it.agency)}${it.time ? " · " + it.time : ""}${it.syncedLate ? " · <span class='text-warning'>उशिरा सिंक</span>" : ""}</div></div>
        ${it.photo ? `<a href="${esc(it.photo)}" target="_blank" rel="noopener" class="rcard-photo"><img src="${esc(it.photo)}" alt=""></a>` : ""}</div>
      ${it.remark ? `<div class="rcard-remark">“${esc(it.remark)}”</div>` : ""}
      ${it.action ? `<div class="rcard-remark"><b>कारवाई:</b> ${esc(it.action)}</div>` : ""}
      ${it.within === "N" ? `<div class="rcard-flag">⚠️ नोंद स्थळापासून दूर घेतली गेली</div>` : ""}
      <div class="rcard-foot"><span><i class="bi bi-person"></i> ${insp}</span>${contactBtns(mob, it.name)}<button class="btn btn-sm btn-link p-0 ms-2" data-hist="${esc(it.wbId)}">इतिहास</button></div>
    </div>`;
  }
  function renderRed(r) {
    const el = $("redSection");
    if (!r.red.length && !r.yellow.length) { el.innerHTML = `<div class="ok-strip"><i class="bi bi-shield-check"></i> ${r.isToday ? "आज" : "या दिवशी"} कुठेही बेकायदेशीर उपसा नोंदवलेला नाही.</div>`; return; }
    el.innerHTML = (r.red.length ? `<h3 class="sec-title sec-red">🔴 बेकायदेशीर उपसा — ${r.red.length}</h3>` + r.red.map((it) => wbCard(it, "rc-red")).join("") : "")
      + (r.yellow.length ? `<h3 class="sec-title sec-yellow">🟡 कारवाई केली — ${r.yellow.length}</h3>` + r.yellow.map((it) => wbCard(it, "rc-yellow")).join("") : "");
    el.querySelectorAll("[data-hist]").forEach((b) => b.addEventListener("click", () => showHistory(b.dataset.hist)));
  }
  function renderPending(r) {
    const el = $("pendingSection");
    if (!r.pending.length) { el.innerHTML = `<div class="ok-strip"><i class="bi bi-check2-all"></i> सर्व जलसाठ्यांची नोंद झाली आहे.</div>`; return; }
    el.innerHTML = `<h3 class="sec-title sec-grey">⚪ नोंद बाकी — ${r.kpi.pending} जलसाठे, ${r.pending.filter((p) => p.id).length} निरीक्षक</h3>` + r.pending.map((p) => `
      <div class="pcard">
        <div class="pcard-top"><div><div class="pcard-name">${esc(p.name)}</div><div class="pcard-meta">${p.id ? esc(p.id) + " · " : ""}${p.mobile ? esc(p.mobile) : ""}</div></div>${contactBtns(p.mobile, p.wbs.map((w) => w.name).join(", "))}</div>
        <div class="pcard-wbs">${p.wbs.map((w) => `<span class="chip">${esc(w.name)} <small>${esc(w.taluka)}</small></span>`).join("")}</div>
      </div>`).join("");
  }
  function renderBreakdown(r) {
    const el = $("breakdownSection"); const role = state.user.role;
    if (role === "TALUKA_MONITOR") { el.innerHTML = ""; return; }
    const table = (title, obj) => {
      const keys = Object.keys(obj).sort((a, b) => (obj[b].red - obj[a].red) || ((obj[a].reported / obj[a].total) - (obj[b].reported / obj[b].total)));
      if (keys.length < 2) return "";
      return `<h3 class="sec-title">${title}</h3><div class="bd-table">${keys.map((k) => { const v = obj[k], pct = v.total ? Math.round(v.reported * 100 / v.total) : 0; return `<div class="bd-row"><div class="bd-name">${esc(k)}</div><div class="bd-bar"><i style="width:${pct}%"></i></div><div class="bd-num">${pct}%</div><div class="bd-red">${v.red ? "🔴 " + v.red : ""}</div></div>`; }).join("")}</div>`;
    };
    el.innerHTML = table("तालुकानिहाय", r.byTaluka) + (role !== "AGENCY_HEAD" ? table("एजन्सीनिहाय", r.byAgency) : "");
  }

  async function loadTrend() {
    try {
      const r = await api("getTrend", { days: 7 }); if (!r.success) return;
      const s = r.series, max = 100;
      $("trendBars").innerHTML = s.map((d) => { const pct = d.pct == null ? 0 : d.pct; const lbl = d.date.slice(8, 10); return `<div class="tb" title="${fmtMr(d.date)}: ${d.pct == null ? "डेटा नाही" : d.reported + "/" + d.total}"><div class="tb-col"><i style="height:${pct}%;background:${d.red ? "#c1292e" : "#1b998b"}"></i></div><div class="tb-val">${d.pct == null ? "–" : d.pct}</div><div class="tb-lbl">${lbl}</div></div>`; }).join("");
      const valid = s.filter((d) => d.pct != null); const avg = valid.length ? Math.round(valid.reduce((a, d) => a + d.pct, 0) / valid.length) : null;
      $("trendAvg").textContent = avg == null ? "" : `सरासरी ${avg}%`;
      $("trendCard").style.display = "";
    } catch (e) {}
  }

  async function showHistory(wbId) {
    busy("इतिहास लोड होत आहे…");
    try {
      const r = await api("getWbHistory", { wbId, days: 30 }); Swal.close();
      if (!r.success) return Swal.fire("त्रुटी", r.message, "error");
      const rows = r.history.map((h) => `<tr><td>${fmtMr(h.date).replace(/ \d{4}$/, "")}</td><td>${ICON[h.status] || "⚪"} ${STATUS_MR[h.status] || "नोंद नाही"}</td><td>${esc(h.inspector || "")}</td><td>${h.photo ? `<a href="${esc(h.photo)}" target="_blank"><i class="bi bi-image"></i></a>` : ""}${h.within === "N" ? " ⚠️" : ""}</td></tr>`).join("");
      Swal.fire({ title: r.wb.name, html: `<div class="small text-muted mb-2">${esc(r.wb.project)} · ${esc(r.wb.taluka)} · ${esc(r.wb.agency)}</div><div class="hist-wrap"><table class="hist">${rows || "<tr><td colspan=4>३० दिवसांत नोंद नाही</td></tr>"}</table></div>`, width: 520, confirmButtonText: "बंद" });
    } catch (e) { Swal.fire("नेटवर्क त्रुटी", e.message, "error"); }
  }

  // ───────────────────────── नकाशा ─────────────────────────
  function ensureMap() {
    if (O.map || typeof L === "undefined") return;
    O.map = L.map("leafletMap", { zoomControl: true, attributionControl: true }).setView([20.11, 77.13], 10);
    O.layers = {
      map: L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap" }),
      sat: L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", { maxZoom: 19, attribution: "Esri World Imagery" })
    };
    const def = (state.settings && state.settings.mapDefault === "SATELLITE");
    O.satellite = def; (def ? O.layers.sat : O.layers.map).addTo(O.map);
    setTimeout(() => O.map.invalidateSize(), 300);
  }
  function toggleLayer() {
    if (!O.map) return;
    O.map.removeLayer(O.satellite ? O.layers.sat : O.layers.map);
    O.satellite = !O.satellite; (O.satellite ? O.layers.sat : O.layers.map).addTo(O.map);
    $("mapLayerBtn").innerHTML = O.satellite ? '<i class="bi bi-map"></i>' : '<i class="bi bi-globe-americas"></i>';
  }
  async function loadMap() {
    if (!O.map) return;
    try {
      const r = await api("getMapData", { date: O.date }); if (!r.success) return toast("error", r.message);
      O.mapData = r;
      const fill = (id, list, label) => { const sel = $(id), cur = sel.value; sel.innerHTML = `<option value="">${label}</option>` + list.map((x) => `<option ${x === cur ? "selected" : ""}>${esc(x)}</option>`).join(""); };
      fill("mapAgency", r.agencies, "सर्व एजन्सी"); fill("mapTaluka", r.talukas, "सर्व तालुके");
      $("mapNoLoc").textContent = r.noLocation ? `${r.noLocation} जलसाठ्यांचे GPS नाही` : "";
      renderMarkers(); setTimeout(() => O.map.invalidateSize(), 200);
    } catch (e) { toast("error", "नकाशा डेटा मिळाला नाही"); }
  }
  function renderMarkers() {
    if (!O.map || !O.mapData) return;
    O.markers.forEach((m) => O.map.removeLayer(m)); O.markers = [];
    const fa = $("mapAgency").value, ft = $("mapTaluka").value, fs = $("mapStatus").value;
    const pts = O.mapData.markers.filter((m) => (!fa || m.agency === fa) && (!ft || m.taluka === ft) && (!fs || m.status === fs));
    pts.forEach((m) => {
      const mk = L.circleMarker([m.lat, m.lng], { radius: m.status === "ILLEGAL_PUMPING" ? 11 : 8, color: "#fff", weight: 2, fillColor: COLOR[m.status] || COLOR.NOT_REPORTED, fillOpacity: 0.95 });
      mk.bindPopup(`<div class="popup">
        <div class="popup-name">${ICON[m.status] || ""} ${esc(m.name)}</div>
        <div class="popup-meta">${esc(m.project)} · ${esc(m.taluka)} · ${esc(m.agency)}${m.locationStatus === "PROPOSED" ? " · <span style='color:#8a6400'>स्थळ मंजुरी बाकी</span>" : ""}</div>
        <div class="popup-status" style="color:${COLOR[m.status]}">${STATUS_MR[m.status] || "नोंद नाही"}${m.time ? " · " + m.time : ""}${m.within === "N" ? " · ⚠️ दूरून" : ""}</div>
        ${m.remark ? `<div class="popup-remark">“${esc(m.remark)}”</div>` : ""}
        ${m.photo ? `<a href="${esc(m.photo)}" target="_blank" rel="noopener"><img class="popup-img" src="${esc(m.photo)}" alt=""></a>` : ""}
        <div class="popup-foot"><span><i class="bi bi-person"></i> ${esc(m.inspector || "—")}</span>${contactBtns(m.mobile, m.name)}</div>
        <button class="btn btn-sm btn-link p-0 mt-1" onclick="window.JN.officer.history('${esc(m.wbId)}')">३० दिवसांचा इतिहास</button>
      </div>`, { maxWidth: 280 });
      mk.addTo(O.map); O.markers.push(mk);
    });
    if (pts.length) { const b = L.latLngBounds(pts.map((p) => [p.lat, p.lng])); O.map.fitBounds(b.pad(0.15), { maxZoom: 14 }); }
  }

  // ───────────────────────── अधिकारी ─────────────────────────
  async function loadTeam() {
    if (O.team) return;
    const el = $("teamList"); el.innerHTML = '<div class="loading"><span class="spinner-border spinner-border-sm"></span> लोड होत आहे…</div>';
    try {
      const r = await api("getSubordinates"); if (!r.success) { el.innerHTML = `<div class="empty">${esc(r.message)}</div>`; return; }
      O.team = r.subordinates;
      if (!O.team.length) { el.innerHTML = `<div class="empty">तुमच्या खाली (Reports_To) कोणीही अधिकारी मॅप केलेले नाहीत.</div>`; return; }
      el.innerHTML = `<h3 class="sec-title">माझ्या अंतर्गत अधिकारी — आजची व ७ दिवसांची कामगिरी</h3>` + O.team.map((s) => {
        const medal = s.rank === 1 ? "🥇" : s.rank === 2 ? "🥈" : s.rank === 3 ? "🥉" : `#${s.rank}`;
        const wk = s.weekPct == null ? "—" : s.weekPct + "%";
        const cls = s.todayPct >= 90 ? "good" : s.todayPct >= 60 ? "mid" : "bad";
        return `<div class="tcard">
          <div class="tcard-top"><div><span class="tcard-rank">${medal}</span> <b>${esc(s.name)}</b><div class="tcard-meta">${esc(s.roleMr)}${s.taluka && s.taluka !== "ALL" ? " · " + esc(s.taluka) : ""}${s.agency && s.agency !== "ALL" ? " · " + esc(s.agency) : ""}${s.pwdChanged ? "" : " · <span class='text-danger'>अद्याप लॉगिन नाही</span>"}</div></div>${contactBtns(s.mobile, s.pendingNames.join(", "))}</div>
          <div class="tcard-stats"><div><b>${s.total}</b><span>जलसाठे</span></div><div class="${cls}"><b>${s.todayPct}%</b><span>आज</span></div><div><b>${wk}</b><span>७ दिवस</span></div><div class="${s.red ? "bad" : ""}"><b>${s.red}</b><span>उपसा</span></div></div>
          ${s.pendingNames.length ? `<div class="tcard-pending">बाकी: ${s.pendingNames.map(esc).join(", ")}${s.total - s.reported > s.pendingNames.length ? " …" : ""}</div>` : ""}
        </div>`;
      }).join("");
    } catch (e) { el.innerHTML = `<div class="empty">नेटवर्क त्रुटी: ${esc(e.message)}</div>`; }
  }

  // ───────────────────────── अ‍ॅडमिन ─────────────────────────
  async function loadAdmin() {
    if (!O.users) { $("admUserList").innerHTML = '<div class="loading">लोड होत आहे…</div>'; try { const r = await api("admin_listUsers"); O.users = r.success ? r.users : []; } catch (e) { O.users = []; } renderUsers(); }
    if (!O.wbs) { try { const r = await api("admin_listWaterBodies"); O.wbs = r.success ? r.waterBodies : []; } catch (e) { O.wbs = []; } renderWbs(); }
    if (state.user.role === "DISTRICT_CELL") loadSettings();
  }
  function renderUsers() {
    const q = ($("admUserSearch").value || "").toLowerCase(), el = $("admUserList");
    const list = (O.users || []).filter((u) => !q || [u.name, u.id, u.mobile, u.agency, u.taluka].join(" ").toLowerCase().includes(q));
    if (!list.length) { el.innerHTML = '<div class="empty">युजर नाहीत</div>'; return; }
    const canMap = state.user.role === "DISTRICT_CELL" || state.user.role === "AGENCY_HEAD";
    el.innerHTML = list.map((u) => `<div class="ucard ${u.approval === "PENDING" ? "u-pending" : ""}">
      <div class="ucard-top"><div><b>${esc(u.name)}</b> <small class="text-muted">${esc(u.id)}</small><div class="tcard-meta">${esc(u.roleMr)} · ${esc(u.agency)} · ${esc(u.taluka)} · ${esc(u.mobile)}${u.approval === "PENDING" ? " · <b class='text-warning'>मंजुरी बाकी</b>" : ""}${!u.active ? " · <b class='text-danger'>निष्क्रिय</b>" : ""}</div></div></div>
      ${u.role === "INSPECTOR" ? `<div class="pcard-wbs">${u.mappings.map((m) => `<span class="chip">${esc(m.wbName)}${canMap ? ` <a href="#" data-unmap="${esc(m.mappingId)}" title="काढा">✕</a>` : ""}</span>`).join("") || "<small class='text-muted'>जलसाठा नेमलेला नाही</small>"}</div>` : ""}
      <div class="ucard-actions">
        ${u.approval === "PENDING" ? `<button class="btn btn-sm btn-success" data-approve="${esc(u.id)}">✅ मंजूर</button><button class="btn btn-sm btn-outline-danger" data-reject="${esc(u.id)}">नाकारा</button>` : ""}
        ${u.role === "INSPECTOR" && canMap ? `<button class="btn btn-sm btn-outline-primary" data-map="${esc(u.id)}">+ जलसाठा नेमा</button>` : ""}
        <button class="btn btn-sm btn-outline-secondary" data-reset="${esc(u.id)}">पासवर्ड रिसेट</button>
      </div></div>`).join("");
    el.querySelectorAll("[data-approve]").forEach((b) => b.addEventListener("click", () => approveUser(b.dataset.approve, true)));
    el.querySelectorAll("[data-reject]").forEach((b) => b.addEventListener("click", () => approveUser(b.dataset.reject, false)));
    el.querySelectorAll("[data-reset]").forEach((b) => b.addEventListener("click", () => resetPwd(b.dataset.reset)));
    el.querySelectorAll("[data-map]").forEach((b) => b.addEventListener("click", () => addMapping(b.dataset.map)));
    el.querySelectorAll("[data-unmap]").forEach((a) => a.addEventListener("click", (e) => { e.preventDefault(); closeMapping(a.dataset.unmap); }));
  }
  async function approveUser(id, approve) {
    const c = await Swal.fire({ title: approve ? "नोंदणी मंजूर करायची?" : "नोंदणी नाकारायची?", text: id, icon: "question", showCancelButton: true, confirmButtonText: "होय", cancelButtonText: "नाही" }); if (!c.isConfirmed) return;
    busy("सेव्ह…"); const r = await api("admin_approveUser", { targetId: id, approve }); Swal.close();
    if (r.success) { toast("success", approve ? "मंजूर केले" : "नाकारले"); O.users = null; loadAdmin(); } else Swal.fire("त्रुटी", r.message, "error");
  }
  async function resetPwd(id) {
    const c = await Swal.fire({ title: "पासवर्ड रिसेट?", html: `<b>${esc(id)}</b> चा पासवर्ड डिफॉल्टवर जाईल आणि पुढच्या लॉगिनला बदलावा लागेल.`, icon: "warning", showCancelButton: true, confirmButtonText: "रिसेट करा", cancelButtonText: "रद्द", confirmButtonColor: "#c1292e" }); if (!c.isConfirmed) return;
    busy("रिसेट…"); const r = await api("admin_resetPassword", { targetId: id }); Swal.close();
    r.success ? Swal.fire("झाले", r.message, "success") : Swal.fire("त्रुटी", r.message, "error");
  }
  async function addMapping(inspectorId) {
    const opts = {}; (O.wbs || []).filter((w) => w.active).forEach((w) => { opts[w.wbId] = `${w.name} (${w.taluka})`; });
    const c = await Swal.fire({ title: "जलसाठा नेमा", input: "select", inputOptions: opts, inputPlaceholder: "जलसाठा निवडा", showCancelButton: true, confirmButtonText: "नेमा", cancelButtonText: "रद्द" });
    if (!c.isConfirmed || !c.value) return;
    busy("सेव्ह…"); const r = await api("admin_addMapping", { inspectorId, wbId: c.value }); Swal.close();
    if (r.success) { toast("success", "मॅपिंग झाले"); O.users = null; loadAdmin(); } else Swal.fire("त्रुटी", r.message, "error");
  }
  async function closeMapping(mappingId) {
    const c = await Swal.fire({ title: "हे मॅपिंग काढायचे?", text: "आजपासून हा जलसाठा या निरीक्षकाकडे राहणार नाही (इतिहास टिकेल).", icon: "warning", showCancelButton: true, confirmButtonText: "काढा", cancelButtonText: "रद्द" }); if (!c.isConfirmed) return;
    busy("सेव्ह…"); const r = await api("admin_closeMapping", { mappingId }); Swal.close();
    if (r.success) { toast("success", "काढले"); O.users = null; loadAdmin(); } else Swal.fire("त्रुटी", r.message, "error");
  }
  function renderWbs() {
    const q = ($("admWbSearch").value || "").toLowerCase(), el = $("admWbList");
    const list = (O.wbs || []).filter((w) => !q || [w.name, w.project, w.village, w.taluka, w.agency, w.wbId].join(" ").toLowerCase().includes(q));
    if (!list.length) { el.innerHTML = '<div class="empty">जलसाठे नाहीत</div>'; return; }
    const canApprove = state.user.role === "DISTRICT_CELL" || state.user.role === "AGENCY_HEAD";
    el.innerHTML = list.map((w) => `<div class="ucard ${w.locationStatus !== "APPROVED" ? "u-pending" : ""}">
      <div><b>${esc(w.name)}</b> <small class="text-muted">${esc(w.wbId)}</small><div class="tcard-meta">${esc(w.project)} · ${esc(w.typeLabel)} · ${esc(w.taluka)} · ${esc(w.village)} · ${esc(w.agency)}${!w.active ? " · <b class='text-danger'>बंद</b>" : ""}</div>
      <div class="tcard-meta">${w.lat ? `📍 ${w.lat.toFixed(5)}, ${w.lng.toFixed(5)} · ${w.locationStatus === "APPROVED" ? "<span class='text-success'>स्थळ मंजूर</span>" : "<span class='text-warning'>स्थळ मंजुरी बाकी (निरीक्षकाच्या GPS वरून)</span>"}` : "<span class='text-danger'>स्थळाचे GPS नाही</span>"}</div></div>
      ${w.lat && w.locationStatus !== "APPROVED" && canApprove ? `<div class="ucard-actions"><a class="btn btn-sm btn-outline-secondary" target="_blank" rel="noopener" href="https://maps.google.com/?q=${w.lat},${w.lng}">नकाशात पाहा</a><button class="btn btn-sm btn-success" data-aploc="${esc(w.wbId)}">✅ स्थळ मंजूर</button></div>` : ""}
    </div>`).join("");
    el.querySelectorAll("[data-aploc]").forEach((b) => b.addEventListener("click", async () => { busy("सेव्ह…"); const r = await api("admin_approveLocation", { wbId: b.dataset.aploc }); Swal.close(); if (r.success) { toast("success", "स्थळ मंजूर"); O.wbs = null; loadAdmin(); } else Swal.fire("त्रुटी", r.message, "error"); }));
  }
  async function loadSettings() {
    const el = $("admSettingsList"); el.innerHTML = '<div class="loading">लोड…</div>';
    const r = await api("admin_getSettings"); if (!r.success) { el.innerHTML = `<div class="empty">${esc(r.message)}</div>`; return; }
    el.innerHTML = r.settings.map((s) => {
      const isToggle = /^(ON|OFF)$/i.test(s.value);
      return `<div class="scard"><div><b>${esc(s.key)}</b><div class="tcard-meta">${esc(s.description)}</div></div>
        ${isToggle ? `<label class="switch"><input type="checkbox" data-skey="${esc(s.key)}" ${s.value.toUpperCase() === "ON" ? "checked" : ""}><span class="slider"></span></label>`
                   : `<input class="form-control form-control-sm set-input" data-skey="${esc(s.key)}" value="${esc(s.value)}">`}</div>`;
    }).join("");
    el.querySelectorAll("input[data-skey]").forEach((inp) => inp.addEventListener("change", async () => {
      const val = inp.type === "checkbox" ? (inp.checked ? "ON" : "OFF") : inp.value;
      const r = await api("admin_setSetting", { key: inp.dataset.skey, value: val });
      r.success ? toast("success", `${inp.dataset.skey} = ${val}`) : Swal.fire("त्रुटी", r.message, "error");
    }));
  }

  window.JN.officer = { init, history: showHistory };
})();
