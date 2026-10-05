// App Engine for Marvel Transportes Anomaly Checklist

function getMarvelData() {
  if (window.MarvelData) return window.MarvelData;
  return {
    INITIAL_STAGES: [],
    INITIAL_ATENDIMENTOS: [],
    MOCK_OPERATORS: ["João", "Alexandre", "Nathali", "Yuri", "Eduardo"]
  };
}

function getApiBaseUrl() {
  if (typeof window !== 'undefined' && window.location.protocol === 'file:') {
    return 'http://localhost:18080';
  }
  return '';
}

// Application State
let state = {
  atendimentos: [],
  allServerAtendimentos: [],
  activeTicketId: null,
  selectedStageId: 1,
  activeOperator: (typeof sessionStorage !== 'undefined' && sessionStorage.getItem("marvel_operator_name")) || (typeof localStorage !== 'undefined' && localStorage.getItem("marvel_operator_name")) || "",
  loginErrorMsg: "",
  soundEnabled: true,
  viewTab: "ongoing", // "ongoing" | "history"
  historySearchQuery: "",
  isResetConfirmOpen: false,
  isCloseConfirmOpen: false,
  isDeleteConfirmOpen: false,
  ticketIdToClose: null,
  ticketIdToDelete: null,
  isImportModalOpen: false,
  isNewTicketModalOpen: false,
  isShareModalOpen: false,
  isFetchModalOpen: false,
  shareModalTicketId: null,
  fetchModalInputError: "",
  copyToastMessage: "",
  importedToastBanner: false,
  showResetToast: false,
  showSuccessToast: false,
  successToastMessage: "",
  showEmailErrorToast: false,
  emailErrorMessage: "",
  importFormData: {
    protocolo: "",
    frota: "",
    contato: "",
    observacao: "",
    notaDevolucao: "",
    notaOrigem: ""
  },
  importFormError: "",
  newTicketFormData: {
    protocolo: "",
    condutor: "",
    frota: "",
    contato: "",
    cliente: ""
  },
  newTicketFormError: ""
};

// Web Audio API Synth Feedback
function playClickSound(isCheck) {
  if (!state.soundEnabled) return;
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.type = isCheck ? 'sine' : 'triangle';
    osc.frequency.setValueAtTime(isCheck ? 587.33 : 329.63, ctx.currentTime);
    if (isCheck) {
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.08);
    }
    
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.09);
    
    osc.connect(gain);
    gain.connect(ctx.destination);
    
    osc.start();
    osc.stop(ctx.currentTime + 0.1);
  } catch (e) {
    // Ignore audio context errors
  }
}

function sanitizeTicket(ticket) {
  if (!ticket) return null;
  ticket.id = ticket.id || ("000" + Math.floor(Math.random() * 89999 + 10000));
  ticket.completedTasks = ticket.completedTasks || {};
  ticket.flags = ticket.flags || {};
  ticket.auditLog = ticket.auditLog || [];
  ticket.productPhotos = ticket.productPhotos || [];
  ticket.cabinPhotos = ticket.cabinPhotos || [];
  ticket.carregamentoPhotos = ticket.carregamentoPhotos || [];
  ticket.fotoFinalPhotos = ticket.fotoFinalPhotos || [];
  ticket.docChoice = ticket.docChoice || null;
  ticket.directionChoice = ticket.directionChoice || null;
  ticket.currentStageId = ticket.currentStageId || 1;
  ticket.status = ticket.status || "Em andamento";
  return ticket;
}

// Load and Initialize State
// Load and Initialize State
async function initApp() {
  try {
    const data = getMarvelData();
    const INITIAL_ATENDIMENTOS = data.INITIAL_ATENDIMENTOS || [];
    const MOCK_OPERATORS = data.MOCK_OPERATORS || ["João", "Alexandre", "Nathali", "Yuri", "Eduardo"];

    // 1. Fetch shared tickets from server REST API
    let serverAtendimentos = [];
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 1500);
      const res = await fetch("/api/checklists", { signal: controller.signal });
      clearTimeout(timeoutId);
      if (res.ok) {
        serverAtendimentos = await res.json();
      }
    } catch (e) {}

    // 2. Load from localStorage
    let localAtendimentos = [];
    const saved = localStorage.getItem("marvel_checklist_state_v9");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        localAtendimentos = parsed.atendimentos || [];
        if (parsed.activeOperator && parsed.activeOperator.trim()) {
          state.activeOperator = parsed.activeOperator.trim();
        }
      } catch (e) {}
    }
    const sessionOp = sessionStorage.getItem("marvel_operator_name") || localStorage.getItem("marvel_operator_name");
    if (sessionOp && sessionOp.trim()) {
      state.activeOperator = sessionOp.trim();
    }

    // 3. Cache all known historical / server tickets
    const mergedMap = new Map();
    INITIAL_ATENDIMENTOS.forEach(t => { if (t) mergedMap.set(t.id, sanitizeTicket(t)); });
    localAtendimentos.forEach(t => { if (t) mergedMap.set(t.id, sanitizeTicket(t)); });
    (serverAtendimentos || []).forEach(t => { if (t) mergedMap.set(t.id, sanitizeTicket(t)); });

    state.allServerAtendimentos = Array.from(mergedMap.values()).map(sanitizeTicket);

    // Initial session launch starts with 0 ongoing atendimentos presented on screen
    state.atendimentos = [];
    state.activeTicketId = null;

    // 4. Check URL parameter (?checklist=ID or ?c=ID) or Hash (#/checklist/ID)
    const urlParams = new URLSearchParams(window.location.search);
    let urlChecklistId = urlParams.get('checklist') || urlParams.get('c');
    if (!urlChecklistId && window.location.hash) {
      const hashParts = window.location.hash.split('/');
      if (hashParts.length >= 3 && hashParts[1] === 'checklist') {
        urlChecklistId = hashParts[2];
      }
    }

    if (urlChecklistId) {
      const found = state.allServerAtendimentos.find(t => t.id === urlChecklistId || t.protocolo === urlChecklistId);
      if (found) {
        state.atendimentos = [found];
        state.activeTicketId = found.id;
        state.importedToastBanner = true;
      }
    }

    let ticket = getActiveTicket();
    if (ticket) {
      state.selectedStageId = ticket.currentStageId || getFirstIncompleteStageId(ticket);
    }

    renderApp();
  } catch (err) {
    console.error("Critical error in initApp:", err);
    renderApp();
  }
}

function saveState() {
  localStorage.setItem("marvel_checklist_state_v9", JSON.stringify({
    atendimentos: state.atendimentos,
    activeTicketId: state.activeTicketId,
    activeOperator: state.activeOperator
  }));

  // Sync state.atendimentos merged with state.allServerAtendimentos so server database is preserved
  try {
    const serverMap = new Map();
    (state.allServerAtendimentos || []).forEach(t => { if (t && t.id) serverMap.set(t.id, t); });
    (state.atendimentos || []).forEach(t => { if (t && t.id) serverMap.set(t.id, t); });

    const mergedToSave = Array.from(serverMap.values());
    state.allServerAtendimentos = mergedToSave;

    fetch("/api/checklists", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(mergedToSave)
    }).catch(() => {});
  } catch (e) {}
}

function getActiveTicket() {
  let found = state.atendimentos.find(t => t.id === state.activeTicketId);
  if (!found && state.activeTicketId && state.allServerAtendimentos) {
    found = state.allServerAtendimentos.find(t => t.id === state.activeTicketId);
    if (found && !state.atendimentos.some(t => t.id === found.id)) {
      state.atendimentos.push(found);
    }
  }
  return found;
}

// Helper: Check if Stage is Bypassed / Not Applicable
function isStageBypassed(ticket, stageId) {
  return false; // All 5 stages are applicable
}

// Helper: Check Stage Required Tasks Completion
function isStageCompleted(ticket, stageId) {
  if (!ticket) return false;
  const data = getMarvelData();
  const stage = (data.INITIAL_STAGES || []).find(s => s.id === stageId);
  if (!stage) return false;

  // Stage 1: Recebimento
  if (stageId === 1) {
    for (const task of stage.tasks) {
      if (!ticket.completedTasks || !ticket.completedTasks[task.id]) return false;
    }
    return true;
  }

  // Stage 2: Documentação (Doc Choice: Parcial vs Total)
  if (stageId === 2) {
    if (!ticket.docChoice) return false;
    const selectedOpt = (stage.options || []).find(o => o.id === ticket.docChoice);
    if (!selectedOpt) return false;
    for (const task of selectedOpt.tasks) {
      if (!ticket.completedTasks || !ticket.completedTasks[task.id]) return false;
    }
    return true;
  }

  // Stage 3: Registros de Imagens
  if (stageId === 3) {
    for (const task of stage.tasks) {
      if (!ticket.completedTasks || !ticket.completedTasks[task.id]) return false;
    }
    return true;
  }

  // Stage 4: Direcionamento da Devolução (Direction Choice: A definir fornecedor vs Alocar em cabine)
  if (stageId === 4) {
    if (!ticket.directionChoice) return false;
    const selectedOpt = (stage.options || []).find(o => o.id === ticket.directionChoice);
    if (!selectedOpt) return false;
    for (const task of selectedOpt.tasks) {
      if (!ticket.completedTasks || !ticket.completedTasks[task.id]) return false;
    }
    if (selectedOpt.subsection) {
      for (const subTask of selectedOpt.subsection.tasks) {
        if (!ticket.completedTasks || !ticket.completedTasks[subTask.id]) return false;
      }
    }
    return true;
  }

  // Stage 5: Conferência e Lançamentos
  if (stageId === 5) {
    const tasks = ticket.directionChoice === "alocar_cabine" ? stage.tasksCabine : stage.tasksGeneral;
    if (!tasks) return false;
    for (const task of tasks) {
      if (!ticket.completedTasks || !ticket.completedTasks[task.id]) return false;
    }
    return true;
  }

  return true;
}

// Get active task list for a stage based on ticket choices
function getStageTasksForTicket(ticket, stage) {
  if (!ticket || !stage) return [];
  if (stage.id === 1 || stage.id === 3) {
    return stage.tasks || [];
  }
  if (stage.id === 2) {
    if (!ticket.docChoice) return [];
    const opt = (stage.options || []).find(o => o.id === ticket.docChoice);
    return opt ? (opt.tasks || []) : [];
  }
  if (stage.id === 4) {
    if (!ticket.directionChoice) return [];
    const opt = (stage.options || []).find(o => o.id === ticket.directionChoice);
    if (!opt) return [];
    const optTasks = opt.tasks || [];
    const subTasks = opt.subsection?.tasks || [];
    return [...optTasks, ...subTasks];
  }
  if (stage.id === 5) {
    const isCabine = ticket.directionChoice === "alocar_cabine";
    return isCabine ? (stage.tasksCabine || []) : (stage.tasksGeneral || []);
  }
  return stage.tasks || [];
}

// Check Stage Unlock Status (Strict Sequential 1..5)
function isStageUnlocked(ticket, stageId) {
  if (stageId === 1) return true;
  return isStageCompleted(ticket, stageId - 1);
}

function getNextNonBypassedStageId(ticket, currentStageId) {
  return currentStageId < 5 ? currentStageId + 1 : 5;
}

function getFirstIncompleteStageId(ticket) {
  for (let i = 1; i <= 5; i++) {
    if (!isStageCompleted(ticket, i)) return i;
  }
  return 5;
}

// Calculate Overall Progress % (5 Total Stages)
function calculateOverallProgress(ticket) {
  if (!ticket) return { count: 0, total: 5, percent: 0 };
  let completedStages = 0;
  for (let i = 1; i <= 5; i++) {
    if (isStageCompleted(ticket, i)) completedStages++;
  }
  const percent = Math.round((completedStages / 5) * 100);
  return { count: completedStages, total: 5, percent };
}

// Check if Checklist is 100% Completed
function isChecklist100PercentCompleted(ticket) {
  if (!ticket) return false;
  const overall = calculateOverallProgress(ticket);
  return overall.percent === 100;
}

// Select Choice in Stage 2 (Documentação)
function selectStage2DocChoice(choiceId, choiceTitle) {
  const ticket = getActiveTicket();
  if (!ticket) return;
  if (ticket.status === "Concluído") return;

  const timestamp = new Date().toLocaleTimeString('pt-BR');
  const dateStamp = new Date().toLocaleDateString('pt-BR');

  ticket.docChoice = choiceId;

  const logEntry = {
    id: "log_" + Date.now(),
    text: `🔀 Opção na Etapa 02 selecionada: '${choiceTitle}'`,
    user: state.activeOperator,
    at: `${dateStamp} ${timestamp}`,
    stage: "02. Documentação"
  };
  ticket.auditLog = [logEntry, ...(ticket.auditLog || [])];

  playClickSound(true);

  if (isStageCompleted(ticket, 2) && state.selectedStageId === 2) {
    state.selectedStageId = 3;
    ticket.currentStageId = 3;
  }

  saveState();
  renderApp();
}

// Select Choice in Stage 4 (Direcionamento da Devolução)
function selectStage4DirectionChoice(choiceId, choiceTitle) {
  const ticket = getActiveTicket();
  if (!ticket) return;
  if (ticket.status === "Concluído") return;

  const timestamp = new Date().toLocaleTimeString('pt-BR');
  const dateStamp = new Date().toLocaleDateString('pt-BR');

  ticket.directionChoice = choiceId;

  const logEntry = {
    id: "log_" + Date.now(),
    text: `🔀 Opção na Etapa 04 selecionada: '${choiceTitle}'`,
    user: state.activeOperator,
    at: `${dateStamp} ${timestamp}`,
    stage: "04. Direcionamento"
  };
  ticket.auditLog = [logEntry, ...(ticket.auditLog || [])];

  playClickSound(true);

  if (isStageCompleted(ticket, 4) && state.selectedStageId === 4) {
    state.selectedStageId = 5;
    ticket.currentStageId = 5;
  }

  saveState();
  renderApp();
}

// Attach / Remove Product Photos in Stage 03
function addProductPhoto(photoDataUrl) {
  const ticket = getActiveTicket();
  if (!ticket) return;
  if (ticket.status === "Concluído") return;

  ticket.productPhotos = ticket.productPhotos || [];
  ticket.productPhotos.push(photoDataUrl);
  saveState();
  renderApp();
}

function removeProductPhoto(index) {
  const ticket = getActiveTicket();
  if (!ticket || !ticket.productPhotos) return;
  ticket.productPhotos.splice(index, 1);
  saveState();
  renderApp();
}

// Attach / Remove Cabin Photos in Stage 04
function addCabinPhoto(photoDataUrl) {
  const ticket = getActiveTicket();
  if (!ticket) return;
  if (ticket.status === "Concluído") return;

  ticket.cabinPhotos = ticket.cabinPhotos || [];
  ticket.cabinPhotos.push(photoDataUrl);
  saveState();
  renderApp();
}

function removeCabinPhoto(index) {
  const ticket = getActiveTicket();
  if (!ticket || !ticket.cabinPhotos) return;
  ticket.cabinPhotos.splice(index, 1);
  saveState();
  renderApp();
}

// Attach / Remove Carregamento Photos in Stage 04.02
function addCarregamentoPhoto(photoDataUrl) {
  const ticket = getActiveTicket();
  if (!ticket) return;
  if (ticket.status === "Concluído") return;

  ticket.carregamentoPhotos = ticket.carregamentoPhotos || [];
  ticket.carregamentoPhotos.push(photoDataUrl);
  saveState();
  renderApp();
}

function removeCarregamentoPhoto(index) {
  const ticket = getActiveTicket();
  if (!ticket || !ticket.carregamentoPhotos) return;
  ticket.carregamentoPhotos.splice(index, 1);
  saveState();
  renderApp();
}

// Attach / Remove Foto Final Photos in Stage 04.02
function addFotoFinalPhoto(photoDataUrl) {
  const ticket = getActiveTicket();
  if (!ticket) return;
  if (ticket.status === "Concluído") return;

  ticket.fotoFinalPhotos = ticket.fotoFinalPhotos || [];
  ticket.fotoFinalPhotos.push(photoDataUrl);
  saveState();
  renderApp();
}

function removeFotoFinalPhoto(index) {
  const ticket = getActiveTicket();
  if (!ticket || !ticket.fotoFinalPhotos) return;
  ticket.fotoFinalPhotos.splice(index, 1);
  saveState();
  renderApp();
}

