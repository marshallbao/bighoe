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
  importSeatsBtn: document.querySelector("#importSeatsBtn"),
  applySizeBtn: document.querySelector("#applySizeBtn"),
  addRowBtn: document.querySelector("#addRowBtn"),
  removeRowBtn: document.querySelector("#removeRowBtn"),
  addColBtn: document.querySelector("#addColBtn"),
  removeColBtn: document.querySelector("#removeColBtn"),
  clearSeatsBtn: document.querySelector("#clearSeatsBtn"),
  resetBtn: document.querySelector("#resetBtn"),
  exportBtn: document.querySelector("#exportBtn")
};

let draggedId = null;
let saveTimer = null;

function activeClass() {
  return BighoeData.getActiveClass();
}

function seatStorageKey() {
  return `${SEAT_STORAGE_PREFIX}-${activeClass().id}`;
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
  return BighoeData.getStudents(activeClass().id, { includeInactive: true });
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

function saveState() {
  localStorage.setItem(seatStorageKey(), JSON.stringify(state));
  els.saveState.textContent = "已自动保存";
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    els.saveState.textContent = "已自动保存";
  }, 900);
}

function markChanged() {
  els.saveState.textContent = "保存中...";
  pruneMissingStudents();
  render();
  saveState();
}

function loadState() {
  state.rows = 4;
  state.cols = 6;
  state.seats = [];

  const migrated = BighoeData.migrateLegacySeatPlanner();
  const stored = localStorage.getItem(seatStorageKey());

  if (!stored && migrated && migrated.classId === activeClass().id) {
    state.rows = migrated.rows;
    state.cols = migrated.cols;
    state.seats = migrated.seats;
    ensureSeatSize();
    saveState();
    return;
  }

  if (!stored) {
    ensureSeatSize();
    return;
  }

  try {
    const parsed = JSON.parse(stored);
    state.rows = Number(parsed.rows) || state.rows;
    state.cols = Number(parsed.cols) || state.cols;
    state.seats = Array.isArray(parsed.seats) ? parsed.seats : [];
    ensureSeatSize();
    pruneMissingStudents();
  } catch {
    ensureSeatSize();
  }
}

function makeStudentCard(student) {
  const card = document.createElement("div");
  card.className = "student-card";
  card.draggable = true;
  card.textContent = student.name;
  card.dataset.id = student.id;
  card.addEventListener("dragstart", (event) => {
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

function moveStudentToSeat(studentId, seatIndex) {
  const fromIndex = state.seats.indexOf(studentId);
  const targetId = state.seats[seatIndex];

  if (fromIndex !== -1) {
    state.seats[fromIndex] = targetId || null;
  } else if (targetId) {
    state.seats[seatIndex] = null;
  }

  state.seats[seatIndex] = studentId;
  markChanged();
}

function moveStudentToRoster(studentId) {
  const fromIndex = state.seats.indexOf(studentId);
  if (fromIndex !== -1) {
    state.seats[fromIndex] = null;
    markChanged();
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

function render() {
  const students = getStudents();
  renderClassSelect();
  els.currentClassName.textContent = activeClass().name;
  els.rowsInput.value = state.rows;
  els.colsInput.value = state.cols;
  els.studentCount.textContent = `${students.length} 人`;
  els.seatCount.textContent = `${state.rows * state.cols} 座`;
  renderBoard();
  renderRoster();
}

function renderClassSelect() {
  const sharedState = BighoeData.readState();
  els.classSelect.innerHTML = "";
  sharedState.classes.forEach((classItem) => {
    const option = document.createElement("option");
    option.value = classItem.id;
    option.textContent = classItem.name;
    option.selected = classItem.id === sharedState.activeClassId;
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

function importSeats(text) {
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
  markChanged();
}

function hasSeatArrangement() {
  return state.seats.some(Boolean);
}

function resizeSeats(rows, cols) {
  state.rows = Math.min(12, Math.max(1, Number(rows) || 1));
  state.cols = Math.min(12, Math.max(1, Number(cols) || 1));
  ensureSeatSize();
  markChanged();
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

  const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `${activeClass().name}-学生座次表.txt`;
  link.click();
  URL.revokeObjectURL(link.href);
}

els.classSelect.addEventListener("change", () => {
  BighoeData.setActiveClass(els.classSelect.value);
  loadState();
  render();
});
els.importSeatsBtn.addEventListener("click", () => {
  if (!els.seatInput.value.trim()) return;
  if (hasSeatArrangement() && !confirm("导入座次会覆盖当前座位安排，确定继续吗？")) return;
  importSeats(els.seatInput.value);
});
els.applySizeBtn.addEventListener("click", () => resizeSeats(els.rowsInput.value, els.colsInput.value));
els.addRowBtn.addEventListener("click", () => resizeSeats(state.rows + 1, state.cols));
els.removeRowBtn.addEventListener("click", () => resizeSeats(state.rows - 1, state.cols));
els.addColBtn.addEventListener("click", () => resizeSeats(state.rows, state.cols + 1));
els.removeColBtn.addEventListener("click", () => resizeSeats(state.rows, state.cols - 1));
els.clearSeatsBtn.addEventListener("click", () => {
  state.seats = Array(state.rows * state.cols).fill(null);
  markChanged();
});
els.resetBtn.addEventListener("click", () => {
  if (!confirm("确定要重置当前班级的座位安排吗？公共学生名单会保留。")) return;
  state.seats = Array(state.rows * state.cols).fill(null);
  localStorage.removeItem(seatStorageKey());
  markChanged();
});
els.exportBtn.addEventListener("click", exportSeats);
els.seatFileInput.addEventListener("change", async () => {
  const [file] = els.seatFileInput.files;
  if (!file) return;
  if (hasSeatArrangement() && !confirm("导入座次文件会覆盖当前座位安排，确定继续吗？")) {
    els.seatFileInput.value = "";
    return;
  }
  importSeats(await file.text());
  els.seatFileInput.value = "";
});
addDropHandlers(els.roster, moveStudentToRoster);

loadState();
render();
