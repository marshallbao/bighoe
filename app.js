const SEAT_STORAGE_PREFIX = "bighoe-seat-plan-v1";

const state = {
  rows: 4,
  cols: 6,
  seats: []
};

const els = {
  board: document.querySelector("#board"),
  roster: document.querySelector("#roster"),
  seatInput: document.querySelector("#seatInput"),
  seatFileInput: document.querySelector("#seatFileInput"),
  classSelect: document.querySelector("#classSelect"),
  rowsInput: document.querySelector("#rowsInput"),
  colsInput: document.querySelector("#colsInput"),
  studentCount: document.querySelector("#studentCount"),
  unassignedCount: document.querySelector("#unassignedCount"),
  seatCount: document.querySelector("#seatCount"),
  saveState: document.querySelector("#saveState"),
  currentClassName: document.querySelector("#currentClassName"),
  currentPlanName: document.querySelector("#currentPlanName"),
  planList: document.querySelector("#planList"),
  importSeatsBtn: document.querySelector("#importSeatsBtn"),
  applySizeBtn: document.querySelector("#applySizeBtn"),
  addRowBtn: document.querySelector("#addRowBtn"),
  removeRowBtn: document.querySelector("#removeRowBtn"),
  addColBtn: document.querySelector("#addColBtn"),
  removeColBtn: document.querySelector("#removeColBtn"),
  clearSeatsBtn: document.querySelector("#clearSeatsBtn"),
  resetBtn: document.querySelector("#resetBtn"),
  exportBtn: document.querySelector("#exportBtn"),
  newPlanBtn: document.querySelector("#newPlanBtn")
};

let draggedId = null;
let saveTimer = null;
let classStudentsCache = [];
let currentPlanId = null;
let currentPlanName = "";
let isEditing = false;

function activeClass() {
  return BighoeData.getActiveClass();
}

function normalizeSeatName(name) {
  return name.replace(/^\s*(?:\d+|[一二三四五六七八九十百]+)[.、)]\s*/, "").trim();
}

function isEmptySeat(value) {
  return /^(?:空|空位|空座|-|--|无|none|null)$/i.test(value.trim());
}

function ensureSeatSize() {
  const target = state.rows * state.cols;
  if (state.seats.length < target) {
    state.seats.push(...Array(target - state.seats.length).fill(null));
  }
  if (state.seats.length > target) {
    state.seats.splice(target);
  }
}

function getStudents() {
  return classStudentsCache;
}

function getAssignedIds() {
  return new Set(state.seats.filter(Boolean));
}

function getStudent(id) {
  return BighoeData.getStudentById(id);
}

function getStudentBySeatName(name) {
  const normalized = normalizeSeatName(name);
  if (!normalized || isEmptySeat(normalized)) return null;
  return BighoeData.findStudentByName(normalized, activeClass().id) || { missingName: normalized };
}

function pruneMissingStudents() {
  const knownIds = new Set(getStudents().map((student) => student.id));
  state.seats = state.seats.map((studentId) => (knownIds.has(studentId) ? studentId : null));
}

function authenticatedFetch(url, options = {}) {
  const csrfToken = sessionStorage.getItem('bighoe_csrf_token');
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {})
  };

  if (csrfToken && options.method && options.method !== "GET") {
    headers["X-CSRF-Token"] = csrfToken;
  }

  return fetch(url, { ...options, headers, credentials: "same-origin" });
}

async function saveState() {
  const activeCls = activeClass();
  if (!activeCls) return;

  els.saveState.textContent = "保存中...";
  try {
    if (currentPlanId) {
      const res = await authenticatedFetch("/api/seating/plan/update", {
        method: "POST",
        body: JSON.stringify({
          id: currentPlanId,
          name: currentPlanName || "未命名计划",
          rows: state.rows,
          cols: state.cols,
          seats: state.seats
        })
      });
      if (res.status === 401 || res.status === 403) {
        sessionStorage.removeItem('bighoe_csrf_token');
        window.location.href = 'login.html';
        return;
      }
    } else {
      const res = await authenticatedFetch("/api/seating/update", {
        method: "POST",
        body: JSON.stringify({
          classId: activeCls.id,
          rows: state.rows,
          cols: state.cols,
          seats: state.seats
        })
      });
    }
    els.saveState.textContent = "已自动保存";
  } catch (err) {
    console.error("Failed to save seating:", err);
    els.saveState.textContent = "保存失败";
  }

  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    els.saveState.textContent = "已自动保存";
  }, 900);
}

