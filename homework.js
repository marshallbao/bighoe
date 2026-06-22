const HOMEWORK_KEY = "bighoe-homework-v1";
const homeworkStatuses = [
  { value: "submitted", label: "已交" },
  { value: "missing", label: "未交" },
  { value: "late", label: "迟交" },
  { value: "excused", label: "请假" },
  { value: "not_required", label: "无需提交" }
];

const homeworkEls = {
  classSelect: document.querySelector("#classSelect"),
  titleInput: document.querySelector("#homeworkTitleInput"),
  subjectInput: document.querySelector("#homeworkSubjectInput"),
  dateInput: document.querySelector("#homeworkDateInput"),
  noteInput: document.querySelector("#homeworkNoteInput"),
  createBtn: document.querySelector("#createHomeworkBtn"),
  homeworkCount: document.querySelector("#homeworkCount"),
  homeworkList: document.querySelector("#homeworkList"),
  selectedTitle: document.querySelector("#selectedHomeworkTitle"),
  markAllSubmittedBtn: document.querySelector("#markAllSubmittedBtn"),
  copyMissingBtn: document.querySelector("#copyMissingBtn"),
  dueCount: document.querySelector("#dueCount"),
  submittedCount: document.querySelector("#submittedCount"),
  missingCount: document.querySelector("#missingCount"),
  onTimeRate: document.querySelector("#onTimeRate"),
  recordTable: document.querySelector("#recordTable"),
  analysis: document.querySelector("#homeworkAnalysis"),
  periodButtons: document.querySelectorAll("[data-period]")
};

let selectedHomeworkId = null;
let analysisPeriod = "week";

function todayText() {
  return new Date().toISOString().slice(0, 10);
}

function readHomeworkState() {
  try {
    const parsed = JSON.parse(localStorage.getItem(HOMEWORK_KEY));
    return Array.isArray(parsed?.tasks) ? parsed : { tasks: [] };
  } catch {
    return { tasks: [] };
  }
}

function writeHomeworkState(state) {
  localStorage.setItem(HOMEWORK_KEY, JSON.stringify(state));
}

function activeClass() {
  return BighoeData.getActiveClass();
}

function classStudents() {
  return BighoeData.getStudents(activeClass().id).filter((student) => student.status === "active");
}

function classTasks() {
  return readHomeworkState()
    .tasks.filter((task) => task.classId === activeClass().id)
    .sort((a, b) => b.assignedDate.localeCompare(a.assignedDate));
}

function selectedTask() {
  return classTasks().find((task) => task.id === selectedHomeworkId) || classTasks()[0] || null;
}

function startOfWeek(dateText) {
  const date = new Date(`${dateText}T00:00:00`);
  const day = date.getDay() || 7;
  date.setDate(date.getDate() - day + 1);
  return date.toISOString().slice(0, 10);
}

function samePeriod(taskDate, period) {
  const today = todayText();
  if (period === "week") return startOfWeek(taskDate) === startOfWeek(today);
  if (period === "month") return taskDate.slice(0, 7) === today.slice(0, 7);
  return true;
}

function renderClassSelect() {
  const state = BighoeData.readState();
  homeworkEls.classSelect.innerHTML = "";
  state.classes.forEach((classItem) => {
    const option = document.createElement("option");
    option.value = classItem.id;
    option.textContent = classItem.name;
    option.selected = classItem.id === state.activeClassId;
    homeworkEls.classSelect.appendChild(option);
  });
}