// Core Toggle Task Action
function toggleTask(taskId, taskTitle, stageCode, stageTitle) {
  const ticket = getActiveTicket();
  if (!ticket) return;

  if (ticket.status === "Concluído") {
    state.copyToastMessage = "⚠️ Atendimento encerrado (modo consulta). Reabra o atendimento para fazer alterações.";
    renderApp();
    setTimeout(() => { state.copyToastMessage = ""; renderApp(); }, 3500);
    return;
  }

  ticket.completedTasks = ticket.completedTasks || {};
  const isChecked = !ticket.completedTasks[taskId];
  const timestamp = new Date().toLocaleTimeString('pt-BR');
  const dateStamp = new Date().toLocaleDateString('pt-BR');

  if (isChecked) {
    ticket.completedTasks[taskId] = {
      by: state.activeOperator,
      at: `${dateStamp} ${timestamp}`
    };
  } else {
    delete ticket.completedTasks[taskId];
  }

  const logEntry = {
    id: "log_" + Date.now(),
    text: `Tarefa "${taskTitle}" ${isChecked ? 'marcada ☑' : 'desmarcada ☐'}`,
    user: state.activeOperator,
    at: `${dateStamp} ${timestamp}`,
    stage: `${stageCode}. ${stageTitle}`
  };
  ticket.auditLog = [logEntry, ...(ticket.auditLog || [])];

  playClickSound(isChecked);

  const currentStageCompleted = isStageCompleted(ticket, state.selectedStageId);
  if (currentStageCompleted) {
    const nextStage = getNextNonBypassedStageId(ticket, state.selectedStageId);
    if (nextStage !== state.selectedStageId) {
      state.selectedStageId = nextStage;
      ticket.currentStageId = nextStage;
    }
  }

  if (state.selectedStageId === 15 && isStageCompleted(ticket, 15)) {
    ticket.isCompleted = true;
  }

  saveState();
  renderApp();
}

// Toggle Conditional Flag Action
function toggleFlag(flagName) {
  const ticket = getActiveTicket();
  if (!ticket) return;

  ticket.flags = ticket.flags || {};
  ticket.flags[flagName] = !ticket.flags[flagName];

  const logEntry = {
    id: "log_" + Date.now(),
    text: `Condicional '${flagName}' alterado para: ${ticket.flags[flagName] ? 'ATIVADO' : 'DESATIVADO'}`,
    user: state.activeOperator,
    at: new Date().toLocaleTimeString('pt-BR'),
    stage: `Etapa ${state.selectedStageId}`
  };
  ticket.auditLog = [logEntry, ...(ticket.auditLog || [])];

  saveState();
  renderApp();
}

// RESET CHECKLIST FUNCTIONALITY
function executeResetChecklist() {
  const ticket = getActiveTicket();
  if (!ticket) return;

  const data = getMarvelData();
  const stages = data.INITIAL_STAGES || [];
  const prevStage = stages.find(s => s.id === state.selectedStageId) || { code: "01", title: "Recebimento" };
  const prevStageInfo = `${prevStage.code} — ${prevStage.title}`;

  const timestamp = new Date().toLocaleTimeString('pt-BR');
  const dateStamp = new Date().toLocaleDateString('pt-BR');

  ticket.completedTasks = {};
  ticket.destinationChoice = null;
  ticket.cabinPhotos = [];
  ticket.currentStageId = 1;
  ticket.isCompleted = false;
  state.selectedStageId = 1;

  const logEntry = {
    id: "log_" + Date.now(),
    text: `🔄 CHECKLIST RESETADO (Etapa anterior: ${prevStageInfo})`,
    user: state.activeOperator,
    at: `${dateStamp} ${timestamp}`,
    stage: "Reset Operacional"
  };

  ticket.auditLog = [logEntry, ...(ticket.auditLog || [])];

  state.isResetConfirmOpen = false;
  state.showResetToast = true;

  if (window.marvelToastTimeout) clearTimeout(window.marvelToastTimeout);
  window.marvelToastTimeout = setTimeout(() => {
    state.showResetToast = false;
    renderApp();
  }, 5000);

  saveState();
  renderApp();
}

// EXECUTE IMPORT & GENERATE PDF WITH RED VISUAL CHECKLIST DESIGN (INSPIRED BY REFERENCE)
async function executeGeneratePDF() {
  const ticket = getActiveTicket();
  if (!ticket) return;

  const protocolo = (document.getElementById('inputProtocolo')?.value || "").trim();
  const frota = (document.getElementById('inputFrota')?.value || "").trim();
  const contato = (document.getElementById('inputContato')?.value || "").trim();
  const observacao = (document.getElementById('inputObservacao')?.value || "").trim();
  const notaDevolucao = (document.getElementById('inputNotaDevolucao')?.value || "").trim();
  const notaOrigem = (document.getElementById('inputNotaOrigem')?.value || "").trim();

  // Validate all 6 mandatory fields
  if (!protocolo || !frota || !contato || !observacao || !notaDevolucao || !notaOrigem) {
    state.importFormError = "⚠️ Por favor, preencha TODOS os 6 campos obrigatórios (Protocolo, Frota, Contato, Observação, Nota de Devolução e Nota de Origem).";
    state.importFormData = { protocolo, frota, contato, observacao, notaDevolucao, notaOrigem };
    renderApp();
    return;
  }

  state.importFormError = "";
  state.importFormData = { protocolo, frota, contato, observacao, notaDevolucao, notaOrigem };

  // 1. Instant non-blocking visual feedback on the button
  const confirmBtn = document.getElementById('confirmGeneratePdfBtn');
  const cancelBtn = document.getElementById('cancelImportModalBtn');
  if (confirmBtn) {
    confirmBtn.disabled = true;
    confirmBtn.innerHTML = "⏳ Gerando relatório...";
    confirmBtn.style.opacity = "0.8";
    confirmBtn.style.cursor = "wait";
  }
  if (cancelBtn) {
    cancelBtn.disabled = true;
  }

  // Add processing status notice in modal
  const footerEl = document.querySelector('.modal-footer');
  let statusNotice = document.getElementById('pdfStatusNotice');
  if (!statusNotice && footerEl) {
    statusNotice = document.createElement('div');
    statusNotice.id = 'pdfStatusNotice';
    statusNotice.style.cssText = 'color: #DC2626; font-size: 0.85rem; font-weight: 700; width: 100%; text-align: center; margin-top: 8px;';
    statusNotice.textContent = 'Gerando relatório...';
    footerEl.parentNode.insertBefore(statusNotice, footerEl);
  } else if (statusNotice) {
    statusNotice.textContent = 'Gerando relatório...';
  }

  // 2. Yield to browser so it paints the processing state immediately
  await new Promise(resolve => setTimeout(resolve, 80));

  const timestamp = new Date().toLocaleTimeString('pt-BR');
  const dateStamp = new Date().toLocaleDateString('pt-BR');
  const cleanDate = dateStamp.replace(/\//g, '-');
  const data = getMarvelData();
  const INITIAL_STAGES = data.INITIAL_STAGES || [];

  // Build Printable HTML Document Content with Red Visual Identity (inspired by reference image)
  const pdfContainer = document.createElement('div');
  pdfContainer.id = "pdfReportContent";
  pdfContainer.innerHTML = `
    <div style="font-family: 'Segoe UI', Arial, sans-serif; background-color: #F8FAFC; color: #1E293B; padding: 20px; max-width: 794px; margin: 0 auto; box-sizing: border-box;">
      
      <!-- CABEÇALHO SUPERIOR DESTACADO (Preto Grafite com Barra Vermelha Marvel) -->
      <div style="background: #0F172A; border-bottom: 4px solid #DC2626; border-radius: 8px 8px 0 0; padding: 18px 24px; display: flex; align-items: center; justify-content: space-between;">
        <div>
          <div style="font-size: 20px; font-weight: 900; letter-spacing: 1px; color: #FFFFFF; text-transform: uppercase;">
            MARVEL CHECK
          </div>
          <div style="font-size: 13px; font-weight: 700; color: #EF4444; letter-spacing: 0.5px; text-transform: uppercase; margin-top: 2px;">
            RELATÓRIO DO CHECKLIST DE ANOMALIAS
          </div>
        </div>
        <div style="text-align: right;">
          <div style="font-size: 12px; font-weight: 800; color: #FFFFFF; letter-spacing: 0.5px;">TRANSPORTES MARVEL</div>
          <div style="font-size: 10px; color: #94A3B8; margin-top: 2px;">Torre de Controle Operacional</div>
          <div style="display: inline-block; background: rgba(220, 38, 38, 0.25); border: 1px solid #DC2626; color: #FCA5A5; font-size: 9px; font-weight: 800; padding: 2px 8px; border-radius: 4px; margin-top: 4px;">
            DOCUMENTO AUDITADO
          </div>
        </div>
      </div>

      <!-- PAINEL DE IDENTIFICAÇÃO DO ATENDIMENTO -->
      <div style="background: #FFFFFF; border: 1px solid #E2E8F0; border-left: 5px solid #DC2626; padding: 14px 18px; margin-bottom: 18px; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
        <div style="font-size: 11px; font-weight: 800; color: #991B1B; text-transform: uppercase; letter-spacing: 0.8px; margin-bottom: 10px;">
          📋 DADOS DO ATENDIMENTO E DOCUMENTAÇÃO
        </div>
        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; font-size: 11px;">
          <div><span style="color: #64748B; font-size: 10px;">PROTOCOLO:</span><br><strong style="font-size: 12px; color: #991B1B;">${protocolo}</strong></div>
          <div><span style="color: #64748B; font-size: 10px;">FROTA:</span><br><strong style="font-size: 12px; color: #0F172A;">${frota}</strong></div>
          <div><span style="color: #64748B; font-size: 10px;">CONDUTOR:</span><br><strong style="font-size: 12px; color: #0F172A;">${ticket.condutor || '-'}</strong></div>
          <div><span style="color: #64748B; font-size: 10px;">NOTA DE DEVOLUÇÃO:</span><br><strong style="color: #0F172A;">${notaDevolucao}</strong></div>
          <div><span style="color: #64748B; font-size: 10px;">NOTA DE ORIGEM:</span><br><strong style="color: #0F172A;">${notaOrigem}</strong></div>
          <div><span style="color: #64748B; font-size: 10px;">CONTATO:</span><br><strong style="color: #0F172A;">${contato}</strong></div>
          <div><span style="color: #64748B; font-size: 10px;">TIPO DE DEVOLUÇÃO:</span><br><strong style="color: #0F172A;">${ticket.docChoice === 'parcial' ? 'Parcial' : 'Total'}</strong></div>
          <div><span style="color: #64748B; font-size: 10px;">DIRECIONAMENTO:</span><br><strong style="color: #0F172A;">${ticket.directionChoice === 'alocar_cabine' ? 'Alocar em Cabine' : 'A definir com Fornecedor'}</strong></div>
          <div><span style="color: #64748B; font-size: 10px;">OPERADOR:</span><br><strong style="color: #0F172A;">${state.activeOperator || 'Operador'}</strong></div>
        </div>
        ${observacao ? `
          <div style="margin-top: 10px; padding-top: 8px; border-top: 1px dashed #E2E8F0; font-size: 11px;">
            <span style="color: #64748B; font-weight: 700;">OBSERVAÇÃO DO CHAMADO:</span>
            <div style="background: #F8FAFC; border: 1px solid #E2E8F0; padding: 6px 10px; border-radius: 4px; margin-top: 4px; color: #334155;">
              ${observacao}
            </div>
          </div>
        ` : ''}
      </div>

      <!-- ITENS DO CHECKLIST EM CARDS VERTICAIS (INSPIRADO NA REFERÊNCIA COM IDENTIDADE VERMELHA) -->
      <div style="margin-bottom: 18px;">
        <div style="font-size: 12px; font-weight: 800; color: #0F172A; text-transform: uppercase; letter-spacing: 0.8px; margin-bottom: 12px; display: flex; align-items: center; justify-content: space-between;">
          <span>ITENS VERIFICADOS E AUDITADOS DO CHECKLIST</span>
          <span style="color: #DC2626; font-size: 11px; font-weight: 800;">TOTAL: 5 ETAPAS AUDITADAS</span>
        </div>

        ${INITIAL_STAGES.map(stage => {
          let stageIcon = '📋';
          if (stage.id === 1) stageIcon = '📋';
          else if (stage.id === 2) stageIcon = '📄';
          else if (stage.id === 3) stageIcon = '📸';
          else if (stage.id === 4) stageIcon = '🚚';
          else if (stage.id === 5) stageIcon = '⭐';

          let tasksToRender = [];
          if (stage.id === 2) {
            const selectedOpt = stage.options?.find(o => o.id === ticket.docChoice) || stage.options?.[0];
            tasksToRender = selectedOpt?.tasks || stage.tasks || [];
          } else if (stage.id === 4) {
            const selectedOpt = stage.options?.find(o => o.id === ticket.directionChoice) || stage.options?.[0];
            tasksToRender = selectedOpt?.tasks || [];
            if (selectedOpt?.subsection?.tasks) {
              tasksToRender = tasksToRender.concat(selectedOpt.subsection.tasks);
            }
          } else if (stage.id === 5) {
            tasksToRender = ticket.directionChoice === 'alocar_cabine' ? (stage.tasksCabine || []) : (stage.tasksGeneral || []);
          } else {
            tasksToRender = stage.tasks || [];
          }

          return `
            <div style="margin-bottom: 12px;">
              <div style="font-size: 11px; font-weight: 800; color: #991B1B; text-transform: uppercase; margin-bottom: 5px; padding-left: 2px;">
                ETAPA ${stage.code} — ${stage.title}
              </div>

              ${tasksToRender.map(task => `
                <div style="background: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 8px; padding: 7px 12px; margin-bottom: 5px; display: flex; align-items: center; gap: 12px; box-shadow: 0 1px 2px rgba(0,0,0,0.02);">
                  <!-- Ícone em Bloco Escuro/Borda Vermelha -->
                  <div style="background: #0F172A; border: 1px solid #DC2626; width: 30px; height: 30px; border-radius: 6px; display: flex; align-items: center; justify-content: center; font-size: 13px; flex-shrink: 0;">
                    ${stageIcon}
                  </div>

                  <!-- Caixa de Seleção / Checkbox Vermelho (estilo visual da referência) -->
                  <div style="width: 20px; height: 20px; border-radius: 4px; border: 2px solid #DC2626; background: #DC2626; color: #FFFFFF; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 900; flex-shrink: 0;">
                    ✓
                  </div>

                  <!-- Descrição do Item -->
                  <div style="flex: 1; font-size: 11px; font-weight: 600; color: #1E293B; line-height: 1.3;">
                    ${task.text}
                  </div>

                  <!-- Tag de Status -->
                  <div style="background: #FEE2E2; color: #991B1B; border: 1px solid #FECACA; font-size: 9px; font-weight: 800; padding: 2px 8px; border-radius: 4px; text-transform: uppercase; flex-shrink: 0;">
                    CONCLUÍDO
                  </div>
                </div>
              `).join('')}
            </div>
          `;
        }).join('')}
      </div>

      <!-- SEÇÃO DE FOTOS (SE HOUVER) -->
      ${(
        (ticket.carregamentoPhotos && ticket.carregamentoPhotos.length > 0) ||
        (ticket.fotoFinalPhotos && ticket.fotoFinalPhotos.length > 0) ||
        (ticket.productPhotos && ticket.productPhotos.length > 0) ||
        (ticket.cabinPhotos && ticket.cabinPhotos.length > 0)
      ) ? `
        <div style="background: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 8px; padding: 12px; margin-bottom: 18px;">
          <div style="font-size: 11px; font-weight: 800; color: #991B1B; text-transform: uppercase; letter-spacing: 0.8px; margin-bottom: 8px;">
            📸 REGISTROS FOTOGRÁFICOS DO ATENDIMENTO
          </div>
          <div style="display: flex; flex-wrap: wrap; gap: 8px;">
            ${(ticket.productPhotos || []).map(p => `<img src="${p}" style="width: 100px; height: 75px; object-fit: cover; border-radius: 5px; border: 1px solid #DC2626;" title="Produto">`).join('')}
            ${(ticket.cabinPhotos || []).map(p => `<img src="${p}" style="width: 100px; height: 75px; object-fit: cover; border-radius: 5px; border: 1px solid #DC2626;" title="Cabine">`).join('')}
            ${(ticket.carregamentoPhotos || []).map(p => `<img src="${p}" style="width: 100px; height: 75px; object-fit: cover; border-radius: 5px; border: 1px solid #DC2626;" title="Carregamento">`).join('')}
            ${(ticket.fotoFinalPhotos || []).map(p => `<img src="${p}" style="width: 100px; height: 75px; object-fit: cover; border-radius: 5px; border: 1px solid #DC2626;" title="Foto Final">`).join('')}
          </div>
        </div>
      ` : ''}

      <!-- RODAPÉ PROFISSIONAL (como na imagem de referência) -->
      <div style="border-top: 2px solid #E2E8F0; padding-top: 10px; margin-top: 14px; display: flex; align-items: center; justify-content: space-between; font-size: 10px; color: #64748B;">
        <div>SISTEMA MARVEL CHECK — TORRE DE CONTROLE LOGÍSTICO</div>
        <div>Documento emitido em ${dateStamp} às ${timestamp} • Autenticado digitalmente</div>
      </div>

    </div>
  `;

  // 3. Mount offscreen in document.body so html2canvas computes accurate layout
  const wrapper = document.createElement('div');
  wrapper.id = "pdfOffscreenWrapper";
  wrapper.style.cssText = "position: fixed; top: 0; left: -9999px; width: 794px; background: #FFFFFF; z-index: -9999; visibility: visible;";
  wrapper.appendChild(pdfContainer);
  document.body.appendChild(wrapper);

  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const dateIso = `${year}-${month}-${day}`;
  const cleanProtocolo = protocolo.replace(/[^a-zA-Z0-9_-]/g, '');
  const cleanFrota = frota.replace(/[^a-zA-Z0-9_-]/g, '');
  const filename = cleanProtocolo 
    ? `Relatorio_Anomalias_${dateIso}_Protocolo_${cleanProtocolo}_Frota_${cleanFrota}.pdf`
    : `Relatorio_Anomalias_${dateIso}.pdf`;

  let pdfBase64 = null;
  let pdfGeneratedOk = false;
  let emailSentOk = false;
  let emailErrorMessage = "";
  let pdfGenErrorMessage = "";

  try {
    // Wait for any images inside container to load/decode
    const imgs = Array.from(pdfContainer.querySelectorAll('img'));
    await Promise.all(imgs.map(img => {
      if (img.complete) return Promise.resolve();
      return new Promise(res => {
        img.onload = res;
        img.onerror = res;
        setTimeout(res, 500);
      });
    }));

    if (window.html2pdf) {
      const opt = {
        margin:       [8, 8, 8, 8],
        filename:     filename,
        image:        { type: 'jpeg', quality: 0.95 },
        html2canvas:  { 
          scale: 1.4, 
          useCORS: true, 
          logging: false,
          letterRendering: true,
          scrollY: 0,
          scrollX: 0
        },
        jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' },
        pagebreak:    { mode: ['avoid-all', 'css', 'legacy'] }
      };
      const worker = window.html2pdf().set(opt).from(pdfContainer);
      pdfBase64 = await worker.outputPdf('datauristring');
      await worker.save();
      pdfGeneratedOk = true;
    } else {
      // Direct downloadable HTML/Blob report fallback
      const reportHtml = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Relatório Marvel Protocolo ${protocolo}</title><style>@media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } } body { margin: 0; padding: 20px; background: #F8FAFC; }</style></head><body>${pdfContainer.innerHTML}</body></html>`;
      const blob = new Blob([reportHtml], { type: 'text/html;charset=utf-8' });
      const dlUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = dlUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(dlUrl);
      }, 500);
      pdfGeneratedOk = true;
    }

    // Step 2: Confirm PDF was generated and send automatically via Outlook / Microsoft 365
    if (confirmBtn) {
      confirmBtn.innerHTML = "⏳ Relatório gerado. Enviando por e-mail...";
    }
    if (statusNotice) {
      statusNotice.textContent = "Relatório gerado. Enviando por e-mail...";
    }
    await new Promise(resolve => setTimeout(resolve, 60));

    if (pdfBase64 && pdfBase64.includes('base64,')) {
      const emailSubject = `Relatório de Anomalias - Protocolo ${protocolo} - Frota ${frota}`;
      const emailBody = `<p>Olá,</p><p>Segue em anexo o relatório de anomalias gerado pelo sistema (Protocolo: <strong>${protocolo}</strong>, Frota: <strong>${frota}</strong>).</p><p>Atenciosamente,<br><strong>Marvel Check</strong></p>`;
      const emailRecipient = "anomalia@marvel.com.br";

      try {
        const apiUrl = (typeof getApiBaseUrl === 'function' ? getApiBaseUrl() : '') + '/api/email/send';
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 35000);

        const emailResp = await fetch(apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ticketId: ticket.id,
            protocolo: protocolo,
            frota: frota,
            recipient: emailRecipient,
            subject: emailSubject,
            body: emailBody,
            filename: filename,
            pdfBase64: pdfBase64
          }),
          signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (!emailResp.ok) {
          const errText = await emailResp.text().catch(() => '');
          let errMsg = `Falha na requisição (${emailResp.status})`;
          try {
            const errObj = JSON.parse(errText);
            if (errObj && errObj.message) errMsg = errObj.message;
          } catch(e) {}
          throw new Error(errMsg);
        }

        const emailData = await emailResp.json();
        if (emailData && emailData.status === 'success') {
          emailSentOk = true;
        } else {
          emailErrorMessage = (emailData && emailData.message) || "Erro ao processar envio no servidor de e-mail.";
        }
      } catch (errNet) {
        emailErrorMessage = errNet.message || "Falha de conexão com a API de e-mail.";
      }
    } else {
      emailErrorMessage = "Arquivo PDF não pôde ser codificado para o envio.";
    }
  } catch (err) {
    console.error("Erro na geração ou envio do relatório:", err);
    if (!pdfGeneratedOk) {
      pdfGenErrorMessage = err.message || "Erro inesperado ao gerar relatório.";
    } else {
      emailErrorMessage = err.message || "Erro inesperado ao preparar e-mail.";
    }
  } finally {
    // Clean up temporary DOM element safely
    if (wrapper.parentNode) {
      wrapper.parentNode.removeChild(wrapper);
    }

    state.isImportModalOpen = false;

    if (emailSentOk) {
      state.showSuccessToast = true;
      state.successToastMessage = "Relatório gerado e enviado com sucesso para anomalia@marvel.com.br.";
      state.showEmailErrorToast = false;

      if (window.marvelSuccessTimeout) clearTimeout(window.marvelSuccessTimeout);
      window.marvelSuccessTimeout = setTimeout(() => {
        state.showSuccessToast = false;
        renderApp();
      }, 8000);
    } else if (pdfGeneratedOk) {
      state.showSuccessToast = false;
      state.showEmailErrorToast = true;
      state.emailErrorMessage = "Relatório gerado com sucesso, mas não foi possível enviar o e-mail. O PDF continua disponível para download.";

      if (window.marvelErrorTimeout) clearTimeout(window.marvelErrorTimeout);
      window.marvelErrorTimeout = setTimeout(() => {
        state.showEmailErrorToast = false;
        renderApp();
      }, 10000);
    } else {
      state.showSuccessToast = false;
      state.showEmailErrorToast = true;
      state.emailErrorMessage = "Não foi possível gerar o relatório.";

      if (window.marvelErrorTimeout) clearTimeout(window.marvelErrorTimeout);
      window.marvelErrorTimeout = setTimeout(() => {
        state.showEmailErrorToast = false;
        renderApp();
      }, 10000);
    }

    saveState();
    renderApp();
  }
}