async function markChanged() {
  pruneMissingStudents();
  await render();
  await saveState();
}

async function loadState() {
  state.rows = 4;
  state.cols = 6;
  state.seats = [];
  currentPlanId = null;
  currentPlanName = "";

  const activeCls = activeClass();
  if (!activeCls) {
    ensureSeatSize();
    return;
  }

  try {
    const plans = await authenticatedFetch(`/api/seating/plans?classId=${activeCls.id}`).then((r) => r.json());
    if (plans.status === 401) {
      sessionStorage.removeItem('bighoe_csrf_token');
      window.location.href = 'login.html';
      return;
    }
    if (Array.isArray(plans) && plans.length > 0) {
      const activePlan = plans.find((p) => p.isActive) || plans[0];
      currentPlanId = activePlan.id;
      currentPlanName = activePlan.name;
      state.rows = activePlan.rows;
      state.cols = activePlan.cols;
      state.seats = activePlan.seats;
    } else {
      const data = await authenticatedFetch(`/api/seating?classId=${activeCls.id}`).then((r) => r.json());
      state.rows = Number(data.rows) || state.rows;
      state.cols = Number(data.cols) || state.cols;
      state.seats = Array.isArray(data.seats) ? data.seats : [];
    }
    ensureSeatSize();
    pruneMissingStudents();
  } catch (err) {
    console.error("Failed to load seating:", err);
    ensureSeatSize();
  }
}

async function loadPlan(planId) {
  const activeCls = activeClass();
  if (!activeCls || !planId) return;

  try {
    const plan = await authenticatedFetch(`/api/seating/plan?id=${planId}`).then((r) => r.json());
    currentPlanId = plan.id;
    currentPlanName = plan.name;
    state.rows = plan.rows;
    state.cols = plan.cols;
    state.seats = plan.seats;
    ensureSeatSize();
    pruneMissingStudents();
    isEditing = false;
    await authenticatedFetch("/api/seating/plan/activate", {
      method: "POST",
      body: JSON.stringify({ id: planId, classId: activeCls.id })
    });
    await render();
  } catch (err) {
    console.error("Failed to load plan:", err);
  }
}

function startEditing() {
  isEditing = true;
  els.saveState.textContent = "编辑模式";
  render();
}

function stopEditing() {
  isEditing = false;
  els.saveState.textContent = "已自动保存";
  render();
}

async function renamePlan() {
  const newName = prompt("请输入新的计划名称：", currentPlanName);
  if (!newName || newName.trim() === "") return;
  
  try {
    await authenticatedFetch("/api/seating/plan/update", {
      method: "POST",
      body: JSON.stringify({
        id: currentPlanId,
        name: newName.trim(),
        rows: state.rows,
        cols: state.cols,
        seats: state.seats
      })
    });
    currentPlanName = newName.trim();
    await render();
  } catch (err) {
    console.error("Failed to rename plan:", err);
  }
}

async function createNewPlan() {
  const activeCls = activeClass();
  if (!activeCls) return;

  const name = prompt("请输入座位计划名称：", `座次计划 ${new Date().toLocaleDateString()}`);
  if (!name) return;

  const planId = BighoeData.createId("seat-plan");
  try {
    await authenticatedFetch("/api/seating/plan/create", {
      method: "POST",
      body: JSON.stringify({
        id: planId,
        classId: activeCls.id,
        name,
        rows: state.rows,
        cols: state.cols,
        seats: state.seats
      })
    });
    await authenticatedFetch("/api/seating/plan/activate", {
      method: "POST",
      body: JSON.stringify({ id: planId, classId: activeCls.id })
    });
    currentPlanId = planId;
    currentPlanName = name;
    await render();
  } catch (err) {
    console.error("Failed to create plan:", err);
  }
}

async function copyPlan(sourceId) {
  const activeCls = activeClass();
  if (!activeCls || !sourceId) return;

  const name = prompt("请输入新座位计划名称：", `${currentPlanName} (副本)`);
  if (!name) return;

  const newId = BighoeData.createId("seat-plan");
  try {
    await authenticatedFetch("/api/seating/plan/copy", {
      method: "POST",
      body: JSON.stringify({ id: sourceId, newId, newName: name })
    });
    await authenticatedFetch("/api/seating/plan/activate", {
      method: "POST",
      body: JSON.stringify({ id: newId, classId: activeCls.id })
    });
    currentPlanId = newId;
    currentPlanName = name;
    await render();
  } catch (err) {
    console.error("Failed to copy plan:", err);
  }
}