function renderHomeworkList(tasks) {
  homeworkEls.homeworkList.innerHTML = "";
  homeworkEls.homeworkCount.textContent = `${tasks.length} 项`;

  if (!tasks.length) {
    const empty = document.createElement("p");
    empty.className = "empty-copy";
    empty.textContent = "还没有作业记录。";
    homeworkEls.homeworkList.appendChild(empty);
    return;
  }

  tasks.forEach((task) => {
    const item = document.createElement("button");
    item.className = `list-item ${task.id === selectedHomeworkId ? "active" : ""}`;
    item.type = "button";
    item.innerHTML = `<strong></strong><span>${task.assignedDate} · ${task.subject || "未设置科目"}</span>`;
    item.querySelector("strong").textContent = task.title;
    item.addEventListener("click", () => {
      selectedHomeworkId = task.id;
      render();
    });
    homeworkEls.homeworkList.appendChild(item);
  });
}

function statusSelect(student, task) {
  const select = document.createElement("select");
  select.dataset.studentId = student.id;
  const current = task.records?.[student.id] || "missing";
  homeworkStatuses.forEach((status) => {
    const option = document.createElement("option");
    option.value = status.value;
    option.textContent = status.label;
    option.selected = status.value === current;
    select.appendChild(option);
  });
  select.addEventListener("change", () => updateRecord(task.id, student.id, select.value));
  return select;
}

function renderRecordTable(task, students) {
  homeworkEls.recordTable.innerHTML = "";

  if (!task) {
    const empty = document.createElement("p");
    empty.className = "empty-copy";
    empty.textContent = "先创建或选择一项作业。";
    homeworkEls.recordTable.appendChild(empty);
    return;
  }

  if (!students.length) {
    const empty = document.createElement("p");
    empty.className = "empty-copy";
    empty.textContent = "当前班级还没有在读学生。";
    homeworkEls.recordTable.appendChild(empty);
    return;
  }

  const header = document.createElement("div");
  header.className = "record-row record-head";
  header.innerHTML = "<span>序号</span><span>姓名</span><span>提交状态</span>";
  homeworkEls.recordTable.appendChild(header);

  students.forEach((student, index) => {
    const row = document.createElement("div");
    row.className = "record-row";
    row.innerHTML = `<span>${index + 1}</span><strong></strong>`;
    row.querySelector("strong").textContent = student.name;
    row.appendChild(statusSelect(student, task));
    homeworkEls.recordTable.appendChild(row);
  });
}

function taskSummary(task, students) {
  const counts = { due: 0, submitted: 0, missing: 0, onTime: 0 };
  students.forEach((student) => {
    const status = task?.records?.[student.id] || "missing";
    if (status !== "not_required") counts.due += 1;
    if (status === "submitted" || status === "late") counts.submitted += 1;
    if (status === "missing") counts.missing += 1;
    if (status === "submitted") counts.onTime += 1;
  });
  return counts;
}

function renderSummary(task, students) {
  const summary = taskSummary(task, students);
  homeworkEls.dueCount.textContent = summary.due;
  homeworkEls.submittedCount.textContent = summary.submitted;
  homeworkEls.missingCount.textContent = summary.missing;
  homeworkEls.onTimeRate.textContent = summary.due ? `${Math.round((summary.onTime / summary.due) * 100)}%` : "0%";
}

function renderAnalysis(students) {
  const tasks = classTasks().filter((task) => samePeriod(task.assignedDate, analysisPeriod));
  homeworkEls.analysis.innerHTML = "";

  if (!tasks.length || !students.length) {
    const empty = document.createElement("p");
    empty.className = "empty-copy";
    empty.textContent = "当前周期暂无可统计数据。";
    homeworkEls.analysis.appendChild(empty);
    return;
  }

  const header = document.createElement("div");
  header.className = "analysis-row analysis-head";
  header.innerHTML = "<span>学生</span><span>应交</span><span>按时</span><span>未交</span><span>按时率</span><span>未交率</span>";
  homeworkEls.analysis.appendChild(header);

  students.forEach((student) => {
    const stats = { due: 0, onTime: 0, missing: 0 };
    tasks.forEach((task) => {
      const status = task.records?.[student.id] || "missing";
      if (status !== "not_required") stats.due += 1;
      if (status === "submitted") stats.onTime += 1;
      if (status === "missing") stats.missing += 1;
    });
    const row = document.createElement("div");
    row.className = "analysis-row";
    row.innerHTML = `
      <strong></strong>
      <span>${stats.due}</span>
      <span>${stats.onTime}</span>
      <span>${stats.missing}</span>
      <span>${stats.due ? Math.round((stats.onTime / stats.due) * 100) : 0}%</span>
      <span>${stats.due ? Math.round((stats.missing / stats.due) * 100) : 0}%</span>
    `;
    row.querySelector("strong").textContent = student.name;
    homeworkEls.analysis.appendChild(row);
  });
}