// RENDER ROUTER WITH STRICT SCROLL PRESERVATION
function renderApp() {
  const appContainer = document.getElementById('app');
  if (!appContainer) return;

  // 0. Operator Identification Guard
  if (!state.activeOperator || !state.activeOperator.trim()) {
    appContainer.innerHTML = renderOperatorLoginScreen();
    attachEventListeners();
    return;
  }

  const windowY = window.scrollY || document.documentElement.scrollTop || 0;
  const panelEl = document.querySelector('.stage-content-panel');
  const panelY = panelEl ? panelEl.scrollTop : 0;
  const sidebarEl = document.querySelector('.stage-sidebar');
  const sidebarY = sidebarEl ? sidebarEl.scrollTop : 0;

  const data = getMarvelData();
  const INITIAL_STAGES = data.INITIAL_STAGES || [];

  const activeTicket = getActiveTicket();
  const overall = calculateOverallProgress(activeTicket);
  const is100Percent = isChecklist100PercentCompleted(activeTicket);

  appContainer.innerHTML = `
    <!-- Top Navigation Bar -->
    <header class="app-navbar">
      <div class="brand-section">
        <span class="brand-company-name">Marvel Check</span>
      </div>
      
      <div class="navbar-actions">
        <button class="btn-top-action" id="openFetchChecklistBtn" title="Trazer checklist via código ou link">
          📥 Trazer checklist
        </button>
        <button class="btn-top-action" id="triggerExportShareBtn" title="Exportar/compartilhar checklist">
          📤 Exportar checklist
        </button>
        <button class="btn-top-action" id="triggerResetChecklistBtn" title="Resetar checklist do atendimento ativo">
          ↻ Resetar checklist
        </button>
        <div class="operator-header-badge" title="Operador identificado na sessão">
          👤 <span>Operador: <strong>${state.activeOperator}</strong></span>
          <button class="btn-switch-operator" id="switchOperatorBtn" title="Trocar de operador">(Trocar)</button>
        </div>
        <button class="btn-top-action btn-top-primary" id="triggerAddTicketBtn" title="Iniciar novo checklist">
          + Novo checklist
        </button>
      </div>
    </header>

    ${renderChecklistMode(activeTicket, overall, INITIAL_STAGES)}

    <!-- BOTÃO FIXO IMPORTAR CHECKLIST (EXTRAIR RELATÓRIO / GERAR PDF) - Apenas quando 100% Concluído -->
    ${is100Percent ? `
      <button class="btn-import-checklist" id="openImportChecklistBtn" title="Extrair relatório em PDF do checklist">
        📄 Extrair Relatório
      </button>
    ` : ''}

    ${state.isResetConfirmOpen ? renderResetConfirmModal(activeTicket) : ''}
    ${state.isCloseConfirmOpen ? renderCloseConfirmModal(state.atendimentos.find(t => t.id === state.ticketIdToClose) || activeTicket) : ''}
    ${state.isDeleteConfirmOpen ? renderDeleteConfirmModal(state.atendimentos.find(t => t.id === state.ticketIdToDelete)) : ''}
    ${state.isImportModalOpen ? renderImportChecklistModal(activeTicket) : ''}
    ${state.isNewTicketModalOpen ? renderNewTicketModal() : ''}
    ${state.isShareModalOpen ? renderExportShareModal(activeTicket) : ''}
    ${state.isFetchModalOpen ? renderFetchReceivedModal() : ''}
  `;

  attachEventListeners();

  window.scrollTo(0, windowY);
  const newPanelEl = document.querySelector('.stage-content-panel');
  if (newPanelEl && panelY > 0) {
    newPanelEl.scrollTop = panelY;
  }
  const newSidebarEl = document.querySelector('.stage-sidebar');
  if (newSidebarEl && sidebarY > 0) {
    newSidebarEl.scrollTop = sidebarY;
  }
}