async function deletePlan(planId) {
  if (!confirm("确定要删除这个座位计划吗？")) return;

  try {
    const res = await authenticatedFetch("/api/seating/plan/delete", {
      method: "POST",
      body: JSON.stringify({ id: planId })
    });
    if (res.ok) {
      if (currentPlanId === planId) {
        currentPlanId = null;
        currentPlanName = "";
      }
      await loadState();
      await render();
    }
  } catch (err) {
    console.error("Failed to delete plan:", err);
  }
}

function makeStudentCard(student) {
  const card = document.createElement("div");
  card.className = `student-card${isEditing ? "" : " disabled"}`;
  card.draggable = isEditing;
  card.textContent = student.name;
  card.dataset.id = student.id;
  card.addEventListener("dragstart", (event) => {
    if (!isEditing) {
      event.preventDefault();
      return;
    }
    draggedId = student.id;
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", student.id);
    card.classList.add("dragging");
  });
  card.addEventListener("dragend", () => {
    draggedId = null;
    card.classList.remove("dragging");
    document.querySelectorAll(".drag-over").forEach((node) => node.classList.remove("drag-over"));
  });
  return card;
}

async function moveStudentToSeat(studentId, seatIndex) {
  if (!isEditing) {
    alert("请先点击「编辑」按钮进入编辑模式后再进行排位操作");
    return;
  }
  const fromIndex = state.seats.indexOf(studentId);
  const targetId = state.seats[seatIndex];

  if (fromIndex !== -1) {
    state.seats[fromIndex] = targetId || null;
  } else if (targetId) {
    state.seats[seatIndex] = null;
  }

  state.seats[seatIndex] = studentId;
  await markChanged();
}

async function moveStudentToRoster(studentId) {
  if (!isEditing) {
    alert("请先点击「编辑」按钮进入编辑模式后再进行排位操作");
    return;
  }
  const fromIndex = state.seats.indexOf(studentId);
  if (fromIndex !== -1) {
    state.seats[fromIndex] = null;
    await markChanged();
  }
}

function addDropHandlers(target, onDrop) {
  target.addEventListener("dragover", (event) => {
    event.preventDefault();
    target.classList.add("drag-over");
  });
  target.addEventListener("dragleave", () => target.classList.remove("drag-over"));
  target.addEventListener("drop", (event) => {
    event.preventDefault();
    const studentId = event.dataTransfer.getData("text/plain") || draggedId;
    target.classList.remove("drag-over");
    if (studentId) onDrop(studentId);
  });
}

function renderBoard() {
  els.board.style.setProperty("--cols", state.cols);
  els.board.innerHTML = "";

  state.seats.slice(0, state.rows * state.cols).forEach((studentId, index) => {
    const seat = document.createElement("div");
    seat.className = "seat";
    seat.dataset.label = `${Math.floor(index / state.cols) + 1}-${(index % state.cols) + 1}`;
    addDropHandlers(seat, (id) => moveStudentToSeat(id, index));

    const student = studentId ? getStudent(studentId) : null;
    if (student) seat.appendChild(makeStudentCard(student));
    els.board.appendChild(seat);
  });
}

function renderRoster() {
  const assigned = getAssignedIds();
  const unassigned = getStudents().filter((student) => !assigned.has(student.id));
  els.roster.innerHTML = "";

  if (!unassigned.length) {
    const empty = document.createElement("span");
    empty.className = "save-state";
    empty.textContent = "暂无未入座学生";
    els.roster.appendChild(empty);
  } else {
    unassigned.forEach((student) => els.roster.appendChild(makeStudentCard(student)));
  }

  els.unassignedCount.textContent = `${unassigned.length} 人`;
}

