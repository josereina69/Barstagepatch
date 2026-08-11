  const RETURN_LABELS = ["A","B","C","D","E","F","G","H"];
  const STAGEPATCH_EXT = ".stagepatch";
  const STAGEPATCH_MIME = "application/x-stagepatch+json";
  const STAGEPATCH_SCHEMA_VERSION = 1;
  const LS_BACKUP_KEY = "stagepatch_backup_v1";
  const LS_MODE_KEY = "stagepatch_view_mode_v1";

  let appData = { show: { name:"", artist:"", date:"" }, snakes: [] };
  let editorSnakeId = null;
  let activeTab = "inputs";
  let viewMode = "edit";
  let sharedReadOnly = false;

  const HISTORY_LIMIT = 100;
  let undoStack = [];
  let redoStack = [];
  let historyMuted = false;
  let dragSnakeId = null;

  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? "").replace(/[&<>"']/g, m => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;" })[m]);
  const deepClone = o => JSON.parse(JSON.stringify(o));
  const snakes = () => appData.snakes;
  function clampR(n){ return Math.min(8, Math.max(0, Number(n) || 0)); }
  function isReadMode(){ return viewMode === "read"; }

  function setSaveIndicator(txt){ $("saveIndicator").textContent = "Backup: " + txt; }

  function snapshot(tag="change"){
    if(historyMuted || isReadMode()) return;
    undoStack.push({ tag, state: deepClone(appData) });
    if(undoStack.length > HISTORY_LIMIT) undoStack.shift();
    redoStack = [];
    updateUndoRedoButtons();
  }

  function restoreState(state){
    appData = deepClone(state);
    normalize();
    refreshShowInputs();
    updateShowBadge();
    renderList();
    renderSearchResults();
    refreshPrintSnakeSelect();
    refreshDatalists();
    refreshSheetFilter();
    renderSheetView();
    if(editorSnakeId && !snakes().find(s=>s.id===editorSnakeId)) closeEditor();
    else if(editorSnakeId) renderEditor();
  }

  function undo(){
    if(isReadMode() || !undoStack.length) return;
    const prev = undoStack.pop();
    redoStack.push({ state: deepClone(appData) });
    historyMuted = true; restoreState(prev.state); historyMuted = false;
    updateUndoRedoButtons();
  }
  function redo(){
    if(isReadMode() || !redoStack.length) return;
    const next = redoStack.pop();
    undoStack.push({ state: deepClone(appData) });
    historyMuted = true; restoreState(next.state); historyMuted = false;
    updateUndoRedoButtons();
  }
  function updateUndoRedoButtons(){
    $("undoBtn").disabled = isReadMode() || !undoStack.length;
    $("redoBtn").disabled = isReadMode() || !redoStack.length;
  }

  function autosaveNow(){
    try{
      localStorage.setItem(LS_BACKUP_KEY, JSON.stringify({ savedAt: new Date().toISOString(), payload: appData }));
      setSaveIndicator("guardado " + new Date().toLocaleTimeString());
    }catch{
      setSaveIndicator("error de guardado");
    }
  }

  function readBackup(){
    try{
      const raw = localStorage.getItem(LS_BACKUP_KEY);
      if(!raw) return null;
      const data = JSON.parse(raw);
      if(!data?.payload || !Array.isArray(data.payload.snakes)) return null;
      return data;
    }catch{ return null; }
  }

  function refreshWelcomeLastInfo(){
    const data = readBackup();
    const el = $("lastInfo");
    if(!data){
      el.textContent = "No hay backup local todavía.";
      $("btnLoadLast").disabled = true;
      return;
    }
    $("btnLoadLast").disabled = false;
    const s = data.payload?.show || {};
    const snakesN = data.payload?.snakes?.length || 0;
    const when = data.savedAt ? new Date(data.savedAt).toLocaleString() : "fecha desconocida";
    el.textContent = `Último: ${s.name || "Sin nombre"} · ${snakesN} subsnakes · ${when}`;
  }

  function loadModePref(){
    try{
      const m = localStorage.getItem(LS_MODE_KEY);
      if(m === "read" || m === "edit") viewMode = m;
    }catch{}
    applyModeUI();
  }

  function toggleMode(){
  if (sharedReadOnly) return;
  viewMode = (viewMode === "edit") ? "read" : "edit";
  try{ localStorage.setItem(LS_MODE_KEY, viewMode); }catch{}
  applyModeUI();
  renderSheetView();
  if(viewMode === "read" && $("editor").classList.contains("open")) closeEditor();
}

  function applyModeUI(){
    const root = $("appRoot");
    root.classList.toggle("mode-reading", viewMode === "read");
    root.classList.toggle("mode-edit", viewMode === "edit");

    const b = $("toggleReadMode");
    if(viewMode === "read"){
      b.classList.add("active");
      b.textContent = "✏️ Volver a edición";
    } else {
      b.classList.remove("active");
      b.textContent = "🔒 Modo lectura";
    }
    updateUndoRedoButtons();
  }

  function makeChannels(n){
    return Array.from({length:n}, (_,i)=>({ channel:i+1, source:"", destination:"", micType:"", notes:"", fail:false }));
  }
  function makeReturns(count=0){
    const c = clampR(count);
    return RETURN_LABELS.slice(0,c).map(l=>({label:l, source:"", destination:"", notes:"", fail:false}));
  }

  function normalize(){
    appData.show = appData.show || {name:"",artist:"",date:""};
    appData.snakes = (appData.snakes || []).map(s=>{
      const channels = Array.isArray(s.channels) ? s.channels : makeChannels(Number(s.channelsCount)||8);
      const channelsCount = Number(s.channelsCount) || channels.length || 8;
      const returnsCount = clampR(s.returnsCount);
      const returnsOld = Array.isArray(s.returns) ? s.returns : [];
      const returns = RETURN_LABELS.slice(0, returnsCount).map((l, i)=>({
        label:l,
        source: returnsOld[i]?.source || "",
        destination: returnsOld[i]?.destination || "",
        notes: returnsOld[i]?.notes || "",
        fail: !!returnsOld[i]?.fail
      }));
      return {
        ...s,
        channelsCount,
        channels: channels.map((c,i)=>({
          channel: c.channel || i+1,
          source:c.source||"",
          destination:c.destination||"",
          micType:c.micType||"",
          notes:c.notes||"",
          fail: !!c.fail
        })),
        returnsCount,
        returns
      };
    });
  }

  function updateShowBadge(){
    const s = appData.show;
    const txt = "Show: " + `${s.name || "Sin definir"}${s.artist ? " · " + s.artist : ""}${s.date ? " · " + s.date : ""}`;
    $("showBadge").textContent = txt;
    $("sheetMeta").textContent = txt;
  }

  function saveShowMeta(){
    if(isReadMode()) return;
    snapshot("show meta");
    appData.show.name = $("showName").value.trim();
    appData.show.artist = $("artistName").value.trim();
    appData.show.date = $("showDate").value;
    updateShowBadge();
    renderSheetView();
    alert("Show actualizado.");
  }

  function createSnakeFromData({name, channelsCount, returnsCount, color, zone, channels, returns}){
    if(isReadMode()) return;
    snapshot("create snake");
    const chN = Number(channelsCount) || 8, rN = clampR(returnsCount);
    snakes().unshift({
      id: crypto.randomUUID(), name: name || `Subsnake ${snakes().length+1}`,
      channelsCount: chN, returnsCount: rN, color: color || "#4f8cff", zone: zone || "",
      channels: channels || makeChannels(chN), returns: returns || makeReturns(rN), createdAt: new Date().toISOString()
    });
    renderList(); renderSearchResults(); refreshPrintSnakeSelect(); refreshDatalists(); refreshSheetFilter(); renderSheetView();
  }

  function createSnake(){
    createSnakeFromData({
      name: $("snakeName").value.trim(),
      channelsCount: Number($("snakeChannels").value),
      returnsCount: Number($("snakeReturnsCount").value),
      color: $("snakeColor").value,
      zone: $("snakeZone").value.trim()
    });
    if(!isReadMode()){ $("snakeName").value = ""; $("snakeZone").value = ""; }
  }

  function deleteSnake(id){
    if(isReadMode()) return;
    if(!confirm("¿Eliminar este subsnake?")) return;
    snapshot("delete snake");
    appData.snakes = snakes().filter(s=>s.id!==id);
    renderList(); renderSearchResults(); refreshPrintSnakeSelect(); refreshDatalists(); refreshSheetFilter(); renderSheetView();
  }

  function duplicateSnake(id){
    if(isReadMode()) return;
    const s = snakes().find(x=>x.id===id); if(!s) return;
    snapshot("duplicate snake");
    const cp = deepClone(s); cp.id = crypto.randomUUID(); cp.name = s.name + " (copia)";
    snakes().unshift(cp);
    renderList(); renderSearchResults(); refreshPrintSnakeSelect(); refreshDatalists(); refreshSheetFilter(); renderSheetView();
  }

  function moveSnakeUp(id){
    if(isReadMode()) return;
    const i = appData.snakes.findIndex(s => s.id === id);
    if(i <= 0) return;
    snapshot("move snake up");
    [appData.snakes[i-1], appData.snakes[i]] = [appData.snakes[i], appData.snakes[i-1]];
    renderList(); renderSearchResults(); refreshPrintSnakeSelect(); refreshSheetFilter(); renderSheetView();
  }

  function moveSnakeDown(id){
    if(isReadMode()) return;
    const i = appData.snakes.findIndex(s => s.id === id);
    if(i < 0 || i >= appData.snakes.length - 1) return;
    snapshot("move snake down");
    [appData.snakes[i+1], appData.snakes[i]] = [appData.snakes[i], appData.snakes[i+1]];
    renderList(); renderSearchResults(); refreshPrintSnakeSelect(); refreshSheetFilter(); renderSheetView();
  }

  function bindDragAndDrop(){
    const container = $("snakesList");
    const items = [...container.querySelectorAll(".snake-item[draggable='true']")];

    items.forEach(item=>{
      item.addEventListener("dragstart", e=>{
        dragSnakeId = item.dataset.id;
        item.classList.add("dragging");
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", dragSnakeId);
      });

      item.addEventListener("dragend", ()=>{
        item.classList.remove("dragging");
        container.querySelectorAll(".snake-item").forEach(i=>i.classList.remove("drop-target"));
        dragSnakeId = null;
      });

      item.addEventListener("dragover", e=>{
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        item.classList.add("drop-target");
      });

      item.addEventListener("dragleave", ()=> item.classList.remove("drop-target"));

      item.addEventListener("drop", e=>{
        e.preventDefault();
        item.classList.remove("drop-target");
        const targetId = item.dataset.id;
        const sourceId = dragSnakeId || e.dataTransfer.getData("text/plain");
        if(!sourceId || !targetId || sourceId===targetId) return;
        reorderSnakeByIds(sourceId, targetId);
      });
    });
  }

  function reorderSnakeByIds(sourceId, targetId){
    if(isReadMode()) return;
    const from = appData.snakes.findIndex(s=>s.id===sourceId);
    const to = appData.snakes.findIndex(s=>s.id===targetId);
    if(from < 0 || to < 0 || from === to) return;
    snapshot("drag reorder snakes");
    const [moved] = appData.snakes.splice(from,1);
    appData.snakes.splice(to,0,moved);
    renderList(); renderSearchResults(); refreshPrintSnakeSelect(); refreshSheetFilter(); renderSheetView();
  }

  function renderList(){
    const q = $("search").value.trim().toLowerCase();
    const el = $("snakesList"); el.innerHTML = "";
    const list = snakes().filter(s=>{
      if(!q) return true;
      const txt = [
        s.name,s.zone,s.channelsCount,s.returnsCount,
        ...s.channels.flatMap(c=>[c.source,c.destination,c.micType,c.notes, c.fail ? "falla" : "ok"]),
        ...(s.returns||[]).flatMap(r=>[r.label,r.source,r.destination,r.notes, r.fail ? "falla" : "ok"])
      ].join(" ").toLowerCase();
      return txt.includes(q);
    });

    if(!list.length){ el.innerHTML = `<div class="small">No hay subsnakes aún.</div>`; return; }

    list.forEach((s)=>{
      const realIndex = appData.snakes.findIndex(x=>x.id===s.id);
      const item = document.createElement("div");
      item.className = "snake-item";
      item.draggable = !isReadMode();
      item.dataset.id = s.id;
      item.dataset.index = String(realIndex);

      item.innerHTML = `
        <div class="snake-head">
          <div class="snake-title-wrap">
            <span class="dot" style="background:${s.color}"></span>
            <div>
              <div class="snake-title">${esc(s.name)}</div>
              <div class="snake-meta">
                #${realIndex+1} · ${s.channelsCount} entradas + ${s.returnsCount} salidas ${s.zone ? "• " + esc(s.zone) : ""}
              </div>
            </div>
          </div>
          <div class="snake-actions">
            <button onclick="moveSnakeUp('${s.id}')" title="Subir">↑</button>
            <button onclick="moveSnakeDown('${s.id}')" title="Bajar">↓</button>
            <button onclick="openEditor('${s.id}')">Editar</button>
            <button onclick="duplicateSnake('${s.id}')">Dup</button>
            <button class="btn-danger" onclick="deleteSnake('${s.id}')">X</button>
          </div>
        </div>`;
      el.appendChild(item);
    });

    bindDragAndDrop();
  }

  function openEditor(id){
    if(isReadMode()) return;
    editorSnakeId = id; activeTab = "inputs";
    $("tabInputs").classList.add("active"); $("tabOutputs").classList.remove("active");
    $("editor").classList.add("open");
    renderEditor();
  }
  function openSnakeAndTab(snakeId, tab){ if(isReadMode()) return; openEditor(snakeId); setTab(tab); }
  function closeEditor(){ $("editor").classList.remove("open"); editorSnakeId = null; }
  function setTab(tab){ activeTab = tab; $("tabInputs").classList.toggle("active", tab==="inputs"); $("tabOutputs").classList.toggle("active", tab==="outputs"); renderEditorBody(); }

  function getSuggestions(){
  const baseSource = [
    // ===== VOCES =====
    "Voz principal","Voz lead","Voz secundaria","Coro 1","Coro 2","Coro 3","Coro 4","Coro 5","Coro 6",
    "Rap lead","Rap coro","Locución","Narrador","Presentador","MC","Animación",
    "Talkback FOH","Talkback MON","Talkback Stage","Talkback Luces","Talkback Video",

    // ===== BATERÍA ACÚSTICA =====
    "Bombo In","Bombo Out","Caja Top","Caja Bottom","Caja sample",
    "Caja 2","Caja 3","Hi Hat","Snare","Snare top","Snare Bottom",
    "Charles","Tom 1","Tom 2","Tom 3","Tom 4","Tom base",
    "Overhead L","Overhead R","Ride","Crash L","Crash R","China","Splash",
    "Room L","Room R","Room Mono","Ambiente batería",
    "Pad batería L","Pad batería R","SPD-SX L","SPD-SX R","Click batería",

    // ===== PERCUSIÓN =====
    "Conga L","Conga R","Bongo","Timbal L","Timbal R","Cajón","Shaker","Pandereta",
    "Campana","Bloque","Udu","Djembe","Güiro","Percusión L","Percusión R","Percusión sample L","Percusión sample R","Oh","Oh L","Oh R",

    // ===== BAJO =====
    "Bajo DI","Bajo Mic","Bajo limpio","Bajo drive","Bajo L","Bajo R","Bajo FX L","Bajo FX R","Sintetizador bajo",

    // ===== GUITARRAS =====
    "Guitarra 1 Mic","Guitarra 1 DI","Guitarra 2 Mic","Guitarra 2 DI","Guitarra 3 Mic","Guitarra 3 DI","Tres Cubano",
    "Guitarra eléctrica L","Guitarra eléctrica R",
    "Guitarra acústica DI","Guitarra acústica Mic","Guitarra nylon DI","Guitarra nylon Mic",
    "Guitarra L XLR","Guitarra R XLR","Guitarras L XLR","Guitarras R XLR",
    "Pedalera L","Pedalera R","Amp Sim L","Amp Sim R",

    // ===== TECLADOS / PADS / ELECTRÓNICA =====
    "Teclado 1 L","Teclado 1 R","Teclado 2 L","Teclado 2 R","Teclado 3 L","Teclado 3 R",
    "Piano L","Piano R","Piano Mono","Rhodes L","Rhodes R","Órgano L","Órgano R",
    "Sintetizador L","Sintetizador R","Lead synth","Pad synth",
    "Pad L","Pad R","Pads L","Pads R",
    "Sampler L","Sampler R","Secuencias L","Secuencias R","Ableton L","Ableton R","MainStage L","MainStage R","Acordeón","Melódica",
    "Click","Cue L","Cue R","Referencia L","Referencia R",

    // ===== DJ / PLAYBACK =====
    "DJ 1 L","DJ 1 R","DJ 2 L","DJ 2 R","Controladora L","Controladora R",
    "Playback L","Playback R","Pistas L","Pistas R","FX L","FX R","SFX L","SFX R","Stems Drums","Stems Bass","Stems Music","Stems Vox",

    // ===== VIENTOS =====
    "Saxo alto","Saxo tenor","Saxo barítono","Trompeta 1","Trompeta 2","Trombón 1","Trombón 2","Tuba","Flauta","Clarinete","Oboe","Fagot","Corno francés",

    // ===== CUERDAS =====
    "Violín 1","Violín 2","Viola","Cello","Contrabajo","Arpa",

    // ===== CORO / ORQUESTA EXTRA =====
    "Coro soprano","Coro alto","Coro tenor","Coro bajo","Ensemble L","Ensemble R",

    // ===== AMBIENTES / FX =====
    "Ambiente L","Ambiente R","Ambiente sala","Ambiente público","Room audience L","Room audience R",

    // ===== COMUNICACIONES / IFB =====
    "IFB Prod","IFB Host","IFB Invitado","Comms Stage Manager","Comms Dirección","Comms Cámaras",

    // ===== VIDEO / BROADCAST =====
    "VT L","VT R","Playout L","Playout R","Retorno Broadcast L","Retorno Broadcast R",

    // ===== BACKLINE / OTROS =====
    "Acordeón L","Acordeón R","Mandolina DI","Ukulele DI","Banjo DI","Armónica",
    "Piano vertical Mic L","Piano vertical Mic R","Wurlitzer L","Wurlitzer R"
  ];

  const baseDest = [
    // ===== RIO (GENÉRICO) 32 IN / 16 OUT =====
    "RIO IN 01","RIO IN 02","RIO IN 03","RIO IN 04","RIO IN 05","RIO IN 06","RIO IN 07","RIO IN 08",
    "RIO IN 09","RIO IN 10","RIO IN 11","RIO IN 12","RIO IN 13","RIO IN 14","RIO IN 15","RIO IN 16",
    "RIO IN 17","RIO IN 18","RIO IN 19","RIO IN 20","RIO IN 21","RIO IN 22","RIO IN 23","RIO IN 24",
    "RIO IN 25","RIO IN 26","RIO IN 27","RIO IN 28","RIO IN 29","RIO IN 30","RIO IN 31","RIO IN 32",

    "RIO OUT 01","RIO OUT 02","RIO OUT 03","RIO OUT 04","RIO OUT 05","RIO OUT 06","RIO OUT 07","RIO OUT 08",
    "RIO OUT 09","RIO OUT 10","RIO OUT 11","RIO OUT 12","RIO OUT 13","RIO OUT 14","RIO OUT 15","RIO OUT 16",

    // ===== DiGiCo Racks =====
    "SD-RACK IN 01","SD-RACK IN 02","SD-RACK IN 03","SD-RACK IN 04","SD-RACK IN 05","SD-RACK IN 06","SD-RACK IN 07","SD-RACK IN 08",
    "SD-RACK IN 09","SD-RACK IN 10","SD-RACK IN 11","SD-RACK IN 12","SD-RACK IN 13","SD-RACK IN 14","SD-RACK IN 15","SD-RACK IN 16",
    "SD-RACK IN 17","SD-RACK IN 18","SD-RACK IN 19","SD-RACK IN 20","SD-RACK IN 21","SD-RACK IN 22","SD-RACK IN 23","SD-RACK IN 24",
    "SD-RACK IN 25","SD-RACK IN 26","SD-RACK IN 27","SD-RACK IN 28","SD-RACK IN 29","SD-RACK IN 30","SD-RACK IN 31","SD-RACK IN 32",
    "SD-RACK IN 33","SD-RACK IN 34","SD-RACK IN 35","SD-RACK IN 36","SD-RACK IN 37","SD-RACK IN 38","SD-RACK IN 39","SD-RACK IN 40",
    "SD-RACK IN 41","SD-RACK IN 42","SD-RACK IN 43","SD-RACK IN 44","SD-RACK IN 45","SD-RACK IN 46","SD-RACK IN 47","SD-RACK IN 48",
    "SD-RACK IN 49","SD-RACK IN 50","SD-RACK IN 51","SD-RACK IN 52","SD-RACK IN 53","SD-RACK IN 54","SD-RACK IN 55","SD-RACK IN 56",
    "SD-RACK OUT 01","SD-RACK OUT 02","SD-RACK OUT 03","SD-RACK OUT 04","SD-RACK OUT 05","SD-RACK OUT 06","SD-RACK OUT 07","SD-RACK OUT 08",
    "SD-RACK OUT 09","SD-RACK OUT 10","SD-RACK OUT 11","SD-RACK OUT 12","SD-RACK OUT 13","SD-RACK OUT 14","SD-RACK OUT 15","SD-RACK OUT 16",
    "SD-RACK OUT 17","SD-RACK OUT 18","SD-RACK OUT 19","SD-RACK OUT 20","SD-RACK OUT 21","SD-RACK OUT 22","SD-RACK OUT 23","SD-RACK OUT 24",
    "SD-RACK OUT 25","SD-RACK OUT 26","SD-RACK OUT 27","SD-RACK OUT 28","SD-RACK OUT 29","SD-RACK OUT 30","SD-RACK OUT 31","SD-RACK OUT 32",

    "SD-MINIRACK IN 01","SD-MINIRACK IN 02","SD-MINIRACK IN 03","SD-MINIRACK IN 04","SD-MINIRACK IN 05","SD-MINIRACK IN 06","SD-MINIRACK IN 07","SD-MINIRACK IN 08",
    "SD-MINIRACK IN 09","SD-MINIRACK IN 10","SD-MINIRACK IN 11","SD-MINIRACK IN 12","SD-MINIRACK IN 13","SD-MINIRACK IN 14","SD-MINIRACK IN 15","SD-MINIRACK IN 16",
    "SD-MINIRACK IN 17","SD-MINIRACK IN 18","SD-MINIRACK IN 19","SD-MINIRACK IN 20","SD-MINIRACK IN 21","SD-MINIRACK IN 22","SD-MINIRACK IN 23","SD-MINIRACK IN 24",
    "SD-MINIRACK IN 25","SD-MINIRACK IN 26","SD-MINIRACK IN 27","SD-MINIRACK IN 28","SD-MINIRACK IN 29","SD-MINIRACK IN 30","SD-MINIRACK IN 31","SD-MINIRACK IN 32",
    "SD-MINIRACK OUT 01","SD-MINIRACK OUT 02","SD-MINIRACK OUT 03","SD-MINIRACK OUT 04","SD-MINIRACK OUT 05","SD-MINIRACK OUT 06","SD-MINIRACK OUT 07","SD-MINIRACK OUT 08",
    "SD-MINIRACK OUT 09","SD-MINIRACK OUT 10","SD-MINIRACK OUT 11","SD-MINIRACK OUT 12","SD-MINIRACK OUT 13","SD-MINIRACK OUT 14","SD-MINIRACK OUT 15","SD-MINIRACK OUT 16",

    "SD-NANORACK IN 01","SD-NANORACK IN 02","SD-NANORACK IN 03","SD-NANORACK IN 04","SD-NANORACK IN 05","SD-NANORACK IN 06","SD-NANORACK IN 07","SD-NANORACK IN 08",
    "SD-NANORACK IN 09","SD-NANORACK IN 10","SD-NANORACK IN 11","SD-NANORACK IN 12","SD-NANORACK OUT 01","SD-NANORACK OUT 02","SD-NANORACK OUT 03","SD-NANORACK OUT 04",

    // ===== Patch / Split =====
    "Patch A1","Patch A2","Patch A3","Patch A4","Patch B1","Patch B2","Patch B3","Patch B4",
    "Split FOH","Split MON","Split Broadcast","Split Grabación",

    // ===== FOH =====
    "FOH CH 01","FOH CH 02","FOH CH 03","FOH CH 04","FOH CH 05","FOH CH 06","FOH CH 07","FOH CH 08",
    "FOH CH 09","FOH CH 10","FOH CH 11","FOH CH 12","FOH CH 13","FOH CH 14","FOH CH 15","FOH CH 16",
    "FOH CH 17","FOH CH 18","FOH CH 19","FOH CH 20","FOH CH 21","FOH CH 22","FOH CH 23","FOH CH 24",
    "FOH CH 25","FOH CH 26","FOH CH 27","FOH CH 28","FOH CH 29","FOH CH 30","FOH CH 31","FOH CH 32",
	"OMNI 01","OMNI 02","OMNI 03","OMNI 04","OMNI 05","OMNI 06","OMNI 07","OMNI 08",
"OMNI 09","OMNI 10","OMNI 11","OMNI 12","OMNI 13","OMNI 14","OMNI 15","OMNI 16",

    // ===== MON / IEM / PA =====
    "MON CH 01","MON CH 02","MON CH 03","MON CH 04","MON CH 05","MON CH 06","MON CH 07","MON CH 08",
    "IEM Voz L","IEM Voz R","IEM Guitarra L","IEM Guitarra R","IEM Bajo L","IEM Bajo R","IEM Batería L","IEM Batería R",
    "Wedge 1","Wedge 2","Wedge 3","Wedge 4","Drum Fill","Side Fill L","Side Fill R",
    "PA L","PA R","SUB","Front Fill","Delay L","Delay R","Out Fill L","Out Fill R",

    // ===== Matrices / Grabación =====
    "Matriz 1","Matriz 2","Matriz 3","Matriz 4","Matriz 5","Matriz 6","Matriz 7","Matriz 8",
    "Grabación L","Grabación R","Broadcast L","Broadcast R","Streaming L","Streaming R",

    // ===== MONITORES =====
    "MON CH 01","MON CH 02","MON CH 03","MON CH 04","MON CH 05","MON CH 06","MON CH 07","MON CH 08",
    "MON CH 09","MON CH 10","MON CH 11","MON CH 12","MON CH 13","MON CH 14","MON CH 15","MON CH 16",
	"OMNI 01","OMNI 02","OMNI 03","OMNI 04","OMNI 05","OMNI 06","OMNI 07","OMNI 08",
"OMNI 09","OMNI 10","OMNI 11","OMNI 12","OMNI 13","OMNI 14","OMNI 15","OMNI 16",

    // ===== IEM / WEDGES =====
    "IEM Voz L","IEM Voz R","IEM Coros L","IEM Coros R","IEM Guitarra L","IEM Guitarra R",
    "IEM Bajo L","IEM Bajo R","IEM Teclado L","IEM Teclado R","IEM Batería L","IEM Batería R",
    "IEM Director musical L","IEM Director musical R",
    "Wedge 1","Wedge 2","Wedge 3","Wedge 4","Wedge 5","Wedge 6","Drum Fill","Side Fill L","Side Fill R",

    // ===== PA / SYSTEM =====
    "PA L","PA R","PA C","SUB","SUB AUX","Front Fill","Out Fill L","Out Fill R","In Fill L","In Fill R",
    "Delay L","Delay R","Balcón L","Balcón R","Lobby L","Lobby R","VIP L","VIP R",

    // ===== MATRICES / BUSES =====
    "Matriz 1","Matriz 2","Matriz 3","Matriz 4","Matriz 5","Matriz 6","Matriz 7","Matriz 8",
    "Bus FX 1","Bus FX 2","Bus FX 3","Bus FX 4","Bus Drum","Bus Vox","Bus Music","Bus Speech",

    // ===== GRABACIÓN / BROADCAST / STREAM =====
    "Grabación L","Grabación R","Multitrack 01","Multitrack 02","Multitrack 03","Multitrack 04",
    "Broadcast L","Broadcast R","Mix Minus 1","Mix Minus 2","IFB Send 1","IFB Send 2",
    "Streaming L","Streaming R","Webcast L","Webcast R",

    // ===== VIDEO / COMMS =====
    "Video IN L","Video IN R","VT Return L","VT Return R","Intercom Dirección","Intercom Cámaras"
  ];

  const baseMic = [
    // ===== DINÁMICOS =====
    "Shure SM58","Shure SM57","Shure Beta58A","Shure Beta57A","Shure Beta52A","Shure SM7B",
    "Sennheiser e835","Sennheiser e845","Sennheiser e935","Sennheiser e945","Sennheiser e906","Sennheiser e609",
    "Sennheiser MD421","Sennheiser MD441","Electro-Voice RE20","Electro-Voice RE27",
    "Audix D6","Audix i5","Audix D2","Audix D4","Beyerdynamic M88","Beyerdynamic M201",

    // ===== CONDENSADOR =====
    "AKG C414","AKG C214","AKG C451","AKG C519","Neumann KM184","Neumann KMS105","Neumann U87","Neumann TLM103",
    "Audio-Technica AT4050","Audio-Technica AT4040","Audio-Technica ATM450","Rode NT5","Rode NT1","Rode NT55",
    "sE8","sE4400","DPA 4099","DPA 2011","Earthworks SR314",

    // ===== BOMBO / BATERÍA =====
    "AKG D112","Shure Beta52","Shure Beta91A","Sennheiser e602","Sennheiser e902","Telefunken M82",

    // ===== CINTA =====
    "Royer R-121","AEA R84","Beyerdynamic M160",

    // ===== INSTRUMENTO / CLIP =====
    "Shure Beta98","Shure PGA98","Audio-Technica Pro35","Sennheiser e908","AKG C516",

    // ===== DI =====
    "DI Activa","DI Pasiva","Radial J48","Radial ProDI","BSS AR-133","Countryman Type 85","Palmer PAN 01",

    // ===== INALÁMBRICO / IEM =====
    "Wireless HH","Wireless BP","Inalámbrico mano","Inalámbrico petaca","Headset","Lavalier",
    "In-Ear TX","In-Ear RX","PZM","Boundary Mic"
  ];

  const baseNotes = [
    // ===== GANANCIA / PREVIO =====
    "Ganancia baja","Ganancia media","Ganancia alta","Evitar clip","Revisar ruido","Entrada muy caliente",
    "Pad -10dB","Pad -20dB","Pad OFF",

    // ===== PHANTOM / POLARIDAD =====
    "Phantom ON","Phantom OFF","Sin phantom","Invertir fase","Polaridad normal","Revisar polaridad",

    // ===== FILTROS / DINÁMICA =====
    "HPF ON","HPF OFF","LPF ON","Puerta suave","Compresión ligera","Compresión media","Sin compresión",

    // ===== OPERATIVA =====
    "Mute inicio","Abrir en tema 2","Canal de respaldo","Canal principal","Solo MON","Solo FOH",
    "Solo Broadcast","No enviar a PA","Enviar a FX1","Enviar a FX2","Enviar a Reverb","Enviar a Delay",
    "Subir +3dB en solo","Bajar -3dB en versos","Pan L","Pan R","Centro",

    // ===== CABLEADO =====
    "XLR balanceado","TRS balanceado","TS instrumento","DI requerida","Cable corto","Cable largo","Línea estéreo","Línea mono",

    // ===== SHOW CONTROL =====
    "Chequear antes de show","Revisar en prueba","Prioridad director musical","Prioridad locución",
    "Micro compartido","No tocar patch","Seguridad / safety","Duplicado A/B",

    // ===== FALLOS / ALERTAS =====
    "Intermitente","Con ruido","Sin señal","Posible falso contacto","Revisar con RF","Batería baja transmisor"
  ];

  const src = new Set(baseSource), dst = new Set(baseDest), mic = new Set(baseMic), nts = new Set(baseNotes);

  snakes().forEach(s=>{
    (s.channels||[]).forEach(c=>{
      if(c.source) src.add(c.source);
      if(c.destination) dst.add(c.destination);
      if(c.micType) mic.add(c.micType);
      if(c.notes) nts.add(c.notes);
    });
    (s.returns||[]).forEach(r=>{
      if(r.source) src.add(r.source);
      if(r.destination) dst.add(r.destination);
      if(r.notes) nts.add(r.notes);
    });
  });

  const dedupe = arr => [...new Set(arr.map(v => String(v || "").trim()).filter(Boolean))];

  return {
    source: dedupe([...src]).slice(0,1000),
    destination: dedupe([...dst]).slice(0,1000),
    mic: dedupe([...mic]).slice(0,1000),
    notes: dedupe([...nts]).slice(0,1000)
  };
}

  function fillDatalist(id, values){ $(id).innerHTML = values.map(v=>`<option value="${esc(v)}"></option>`).join(""); }
  function refreshDatalists(){
    const s = getSuggestions();
    fillDatalist("dl-source", s.source);
    fillDatalist("dl-destination", s.destination);
    fillDatalist("dl-mic", s.mic);
    fillDatalist("dl-notes", s.notes);
  }
  function renderEditor(){
    const s = snakes().find(x=>x.id===editorSnakeId); if(!s) return;
    $("edName").value = s.name; $("edZone").value = s.zone || ""; $("edColor").value = s.color || "#4f8cff";
    renderEditorBody();
  }

  function renderEditorBody(){
    const s = snakes().find(x=>x.id===editorSnakeId); if(!s) return;
    const body = $("editorBody");
    if(activeTab==="inputs"){
      body.innerHTML = s.channels.map((c,i)=>`
        <div class="patch-card ${c.fail ? "is-fail" : ""}">
          <div class="patch-title">
  <span>Entrada ${c.channel}</span>
  <div style="display:flex; gap:6px; align-items:center; flex-wrap:wrap">
    <button type="button" class="icon-btn" onclick="copyChannel('in',${i})" title="Copiar contenido">📑</button>
<button type="button" class="icon-btn" onclick="pasteChannel('in',${i})" title="Pegar contenido">⬇</button>
<button type="button" class="icon-btn" onclick="clearChannel('in',${i})" title="Limpiar contenido">✖</button>
    <label class="fail-toggle" title="Marcar como en fallo/no disponible">
      <input type="checkbox" ${c.fail ? "checked" : ""} onchange="toggleFail('in',${i},this.checked)">
      FALLA
    </label>
  </div>
</div>
          <div class="grid grid-2">
            <div><label>Fuente</label><input list="dl-source" value="${esc(c.source)}" onchange="updIn(${i},'source',this.value)"></div>
            <div><label>Destino</label><input list="dl-destination" value="${esc(c.destination)}" onchange="updIn(${i},'destination',this.value)"></div>
            <div><label>Tipo de micro</label><input list="dl-mic" value="${esc(c.micType||'')}" onchange="updIn(${i},'micType',this.value)"></div>
            <div><label>Notas</label><input list="dl-notes" value="${esc(c.notes||'')}" onchange="updIn(${i},'notes',this.value)"></div>
          </div>
        </div>
      `).join("");
    }else{
      body.innerHTML = (s.returns||[]).map((r,i)=>`
        <div class="patch-card ${r.fail ? "is-fail" : ""}">
          <div class="patch-title">
  <span>Salida ${r.label}</span>
  <div style="display:flex; gap:6px; align-items:center; flex-wrap:wrap">
    <button type="button" class="icon-btn" onclick="copyChannel('out',${i})" title="Copiar contenido">📑</button>
<button type="button" class="icon-btn" onclick="pasteChannel('out',${i})" title="Pegar contenido">⬇</button>
<button type="button" class="icon-btn" onclick="clearChannel('out',${i})" title="Limpiar contenido">✖</button>
    <label class="fail-toggle" title="Marcar como en fallo/no disponible">
      <input type="checkbox" ${r.fail ? "checked" : ""} onchange="toggleFail('out',${i},this.checked)">
      FALLA
    </label>
  </div>
</div>
          <div class="grid grid-2">
            <div><label>Fuente</label><input list="dl-source" value="${esc(r.source)}" onchange="updOut(${i},'source',this.value)"></div>
            <div><label>Destino</label><input list="dl-destination" value="${esc(r.destination)}" onchange="updOut(${i},'destination',this.value)"></div>
            <div><label>Notas</label><input list="dl-notes" value="${esc(r.notes||'')}" onchange="updOut(${i},'notes',this.value)"></div>
          </div>
        </div>
      `).join("") || `<div class="small">Este subsnake no tiene salidas.</div>`;
    }
  }

  function updIn(i,k,v){
    if(isReadMode()) return;
    const s = snakes().find(x=>x.id===editorSnakeId); if(!s) return;
    snapshot("edit input");
    s.channels[i][k]=v;
    renderList(); renderSearchResults(); refreshDatalists(); renderSheetView();
  }
  function updOut(i,k,v){
    if(isReadMode()) return;
    const s = snakes().find(x=>x.id===editorSnakeId); if(!s) return;
    snapshot("edit output");
    s.returns[i][k]=v;
    renderList(); renderSearchResults(); refreshDatalists(); renderSheetView();
  }

  function toggleFail(kind, i, checked){
    if(isReadMode()) return;
    const s = snakes().find(x=>x.id===editorSnakeId); if(!s) return;
    snapshot("toggle fail");
    if(kind === "in"){
      if(s.channels[i]) s.channels[i].fail = !!checked;
    } else {
      if(s.returns?.[i]) s.returns[i].fail = !!checked;
    }
    renderEditorBody();
    renderList();
    renderSearchResults();
    renderSheetView();
  }