// Checklist View Render
function renderChecklistMode(ticket, overall, INITIAL_STAGES) {
  const ongoingList = state.atendimentos.filter(t => t.status !== "Concluído");
  const allKnown = (state.allServerAtendimentos && state.allServerAtendimentos.length > 0) ? state.allServerAtendimentos : state.atendimentos;
  const closedList = allKnown.filter(t => t.status === "Concluído");

  return `
    <!-- GERENCIADOR DE ATENDIMENTOS (EM ANDAMENTO & HISTÓRICO) -->
    <div class="multi-tickets-manager-card">
      <div class="multi-tickets-header">
        <div class="manager-tabs-bar">
          <button class="manager-tab-btn ${state.viewTab === 'ongoing' ? 'active' : ''}" id="tabViewOngoing">
            📋 EM ANDAMENTO (${ongoingList.length})
          </button>
          <button class="manager-tab-btn ${state.viewTab === 'history' ? 'active' : ''}" id="tabViewHistory">
            📜 HISTÓRICO DE ENCERRADOS (${closedList.length})
          </button>
        </div>
      </div>

      ${state.viewTab === 'ongoing' ? `
        <div class="tickets-pills-container">
          ${ongoingList.length === 0 ? `
            <div style="font-size: 0.85rem; color: var(--text-secondary); padding: 8px 0;">
              Nenhum atendimento em andamento no momento. Clique em <strong>➕ Novo Atendimento</strong> para iniciar.
            </div>
          ` : ongoingList.map(t => {
            const isActive = t.id === state.activeTicketId;
            const is100 = isChecklist100PercentCompleted(t);
            const tOverall = calculateOverallProgress(t);
            return `
              <div class="ticket-tab-item ${isActive ? 'active' : ''} ${is100 ? 'completed' : ''}" data-ticket-id="${t.id}">
                <div class="ticket-tab-top">
                  <span class="ticket-tab-driver">👤 ${t.condutor || 'Condutor'}</span>
                  <span class="ticket-tab-status ${is100 ? 'status-done' : 'status-ongoing'}">
                    ${is100 ? '✓ 100% Concluído' : tOverall.percent + '%'}
                  </span>
                </div>
                <div class="ticket-tab-meta">
                  Prot: <strong>${t.protocolo || t.id}</strong> | Frota: <strong>${t.frota || '-'}</strong> | ${t.cliente || 'Cliente'}
                </div>
                <div class="ticket-tab-actions">
                  <button class="btn-tab-share-mini" data-share-ticket-id="${t.id}">
                    📤 Exportar Link
                  </button>
                  <button class="btn-tab-share-mini" data-close-ticket-id="${t.id}" style="color: #10B981;">
                    🔒 Encerrar
                  </button>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      ` : ''}
    </div>

    ${state.viewTab === 'history' ? renderHistoryView(closedList) : renderActiveWorkspace(ticket, overall, INITIAL_STAGES)}
  `;
}

// Workspace de Atendimento Ativo
function renderActiveWorkspace(ticket, overall, INITIAL_STAGES) {
  if (!ticket) {
    return `
      <!-- Header de Progresso Inicial (0 de 15) -->
      <div class="ticket-header-banner">
        <div class="ticket-header-top-bar">
          <div class="stage-summary-pill">
            Etapas concluídas: 0 de 15
          </div>
        </div>
      </div>

      <!-- State Inicial Limpo (Aguardando Checklist) -->
      <div style="background: #FFFFFF; border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 48px 24px; text-align: center; margin-top: 16px; box-shadow: var(--shadow-card);">
        <div style="font-size: 3rem; margin-bottom: 12px;">📋</div>
        <h2 style="font-size: 1.3rem; font-weight: 800; color: var(--marvel-red-primary); margin-bottom: 8px;">
          NENHUM CHECKLIST ATIVO
        </h2>
        <p style="font-size: 0.95rem; color: var(--text-secondary); max-width: 520px; margin: 0 auto 24px auto; line-height: 1.6;">
          Para começar um novo checklist, clique no botão <strong>"+ Novo checklist"</strong> no canto superior direito.
        </p>
      </div>
    `;
  }

  const selectedStage = INITIAL_STAGES.find(s => s.id === state.selectedStageId) || INITIAL_STAGES[0];
  const is100Percent = isChecklist100PercentCompleted(ticket);
  const isClosed = ticket.status === "Concluído";

  return `
    <!-- Header de Atendimento Ativo -->
    <div class="ticket-header-banner">
      <div class="ticket-header-top-bar">
        <!-- SOMENTE O INDICADOR DE ETAPAS CONCLUÍDAS NO CANTO SUPERIOR ESQUERDO -->
        <div class="stage-summary-pill">
          Etapas concluídas: ${overall.count} de ${overall.total}
        </div>
      </div>

      <!-- Barra de Progresso Geral -->
      <div class="overall-progress-container">
        <div class="overall-progress-bar-bg">
          <div class="overall-progress-fill" style="width: ${overall.percent}%;"></div>
        </div>
        <div class="overall-progress-text">${overall.percent}% CONCLUÍDO</div>
      </div>
    </div>

    <!-- NOTIFICAÇÃO DE MODO CONSULTA PARA CHECKLIST ENCERRADO -->
    ${isClosed ? `
      <div class="alert-banner info" style="margin: 12px 24px 0 24px; border-color: #10B981; background: rgba(16, 185, 129, 0.08);">
        <div class="alert-icon" style="color: #10B981;">🔒</div>
        <div style="display: flex; align-items: center; justify-content: space-between; width: 100%;">
          <div>
            <div class="alert-content-title" style="color: #059669;">ATENDIMENTO ENCERRADO — MODO CONSULTA</div>
            <div class="alert-content-desc">Encerrado por <strong>${ticket.closedBy || 'Operador'}</strong> em <strong>${ticket.dataEncerramento || 'Data N/I'}</strong>. Todos os dados e respostas estão salvos e preservados exclusivamente para consulta.</div>
          </div>
          <button class="btn-reopen-ticket" id="triggerReopenTicketBtn" style="padding: 4px 12px; font-size: 0.8rem;">
            🔓 Reabrir para Edição
          </button>
        </div>
      </div>
    ` : (is100Percent ? `
      <div class="alert-banner success" style="margin: 12px 24px 0 24px;">
        <div class="alert-icon">🎉</div>
        <div style="display: flex; align-items: center; justify-content: space-between; width: 100%;">
          <div>
            <div class="alert-content-title">CHECKLIST 100% CONCLUÍDO!</div>
            <div class="alert-content-desc">Todas as etapas obrigatórias foram verificadas. Este atendimento está pronto para ser encerrado e arquivado no histórico.</div>
          </div>
          <button class="btn-close-ticket" id="triggerCloseTicketBtn" style="padding: 6px 16px;">
            🔒 Encerrar Atendimento
          </button>
        </div>
      </div>
    ` : '')}

    <!-- IDENTIFICAÇÃO CLARA DO CONDUTOR / ATENDIMENTO ATUAL -->
    <div class="current-driver-card">
      <div class="current-driver-info">
        <span class="current-driver-tag">👤 ATENDIMENTO ATUAL:</span>
        <span class="current-driver-name">${ticket.condutor || 'Condutor'}</span>
        <span style="font-size: 0.75rem; font-weight: 800; padding: 2px 8px; border-radius: var(--radius-sm); margin-left: 8px; ${isClosed ? 'background: rgba(16,185,129,0.12); color: #10B981; border: 1px solid rgba(16,185,129,0.3);' : 'background: var(--marvel-red-very-light); color: var(--marvel-red-primary); border: 1px solid var(--marvel-red-primary);'}">
          ${isClosed ? '✓ Concluído / Encerrado' : 'Em andamento'}
        </span>
      </div>
      <div class="current-driver-details">
        <span><strong>Protocolo:</strong> ${ticket.protocolo || ticket.id}</span>
        <span class="detail-sep">•</span>
        <span><strong>Frota:</strong> ${ticket.frota || 'N/I'}</span>
        <span class="detail-sep">•</span>
        <span><strong>Cliente:</strong> ${ticket.cliente || 'N/I'}</span>
        <span class="detail-sep">•</span>
        <span><strong>Contato:</strong> ${ticket.contato || 'N/I'}</span>
      </div>
    </div>

    <!-- Layout Principal: Sidebar (Left) + Content (Right) -->
    <div class="main-workspace">
      <!-- Sidebar de Etapas -->
      <aside class="stage-sidebar">
        <div class="sidebar-title">Sequência de Etapas (01-05)</div>
        ${INITIAL_STAGES.map(stage => {
          const isBypassed = isStageBypassed(ticket, stage.id);
          const isDone = isStageCompleted(ticket, stage.id);
          const isUnlocked = isStageUnlocked(ticket, stage.id);
          const isActive = stage.id === state.selectedStageId;

          let badgeIcon = '○';
          let statusClass = 'status-unlocked';
          let taskCountLabel = '';

          if (isBypassed) {
            badgeIcon = 'N/A';
            statusClass = 'status-bypassed';
            taskCountLabel = 'Não aplicável';
          } else if (isDone) {
            badgeIcon = '✓';
            statusClass = 'status-completed';
          } else if (isActive) {
            badgeIcon = '●';
            statusClass = 'status-active';
          } else if (!isUnlocked) {
            badgeIcon = '🔒';
            statusClass = 'status-locked';
          }

          if (!isBypassed) {
            const currentTasks = getStageTasksForTicket(ticket, stage);
            if ((stage.id === 2 && !ticket.docChoice) || (stage.id === 4 && !ticket.directionChoice)) {
              taskCountLabel = 'Seleção pendente';
            } else {
              const totalTasks = currentTasks.length;
              const checkedCount = currentTasks.filter(t => ticket.completedTasks && ticket.completedTasks[t.id]).length;
              taskCountLabel = `${checkedCount}/${totalTasks} tarefas`;
            }
          }

          return `
            <div class="stage-nav-item ${isActive ? 'active' : ''} ${isDone ? 'completed' : ''} ${isBypassed ? 'bypassed' : ''} ${!isUnlocked ? 'locked' : ''}"
                 data-stage-id="${stage.id}">
              <div class="stage-nav-left">
                <div class="stage-badge-icon ${statusClass}">${badgeIcon}</div>
                <div class="stage-nav-info">
                  <div class="stage-nav-code-name">${stage.code}. ${stage.title} ${isBypassed ? '(N/A)' : ''}</div>
                  <div class="stage-nav-task-count">${taskCountLabel}</div>
                </div>
              </div>
            </div>
          `;
        }).join('')}
      </aside>

      <!-- Conteúdo da Etapa Selecionada -->
      <main class="stage-content-panel">
        <!-- Toast Notificação pós Reset -->
        ${state.showResetToast ? `
          <div class="reset-toast-banner">
            <div>
              <strong>✓ Checklist resetado.</strong> O atendimento voltou para a <strong>Etapa 01 — Recebimento</strong>.
            </div>
            <button class="nav-btn" id="dismissToastBtn" style="padding: 2px 8px; font-size: 0.75rem;">✕</button>
          </div>
        ` : ''}

        <!-- Toast Sucesso Geração de PDF e Envio de E-mail -->
        ${state.showSuccessToast ? `
          <div class="reset-toast-banner" style="background: rgba(16, 185, 129, 0.2); border-color: var(--accent-green);">
            <div>
              <strong>✓ ${state.successToastMessage || "Relatório gerado e enviado com sucesso para anomalia@marvel.com.br."}</strong>
              <div style="font-size: 0.8rem; color: #10B981; margin-top: 2px;">Enviado com o relatório anexado via Outlook / Microsoft 365.</div>
            </div>
            <button class="nav-btn" id="dismissToastBtn" style="padding: 2px 8px; font-size: 0.75rem;">✕</button>
          </div>
        ` : ''}

        <!-- Toast Alerta Falha no Envio de E-mail ou Geração -->
        ${state.showEmailErrorToast ? `
          <div class="reset-toast-banner" style="background: rgba(239, 68, 68, 0.2); border-color: #EF4444;">
            <div>
              <strong style="color: #EF4444;">⚠️ ${state.emailErrorMessage || "Relatório gerado com sucesso, mas não foi possível enviar o e-mail. O PDF continua disponível para download."}</strong>
            </div>
            <button class="nav-btn" id="dismissEmailErrorToastBtn" style="padding: 2px 8px; font-size: 0.75rem;">✕</button>
          </div>
        ` : ''}

        <div class="stage-header-card">
          <div class="stage-header-top">
            <span class="stage-number-tag">ETAPA ${selectedStage.code} DE 5</span>
            <span style="font-size: 0.8rem; color: var(--marvel-red-primary); font-weight: 600;">
              ${selectedStage.isDocChoiceStage || selectedStage.isDirectionChoiceStage ? 'Seleção obrigatória de cenário' : 'Todas as tarefas são obrigatórias'}
            </span>
          </div>
          <h1 class="stage-main-title">ETAPA ${selectedStage.code} — ${selectedStage.title.toUpperCase()}</h1>
          <p class="stage-main-subtitle">"${selectedStage.subtitle}"</p>
        </div>

        <!-- STAGE 1: RECEBIMENTO -->
        ${selectedStage.id === 1 ? `
          <div class="tasks-list-container">
            ${renderCustomTaskList(ticket, selectedStage.tasks, selectedStage)}
          </div>
        ` : ''}

        <!-- STAGE 2: DOCUMENTAÇÃO (PARCIAL VS TOTAL) -->
        ${selectedStage.id === 2 ? renderStage2DocChoiceContent(ticket, selectedStage) : ''}

        <!-- STAGE 3: REGISTROS DE IMAGENS (FOTOS PRODUTOS) -->
        ${selectedStage.id === 3 ? renderStage3ProductPhotosContent(ticket, selectedStage) : ''}

        <!-- STAGE 4: DIRECIONAMENTO DA DEVOLUÇÃO (FORNECEDOR VS CABINE) -->
        ${selectedStage.id === 4 ? renderStage4DirectionChoiceContent(ticket, selectedStage) : ''}

        <!-- STAGE 5: CONFERÊNCIA E LANÇAMENTOS -->
        ${selectedStage.id === 5 ? renderStage5ConferenciaContent(ticket, selectedStage) : ''}
      </main>
    </div>
  `;
}

// Render Content for Stage 2 (Documentação: Parcial vs Total)
function renderStage2DocChoiceContent(ticket, stage) {
  const currentChoice = ticket.docChoice;
  const selectedOption = stage.options.find(opt => opt.id === currentChoice);

  return `
    <div style="margin-bottom: 24px;">
      <div style="font-size: 0.85rem; font-weight: 800; color: var(--marvel-red-primary); text-transform: uppercase; letter-spacing: 0.8px; margin-bottom: 12px;">
        É DEVOLUÇÃO TOTAL OU PARCIAL? (SELEÇÃO OBRIGATÓRIA):
      </div>

      <div class="destination-choice-grid">
        ${stage.options.map(opt => {
          const isSelected = opt.id === currentChoice;
          return `
            <div class="choice-card-item ${isSelected ? 'selected' : ''}" data-doc-choice-id="${opt.id}" data-choice-title="${opt.title}">
              <div class="choice-card-header">
                <div class="choice-card-title">${opt.title}</div>
                <div class="choice-badge-check">
                  ${isSelected ? '✓ SELECIONADO' : '○ SELECIONAR'}
                </div>
              </div>
              <div class="choice-card-desc">${opt.description}</div>
            </div>
          `;
        }).join('')}
      </div>

      ${!currentChoice ? `
        <div class="alert-banner warning" style="margin-top: 16px;">
          <div class="alert-icon">⚠️</div>
          <div>
            <div class="alert-content-title">SELEÇÃO PENDENTE</div>
            <div class="alert-content-desc">Selecione se a devolução é <strong>Parcial</strong> ou <strong>Total</strong> para exibir a lista de verificações de documentação.</div>
          </div>
        </div>
      ` : ''}

      ${selectedOption ? `
        <div style="font-size: 0.85rem; font-weight: 800; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.8px; margin-top: 24px; margin-bottom: 12px;">
          TAREFAS DA DEVOLUÇÃO ${selectedOption.title.toUpperCase()}:
        </div>
        <div class="tasks-list-container">
          ${renderCustomTaskList(ticket, selectedOption.tasks, stage)}
        </div>
      ` : ''}
    </div>
  `;
}

// Render Content for Stage 3 (Registros de Imagens: Fotos dos Produtos)
function renderStage3ProductPhotosContent(ticket, stage) {
  const productPhotos = ticket.productPhotos || [];
  const task1 = stage.tasks[0];
  const completedInfo1 = ticket.completedTasks ? ticket.completedTasks[task1.id] : null;
  const isTask1Checked = !!completedInfo1;

  return `
    <div style="margin-bottom: 24px;">
      <!-- Task 1 Card com Orientação e Upload -->
      <div class="task-card-item ${isTask1Checked ? 'checked' : ''}" 
           data-task-id="${task1.id}" 
           data-task-title="${task1.text}"
           data-stage-code="${stage.code}"
           data-stage-title="${stage.title}">
        
        <div class="custom-checkbox-target">
          <svg class="check-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
        </div>

        <div class="task-text-body" style="width: 100%;">
          <div class="task-title-text">
            1. ${task1.text}
            <span class="task-required-tag">Obrigatória</span>
          </div>

          <!-- Orientação de Fotos -->
          <div style="background: rgba(229, 57, 53, 0.05); border-left: 3px solid var(--marvel-red-primary); padding: 10px 14px; margin-top: 10px; border-radius: 4px; font-size: 0.85rem; color: var(--text-primary);">
            <strong>📌 ORIENTAÇÃO PARA REGISTRO FOTOGRÁFICO:</strong>
            <ul style="margin-left: 18px; margin-top: 4px; line-height: 1.5; color: var(--text-secondary);">
              ${(task1.orientation || []).map(o => `<li>${o}</li>`).join('')}
            </ul>
          </div>

          ${isTask1Checked ? `
            <div class="task-metadata-stamp" style="margin-top: 8px;">
              <span>✓ Registrado por ${completedInfo1.by} às ${completedInfo1.at}</span>
            </div>
          ` : ''}
        </div>
      </div>

      <!-- Area de Upload de Fotos dos Produtos -->
      <div style="margin-top: 16px; margin-bottom: 24px;">
        <div class="cabin-photo-dropzone" id="triggerProductUploadBtn" style="border-style: dashed; padding: 20px;">
          <input type="file" id="realProductFileInput" accept="image/*" multiple style="display: none;">
          <div style="font-size: 2rem; margin-bottom: 6px;">📷</div>
          <div style="font-size: 1rem; font-weight: 700; color: var(--text-primary);">Clique para Selecionar Fotos dos Produtos</div>
          <div style="font-size: 0.82rem; color: var(--text-muted); margin-top: 4px;">Selecione arquivos de imagem do seu computador (JPG, PNG, WEBP)</div>
        </div>

        ${productPhotos.length > 0 ? `
          <div style="font-size: 0.8rem; font-weight: 700; color: var(--text-muted); text-transform: uppercase; margin-top: 12px; margin-bottom: 10px;">
            FOTOS DOS PRODUTOS ANEXADAS (${productPhotos.length}):
          </div>
          <div class="photo-preview-grid">
            ${productPhotos.map((photoUrl, idx) => `
              <div class="photo-preview-card">
                <img src="${photoUrl}" alt="Foto Produto ${idx + 1}">
                <button type="button" class="photo-delete-btn" data-product-photo-idx="${idx}" title="Remover foto">✕</button>
              </div>
            `).join('')}
          </div>
        ` : ''}
      </div>

      <!-- Outras Tarefas da Etapa 03 -->
      <div style="font-size: 0.85rem; font-weight: 800; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.8px; margin-bottom: 12px;">
        CONFIRMAÇÃO E VALIDAÇÃO:
      </div>
      <div class="tasks-list-container">
        ${renderCustomTaskList(ticket, stage.tasks.slice(1), stage)}
      </div>
    </div>
  `;
}

// Helper to render Stage 4.02 subsection tasks with conditional upload dropzones
function renderStage4SubsectionTasks(ticket, tasks, stage) {
  const carregamentoPhotos = ticket.carregamentoPhotos || [];
  const fotoFinalPhotos = ticket.fotoFinalPhotos || [];

  return (tasks || []).map(task => {
    const completedInfo = ticket.completedTasks ? ticket.completedTasks[task.id] : null;
    const isChecked = !!completedInfo;
    const isCarregamentoTask = task.id === 't4_sub_1';
    const isFotoFinalTask = task.id === 't4_sub_6';

    let html = `
      <div class="task-card-item ${isChecked ? 'checked' : ''}" 
           data-task-id="${task.id}" 
           data-task-title="${task.text}"
           data-stage-code="${stage.code}"
           data-stage-title="${stage.title}">
        
        <div class="custom-checkbox-target">
          <svg class="check-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
        </div>

        <div class="task-text-body">
          <div class="task-title-text">
            ${task.text}
            <span class="task-required-tag">Obrigatória</span>
          </div>
          ${isChecked ? `
            <div class="task-metadata-stamp">
              <span>✓ Registrado por ${completedInfo.by} às ${completedInfo.at}</span>
            </div>
          ` : ''}
        </div>
        <div class="task-arrow-indicator">›</div>
      </div>
    `;

    // 3.1 Conditional Photo Dropzone for Carregamento
    if (isCarregamentoTask && isChecked) {
      html += `
        <div style="margin-top: 10px; margin-bottom: 16px; padding-left: 12px;">
          <div class="cabin-photo-dropzone" id="triggerCarregamentoUploadBtn" style="border-style: dashed; padding: 16px; background: rgba(16, 185, 129, 0.04); border-color: #10B981;">
            <input type="file" id="realCarregamentoFileInput" accept="image/*" multiple style="display: none;">
            <div style="font-size: 1.8rem; margin-bottom: 4px;">📦📷</div>
            <div style="font-size: 0.95rem; font-weight: 700; color: #065F46;">Clique para Anexar Fotos do Carregamento dos Produtos Devolvidos</div>
            <div style="font-size: 0.8rem; color: #047857; margin-top: 2px;">Selecione imagens do seu dispositivo (JPG, PNG, WEBP)</div>
          </div>

          ${carregamentoPhotos.length > 0 ? `
            <div style="font-size: 0.78rem; font-weight: 700; color: #065F46; text-transform: uppercase; margin-top: 10px; margin-bottom: 8px;">
              FOTOS DO CARREGAMENTO ANEXADAS (${carregamentoPhotos.length}):
            </div>
            <div class="photo-preview-grid">
              ${carregamentoPhotos.map((photoUrl, idx) => `
                <div class="photo-preview-card">
                  <img src="${photoUrl}" alt="Foto Carregamento ${idx + 1}">
                  <button type="button" class="photo-delete-btn" data-carregamento-photo-idx="${idx}" title="Remover foto">✕</button>
                </div>
              `).join('')}
            </div>
          ` : ''}
        </div>
      `;
    }

    // 3.2 Conditional Photo Dropzone for Foto Final
    if (isFotoFinalTask && isChecked) {
      html += `
        <div style="margin-top: 10px; margin-bottom: 16px; padding-left: 12px;">
          <div class="cabin-photo-dropzone" id="triggerFotoFinalUploadBtn" style="border-style: dashed; padding: 16px; background: rgba(16, 185, 129, 0.04); border-color: #10B981;">
            <input type="file" id="realFotoFinalFileInput" accept="image/*" multiple style="display: none;">
            <div style="font-size: 1.8rem; margin-bottom: 4px;">🏁📷</div>
            <div style="font-size: 0.95rem; font-weight: 700; color: #065F46;">Clique para Anexar Fotos Finais Realizadas</div>
            <div style="font-size: 0.8rem; color: #047857; margin-top: 2px;">Selecione imagens do seu dispositivo (JPG, PNG, WEBP)</div>
          </div>

          ${fotoFinalPhotos.length > 0 ? `
            <div style="font-size: 0.78rem; font-weight: 700; color: #065F46; text-transform: uppercase; margin-top: 10px; margin-bottom: 8px;">
              FOTOS FINAIS ANEXADAS (${fotoFinalPhotos.length}):
            </div>
            <div class="photo-preview-grid">
              ${fotoFinalPhotos.map((photoUrl, idx) => `
                <div class="photo-preview-card">
                  <img src="${photoUrl}" alt="Foto Final ${idx + 1}">
                  <button type="button" class="photo-delete-btn" data-fotofinal-photo-idx="${idx}" title="Remover foto">✕</button>
                </div>
              `).join('')}
            </div>
          ` : ''}
        </div>
      `;
    }

    return html;
  }).join('');
}

// Render Content for Stage 4 (Direcionamento da Devolução: Fornecedor vs Cabine)
function renderStage4DirectionChoiceContent(ticket, stage) {
  const currentChoice = ticket.directionChoice;
  const selectedOption = stage.options.find(opt => opt.id === currentChoice);
  const cabinPhotos = ticket.cabinPhotos || [];

  return `
    <div style="margin-bottom: 24px;">
      <div style="font-size: 0.85rem; font-weight: 800; color: var(--marvel-red-primary); text-transform: uppercase; letter-spacing: 0.8px; margin-bottom: 12px;">
        TIPO DE DIRECIONAMENTO (SELEÇÃO OBRIGATÓRIA):
      </div>

      <div class="destination-choice-grid">
        ${stage.options.map(opt => {
          const isSelected = opt.id === currentChoice;
          return `
            <div class="choice-card-item ${isSelected ? 'selected' : ''}" data-direction-choice-id="${opt.id}" data-choice-title="${opt.title}">
              <div class="choice-card-header">
                <div class="choice-card-title">${opt.title}</div>
                <div class="choice-badge-check">
                  ${isSelected ? '✓ SELECIONADO' : '○ SELECIONAR'}
                </div>
              </div>
              <div class="choice-card-desc">${opt.description}</div>
            </div>
          `;
        }).join('')}
      </div>

      ${!currentChoice ? `
        <div class="alert-banner warning" style="margin-top: 16px;">
          <div class="alert-icon">⚠️</div>
          <div>
            <div class="alert-content-title">SELEÇÃO PENDENTE</div>
            <div class="alert-content-desc">Escolha um dos tipos de direcionamento acima para liberar o checklist da etapa.</div>
          </div>
        </div>
      ` : ''}

      ${selectedOption ? `
        <!-- OPÇÃO 1: A DEFINIR COM O FORNECEDOR -->
        ${currentChoice === 'a_definir_fornecedor' ? `
          <div style="font-size: 0.85rem; font-weight: 800; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.8px; margin-top: 24px; margin-bottom: 12px;">
            VERIFICAÇÕES DE DIRECIONAMENTO AO FORNECEDOR:
          </div>
          <div class="tasks-list-container">
            ${renderCustomTaskList(ticket, selectedOption.tasks, stage)}
          </div>

          <!-- SUBSEÇÃO 04.02 — CUIDADO COM A CARGA E LOCALIZAÇÃO -->
          <div style="background: #FFFFFF; border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 20px; margin-top: 24px;">
            <div style="font-size: 0.9rem; font-weight: 800; color: var(--marvel-red-primary); text-transform: uppercase; letter-spacing: 0.6px; margin-bottom: 14px; border-bottom: 2px solid var(--marvel-red-light); padding-bottom: 8px;">
              🚛 ${selectedOption.subsection.title}
            </div>
            <div class="tasks-list-container">
              ${renderStage4SubsectionTasks(ticket, selectedOption.subsection.tasks, stage)}
            </div>
          </div>
        ` : ''}

        <!-- OPÇÃO 2: ALOCAR EM CABINE -->
        ${currentChoice === 'alocar_cabine' ? `
          <div style="font-size: 0.85rem; font-weight: 800; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.8px; margin-top: 24px; margin-bottom: 12px;">
            VERIFICAÇÕES DE ALOCAÇÃO EM CABINE:
          </div>
          <div class="tasks-list-container">
            ${selectedOption.tasks.map(task => {
              const completedInfo = ticket.completedTasks ? ticket.completedTasks[task.id] : null;
              const isChecked = !!completedInfo;

              if (task.hasUpload) {
                return `
                  <div class="task-card-item ${isChecked ? 'checked' : ''}" 
                       data-task-id="${task.id}" 
                       data-task-title="${task.text}"
                       data-stage-code="${stage.code}"
                       data-stage-title="${stage.title}">
                    <div class="custom-checkbox-target">
                      <svg class="check-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                        <polyline points="20 6 9 17 4 12"></polyline>
                      </svg>
                    </div>
                    <div class="task-text-body" style="width: 100%;">
                      <div class="task-title-text">
                        ${task.text}
                        <span class="task-required-tag">Obrigatória</span>
                      </div>
                      ${isChecked ? `
                        <div class="task-metadata-stamp">
                          <span>✓ Registrado por ${completedInfo.by} às ${completedInfo.at}</span>
                        </div>
                      ` : ''}
                    </div>
                  </div>

                  <!-- Upload de Foto da Cabine -->
                  <div style="margin-top: 10px; margin-bottom: 16px; padding-left: 12px;">
                    <div class="cabin-photo-dropzone" id="triggerCabinUploadBtn" style="border-style: dashed; padding: 16px;">
                      <input type="file" id="realCabinFileInput" accept="image/*" multiple style="display: none;">
                      <div style="font-size: 1.8rem; margin-bottom: 4px;">📷</div>
                      <div style="font-size: 0.95rem; font-weight: 700; color: var(--text-primary);">Clique para Anexar Foto das Mercadorias na Cabine</div>
                      <div style="font-size: 0.8rem; color: var(--text-muted); margin-top: 2px;">Selecione imagens do computador</div>
                    </div>

                    ${cabinPhotos.length > 0 ? `
                      <div style="font-size: 0.78rem; font-weight: 700; color: var(--text-muted); text-transform: uppercase; margin-top: 10px; margin-bottom: 8px;">
                        FOTOS DA CABINE ANEXADAS (${cabinPhotos.length}):
                      </div>
                      <div class="photo-preview-grid">
                        ${cabinPhotos.map((photoUrl, idx) => `
                          <div class="photo-preview-card">
                            <img src="${photoUrl}" alt="Foto Cabine ${idx + 1}">
                            <button type="button" class="photo-delete-btn" data-cabin-photo-idx="${idx}" title="Remover foto">✕</button>
                          </div>
                        `).join('')}
                      </div>
                    ` : ''}
                  </div>
                `;
              }

              return `
                <div class="task-card-item ${isChecked ? 'checked' : ''}" 
                     data-task-id="${task.id}" 
                     data-task-title="${task.text}"
                     data-stage-code="${stage.code}"
                     data-stage-title="${stage.title}">
                  <div class="custom-checkbox-target">
                    <svg class="check-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                      <polyline points="20 6 9 17 4 12"></polyline>
                    </svg>
                  </div>
                  <div class="task-text-body">
                    <div class="task-title-text">
                      ${task.text}
                      <span class="task-required-tag">Obrigatória</span>
                    </div>
                    ${isChecked ? `
                      <div class="task-metadata-stamp">
                        <span>✓ Registrado por ${completedInfo.by} às ${completedInfo.at}</span>
                      </div>
                    ` : ''}
                  </div>
                  <div class="task-arrow-indicator">›</div>
                </div>
              `;
            }).join('')}
          </div>
        ` : ''}
      ` : ''}
    </div>
  `;
}

// Render Content for Stage 5 (Conferência e Lançamentos)
function renderStage5ConferenciaContent(ticket, stage) {
  const isCabine = ticket.directionChoice === "alocar_cabine";
  const taskList = isCabine ? stage.tasksCabine : stage.tasksGeneral;
  const is100 = isStageCompleted(ticket, 5);

  return `
    <div style="margin-bottom: 24px;">
      <div style="font-size: 0.85rem; font-weight: 800; color: var(--marvel-red-primary); text-transform: uppercase; letter-spacing: 0.8px; margin-bottom: 12px;">
        CONFERÊNCIA E LANÇAMENTOS FINAIS (${isCabine ? 'MERCADORIA EM CABINE' : 'DEVOLUÇÃO GERAL'}):
      </div>

      <div class="tasks-list-container">
        ${renderCustomTaskList(ticket, taskList, stage)}
      </div>

      ${is100 ? `
        <div class="alert-banner success" style="padding: 24px; margin-top: 24px;">
          <div class="alert-icon">✓</div>
          <div>
            <div class="alert-content-title" style="font-size: 1.3rem;">ATENDIMENTO DE DEVOLUÇÃO CONCLUÍDO COM SUCESSO!</div>
            <div class="alert-content-desc">Todas as 5 etapas do checklist foram verificadas. Clique em "📄 Extrair Relatório" no canto inferior direito para exportar o relatório oficial.</div>
          </div>
        </div>
      ` : ''}
    </div>
  `;
}

// Helper to render any list of tasks
function renderCustomTaskList(ticket, tasks, stage) {
  return (tasks || []).map(task => {
    const completedInfo = ticket.completedTasks ? ticket.completedTasks[task.id] : null;
    const isChecked = !!completedInfo;
    const isMotivoTask = task.id === 't1_4' || task.text.toLowerCase().includes('motivo');

    return `
      <div class="task-card-item ${isChecked ? 'checked' : ''}" 
           data-task-id="${task.id}" 
           data-task-title="${task.text}"
           data-stage-code="${stage.code}"
           data-stage-title="${stage.title}">
        
        <div class="custom-checkbox-target">
          <svg class="check-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
        </div>

        <div class="task-text-body">
          <div class="task-title-text">
            ${task.text}
            <span class="task-required-tag">Obrigatória</span>
          </div>
          ${isMotivoTask ? `
            <div class="instruction-hint-badge">
              ℹ️ Se você sabe o motivo da devolução, pode avançar.
            </div>
          ` : ''}
          ${isChecked ? `
            <div class="task-metadata-stamp">
              <span>✓ Registrado por ${completedInfo.by} às ${completedInfo.at}</span>
            </div>
          ` : ''}
        </div>
        <div class="task-arrow-indicator">›</div>
      </div>
    `;
  }).join('');
}

// Render Tasks Cards list
function renderStageTasks(ticket, stage) {
  let taskList = [...stage.tasks];

  if (stage.id === 2 && ticket.flags?.noNf && stage.conditionals?.hasNoNfTask) {
    taskList.push(stage.conditionals.hasNoNfTask);
  }

  if (stage.id === 8 && stage.conditionals) {
    if (ticket.flags?.diffAddress && stage.conditionals.diffAddress) {
      taskList = [...taskList, ...stage.conditionals.diffAddress];
    }
    if (ticket.flags?.otherState && stage.conditionals.otherState) {
      taskList = [...taskList, ...stage.conditionals.otherState];
    }
  }

  return taskList.map(task => {
    const completedInfo = ticket.completedTasks ? ticket.completedTasks[task.id] : null;
    const isChecked = !!completedInfo;

    return `
      <div class="task-card-item ${isChecked ? 'checked' : ''}" 
           data-task-id="${task.id}" 
           data-task-title="${task.text}"
           data-stage-code="${stage.code}"
           data-stage-title="${stage.title}">
        
        <div class="custom-checkbox-target">
          <svg class="check-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
        </div>

        <div class="task-text-body">
          <div class="task-title-text">
            ${task.text}
            <span class="task-required-tag">Obrigatória</span>
          </div>
          ${isChecked ? `
            <div class="task-metadata-stamp">
              <span>✓ Registrado por ${completedInfo.by} às ${completedInfo.at}</span>
            </div>
          ` : ''}
        </div>
        <div class="task-arrow-indicator">›</div>
      </div>
    `;
  }).join('');
}

// Modal Confirmação de Reset de Checklist
function renderResetConfirmModal(ticket) {
  return `
    <div class="modal-overlay" id="resetConfirmModalOverlay">
      <div class="modal-card" style="max-width: 500px; border-color: var(--accent-red-border);">
        <div class="modal-header">
          <h2 class="modal-title" style="color: #FCA5A5; display: flex; align-items: center; gap: 8px;">
            ⚠️ RESETAR CHECKLIST?
          </h2>
          <button class="nav-btn" id="closeResetModalBtn" style="padding: 4px 10px;">✕</button>
        </div>

        <div style="font-size: 0.93rem; color: var(--text-secondary); line-height: 1.6; padding: 24px;">
          Essa ação irá reiniciar o checklist deste atendimento e retornar para a <strong>Etapa 01 — Recebimento</strong>.
          <br><br>
          Todas as etapas marcadas como concluídas voltarão para pendente. O operador deverá realizar novamente todas as verificações.
          <br><br>
          <div style="font-size: 0.82rem; color: var(--text-muted); background: rgba(255,255,255,0.03); padding: 10px; border-radius: 6px; border: 1px solid var(--border-color);">
            📌 <strong>IMPORTANTE:</strong> O histórico de auditoria prévio <u>NÃO será apagado</u>.
          </div>
        </div>

        <div class="modal-footer">
          <button type="button" class="nav-btn" id="cancelResetBtn">CANCELAR</button>
          <button type="button" class="btn-modal-danger" id="confirmResetBtn">SIM, RESETAR CHECKLIST</button>
        </div>
      </div>
    </div>
  `;
}

// Modal "Importar Checklist" (Revisão + 6 Campos Obrigatórios)
function renderImportChecklistModal(ticket) {
  const data = getMarvelData();
  const INITIAL_STAGES = data.INITIAL_STAGES || [];

  return `
    <div class="modal-overlay" id="importModalOverlay">
      <div class="modal-card" style="max-width: 780px;">
        <div class="modal-header">
          <h2 class="modal-title" style="color: var(--accent-green); display: flex; align-items: center; gap: 8px;">
            📄 EXTRAIR RELATÓRIO EM PDF — REVISÃO E CONFIRMAÇÃO
          </h2>
          <button class="nav-btn" id="closeImportModalBtn" style="padding: 4px 10px;">✕</button>
        </div>

        <div class="modal-body">
          ${state.importFormError ? `
            <div class="alert-banner critical" style="margin-bottom: 16px;">
              <div class="alert-icon">⚠️</div>
              <div>
                <div class="alert-content-title">DADOS COMPLEMENTARES INCOMPLETOS</div>
                <div class="alert-content-desc">${state.importFormError}</div>
              </div>
            </div>
          ` : ''}

          <!-- Form de 6 Campos Obrigatórios -->
          <div style="background: rgba(255, 255, 255, 0.03); border: 1px solid var(--border-light); border-radius: var(--radius-md); padding: 18px; margin-bottom: 24px;">
            <div style="font-size: 0.85rem; font-weight: 800; color: var(--accent-cyan); text-transform: uppercase; letter-spacing: 0.8px; margin-bottom: 14px;">
              📝 PREENCHA OS 6 DADOS COMPLEMENTARES OBRIGATÓRIOS DO CHAMADO:
            </div>

            <div class="form-group-grid">
              <div>
                <label class="form-field-label">Número do Protocolo *</label>
                <input type="text" class="form-field-input" id="inputProtocolo" placeholder="Ex: PROT-2026-9876" value="${state.importFormData.protocolo || ticket?.protocolo || ticket?.id || ''}">
              </div>

              <div>
                <label class="form-field-label">Número da Frota *</label>
                <input type="text" class="form-field-input" id="inputFrota" placeholder="Ex: MVT-12345" value="${state.importFormData.frota || ticket?.frota || ''}">
              </div>
            </div>

            <div class="form-group-grid">
              <div>
                <label class="form-field-label">Número da Nota de Devolução *</label>
                <input type="text" class="form-field-input" id="inputNotaDevolucao" placeholder="Ex: NF-DEV-889900" value="${state.importFormData.notaDevolucao || ''}">
              </div>

              <div>
                <label class="form-field-label">Número da Nota de Origem *</label>
                <input type="text" class="form-field-input" id="inputNotaOrigem" placeholder="Ex: NF-ORI-112233" value="${state.importFormData.notaOrigem || ''}">
              </div>
            </div>

            <div class="form-group-full">
              <label class="form-field-label">Contato do Motorista *</label>
              <input type="text" class="form-field-input" id="inputContato" placeholder="Ex: (11) 98765-4321 - João Santos" value="${state.importFormData.contato || ticket?.contato || ticket?.condutor || ''}">
            </div>

            <div class="form-group-full">
              <label class="form-field-label">Observação do Chamado *</label>
              <textarea class="form-field-input" id="inputObservacao" rows="3" placeholder="Descreva as observações finais do chamado ou tratativa realizada...">${state.importFormData.observacao || ''}</textarea>
            </div>
          </div>

          <!-- Relatório/Resumo do Checklist Preenchido -->
          <div style="font-size: 0.85rem; font-weight: 800; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.8px; margin-bottom: 12px;">
            📋 RELATÓRIO DE REVISÃO DAS ETAPAS AUDITADAS:
          </div>

          <div style="background: var(--bg-dark); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 14px; max-height: 200px; overflow-y: auto;">
            ${INITIAL_STAGES.map(stage => {
              const isBypassed = isStageBypassed(ticket, stage.id);
              return `
                <div style="display: flex; align-items: center; justify-content: space-between; padding: 8px 12px; border-bottom: 1px solid rgba(255, 255, 255, 0.05); font-size: 0.85rem;">
                  <div>
                    <span style="font-weight: 700; color: var(--text-primary);">Etapa ${stage.code}. ${stage.title}</span>
                    ${stage.id === 5 ? `<span style="font-size: 0.75rem; color: var(--accent-cyan); margin-left: 8px;">(${ticket.destinationChoice === 'destinacao_definida' ? 'Destinação definida' : 'Cabine avaliada'})</span>` : ''}
                  </div>
                  <span style="font-weight: 700; color: ${isBypassed ? 'var(--accent-cyan)' : 'var(--accent-green)'};">
                    ${isBypassed ? 'N/A (Não aplicável)' : '✓ 100% Concluído'}
                  </span>
                </div>
              `;
            }).join('')}
          </div>
          <!-- Informação de Envio Automático por E-mail -->
          <div style="background: rgba(220, 38, 38, 0.06); border: 1px solid rgba(220, 38, 38, 0.3); border-radius: var(--radius-md); padding: 12px 16px; margin-top: 14px; display: flex; align-items: center; justify-content: space-between; font-size: 0.85rem;">
            <div>
              <span style="font-weight: 800; color: #DC2626;">📧 ENVIO AUTOMÁTICO POR E-MAIL:</span>
              <div style="color: var(--text-primary); margin-top: 2px;">
                Destinatário: <strong>anomalia@marvel.com.br</strong> (Outlook / Microsoft 365)
              </div>
            </div>
            <span style="background: rgba(16, 185, 129, 0.2); color: #10B981; font-size: 0.75rem; font-weight: 800; padding: 3px 8px; border-radius: 4px; border: 1px solid #10B981;">
              ✓ ATIVO
            </span>
          </div>
        </div>

        <div class="modal-footer">
          <button type="button" class="nav-btn" id="cancelImportModalBtn">CANCELAR</button>
          <button type="button" class="btn-import-checklist" id="confirmGeneratePdfBtn" style="position: static; animation: none; padding: 10px 24px; font-size: 0.95rem;">
            📄 Confirmar e Extrair Relatório
          </button>
        </div>
      </div>
    </div>
  `;
}

// EXECUTE CREATE NEW INDEPENDENT TICKET
function executeCreateNewTicket() {
  const protocolo = (document.getElementById('inputNewProtocolo')?.value || "").trim();
  const condutor = (document.getElementById('inputNewCondutor')?.value || "").trim();
  const frota = (document.getElementById('inputNewFrota')?.value || "").trim();
  const contato = (document.getElementById('inputNewContato')?.value || "").trim();
  const cliente = (document.getElementById('inputNewCliente')?.value || "").trim();

  if (!protocolo || !condutor || !frota || !contato || !cliente) {
    state.newTicketFormError = "⚠️ Por favor, preencha TODOS os 5 campos (Protocolo, Condutor, Frota, Contato e Cliente).";
    state.newTicketFormData = { protocolo, condutor, frota, contato, cliente };
    renderApp();
    return;
  }

  // Check duplicate protocol
  const existing = state.atendimentos.find(t => (t.id === protocolo || t.protocolo === protocolo));
  if (existing) {
    state.newTicketFormError = `⚠️ Já existe um atendimento cadastrado com o protocolo "${protocolo}".`;
    state.newTicketFormData = { protocolo, condutor, frota, contato, cliente };
    renderApp();
    return;
  }

  const timestamp = new Date().toLocaleTimeString('pt-BR');
  const dateStamp = new Date().toLocaleDateString('pt-BR');

  const newTicket = {
    id: protocolo,
    protocolo: protocolo,
    condutor: condutor,
    frota: frota,
    contato: contato,
    cliente: cliente,
    ocorrencia: "Anomalia Operacional",
    operador: state.activeOperator,
    dataInicio: `${dateStamp} ${timestamp}`,
    currentStageId: 1,
    destinationChoice: null,
    completedTasks: {},
    cabinPhotos: [],
    flags: { noNf: false, diffAddress: false, otherState: false, riskTipping: false },
    auditLog: [
      {
        id: "log_" + Date.now(),
        text: `Novo atendimento cadastrado para ${condutor} (Frota ${frota})`,
        user: state.activeOperator,
        at: `${dateStamp} ${timestamp}`,
        stage: "01. Recebimento"
      }
    ]
  };

  state.atendimentos.push(newTicket);
  state.activeTicketId = newTicket.id;
  state.selectedStageId = 1;
  state.isNewTicketModalOpen = false;
  state.newTicketFormError = "";
  state.newTicketFormData = { protocolo: "", condutor: "", frota: "", contato: "", cliente: "" };

  saveState();
  renderApp();
}

// Modal "Cadastrar Novo Atendimento"
function renderNewTicketModal() {
  return `
    <div class="modal-overlay" id="newTicketModalOverlay">
      <div class="modal-card" style="max-width: 580px;">
        <div class="modal-header">
          <h2 class="modal-title" style="color: var(--marvel-red-primary); display: flex; align-items: center; gap: 8px;">
            ➕ CADASTRAR NOVO ATENDIMENTO
          </h2>
          <button class="nav-btn" id="closeNewTicketModalBtn" style="padding: 4px 10px;">✕</button>
        </div>

        <div class="modal-body">
          ${state.newTicketFormError ? `
            <div class="alert-banner critical" style="margin-bottom: 16px;">
              <div class="alert-icon">⚠️</div>
              <div>
                <div class="alert-content-title">DADOS INCOMPLETOS</div>
                <div class="alert-content-desc">${state.newTicketFormError}</div>
              </div>
            </div>
          ` : ''}

          <div style="background: var(--bg-app); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 18px;">
            <div style="font-size: 0.82rem; font-weight: 800; color: var(--marvel-red-primary); text-transform: uppercase; letter-spacing: 0.6px; margin-bottom: 14px;">
              📋 PREENCHA OS DADOS DO NOVO CONDUTOR:
            </div>

            <div class="form-group-grid">
              <div>
                <label class="form-field-label">Número do Protocolo *</label>
                <input type="text" class="form-field-input" id="inputNewProtocolo" placeholder="Ex: PROT-002" value="${state.newTicketFormData.protocolo || ''}">
              </div>

              <div>
                <label class="form-field-label">Nome do Condutor *</label>
                <input type="text" class="form-field-input" id="inputNewCondutor" placeholder="Ex: Carlos Santos" value="${state.newTicketFormData.condutor || ''}">
              </div>
            </div>

            <div class="form-group-grid">
              <div>
                <label class="form-field-label">Número da Frota *</label>
                <input type="text" class="form-field-input" id="inputNewFrota" placeholder="Ex: 5678" value="${state.newTicketFormData.frota || ''}">
              </div>

              <div>
                <label class="form-field-label">Contato *</label>
                <input type="text" class="form-field-input" id="inputNewContato" placeholder="Ex: (11) 98888-7777" value="${state.newTicketFormData.contato || ''}">
              </div>
            </div>

            <div class="form-group-full">
              <label class="form-field-label">Cliente *</label>
              <input type="text" class="form-field-input" id="inputNewCliente" placeholder="Ex: Ambev, Nestlé, Unilever..." value="${state.newTicketFormData.cliente || ''}">
            </div>
          </div>
        </div>

        <div class="modal-footer">
          <button type="button" class="nav-btn" id="cancelNewTicketBtn">CANCELAR</button>
          <button type="button" class="btn-add-ticket" id="confirmSaveNewTicketBtn" style="padding: 10px 24px; font-size: 0.95rem;">
            💾 SALVAR E ABRIR CHECKLIST
          </button>
        </div>
      </div>
    </div>
  `;
}

// Modal "Exportar/Compartilhar Checklist"
function renderExportShareModal(ticket) {
  if (!ticket) return "";
  const shareUrl = `${window.location.origin}${window.location.pathname}?checklist=${ticket.id}`;
  const is100 = isChecklist100PercentCompleted(ticket);

  return `
    <div class="modal-overlay" id="shareModalOverlay">
      <div class="modal-card" style="max-width: 620px;">
        <div class="modal-header">
          <h2 class="modal-title" style="color: var(--marvel-red-primary); display: flex; align-items: center; gap: 8px;">
            📤 EXPORTAR CHECKLIST — COMPARTILHAR ATENDIMENTO
          </h2>
          <button class="nav-btn" id="closeShareModalBtn" style="padding: 4px 10px;">✕</button>
        </div>

        <div class="modal-body">
          ${state.copyToastMessage ? `
            <div class="alert-banner success" style="margin-bottom: 16px;">
              <div class="alert-icon">✓</div>
              <div>
                <div class="alert-content-title">COPIADO COM SUCESSO!</div>
                <div class="alert-content-desc">${state.copyToastMessage}</div>
              </div>
            </div>
          ` : ''}

          <!-- Info do Checklist -->
          <div style="background: var(--bg-app); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 16px; margin-bottom: 20px;">
            <div style="font-size: 0.82rem; font-weight: 800; color: var(--marvel-red-primary); text-transform: uppercase; margin-bottom: 10px;">
              📋 DADOS DO CHECKLIST SELECIONADO:
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; font-size: 0.9rem; color: var(--text-primary);">
              <div><strong>Condutor:</strong> ${ticket.condutor || '-'}</div>
              <div><strong>Protocolo:</strong> ${ticket.protocolo || ticket.id}</div>
              <div><strong>Frota:</strong> ${ticket.frota || '-'}</div>
              <div><strong>Cliente:</strong> ${ticket.cliente || '-'}</div>
            </div>
            <div style="margin-top: 10px; font-size: 0.85rem; color: var(--text-primary);">
              <strong>Status:</strong> <span style="font-weight: 800; color: ${is100 ? '#10B981' : 'var(--marvel-red-primary)'};">${is100 ? '✓ 100% Concluído' : 'Em andamento'}</span>
            </div>
          </div>

          <!-- Link Único -->
          <div style="margin-bottom: 16px;">
            <label class="form-field-label">Link Único do Checklist *</label>
            <div style="display: flex; gap: 8px;">
              <input type="text" class="form-field-input" id="shareUrlInput" value="${shareUrl}" readonly style="background: #FFFFFF; font-weight: 600; color: var(--text-primary);">
              <button type="button" class="btn-add-ticket" id="copyShareUrlBtn" style="white-space: nowrap; padding: 10px 18px;">
                📋 Copiar Link
              </button>
            </div>
          </div>

          <!-- Código Único -->
          <div>
            <label class="form-field-label">Código Único do Atendimento *</label>
            <div style="display: flex; gap: 8px;">
              <input type="text" class="form-field-input" id="shareCodeInput" value="${ticket.id}" readonly style="background: #FFFFFF; font-weight: 700; color: var(--marvel-red-primary); width: 180px;">
              <button type="button" class="btn-reset-checklist" id="copyShareCodeBtn" style="white-space: nowrap;">
                🔗 Copiar Código
              </button>
            </div>
          </div>
        </div>

        <div class="modal-footer">
          <button type="button" class="nav-btn" id="cancelShareModalBtn">FECHAR</button>
        </div>
      </div>
    </div>
  `;
}

// Modal "Trazer Checklist Recebido"
function renderFetchReceivedModal() {
  return `
    <div class="modal-overlay" id="fetchModalOverlay">
      <div class="modal-card" style="max-width: 560px;">
        <div class="modal-header">
          <h2 class="modal-title" style="color: var(--marvel-red-primary); display: flex; align-items: center; gap: 8px;">
            📥 TRAZER CHECKLIST — IMPORTAR ATENDIMENTO
          </h2>
          <button class="nav-btn" id="closeFetchModalBtn" style="padding: 4px 10px;">✕</button>
        </div>

        <div class="modal-body">
          ${state.fetchModalInputError ? `
            <div class="alert-banner critical" style="margin-bottom: 16px;">
              <div class="alert-icon">⚠️</div>
              <div>
                <div class="alert-content-title">CHECKLIST NÃO ENCONTRADO</div>
                <div class="alert-content-desc">${state.fetchModalInputError}</div>
              </div>
            </div>
          ` : ''}

          <div style="background: var(--bg-app); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 18px;">
            <label class="form-field-label">Cole aqui o link ou código do checklist recebido *</label>
            <textarea class="form-field-input" id="inputReceivedLink" rows="3" placeholder="Ex: http://localhost:8080/?checklist=PROT-001 ou digite o código PROT-001"></textarea>
            <div style="font-size: 0.78rem; color: var(--text-secondary); margin-top: 8px;">
              O sistema irá localizar o atendimento no servidor central e carregar todas as etapas preenchidas sem duplicar registros.
            </div>
          </div>
        </div>

        <div class="modal-footer">
          <button type="button" class="nav-btn" id="cancelFetchModalBtn">CANCELAR</button>
          <button type="button" class="btn-add-ticket" id="confirmFetchChecklistBtn" style="padding: 10px 24px; font-size: 0.95rem;">
            📂 ABRIR CHECKLIST
          </button>
        </div>
      </div>
    </div>
  `;
}

// EXECUTE FETCH RECEIVED CHECKLIST
async function executeFetchReceivedChecklist() {
  const rawInput = (document.getElementById('inputReceivedLink')?.value || "").trim();
  if (!rawInput) {
    state.fetchModalInputError = "Por favor, cole um link ou código válido de checklist.";
    renderApp();
    return;
  }

  let extractedId = rawInput;
  try {
    if (rawInput.includes("http://") || rawInput.includes("https://")) {
      const parsedUrl = new URL(rawInput);
      extractedId = parsedUrl.searchParams.get("checklist") || parsedUrl.searchParams.get("c") || rawInput;
      if (!extractedId && parsedUrl.hash) {
        const hashParts = parsedUrl.hash.split("/");
        if (hashParts.length >= 3 && hashParts[1] === "checklist") {
          extractedId = hashParts[2];
        }
      }
    }
  } catch (e) {}

  extractedId = (extractedId || "").trim();

  // 1. Check local state.atendimentos
  let found = state.atendimentos.find(t => t.id === extractedId || t.protocolo === extractedId);

  // 2. Fetch from server API
  if (!found) {
    try {
      const res = await fetch("/api/checklists");
      if (res.ok) {
        const serverAtendimentos = await res.json();
        found = serverAtendimentos.find(t => t.id === extractedId || t.protocolo === extractedId);
        if (found) {
          state.atendimentos.push(found);
        }
      }
    } catch (e) {}
  }

  if (!found) {
    state.fetchModalInputError = "Não foi possível localizar este checklist. Verifique o link e tente novamente.";
    renderApp();
    return;
  }

  state.activeTicketId = found.id;
  state.selectedStageId = found.currentStageId || getFirstIncompleteStageId(found);
  state.isFetchModalOpen = false;
  state.fetchModalInputError = "";
  state.importedToastBanner = true;

  saveState();
  renderApp();
}

// Render Operator Login Screen (Matching mockup media_1789067394826.png)
function renderOperatorLoginScreen() {
  return `
    <div class="operator-login-screen">
      <div class="operator-login-wrapper">
        <!-- Left Side: Brand Artwork -->
        <div class="login-brand-side">
          <img src="./logo.png" alt="Marvel Check Logo" class="login-brand-logo-img">
          <div class="login-brand-title-main">MARVEL CHECK</div>
          <div class="login-brand-subtitle">ANOMALIAS</div>
          <div class="login-brand-company">TRANSPORTES MARVEL</div>
        </div>

        <!-- Right Side: Glassmorphic Card -->
        <div class="login-card-side">
          <div class="operator-login-card">
            <div class="login-card-avatar">👤</div>

            <form class="operator-login-form" id="operatorLoginForm" onsubmit="return false;">
              ${state.loginErrorMsg ? `
                <div class="operator-error-banner">
                  ⚠️ ${state.loginErrorMsg}
                </div>
              ` : ''}

              <div class="operator-input-wrapper">
                <span class="operator-input-icon">👤</span>
                <input type="text" class="operator-name-input" id="operatorNameInput" placeholder="Nome do usuário" autocomplete="name" autofocus>
              </div>

              <button type="submit" class="btn-operator-login" id="btnOperatorLogin">
                ENTRAR
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  `;
}

function executeOperatorLogin() {
  const inputEl = document.getElementById('operatorNameInput');
  const name = (inputEl ? inputEl.value : "").trim();

  if (!name) {
    state.loginErrorMsg = "Informe o seu nome completo para continuar.";
    renderApp();
    setTimeout(() => {
      const el = document.getElementById('operatorNameInput');
      if (el) el.focus();
    }, 50);
    return;
  }

  state.activeOperator = name;
  state.loginErrorMsg = "";
  if (typeof sessionStorage !== 'undefined') sessionStorage.setItem("marvel_operator_name", name);
  if (typeof localStorage !== 'undefined') localStorage.setItem("marvel_operator_name", name);
  saveState();
  renderApp();
}

function copyToClipboard(text, message) {
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(text);
  } else {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    document.body.appendChild(textArea);
    textArea.select();
    try { document.execCommand('copy'); } catch (err) {}
    document.body.removeChild(textArea);
  }
  state.copyToastMessage = message;
  renderApp();
  setTimeout(() => {
    state.copyToastMessage = "";
    renderApp();
  }, 3000);
}

// Render History View
function renderHistoryView(closedList) {
  const query = (state.historySearchQuery || "").toLowerCase().trim();
  
  let filtered = closedList.filter(t => {
    if (!query) return true;
    const matchProtocolo = (t.protocolo || "").toLowerCase().includes(query);
    const matchCondutor = (t.condutor || "").toLowerCase().includes(query);
    const matchFrota = (t.frota || "").toLowerCase().includes(query);
    const matchCliente = (t.cliente || "").toLowerCase().includes(query);
    return matchProtocolo || matchCondutor || matchFrota || matchCliente;
  });

  return `
    <div class="history-view-container">
      <div class="history-card-panel">
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px;">
          <div>
            <h2 style="font-size: 1.3rem; font-weight: 800; color: var(--marvel-red-primary);">
              📜 HISTÓRICO DE CHECKLISTS ENCERRADOS
            </h2>
            <div style="font-size: 0.85rem; color: var(--text-secondary); margin-top: 4px;">
              Consulta detalhada de atendimentos finalizados e arquivados
            </div>
          </div>
          <span style="font-weight: 800; font-size: 0.9rem; background: rgba(16, 185, 129, 0.1); color: #10B981; padding: 6px 14px; border-radius: var(--radius-md); border: 1px solid rgba(16, 185, 129, 0.3);">
            ${closedList.length} Atendimentos Arquivados
          </span>
        </div>

        <!-- Barra de Busca no Histórico -->
        <div class="history-search-bar">
          <input type="text" class="history-search-input" id="historySearchInput" placeholder="🔎 Pesquisar por protocolo, motorista, frota ou cliente..." value="${state.historySearchQuery || ''}">
          ${state.historySearchQuery ? `
            <button class="nav-btn" id="clearHistorySearchBtn" style="padding: 10px 14px;">Limpar Busca</button>
          ` : ''}
        </div>

        <!-- Tabela do Histórico -->
        ${filtered.length === 0 ? `
          <div style="padding: 40px; text-align: center; color: var(--text-secondary);">
            <div style="font-size: 2rem; margin-bottom: 8px;">📂</div>
            <div style="font-weight: 700; font-size: 1rem;">Nenhum atendimento encerrado encontrado</div>
            <div style="font-size: 0.85rem; margin-top: 4px;">${query ? 'Tente ajustar os termos de pesquisa' : 'Encerrar um checklist na aba "Em andamento" para enviá-lo para este histórico.'}</div>
          </div>
        ` : `
          <div style="overflow-x: auto;">
            <table class="history-table">
              <thead>
                <tr>
                  <th>Protocolo</th>
                  <th>Motorista / Condutor</th>
                  <th>Frota</th>
                  <th>Cliente</th>
                  <th>Data de Encerramento</th>
                  <th>Status</th>
                  <th style="text-align: right;">Ações</th>
                </tr>
              </thead>
              <tbody>
                ${filtered.map(t => `
                  <tr>
                    <td><strong>${t.protocolo || t.id}</strong></td>
                    <td>👤 ${t.condutor || 'Condutor'}</td>
                    <td>🚚 ${t.frota || '-'}</td>
                    <td>🏢 ${t.cliente || '-'}</td>
                    <td>📅 ${t.dataEncerramento || t.dataInicio || 'Concluído'}</td>
                    <td>
                      <span style="font-size: 0.75rem; font-weight: 800; padding: 4px 8px; border-radius: var(--radius-sm); background: rgba(16, 185, 129, 0.12); color: #10B981; border: 1px solid rgba(16, 185, 129, 0.3);">
                        ✓ Concluído (100%)
                      </span>
                    </td>
                    <td style="text-align: right;">
                      <div style="display: flex; align-items: center; justify-content: flex-end; gap: 8px;">
                        <button class="btn-history-consult" data-consult-id="${t.id}" title="Abrir checklist completo em modo consulta">
                          👁️ Consultar
                        </button>
                        <button class="btn-tab-share-mini" data-share-ticket-id="${t.id}" title="Exportar link único">
                          📤 Link
                        </button>
                        <button class="nav-btn" data-delete-ticket-id="${t.id}" style="color: #EF4444; border-color: rgba(239, 68, 68, 0.3); padding: 4px 8px; font-size: 0.75rem;" title="Excluir permanentemente">
                          🗑️
                        </button>
                      </div>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        `}
      </div>
    </div>
  `;
}

// Modal Confirmação de Encerramento de Atendimento
function renderCloseConfirmModal(ticket) {
  if (!ticket) return "";
  return `
    <div class="modal-overlay" id="closeConfirmModalOverlay">
      <div class="modal-card" style="max-width: 520px; border-color: #10B981;">
        <div class="modal-header">
          <h2 class="modal-title" style="color: #10B981; display: flex; align-items: center; gap: 8px;">
            🔒 ENCERRAR ATENDIMENTO?
          </h2>
          <button class="nav-btn" id="closeCloseModalBtn" style="padding: 4px 10px;">✕</button>
        </div>

        <div style="font-size: 0.93rem; color: var(--text-secondary); line-height: 1.6; padding: 24px;">
          Deseja encerrar este atendimento? Após o encerramento, ele será movido para o <strong>Histórico de Checklists Encerrados</strong> e ficará disponível para consulta futura.
          <br><br>
          <div style="background: var(--bg-app); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 14px; font-size: 0.88rem; color: var(--text-primary);">
            <div><strong>Motorista:</strong> ${ticket.condutor || '-'}</div>
            <div><strong>Protocolo:</strong> ${ticket.protocolo || ticket.id}</div>
            <div><strong>Frota:</strong> ${ticket.frota || '-'}</div>
            <div><strong>Cliente:</strong> ${ticket.cliente || '-'}</div>
          </div>
          <br>
          📌 <strong>IMPORTANTE:</strong> Nenhuma resposta ou foto será apagada. O atendimento continuará acessível via histórico e link compartilhado em modo de consulta.
        </div>

        <div class="modal-footer">
          <button type="button" class="nav-btn" id="cancelCloseModalBtn">CANCELAR</button>
          <button type="button" class="btn-close-ticket" id="confirmCloseTicketBtn" style="padding: 10px 22px;">
            🔒 SIM, ENCERRAR ATENDIMENTO
          </button>
        </div>
      </div>
    </div>
  `;
}

// Modal Confirmação de Exclusão Definitiva
function renderDeleteConfirmModal(ticket) {
  if (!ticket) return "";
  return `
    <div class="modal-overlay" id="deleteConfirmModalOverlay">
      <div class="modal-card" style="max-width: 520px; border-color: var(--marvel-red-border);">
        <div class="modal-header">
          <h2 class="modal-title" style="color: var(--marvel-red-primary); display: flex; align-items: center; gap: 8px;">
            ⚠️ EXCLUIR PERMANENTEMENTE CHECKLIST?
          </h2>
          <button class="nav-btn" id="closeDeleteModalBtn" style="padding: 4px 10px;">✕</button>
        </div>

        <div style="font-size: 0.93rem; color: var(--text-secondary); line-height: 1.6; padding: 24px;">
          Tem certeza que deseja <strong>excluir permanentemente</strong> este checklist do condutor <strong>${ticket.condutor}</strong> (Protocolo ${ticket.protocolo})?
          <br><br>
          <div style="font-size: 0.85rem; color: #DC2626; background: rgba(239, 68, 68, 0.08); border: 1px solid rgba(239, 68, 68, 0.3); padding: 12px; border-radius: 6px;">
            ⚠️ <strong>ATENÇÃO:</strong> Esta ação NÃO poderá ser desfeita. Todos os dados, etapas preenchidas, fotos e registros de auditoria serão removidos permanentemente.
          </div>
        </div>

        <div class="modal-footer">
          <button type="button" class="nav-btn" id="cancelDeleteModalBtn">CANCELAR</button>
          <button type="button" class="btn-modal-danger" id="confirmDeleteTicketBtn" style="padding: 10px 22px;">
            🗑️ SIM, EXCLUIR PERMANENTEMENTE
          </button>
        </div>
      </div>
    </div>
  `;
}

// EXECUTE CLOSE TICKET
function executeCloseTicket() {
  const ticketId = state.ticketIdToClose || state.activeTicketId;
  const ticket = state.atendimentos.find(t => t.id === ticketId);
  if (!ticket) return;

  const timestamp = new Date().toLocaleTimeString('pt-BR');
  const dateStamp = new Date().toLocaleDateString('pt-BR');

  ticket.status = "Concluído";
  ticket.dataEncerramento = `${dateStamp} ${timestamp}`;
  ticket.closedBy = state.activeOperator;

  const logEntry = {
    id: "log_" + Date.now(),
    text: `🔒 Atendimento encerrado por ${state.activeOperator} e movido para o histórico`,
    user: state.activeOperator,
    at: `${dateStamp} ${timestamp}`,
    stage: "Encerramento"
  };
  ticket.auditLog = [logEntry, ...(ticket.auditLog || [])];

  state.isCloseConfirmOpen = false;
  state.ticketIdToClose = null;

  // Switch active ticket to another ongoing ticket if available
  const remainingOngoing = state.atendimentos.filter(t => t.status !== "Concluído");
  if (remainingOngoing.length > 0) {
    state.activeTicketId = remainingOngoing[0].id;
  }

  saveState();
  renderApp();
}

function executeReopenTicket() {
  const ticket = getActiveTicket();
  if (!ticket) return;

  const timestamp = new Date().toLocaleTimeString('pt-BR');
  const dateStamp = new Date().toLocaleDateString('pt-BR');

  ticket.status = "Em andamento";

  const logEntry = {
    id: "log_" + Date.now(),
    text: `🔓 Atendimento reaberto por ${state.activeOperator} para edição`,
    user: state.activeOperator,
    at: `${dateStamp} ${timestamp}`,
    stage: "Reabertura"
  };
  ticket.auditLog = [logEntry, ...(ticket.auditLog || [])];

  saveState();
  renderApp();
}

function executeDeleteTicket() {
  const ticketId = state.ticketIdToDelete;
  if (!ticketId) return;

  state.atendimentos = state.atendimentos.filter(t => t.id !== ticketId);

  if (state.activeTicketId === ticketId) {
    if (state.atendimentos.length > 0) {
      state.activeTicketId = state.atendimentos[0].id;
    } else {
      state.activeTicketId = null;
    }
  }

  state.isDeleteConfirmOpen = false;
  state.ticketIdToDelete = null;

  saveState();
  renderApp();
}

// Event Listeners Routing
function attachEventListeners() {
  // Operator Login & Switch Listeners
  const operatorLoginForm = document.getElementById('operatorLoginForm');
  const btnOperatorLogin = document.getElementById('btnOperatorLogin');

  if (operatorLoginForm) {
    operatorLoginForm.addEventListener('submit', (e) => {
      e.preventDefault();
      executeOperatorLogin();
    });
  }

  if (btnOperatorLogin) {
    btnOperatorLogin.addEventListener('click', (e) => {
      e.preventDefault();
      executeOperatorLogin();
    });
  }

  const switchOperatorBtn = document.getElementById('switchOperatorBtn');
  if (switchOperatorBtn) {
    switchOperatorBtn.addEventListener('click', () => {
      state.activeOperator = "";
      state.loginErrorMsg = "";
      if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem("marvel_operator_name");
      if (typeof localStorage !== 'undefined') localStorage.removeItem("marvel_operator_name");
      saveState();
      renderApp();
    });
  }

  // Manager Tabs (Em Andamento vs Histórico)
  const tabViewOngoing = document.getElementById('tabViewOngoing');
  if (tabViewOngoing) {
    tabViewOngoing.addEventListener('click', () => {
      state.viewTab = 'ongoing';
      renderApp();
    });
  }

  const tabViewHistory = document.getElementById('tabViewHistory');
  if (tabViewHistory) {
    tabViewHistory.addEventListener('click', () => {
      state.viewTab = 'history';
      renderApp();
    });
  }

  // History Search Input Listener
  const historySearchInput = document.getElementById('historySearchInput');
  if (historySearchInput) {
    historySearchInput.addEventListener('input', (e) => {
      state.historySearchQuery = e.target.value;
      renderApp();
    });
  }

  const clearHistorySearchBtn = document.getElementById('clearHistorySearchBtn');
  if (clearHistorySearchBtn) {
    clearHistorySearchBtn.addEventListener('click', () => {
      state.historySearchQuery = "";
      renderApp();
    });
  }

  // History Consultation Click Handler
  document.querySelectorAll('.btn-history-consult').forEach(btn => {
    btn.addEventListener('click', () => {
      const ticketId = btn.getAttribute('data-consult-id');
      if (ticketId) {
        state.activeTicketId = ticketId;
        state.viewTab = 'ongoing';
        const ticket = getActiveTicket();
        if (ticket) {
          state.selectedStageId = ticket.currentStageId || 1;
        }
        renderApp();
      }
    });
  });

  // Close Ticket Trigger (Header & Tab Action)
  const triggerCloseTicketBtn = document.getElementById('triggerCloseTicketBtn');
  if (triggerCloseTicketBtn) {
    triggerCloseTicketBtn.addEventListener('click', () => {
      state.ticketIdToClose = state.activeTicketId;
      state.isCloseConfirmOpen = true;
      renderApp();
    });
  }

  document.querySelectorAll('[data-close-ticket-id]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const ticketId = btn.getAttribute('data-close-ticket-id');
      if (ticketId) {
        state.ticketIdToClose = ticketId;
        state.isCloseConfirmOpen = true;
        renderApp();
      }
    });
  });

  const confirmCloseTicketBtn = document.getElementById('confirmCloseTicketBtn');
  if (confirmCloseTicketBtn) {
    confirmCloseTicketBtn.addEventListener('click', executeCloseTicket);
  }

  const cancelCloseModalBtn = document.getElementById('cancelCloseModalBtn');
  const closeCloseModalBtn = document.getElementById('closeCloseModalBtn');
  const closeConfirmModalOverlay = document.getElementById('closeConfirmModalOverlay');
  if (cancelCloseModalBtn) cancelCloseModalBtn.addEventListener('click', () => { state.isCloseConfirmOpen = false; renderApp(); });
  if (closeCloseModalBtn) closeCloseModalBtn.addEventListener('click', () => { state.isCloseConfirmOpen = false; renderApp(); });
  if (closeConfirmModalOverlay) {
    closeConfirmModalOverlay.addEventListener('click', (e) => {
      if (e.target === closeConfirmModalOverlay) { state.isCloseConfirmOpen = false; renderApp(); }
    });
  }

  // Reopen Ticket Trigger
  const triggerReopenTicketBtn = document.getElementById('triggerReopenTicketBtn');
  if (triggerReopenTicketBtn) {
    triggerReopenTicketBtn.addEventListener('click', executeReopenTicket);
  }

  // Permanent Delete Ticket Trigger
  document.querySelectorAll('[data-delete-ticket-id]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const ticketId = btn.getAttribute('data-delete-ticket-id');
      if (ticketId) {
        state.ticketIdToDelete = ticketId;
        state.isDeleteConfirmOpen = true;
        renderApp();
      }
    });
  });

  const confirmDeleteTicketBtn = document.getElementById('confirmDeleteTicketBtn');
  if (confirmDeleteTicketBtn) {
    confirmDeleteTicketBtn.addEventListener('click', executeDeleteTicket);
  }

  const cancelDeleteModalBtn = document.getElementById('cancelDeleteModalBtn');
  const closeDeleteModalBtn = document.getElementById('closeDeleteModalBtn');
  const deleteConfirmModalOverlay = document.getElementById('deleteConfirmModalOverlay');
  if (cancelDeleteModalBtn) cancelDeleteModalBtn.addEventListener('click', () => { state.isDeleteConfirmOpen = false; renderApp(); });
  if (closeDeleteModalBtn) closeDeleteModalBtn.addEventListener('click', () => { state.isDeleteConfirmOpen = false; renderApp(); });
  if (deleteConfirmModalOverlay) {
    deleteConfirmModalOverlay.addEventListener('click', (e) => {
      if (e.target === deleteConfirmModalOverlay) { state.isDeleteConfirmOpen = false; renderApp(); }
    });
  }

  // Open New Ticket Modal
  const triggerAddTicketBtn = document.getElementById('triggerAddTicketBtn');
  if (triggerAddTicketBtn) {
    triggerAddTicketBtn.addEventListener('click', () => {
      state.isNewTicketModalOpen = true;
      state.newTicketFormError = "";
      renderApp();
    });
  }

  // Confirm Save New Ticket inside Modal
  const confirmSaveNewTicketBtn = document.getElementById('confirmSaveNewTicketBtn');
  if (confirmSaveNewTicketBtn) {
    confirmSaveNewTicketBtn.addEventListener('click', executeCreateNewTicket);
  }

  const cancelNewTicketBtn = document.getElementById('cancelNewTicketBtn');
  const closeNewTicketModalBtn = document.getElementById('closeNewTicketModalBtn');
  const newTicketModalOverlay = document.getElementById('newTicketModalOverlay');
  if (cancelNewTicketBtn) cancelNewTicketBtn.addEventListener('click', () => { state.isNewTicketModalOpen = false; renderApp(); });
  if (closeNewTicketModalBtn) closeNewTicketModalBtn.addEventListener('click', () => { state.isNewTicketModalOpen = false; renderApp(); });
  if (newTicketModalOverlay) {
    newTicketModalOverlay.addEventListener('click', (e) => {
      if (e.target === newTicketModalOverlay) { state.isNewTicketModalOpen = false; renderApp(); }
    });
  }

  // Open Export/Share Modal
  const triggerExportShareBtn = document.getElementById('triggerExportShareBtn');
  if (triggerExportShareBtn) {
    triggerExportShareBtn.addEventListener('click', () => {
      state.isShareModalOpen = true;
      state.copyToastMessage = "";
      renderApp();
    });
  }

  // Mini share buttons in multi-ticket tabs
  document.querySelectorAll('.btn-tab-share-mini').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const ticketId = btn.getAttribute('data-share-ticket-id');
      if (ticketId) {
        state.activeTicketId = ticketId;
        state.isShareModalOpen = true;
        state.copyToastMessage = "";
        renderApp();
      }
    });
  });

  const cancelShareModalBtn = document.getElementById('cancelShareModalBtn');
  const closeShareModalBtn = document.getElementById('closeShareModalBtn');
  const shareModalOverlay = document.getElementById('shareModalOverlay');
  if (cancelShareModalBtn) cancelShareModalBtn.addEventListener('click', () => { state.isShareModalOpen = false; renderApp(); });
  if (closeShareModalBtn) closeShareModalBtn.addEventListener('click', () => { state.isShareModalOpen = false; renderApp(); });
  if (shareModalOverlay) {
    shareModalOverlay.addEventListener('click', (e) => {
      if (e.target === shareModalOverlay) { state.isShareModalOpen = false; renderApp(); }
    });
  }

  const copyShareUrlBtn = document.getElementById('copyShareUrlBtn');
  if (copyShareUrlBtn) {
    copyShareUrlBtn.addEventListener('click', () => {
      const shareUrlInput = document.getElementById('shareUrlInput');
      if (shareUrlInput) {
        copyToClipboard(shareUrlInput.value, "Link do checklist copiado para a área de transferência!");
      }
    });
  }

  const copyShareCodeBtn = document.getElementById('copyShareCodeBtn');
  if (copyShareCodeBtn) {
    copyShareCodeBtn.addEventListener('click', () => {
      const shareCodeInput = document.getElementById('shareCodeInput');
      if (shareCodeInput) {
        copyToClipboard(shareCodeInput.value, "Código do checklist copiado para a área de transferência!");
      }
    });
  }

  // Open Fetch Received Modal ("Trazer Checklist")
  const openFetchChecklistBtn = document.getElementById('openFetchChecklistBtn');
  if (openFetchChecklistBtn) {
    openFetchChecklistBtn.addEventListener('click', () => {
      state.isFetchModalOpen = true;
      state.fetchModalInputError = "";
      renderApp();
    });
  }

  const confirmFetchChecklistBtn = document.getElementById('confirmFetchChecklistBtn');
  if (confirmFetchChecklistBtn) {
    confirmFetchChecklistBtn.addEventListener('click', executeFetchReceivedChecklist);
  }

  const cancelFetchModalBtn = document.getElementById('cancelFetchModalBtn');
  const closeFetchModalBtn = document.getElementById('closeFetchModalBtn');
  const fetchModalOverlay = document.getElementById('fetchModalOverlay');
  if (cancelFetchModalBtn) cancelFetchModalBtn.addEventListener('click', () => { state.isFetchModalOpen = false; renderApp(); });
  if (closeFetchModalBtn) closeFetchModalBtn.addEventListener('click', () => { state.isFetchModalOpen = false; renderApp(); });
  if (fetchModalOverlay) {
    fetchModalOverlay.addEventListener('click', (e) => {
      if (e.target === fetchModalOverlay) { state.isFetchModalOpen = false; renderApp(); }
    });
  }

  const dismissImportBannerBtn = document.getElementById('dismissImportBannerBtn');
  if (dismissImportBannerBtn) {
    dismissImportBannerBtn.addEventListener('click', () => {
      state.importedToastBanner = false;
      renderApp();
    });
  }

  // Switch Active Ticket Tab
  document.querySelectorAll('.ticket-tab-item').forEach(tab => {
    tab.addEventListener('click', () => {
      const ticketId = tab.getAttribute('data-ticket-id');
      if (ticketId && ticketId !== state.activeTicketId) {
        state.activeTicketId = ticketId;
        const targetTicket = getActiveTicket();
        if (targetTicket) {
          state.selectedStageId = targetTicket.currentStageId || getFirstIncompleteStageId(targetTicket);
        }
        saveState();
        renderApp();
      }
    });
  });

  const triggerResetBtn = document.getElementById('triggerResetChecklistBtn');
  if (triggerResetBtn) {
    triggerResetBtn.addEventListener('click', () => {
      state.isResetConfirmOpen = true;
      renderApp();
    });
  }

  const confirmResetBtn = document.getElementById('confirmResetBtn');
  if (confirmResetBtn) {
    confirmResetBtn.addEventListener('click', executeResetChecklist);
  }

  const cancelResetBtn = document.getElementById('cancelResetBtn');
  const closeResetModalBtn = document.getElementById('closeResetModalBtn');
  const resetConfirmOverlay = document.getElementById('resetConfirmModalOverlay');
  if (cancelResetBtn) cancelResetBtn.addEventListener('click', () => { state.isResetConfirmOpen = false; renderApp(); });
  if (closeResetModalBtn) closeResetModalBtn.addEventListener('click', () => { state.isResetConfirmOpen = false; renderApp(); });
  if (resetConfirmOverlay) {
    resetConfirmOverlay.addEventListener('click', (e) => {
      if (e.target === resetConfirmOverlay) { state.isResetConfirmOpen = false; renderApp(); }
    });
  }

  // Open Import Modal (PDF Report)
  const openImportBtn = document.getElementById('openImportChecklistBtn');
  if (openImportBtn) {
    openImportBtn.addEventListener('click', () => {
      const ticket = getActiveTicket();
      state.isImportModalOpen = true;
      state.importFormError = "";
      state.importFormData = {
        protocolo: ticket?.protocolo || ticket?.id || "",
        frota: ticket?.frota || "",
        contato: ticket?.contato || ticket?.condutor || "",
        notaDevolucao: state.importFormData.notaDevolucao || "",
        notaOrigem: state.importFormData.notaOrigem || "",
        observacao: state.importFormData.observacao || ""
      };
      renderApp();
    });
  }

  // Confirm PDF Generation inside Modal
  const confirmPdfBtn = document.getElementById('confirmGeneratePdfBtn');
  if (confirmPdfBtn) {
    confirmPdfBtn.addEventListener('click', executeGeneratePDF);
  }

  const cancelImportModalBtn = document.getElementById('cancelImportModalBtn');
  const closeImportModalBtn = document.getElementById('closeImportModalBtn');
  const importModalOverlay = document.getElementById('importModalOverlay');
  if (cancelImportModalBtn) cancelImportModalBtn.addEventListener('click', () => { state.isImportModalOpen = false; renderApp(); });
  if (closeImportModalBtn) closeImportModalBtn.addEventListener('click', () => { state.isImportModalOpen = false; renderApp(); });
  if (importModalOverlay) {
    importModalOverlay.addEventListener('click', (e) => {
      if (e.target === importModalOverlay) { state.isImportModalOpen = false; renderApp(); }
    });
  }

  const dismissToastBtn = document.getElementById('dismissToastBtn');
  if (dismissToastBtn) {
    dismissToastBtn.addEventListener('click', () => {
      state.showResetToast = false;
      state.showSuccessToast = false;
      renderApp();
    });
  }

  const dismissEmailErrorToastBtn = document.getElementById('dismissEmailErrorToastBtn');
  if (dismissEmailErrorToastBtn) {
    dismissEmailErrorToastBtn.addEventListener('click', () => {
      state.showEmailErrorToast = false;
      renderApp();
    });
  }

  // Stage 2 Choice Cards Click Handler (Parcial vs Total)
  document.querySelectorAll('[data-doc-choice-id]').forEach(card => {
    card.addEventListener('click', () => {
      const choiceId = card.getAttribute('data-doc-choice-id');
      const choiceTitle = card.getAttribute('data-choice-title');
      selectStage2DocChoice(choiceId, choiceTitle);
    });
  });

  // Stage 4 Choice Cards Click Handler (Fornecedor vs Cabine)
  document.querySelectorAll('[data-direction-choice-id]').forEach(card => {
    card.addEventListener('click', () => {
      const choiceId = card.getAttribute('data-direction-choice-id');
      const choiceTitle = card.getAttribute('data-choice-title');
      selectStage4DirectionChoice(choiceId, choiceTitle);
    });
  });

  // Stage 3 Product Photo Real File Upload Trigger
  const triggerProductUploadBtn = document.getElementById('triggerProductUploadBtn');
  const realProductFileInput = document.getElementById('realProductFileInput');
  if (triggerProductUploadBtn && realProductFileInput) {
    triggerProductUploadBtn.addEventListener('click', (e) => {
      if (e.target !== realProductFileInput) {
        realProductFileInput.click();
      }
    });

    realProductFileInput.addEventListener('change', (e) => {
      const files = Array.from(e.target.files || []);
      if (files.length === 0) return;

      files.forEach(file => {
        const reader = new FileReader();
        reader.onload = (event) => {
          if (event.target && event.target.result) {
            addProductPhoto(event.target.result);
          }
        };
        reader.readAsDataURL(file);
      });
      realProductFileInput.value = '';
    });
  }

  // Stage 4 Cabin Photo Real File Upload Trigger
  const triggerCabinUploadBtn = document.getElementById('triggerCabinUploadBtn');
  const realCabinFileInput = document.getElementById('realCabinFileInput');
  if (triggerCabinUploadBtn && realCabinFileInput) {
    triggerCabinUploadBtn.addEventListener('click', (e) => {
      if (e.target !== realCabinFileInput) {
        realCabinFileInput.click();
      }
    });

    realCabinFileInput.addEventListener('change', (e) => {
      const files = Array.from(e.target.files || []);
      if (files.length === 0) return;

      files.forEach(file => {
        const reader = new FileReader();
        reader.onload = (event) => {
          if (event.target && event.target.result) {
            addCabinPhoto(event.target.result);
          }
        };
        reader.readAsDataURL(file);
      });
      realCabinFileInput.value = '';
    });
  }

  // Remove Photo Buttons
  document.querySelectorAll('[data-product-photo-idx]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const idx = parseInt(btn.getAttribute('data-product-photo-idx'), 10);
      removeProductPhoto(idx);
    });
  });

  document.querySelectorAll('[data-cabin-photo-idx]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const idx = parseInt(btn.getAttribute('data-cabin-photo-idx'), 10);
      removeCabinPhoto(idx);
    });
  });

  // Stage 4.02 Carregamento Photo Real File Upload Trigger
  const triggerCarregamentoUploadBtn = document.getElementById('triggerCarregamentoUploadBtn');
  const realCarregamentoFileInput = document.getElementById('realCarregamentoFileInput');
  if (triggerCarregamentoUploadBtn && realCarregamentoFileInput) {
    triggerCarregamentoUploadBtn.addEventListener('click', (e) => {
      if (e.target !== realCarregamentoFileInput) {
        realCarregamentoFileInput.click();
      }
    });

    realCarregamentoFileInput.addEventListener('change', (e) => {
      const files = Array.from(e.target.files || []);
      if (files.length === 0) return;

      files.forEach(file => {
        const reader = new FileReader();
        reader.onload = (event) => {
          if (event.target && event.target.result) {
            addCarregamentoPhoto(event.target.result);
          }
        };
        reader.readAsDataURL(file);
      });
      realCarregamentoFileInput.value = '';
    });
  }

  // Stage 4.02 Foto Final Real File Upload Trigger
  const triggerFotoFinalUploadBtn = document.getElementById('triggerFotoFinalUploadBtn');
  const realFotoFinalFileInput = document.getElementById('realFotoFinalFileInput');
  if (triggerFotoFinalUploadBtn && realFotoFinalFileInput) {
    triggerFotoFinalUploadBtn.addEventListener('click', (e) => {
      if (e.target !== realFotoFinalFileInput) {
        realFotoFinalFileInput.click();
      }
    });

    realFotoFinalFileInput.addEventListener('change', (e) => {
      const files = Array.from(e.target.files || []);
      if (files.length === 0) return;

      files.forEach(file => {
        const reader = new FileReader();
        reader.onload = (event) => {
          if (event.target && event.target.result) {
            addFotoFinalPhoto(event.target.result);
          }
        };
        reader.readAsDataURL(file);
      });
      realFotoFinalFileInput.value = '';
    });
  }

  document.querySelectorAll('[data-carregamento-photo-idx]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const idx = parseInt(btn.getAttribute('data-carregamento-photo-idx'), 10);
      removeCarregamentoPhoto(idx);
    });
  });

  document.querySelectorAll('[data-fotofinal-photo-idx]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const idx = parseInt(btn.getAttribute('data-fotofinal-photo-idx'), 10);
      removeFotoFinalPhoto(idx);
    });
  });

  // Sidebar Stage Navigation
  document.querySelectorAll('.stage-nav-item:not(.locked)').forEach(el => {
    el.addEventListener('click', () => {
      const stageId = parseInt(el.getAttribute('data-stage-id'), 10);
      state.selectedStageId = stageId;
      const ticket = getActiveTicket();
      if (ticket) ticket.currentStageId = stageId;
      renderApp();
    });
  });

  // Task Cards Click Handler
  document.querySelectorAll('.task-card-item').forEach(el => {
    el.addEventListener('click', () => {
      const taskId = el.getAttribute('data-task-id');
      const taskTitle = el.getAttribute('data-task-title');
      const stageCode = el.getAttribute('data-stage-code');
      const stageTitle = el.getAttribute('data-stage-title');
      toggleTask(taskId, taskTitle, stageCode, stageTitle);
    });
  });

  const flagNoNfEl = document.getElementById('flagNoNf');
  if (flagNoNfEl) flagNoNfEl.addEventListener('change', () => toggleFlag('noNf'));

  const flagDiffAddressEl = document.getElementById('flagDiffAddress');
  if (flagDiffAddressEl) flagDiffAddressEl.addEventListener('change', () => toggleFlag('diffAddress'));

  const flagOtherStateEl = document.getElementById('flagOtherState');
  if (flagOtherStateEl) flagOtherStateEl.addEventListener('change', () => toggleFlag('otherState'));

  const flagRiskTippingEl = document.getElementById('flagRiskTipping');
  if (flagRiskTippingEl) flagRiskTippingEl.addEventListener('change', () => toggleFlag('riskTipping'));
}

window.initApp = initApp;

if (document.readyState === 'complete' || document.readyState === 'interactive') {
  setTimeout(initApp, 50);
} else {
  document.addEventListener('DOMContentLoaded', initApp);
}