async function renderPlanList() {
  const activeCls = activeClass();
  if (!activeCls) {
    els.planList.innerHTML = "<p class='empty-copy'>暂无座位计划</p>";
    return;
  }

  try {
    const plans = await authenticatedFetch(`/api/seating/plans?classId=${activeCls.id}`).then((r) => r.json());
    if (!Array.isArray(plans) || plans.length === 0) {
      els.planList.innerHTML = "<p class='empty-copy'>暂无座位计划</p>";
      return;
    }

    els.planList.innerHTML = "";
    plans.forEach((plan) => {
      const isCurrentPlan = plan.id === currentPlanId;
      const item = document.createElement("div");
      item.className = `list-item ${isCurrentPlan ? "active" : ""}`;
      item.dataset.id = plan.id;
      item.innerHTML = `
        <strong>${plan.name}</strong>
        <div style="display: flex; gap: 4px; justify-content: flex-end;">
          <button class="rename-plan-btn" type="button" style="font-size: 11px; padding: 2px 6px;">重命名</button>
          <button class="copy-plan-btn" type="button" style="font-size: 11px; padding: 2px 6px;">复制</button>
          ${isCurrentPlan ? `<button class="edit-plan-btn ${isEditing ? "danger" : ""}" type="button" style="font-size: 11px; padding: 2px 6px;">${isEditing ? "完成" : "编辑"}</button>` : ""}
          ${!plan.isActive ? `<button class="delete-plan-btn" type="button" style="font-size: 11px; padding: 2px 6px; color: #b64242;">删除</button>` : ""}
        </div>
      `;
      item.addEventListener("click", () => {
        if (plan.id !== currentPlanId) {
          loadPlan(plan.id);
        }
      });
      item.querySelector(".rename-plan-btn").addEventListener("click", (e) => {
        e.stopPropagation();
        renamePlan();
      });
      item.querySelector(".copy-plan-btn").addEventListener("click", (e) => {
        e.stopPropagation();
        copyPlan(plan.id);
      });
      if (item.querySelector(".edit-plan-btn")) {
        item.querySelector(".edit-plan-btn").addEventListener("click", (e) => {
          e.stopPropagation();
          if (isEditing) {
            stopEditing();
          } else {
            startEditing();
          }
        });
      }
      if (item.querySelector(".delete-plan-btn")) {
        item.querySelector(".delete-plan-btn").addEventListener("click", (e) => {
          e.stopPropagation();
          deletePlan(plan.id);
        });
      }
      els.planList.appendChild(item);
    });
  } catch (err) {
    console.error("Failed to render plan list:", err);
    els.planList.innerHTML = "<p class='empty-copy'>加载失败</p>";
  }
}

async function render() {
  const sharedState = await BighoeData.readState();
  const activeCls = activeClass();

  if (activeCls) {
    classStudentsCache = await BighoeData.getStudents(activeCls.id, { includeInactive: true });
  } else {
    classStudentsCache = [];
  }

  renderClassSelectWithOptions(sharedState.classes, sharedState.activeClassId);
  els.currentClassName.textContent = activeCls ? activeCls.name : "暂无班级";
  
  const planStatus = currentPlanId ? `当前计划：${currentPlanName}` : "未选择计划（临时编辑）";
  els.currentPlanName.textContent = isEditing ? `${planStatus} · 编辑中` : planStatus;
  
  els.rowsInput.value = state.rows;
  els.colsInput.value = state.cols;
  els.studentCount.textContent = `${classStudentsCache.length} 人`;
  els.seatCount.textContent = `${state.rows * state.cols} 座`;
  renderBoard();
  renderRoster();
  await renderPlanList();
}

function renderClassSelectWithOptions(classes, activeClassId) {
  els.classSelect.innerHTML = "";
  classes.forEach((classItem) => {
    const option = document.createElement("option");
    option.value = classItem.id;
    option.textContent = classItem.name;
    option.selected = classItem.id === activeClassId;
    els.classSelect.appendChild(option);
  });
}

function splitSeatRow(rowText) {
  return rowText
    .split(/[\t,，、;；]+/)
    .map((name) => normalizeSeatName(name))
    .filter((name) => name.length > 0);
}

function parseSeatText(text) {
  const trimmed = text.trim().replace(/[;；]\s*(?=第\s*\d+\s*行)/g, "\n");
  if (!trimmed) return [];

  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed.seats)) return parsed.seats;
    if (Array.isArray(parsed)) return parsed;
  } catch {
    // Plain text is the primary import format.
  }

  return trimmed
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const rowMatch = line.match(/^第\s*\d+\s*行\s*[:：]?\s*(.*)$/);
      return splitSeatRow(rowMatch ? rowMatch[1] : line);
    })
    .filter((row) => row.length > 0);
}