function updateRecord(taskId, studentId, status) {
  const state = readHomeworkState();
  const task = state.tasks.find((item) => item.id === taskId);
  if (!task) return;
  task.records = task.records || {};
  task.records[studentId] = status;
  task.updatedAt = new Date().toISOString();
  writeHomeworkState(state);
  render();
}

function createHomework() {
  const title = homeworkEls.titleInput.value.trim();
  if (!title) {
    alert("请填写作业标题。");
    return;
  }

  const assignedDate = homeworkEls.dateInput.value || todayText();
  const state = readHomeworkState();
  const task = {
    id: BighoeData.createId("homework"),
    classId: activeClass().id,
    title,
    subject: homeworkEls.subjectInput.value.trim(),
    assignedDate,
    weekStart: startOfWeek(assignedDate),
    note: homeworkEls.noteInput.value.trim(),
    records: {},
    createdAt: new Date().toISOString()
  };
  classStudents().forEach((student) => {
    task.records[student.id] = "missing";
  });
  state.tasks.push(task);
  writeHomeworkState(state);
  selectedHomeworkId = task.id;
  homeworkEls.titleInput.value = "";
  homeworkEls.subjectInput.value = "";
  homeworkEls.noteInput.value = "";
  render();
}

function markAllSubmitted() {
  const task = selectedTask();
  if (!task) return;
  const state = readHomeworkState();
  const storedTask = state.tasks.find((item) => item.id === task.id);
  classStudents().forEach((student) => {
    storedTask.records[student.id] = "submitted";
  });
  writeHomeworkState(state);
  render();
}

async function copyMissingList() {
  const task = selectedTask();
  if (!task) return;
  const missing = classStudents().filter((student) => (task.records?.[student.id] || "missing") === "missing");
  const text = `${task.assignedDate} ${task.subject || ""}${task.title} 未交：\n${missing.map((student) => student.name).join("、") || "无"}`;
  try {
    await navigator.clipboard.writeText(text);
    alert("未交名单已复制。");
  } catch {
    prompt("复制未交名单", text);
  }
}

function render() {
  const tasks = classTasks();
  const task = selectedTask();
  const students = classStudents();
  if (task && selectedHomeworkId !== task.id) selectedHomeworkId = task.id;
  renderClassSelect();
  renderHomeworkList(tasks);
  homeworkEls.selectedTitle.textContent = task ? `${task.title}（${task.assignedDate}）` : "选择一项作业";
  renderSummary(task, students);
  renderRecordTable(task, students);
  renderAnalysis(students);
}

homeworkEls.dateInput.value = todayText();
homeworkEls.createBtn.addEventListener("click", createHomework);
homeworkEls.markAllSubmittedBtn.addEventListener("click", markAllSubmitted);
homeworkEls.copyMissingBtn.addEventListener("click", copyMissingList);
homeworkEls.classSelect.addEventListener("change", () => {
  BighoeData.setActiveClass(homeworkEls.classSelect.value);
  selectedHomeworkId = null;
  render();
});
homeworkEls.periodButtons.forEach((button) => {
  button.addEventListener("click", () => {
    analysisPeriod = button.dataset.period;
    homeworkEls.periodButtons.forEach((item) => item.classList.toggle("active", item === button));
    render();
  });
});

render();