function copyChannel(kind, i){
  if(isReadMode()) return;
  const s = snakes().find(x=>x.id===editorSnakeId); 
  if(!s) return;

  const row = (kind === "in") ? s.channels?.[i] : s.returns?.[i];
  if(!row) return;

  const payload = {
    kind, // "in" o "out"
    data: {
      source: row.source || "",
      destination: row.destination || "",
      notes: row.notes || "",
      ...(kind === "in" ? { micType: row.micType || "" } : {})
    }
  };

  try{
    localStorage.setItem("stagepatch_clipboard_channel_v1", JSON.stringify(payload));
    alert(`Copiado ${kind==="in"?"entrada":"salida"} ${kind==="in"? (i+1) : (s.returns?.[i]?.label || i+1)}`);
  }catch{
    alert("No se pudo copiar.");
  }
}

function pasteChannel(kind, i){
  if(isReadMode()) return;
  const s = snakes().find(x=>x.id===editorSnakeId); 
  if(!s) return;

  let raw = null;
  try{ raw = localStorage.getItem("stagepatch_clipboard_channel_v1"); }catch{}
  if(!raw){ alert("No hay contenido copiado."); return; }

  let clip = null;
  try{ clip = JSON.parse(raw); }catch{ alert("Contenido copiado inválido."); return; }
  if(!clip?.data){ alert("Contenido copiado vacío."); return; }

  const row = (kind === "in") ? s.channels?.[i] : s.returns?.[i];
  if(!row) return;

  snapshot("paste channel content");
  row.source = clip.data.source || "";
  row.destination = clip.data.destination || "";
  row.notes = clip.data.notes || "";

  if(kind === "in"){
    row.micType = clip.data.micType || "";
  }

  renderEditorBody();
  renderList();
  renderSearchResults();
  refreshDatalists();
  renderSheetView();
}