async function importSeats(text) {
  if (!isEditing) {
    alert("请先点击「编辑」按钮进入编辑模式后再进行导入操作");
    return;
  }
  const rows = parseSeatText(text);
  if (!rows.length) {
    alert("没有识别到可导入的座次内容。");
    return;
  }

  const nextRows = Math.min(12, rows.length);
  const nextCols = Math.min(12, Math.max(...rows.map((row) => row.length)));
  const nextSeats = Array(nextRows * nextCols).fill(null);
  const missingNames = new Set();

  rows.slice(0, nextRows).forEach((row, rowIndex) => {
    row.slice(0, nextCols).forEach((name, colIndex) => {
      const student = getStudentBySeatName(String(name));
      if (student?.missingName) {
        missingNames.add(student.missingName);
        return;
      }
      nextSeats[rowIndex * nextCols + colIndex] = student ? student.id : null;
    });
  });

  if (missingNames.size) {
    alert(`以下学生不在当前班级名单中，请先到“班级和学生管理”添加：\n${[...missingNames].join("、")}`);
    return;
  }

  state.rows = nextRows;
  state.cols = nextCols;
  state.seats = nextSeats;
  els.seatInput.value = "";
  await markChanged();
}

function hasSeatArrangement() {
  return state.seats.some(Boolean);
}

async function resizeSeats(rows, cols) {
  if (!isEditing) {
    alert("请先点击「编辑」按钮进入编辑模式后再调整座位尺寸");
    return;
  }
  state.rows = Math.min(12, Math.max(1, Number(rows) || 1));
  state.cols = Math.min(12, Math.max(1, Number(cols) || 1));
  ensureSeatSize();
  await markChanged();
}

function exportSeats() {
  const lines = [];
  for (let row = 0; row < state.rows; row += 1) {
    const names = [];
    for (let col = 0; col < state.cols; col += 1) {
      const student = getStudent(state.seats[row * state.cols + col]);
      names.push(student ? student.name : "空");
    }
    lines.push(`第 ${row + 1} 行：${names.join("，")}`);
  }

  const planName = currentPlanName || "座次表";
  const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `${activeClass().name}-${planName}.txt`;
  link.click();
  URL.revokeObjectURL(link.href);
}

els.classSelect.addEventListener("change", async () => {
  BighoeData.setActiveClass(els.classSelect.value);
  await loadState();
  await render();
});

els.importSeatsBtn.addEventListener("click", async () => {
  if (!els.seatInput.value.trim()) return;
  if (hasSeatArrangement() && !confirm("导入座次会覆盖当前座位安排，确定继续吗？")) return;
  await importSeats(els.seatInput.value);
});

els.applySizeBtn.addEventListener("click", () => resizeSeats(els.rowsInput.value, els.colsInput.value));
els.addRowBtn.addEventListener("click", () => resizeSeats(state.rows + 1, state.cols));
els.removeRowBtn.addEventListener("click", () => resizeSeats(state.rows - 1, state.cols));
els.addColBtn.addEventListener("click", () => resizeSeats(state.rows, state.cols + 1));
els.removeColBtn.addEventListener("click", () => resizeSeats(state.rows, state.cols - 1));

els.clearSeatsBtn.addEventListener("click", async () => {
  if (!isEditing) {
    alert("请先点击「编辑」按钮进入编辑模式后再进行清空操作");
    return;
  }
  state.seats = Array(state.rows * state.cols).fill(null);
  await markChanged();
});

els.resetBtn.addEventListener("click", async () => {
  if (!isEditing) {
    alert("请先点击「编辑」按钮进入编辑模式后再进行重置操作");
    return;
  }
  if (!confirm("确定要重置当前班级的座位安排吗？公共学生名单会保留。")) return;
  state.seats = Array(state.rows * state.cols).fill(null);
  await markChanged();
});

els.exportBtn.addEventListener("click", exportSeats);

els.seatFileInput.addEventListener("change", async () => {
  const [file] = els.seatFileInput.files;
  if (!file) return;
  if (hasSeatArrangement() && !confirm("导入座次文件会覆盖当前座位安排，确定继续吗？")) {
    els.seatFileInput.value = "";
    return;
  }
  await importSeats(await file.text());
  els.seatFileInput.value = "";
});

els.newPlanBtn.addEventListener("click", createNewPlan);

addDropHandlers(els.roster, moveStudentToRoster);

async function init() {
  await BighoeData.readState();
  await loadState();
  await render();
}
init();