function clearChannel(kind, i){
  if(isReadMode()) return;
  const s = snakes().find(x=>x.id===editorSnakeId); 
  if(!s) return;

  const row = (kind === "in") ? s.channels?.[i] : s.returns?.[i];
  if(!row) return;

  snapshot("clear channel content");
  row.source = "";
  row.destination = "";
  row.notes = "";
  if(kind === "in") row.micType = "";

  // dejamos FAIL como está (no lo tocamos)
  renderEditorBody();
  renderList();
  renderSearchResults();
  refreshDatalists();
  renderSheetView();
}
  function autoDestInputs(){
  if (isReadMode()) return;
  const s = snakes().find(x => x.id === editorSnakeId);
  if (!s) return;

  const toInt = (v) => {
    if (v === null || v === undefined) return null;
    const n = parseInt(String(v).trim(), 10);
    return Number.isFinite(n) ? n : null;
  };

  const prefix = ($("autoDestSystem")?.value || "RIO IN").trim();
if (!prefix) { alert("Prefijo inválido."); return; }

  const destStart = toInt(prompt("Número de destino inicial (ej: 1, 20, 40, 101):", "1"));
  if (destStart === null || destStart < 1) { alert("Destino inicial inválido."); return; }

  const chStart = toInt(prompt(`Canal INICIAL de manguera (1..${s.channels.length}):`, "1"));
  if (chStart === null || chStart < 1 || chStart > s.channels.length) {
    alert(`Canal inicial de manguera inválido. Debe ser 1..${s.channels.length}`);
    return;
  }

  const chEnd = toInt(prompt(`Canal FINAL de manguera (${chStart}..${s.channels.length}):`, String(s.channels.length)));
  if (chEnd === null || chEnd < chStart || chEnd > s.channels.length) {
    alert(`Canal final de manguera inválido. Debe ser ${chStart}..${s.channels.length}`);
    return;
  }

  snapshot("auto destination no-limit");

  let d = destStart;
  for (let ch = chStart; ch <= chEnd; ch++) {
    s.channels[ch - 1].destination = `${prefix} ${String(d).padStart(2, "0")}`;
    d++;
  }

  renderEditorBody();
  renderList();
  renderSearchResults();
  renderSheetView();
}

  function saveEditorMeta(){
    if(isReadMode()) return;
    const s = snakes().find(x=>x.id===editorSnakeId); if(!s) return;
    snapshot("edit snake meta");
    s.name = $("edName").value.trim() || s.name;
    s.zone = $("edZone").value.trim();
    s.color = $("edColor").value;
    renderList(); renderSearchResults(); refreshPrintSnakeSelect(); refreshSheetFilter(); renderSheetView();
  }

  function refreshPrintSnakeSelect(){
    const sel = $("printSnakeSelect");
    sel.innerHTML = snakes().map((s,i)=>`<option value="${s.id}">${i+1}. ${esc(s.name)}</option>`).join("");
  }

  function refreshSheetFilter(){
    const sel = $("sheetSnakeFilter");
    const current = sel.value;
    sel.innerHTML = `<option value="all">Todas las mangueras</option>` + snakes().map((s,i)=>`<option value="${s.id}">${i+1}. ${esc(s.name)}</option>`).join("");
    if([...sel.options].some(o=>o.value===current)) sel.value = current;
  }

  function renderSearchResults(){
    const q = $("search").value.trim().toLowerCase();
    const box = $("searchResults"), list = $("searchResultsList");
    if(!q){ box.style.display="none"; list.innerHTML=""; return; }

    const results = [];
    snakes().forEach((s,si)=>{
      (s.channels||[]).forEach((c,ci)=>{
        const t = [s.name,s.zone,c.channel,c.source,c.destination,c.micType,c.notes, c.fail?"falla":"ok"].join(" ").toLowerCase();
        if(t.includes(q)) results.push({type:"Entrada", snakeId:s.id, snakeIndex:si+1, snake:s.name, zone:s.zone||"—", ch:c.channel, source:c.source||"—", destination:c.destination||"—", mic:c.micType||"—", notes:c.notes||"—", fail:!!c.fail});
      });
      (s.returns||[]).forEach((r,ri)=>{
        const t = [s.name,s.zone,r.label,r.source,r.destination,r.notes, r.fail?"falla":"ok"].join(" ").toLowerCase();
        if(t.includes(q)) results.push({type:"Salida", snakeId:s.id, snakeIndex:si+1, snake:s.name, zone:s.zone||"—", ch:r.label, source:r.source||"—", destination:r.destination||"—", mic:"—", notes:r.notes||"—", fail:!!r.fail});
      });
    });

    box.style.display = "block";
    if(!results.length){ list.innerHTML = `<div class="small">Sin resultados para "${esc(q)}".</div>`; return; }

    list.innerHTML = results.map(r=>`
      <div class="result-item">
        <div class="result-top">
          <div><span class="badge">${r.type}</span> <strong>${esc(r.snake)}</strong> <span class="small">(#${r.snakeIndex})</span></div>
          <div class="row" style="min-width:220px">
            <button onclick="openSnakeAndTab('${r.snakeId}','${r.type==='Entrada'?'inputs':'outputs'}')">Abrir</button>
          </div>
        </div>
        <div class="result-grid">
          <div><div class="k">Zona / Canal</div><div class="v">${esc(r.zone)} / ${esc(String(r.ch))}</div></div>
          <div><div class="k">Fuente → Destino</div><div class="v">${esc(r.source)} → ${esc(r.destination)}</div></div>
          <div><div class="k">Mic</div><div class="v">${esc(r.mic)}</div></div>
          <div><div class="k">Notas</div><div class="v">${esc(r.notes)} ${r.fail ? " · ⚠️ FALLA" : ""}</div></div>
        </div>
      </div>
    `).join("");
  }

  function toStagepatch(){
    return {
      app: "barstage-patch",
      schemaVersion: STAGEPATCH_SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      show: appData.show,
      snakes: appData.snakes
    };
  }

  function validateStagepatch(obj){
    if(!obj || typeof obj !== "object") throw new Error("Archivo inválido.");
    if(!Array.isArray(obj.snakes)) throw new Error("Falta lista de subsnakes.");
    if(obj.schemaVersion && obj.schemaVersion > STAGEPATCH_SCHEMA_VERSION){
      throw new Error("Versión no compatible todavía.");
    }
  }

  function downloadFile(filename, content, mime){
  const blob = new Blob([content], { type: mime || "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

async function saveStagepatchFile(){
  try{
    const payload = JSON.stringify(toStagepatch(), null, 2);
    const base = (appData.show.name || "show").replace(/[^\w\-]+/g, "_");
    const filename = `${base}${STAGEPATCH_EXT}`;

    // Intentar "Guardar como..." si el navegador lo soporta
    if (typeof window.showSaveFilePicker === "function") {
      try{
        const handle = await window.showSaveFilePicker({
          suggestedName: filename,
          types: [{
            description: "Stagepatch file",
            accept: {
              [STAGEPATCH_MIME]: [STAGEPATCH_EXT],
              "application/json": [".json"]
            }
          }]
        });

        const writable = await handle.createWritable();
        await writable.write(payload);
        await writable.close();
        alert("Archivo guardado correctamente.");
        return;
      }catch(e){
        // Si cancela el diálogo, salir sin error
        if (e?.name === "AbortError") return;
        console.warn("showSaveFilePicker falló; usando descarga normal.", e);
      }
    }

    // Fallback universal: descarga normal
    downloadFile(filename, payload, STAGEPATCH_MIME);
    alert("Archivo descargado en Descargas.");
  }catch(err){
    console.error(err);
    alert("Error al guardar: " + (err?.message || err));
  }
}

  function importStagepatchFile(){
    const input = document.createElement("input");
    input.type = "file"; input.accept = `${STAGEPATCH_EXT},application/json,${STAGEPATCH_MIME}`;
    input.onchange = async ()=>{
      const f = input.files?.[0]; if(!f) return;
      try{
        const txt = await f.text();
        const obj = JSON.parse(txt);
        validateStagepatch(obj);
        snapshot("import stagepatch");
        appData = { show: obj.show || {name:"",artist:"",date:""}, snakes: obj.snakes || [] };
        normalize();
        refreshShowInputs(); updateShowBadge(); renderList(); renderSearchResults(); refreshPrintSnakeSelect(); refreshDatalists(); refreshSheetFilter(); renderSheetView();
        autosaveNow();
        alert("Archivo cargado correctamente.");
      }catch(e){
        alert("No se pudo importar: " + (e?.message || e));
      }
    };
    input.click();
  }

  function clearAll(){
    if(isReadMode()) return;
    if(!confirm("Esto borrará TODO en esta sesión. ¿Continuar?")) return;
    snapshot("clear all");
    appData = { show:{name:"",artist:"",date:""}, snakes:[] };
    refreshShowInputs(); updateShowBadge(); renderList(); renderSearchResults(); refreshPrintSnakeSelect(); refreshDatalists(); refreshSheetFilter(); renderSheetView();
  }

  function refreshShowInputs(){
    $("showName").value = appData.show.name || "";
    $("artistName").value = appData.show.artist || "";
    $("showDate").value = appData.show.date || "";
  }

  function enterApp(){
    $("welcomeScreen").classList.add("hidden");
    $("appRoot").classList.remove("hidden");
  }

  function loadLastBackupAndEnter(){
    const data = readBackup();
    if(!data){ alert("No hay backup local."); return; }
    appData = deepClone(data.payload);
    normalize();
    refreshShowInputs(); updateShowBadge(); renderList(); renderSearchResults(); refreshPrintSnakeSelect(); refreshDatalists(); refreshSheetFilter(); renderSheetView();
    enterApp();
  }
  function loadFileFromWelcome(){
    const input = document.createElement("input");
    input.type = "file";
    input.accept = `${STAGEPATCH_EXT},application/json,${STAGEPATCH_MIME}`;
    input.onchange = async ()=>{
      const f = input.files?.[0]; if(!f) return;
      try{
        const txt = await f.text();
        const obj = JSON.parse(txt);
        validateStagepatch(obj);
        appData = { show: obj.show || {name:"",artist:"",date:""}, snakes: obj.snakes || [] };
        normalize();
        refreshShowInputs(); updateShowBadge(); renderList(); renderSearchResults(); refreshPrintSnakeSelect(); refreshDatalists(); refreshSheetFilter(); renderSheetView();
        autosaveNow();
        enterApp();
      }catch(e){
        alert("No se pudo cargar: " + (e?.message || e));
      }
    };
    input.click();
  }

  function formatDatePretty(iso){
    if(!iso) return "—";
    const d = new Date(iso);
    if(Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString();
  }

  function groupRowsForSnake(s){
    const inRows = (s.channels||[]).map(c=>({
      kind:"Entrada", ch:c.channel, source:c.source||"—", destination:c.destination||"—", mic:c.micType||"—", notes:c.notes||"—", fail:!!c.fail
    }));
    const outRows = (s.returns||[]).map(r=>({
      kind:"Salida", ch:r.label, source:r.source||"—", destination:r.destination||"—", mic:"—", notes:r.notes||"—", fail:!!r.fail
    }));
    return [...inRows, ...outRows];
  }

  function renderSheetView(){
    const wrap = $("sheetContainer");
    if(viewMode !== "read"){ wrap.innerHTML = ""; return; }

    const filter = $("sheetSnakeFilter").value || "all";
    const list = (filter === "all") ? snakes() : snakes().filter(s=>s.id===filter);

    if(!list.length){
      wrap.innerHTML = `<div class="card"><div class="small">No hay datos para mostrar.</div></div>`;
      return;
    }

    wrap.innerHTML = list.map((s, idx)=>{
      const rows = groupRowsForSnake(s);
      const rowsHtml = rows.map(r=>`
        <tr class="${r.fail ? "sheet-row-fail" : ""}">
          <td>${esc(r.kind)}</td>
          <td class="mono">${esc(String(r.ch))}</td>
          <td>${esc(r.source)}</td>
          <td>${esc(r.destination)}</td>
          <td>${esc(r.mic)}</td>
          <td>${esc(r.notes)}</td>
          <td>${r.fail ? "⚠️ FALLA" : "OK"}</td>
        </tr>
      `).join("");

      return `
        <div class="sheet-group">
          <div class="sheet-head">
            <span style="display:inline-block;width:12px;height:12px;border-radius:999px;background:${s.color};border:1px solid rgba(255,255,255,.35)"></span>
            <span>${idx+1}. ${esc(s.name)}</span>
            <span class="sheet-meta">· ${s.channelsCount} IN + ${s.returnsCount} OUT ${s.zone ? "· " + esc(s.zone) : ""}</span>
          </div>
          <div class="table-wrap">
            <table class="sheet-table">
              <thead>
                <tr>
                  <th>Tipo</th><th>Canal</th><th>Fuente</th><th>Destino</th><th>Mic</th><th>Notas</th><th>Estado</th>
                </tr>
              </thead>
              <tbody>${rowsHtml}</tbody>
            </table>
          </div>
        </div>
      `;
    }).join("");
  }

  function buildPrintHTML(snakesToPrint){
    const s = appData.show;
    const header = `
      <div style="margin-bottom:10px">
        <div style="font-size:14px;font-weight:700">Barstage Patch</div>
        <div class="muted">Show: ${esc(s.name||"Sin definir")} · Artista: ${esc(s.artist||"—")} · Fecha: ${esc(s.date||"—")}</div>
      </div>
    `;

    const blocks = snakesToPrint.map((sn, idx)=>{
      const rows = groupRowsForSnake(sn).map(r=>`
        <tr class="${r.fail ? "print-row-fail" : ""}">
          <td>${esc(r.kind)}</td>
          <td>${esc(String(r.ch))}</td>
          <td>${esc(r.source)}</td>
          <td>${esc(r.destination)}</td>
          <td>${esc(r.mic)}</td>
          <td>${esc(r.notes)}</td>
          <td>${r.fail ? "FALLA" : "OK"}</td>
        </tr>
      `).join("");

      return `
        <section class="print-snake" style="--snake-color:${sn.color}">
          <h3>${idx+1}. ${esc(sn.name)} <span class="muted">(${sn.channelsCount} IN + ${sn.returnsCount} OUT${sn.zone ? " · " + esc(sn.zone) : ""})</span></h3>
          <table class="print-table">
            <thead>
              <tr><th>Tipo</th><th>Canal</th><th>Fuente</th><th>Destino</th><th>Mic</th><th>Notas</th><th>Estado</th></tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </section>
      `;
    }).join("");

    return `<div class="print-page">${header}${blocks}</div>`;
  }

  function printNow(){
    const mode = $("printMode").value;
    let list = snakes();
    if(mode === "one"){
      const id = $("printSnakeSelect").value;
      list = snakes().filter(s=>s.id===id);
    }
    if(!list.length){ alert("No hay subsnake(s) para imprimir."); return; }
    $("printView").innerHTML = buildPrintHTML(list);
    window.print();
  }

  const installState = { deferredPrompt:null };

  window.addEventListener("beforeinstallprompt", (e)=>{
    e.preventDefault();
    installState.deferredPrompt = e;
    $("btnInstallApp").classList.remove("hidden");
  });

  $("btnInstallApp").addEventListener("click", async ()=>{
    const p = installState.deferredPrompt;
    if(!p){ alert("Instalación no disponible todavía."); return; }
    p.prompt();
    await p.userChoice;
    installState.deferredPrompt = null;
    $("btnInstallApp").classList.add("hidden");
  });

  window.addEventListener("appinstalled", ()=>{
    $("btnInstallApp").classList.add("hidden");
  });
async function shareApp(){
  const shareUrl = location.href; // o tu URL fija publicada
  const shareData = {
    title: "Barstage Patch",
    text: "Te comparto Barstage Patch para organizar mangueras de escenario.",
    url: shareUrl
  };

  try{
    if(navigator.share){
      await navigator.share(shareData);
      return;
    }

    if(navigator.clipboard?.writeText){
      await navigator.clipboard.writeText(shareUrl);
      alert("Link copiado al portapapeles.");
      return;
    }

    prompt("Copia este link:", shareUrl);
  }catch(e){
    // si cancela, no molestamos
    if(e?.name !== "AbortError"){
      alert("No se pudo compartir.");
    }
  }
}
async function shareReadView(){
  try{
    const filter = $("sheetSnakeFilter")?.value || "all";

    const payload = {
      v: 1,
      mode: "read",
      snake: filter,
      data: appData
    };

    const encoded = encodeURIComponent(JSON.stringify(payload));
    const url = `${location.origin}${location.pathname}?share=${encoded}`;

    if(navigator.share){
      await navigator.share({
        title: "Barstage Patch - Vista lectura",
        text: "Te comparto la vista del patch.",
        url
      });
      return;
    }

    if(navigator.clipboard?.writeText){
      await navigator.clipboard.writeText(url);
      alert("Link de vista copiado.");
      return;
    }

    prompt("Copia este link:", url);
  }catch(e){
    if(e?.name !== "AbortError"){
      alert("No se pudo compartir.");
    }
  }
}
  function bind(){
  $("btnNewShow")?.addEventListener("click", ()=>{ enterApp(); });
  $("btnLoadLast")?.addEventListener("click", loadLastBackupAndEnter);
  $("btnLoadFile")?.addEventListener("click", loadFileFromWelcome);

  $("btnShareApp")?.addEventListener("click", shareApp);

  $("saveShowMeta")?.addEventListener("click", saveShowMeta);
  $("createSnake")?.addEventListener("click", createSnake);
  $("search")?.addEventListener("input", ()=>{ renderList(); renderSearchResults(); });
  $("saveStagepatch")?.addEventListener("click", saveStagepatchFile);
  $("importStagepatch")?.addEventListener("click", importStagepatchFile);
  $("clearAll")?.addEventListener("click", clearAll);
  $("printBtn")?.addEventListener("click", printNow);
  $("quickPrint")?.addEventListener("click", printNow);
  $("quickNew")?.addEventListener("click", ()=>window.scrollTo({top:0, behavior:"smooth"}));
  $("closeEditor")?.addEventListener("click", closeEditor);
  $("tabInputs")?.addEventListener("click", ()=>setTab("inputs"));
  $("tabOutputs")?.addEventListener("click", ()=>setTab("outputs"));
  $("autoDestBtn")?.addEventListener("click", autoDestInputs);
  $("edName")?.addEventListener("change", saveEditorMeta);
  $("edZone")?.addEventListener("change", saveEditorMeta);
  $("edColor")?.addEventListener("change", saveEditorMeta);

  $("toggleReadMode")?.addEventListener("click", toggleMode);
  $("sheetSnakeFilter")?.addEventListener("change", renderSheetView);
  $("sheetPrintBtn")?.addEventListener("click", ()=>window.print());
  $("sheetShareBtn")?.addEventListener("click", shareReadView);

  $("printMode")?.addEventListener("change", ()=>{
    if ($("printSnakeSelect") && $("printMode")) {
      $("printSnakeSelect").disabled = $("printMode").value !== "one";
    }
  });

  $("undoBtn")?.addEventListener("click", undo);
  $("redoBtn")?.addEventListener("click", redo);

  document.addEventListener("keydown", (e)=>{
    if(e.key === "Escape" && $("editor")?.classList.contains("open")) closeEditor();
    if((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === "z"){ e.preventDefault(); undo(); }
    if(((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") || ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "z")){ e.preventDefault(); redo(); }
  });
}

  
normalize();

const qp = new URLSearchParams(location.search);
const sharedParam = qp.get("share");
const forceReadFromLink = !!sharedParam;

if (sharedParam) {
  try{
    const payload = JSON.parse(decodeURIComponent(sharedParam));

    if(payload?.data && Array.isArray(payload.data.snakes)){
      appData = payload.data;
      normalize();
    }

    enterApp();
    viewMode = "read";
    sharedReadOnly = true;
  }catch(err){
    console.warn("Link compartido inválido", err);
  }
}

if (forceReadFromLink) {
  enterApp();
  viewMode = "read";
  sharedReadOnly = true;
}

bind();
refreshShowInputs();
updateShowBadge();
renderList();
renderSearchResults();
refreshPrintSnakeSelect();
refreshDatalists();
refreshSheetFilter();

if (!forceReadFromLink) {
  loadModePref();
} else {
  applyModeUI();
}

renderSheetView();

if (forceReadFromLink) {
  const snake = qp.get("snake");
  if (snake && $("sheetSnakeFilter")) {
    $("sheetSnakeFilter").value = snake;
    renderSheetView();
  }
}

updateUndoRedoButtons();
refreshWelcomeLastInfo();
setInterval(autosaveNow, 10000);

if (!forceReadFromLink) {
  loadModePref(); // modo normal guardado local
} else {
  applyModeUI();  // aplica modo lectura forzado
}

renderSheetView();

if (forceReadFromLink) {
  const snake = qp.get("snake");
  if (snake && $("sheetSnakeFilter")) {
    $("sheetSnakeFilter").value = snake;
    renderSheetView();
  }
}

updateUndoRedoButtons();
refreshWelcomeLastInfo();
setInterval(autosaveNow, 10000);


  // ===== Rider PDF (IndexedDB) =====
  const RIDER_DB_NAME = "barstage_rider_db";
  const RIDER_STORE = "files";
  const RIDER_KEY = "current_rider_pdf";
  let riderObjectURL = null;

  function openRiderDB(){
    return new Promise((resolve, reject)=>{
      const req = indexedDB.open(RIDER_DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if(!db.objectStoreNames.contains(RIDER_STORE)){
          db.createObjectStore(RIDER_STORE);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function riderSet(blob){
    const db = await openRiderDB();
    await new Promise((resolve, reject)=>{
      const tx = db.transaction(RIDER_STORE, "readwrite");
      tx.objectStore(RIDER_STORE).put(blob, RIDER_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  }

  async function riderGet(){
    const db = await openRiderDB();
    const val = await new Promise((resolve, reject)=>{
      const tx = db.transaction(RIDER_STORE, "readonly");
      const req = tx.objectStore(RIDER_STORE).get(RIDER_KEY);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return val;
  }

  async function riderRemove(){
    const db = await openRiderDB();
    await new Promise((resolve, reject)=>{
      const tx = db.transaction(RIDER_STORE, "readwrite");
      tx.objectStore(RIDER_STORE).delete(RIDER_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  }

  function setRiderStatus(msg){
    const el = $("riderStatus");
    if(el) el.textContent = msg;
  }

  async function refreshRiderStatus(){
    try{
      const b = await riderGet();
      if(b){
        const kb = Math.round((b.size || 0)/1024);
        setRiderStatus(`Rider: cargado (${kb} KB)`);
      } else {
        setRiderStatus("Rider: no cargado");
      }
    }catch{
      setRiderStatus("Rider: error");
    }
  }

  async function uploadRiderPDF(){
    const i = document.createElement("input");
    i.type = "file";
    i.accept = "application/pdf,.pdf";
    i.onchange = async ()=>{
      const f = i.files?.[0];
      if(!f) return;
      if(f.type !== "application/pdf" && !f.name.toLowerCase().endsWith(".pdf")){
        alert("Selecciona un archivo PDF válido.");
        return;
      }
      try{
        await riderSet(f);
        await refreshRiderStatus();
        alert("Rider PDF cargado correctamente.");
      }catch(e){
        alert("No se pudo guardar el Rider: " + (e?.message || e));
      }
    };
    i.click();
  }

  async function openRiderViewer(){
  try{
    const b = await riderGet();
    if(!b){
      alert("No hay Rider cargado. Pulsa 'Cargar Rider PDF'.");
      return;
    }

    // Limpia URL previa
    if(riderObjectURL) URL.revokeObjectURL(riderObjectURL);
    riderObjectURL = URL.createObjectURL(b);

    const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);

    if(isMobile){
      // Móvil: abrir fuera del iframe (más compatible)
      const a = document.createElement("a");
      a.href = riderObjectURL;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      document.body.appendChild(a);
      a.click();
      a.remove();

      // fallback descarga por si no abre visor
      // no abrimos modal en móvil
      return;
    }

    // PC: mantener tu modal con iframe
    $("riderFrame").src = riderObjectURL;
    $("riderModal").classList.add("open");

  }catch(e){
    alert("No se pudo abrir el Rider: " + (e?.message || e));
  }
}

  function closeRiderViewer(){
    $("riderModal").classList.remove("open");
    $("riderFrame").src = "about:blank";
    if(riderObjectURL){
      URL.revokeObjectURL(riderObjectURL);
      riderObjectURL = null;
    }
  }

  async function removeRiderPDF(){
    if(!confirm("¿Quitar Rider guardado?")) return;
    try{
      await riderRemove();
      closeRiderViewer();
      await refreshRiderStatus();
      alert("Rider eliminado.");
    }catch(e){
      alert("No se pudo eliminar: " + (e?.message || e));
    }
  }

  $("uploadRiderBtn")?.addEventListener("click", uploadRiderPDF);
  $("viewRiderBtn")?.addEventListener("click", openRiderViewer);
  $("removeRiderBtn")?.addEventListener("click", removeRiderPDF);
  $("closeRiderBtn")?.addEventListener("click", closeRiderViewer);

  document.addEventListener("keydown", (e)=>{
    if(e.key === "Escape" && $("riderModal")?.classList.contains("open")){
      closeRiderViewer();
    }
  });

  refreshRiderStatus();

  // ===== Back button handling (Android PWA) - cerrar UI + doble atrás =====
  let backArmedUntil = 0;

  function pushAppState(tag = "app") {
    try { history.pushState({ appState: tag }, "", location.href); } catch {}
  }

  function showBackToast(msg = "Pulsa atrás otra vez para salir") {
    let t = document.getElementById("backToast");
    if (!t) {
      t = document.createElement("div");
      t.id = "backToast";
      Object.assign(t.style, {
        position: "fixed", left: "50%", bottom: "22px", transform: "translateX(-50%)",
        background: "rgba(10,16,32,.95)", color: "#eef3ff", border: "1px solid #3b4f88",
        borderRadius: "999px", padding: "8px 14px", fontSize: "13px", zIndex: "9999",
        boxShadow: "0 8px 24px rgba(0,0,0,.35)", opacity: "0", transition: "opacity .18s ease"
      });
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.style.opacity = "1";
    clearTimeout(t._hideTimer);
    t._hideTimer = setTimeout(() => { t.style.opacity = "0"; }, 900);
  }

  pushAppState("root");

  window.addEventListener("popstate", () => {
    const now = Date.now();

    if ($("riderModal")?.classList.contains("open")) {
      closeRiderViewer();
      pushAppState("after-rider-close");
      backArmedUntil = 0;
      return;
    }

    if ($("editor")?.classList.contains("open")) {
      closeEditor();
      pushAppState("after-editor-close");
      backArmedUntil = 0;
      return;
    }

    const q = $("search");
    if (q && q.value.trim() !== "") {
      q.value = "";
      renderList();
      renderSearchResults();
      pushAppState("after-clear-search");
      backArmedUntil = 0;
      return;
    }

    if (viewMode === "read") {
      toggleMode();
      pushAppState("after-read-mode");
      backArmedUntil = 0;
      return;
    }

    if (now < backArmedUntil) {
      return;
    }

    backArmedUntil = now + 1200;
    showBackToast("Pulsa atrás otra vez para salir");
    pushAppState("armed-exit");
  });
let wakeLock = null;

async function enableWakeLock() {
  try {
    if (!("wakeLock" in navigator)) return;
    if (wakeLock) return; // evita pedir otro lock si ya existe
    wakeLock = await navigator.wakeLock.request("screen");
    console.log("Wake Lock activo");

    wakeLock.addEventListener("release", () => {
      console.log("Wake Lock liberado");
      wakeLock = null;
    });
  } catch (err) {
    console.warn("Wake Lock no disponible:", err?.message || err);
  }
}

async function disableWakeLock() {
  try {
    if (wakeLock) {
      await wakeLock.release();
      wakeLock = null;
    }
  } catch {}
}

// Re-activar al volver a la app (Android lo suelta al apagar pantalla/cambiar app)
document.addEventListener("visibilitychange", async () => {
  if (document.visibilityState === "visible") {
    await enableWakeLock();
  } else {
    await disableWakeLock();
  }
});

// Activar al iniciar
window.addEventListener("load", enableWakeLock);
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./sw.js").then(() => {
        console.log("SW registrado");
      }).catch(console.error);
    });
  }
