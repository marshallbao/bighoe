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
  recordTable: document.querySelector("#recordTable")
};

let selectedHomeworkId = null;
let classStudentsCache = [];
let classTasksCache = [];

function todayText() {
  return new Date().toISOString().slice(0, 10);
}

function authenticatedFetch(url, options = {}) {
  const token = sessionStorage.getItem('bighoe_token');
  const csrfToken = sessionStorage.getItem('bighoe_csrf_token');
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {})
  };
  
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  if (csrfToken && options.method && options.method !== "GET") {
    headers["X-CSRF-Token"] = csrfToken;
  }

  return fetch(url, { ...options, headers });
}

async function readHomeworkState() {
  const activeCls = activeClass();
  if (!activeCls) return { tasks: [] };
  try {
    const res = await authenticatedFetch(`/api/homework?classId=${activeCls.id}`);
    if (res.status === 401 || res.status === 403) {
      sessionStorage.removeItem('bighoe_token');
      sessionStorage.removeItem('bighoe_csrf_token');
      window.location.href = 'login.html';
      return { tasks: [] };
    }
    const tasks = await res.json();
    return { tasks };
  } catch (err) {
    console.error("Failed to read homework state:", err);
    return { tasks: [] };
  }
}

function activeClass() {
  return BighoeData.getActiveClass();
}

function classStudents() {
  return classStudentsCache;
}

function classTasks() {
  return classTasksCache;
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

function renderClassSelectWithOptions(classes, activeClassId) {
  homeworkEls.classSelect.innerHTML = "";
  classes.forEach((classItem) => {
    const option = document.createElement("option");
    option.value = classItem.id;
    option.textContent = classItem.name;
    option.selected = classItem.id === activeClassId;
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
    item.addEventListener("click", async () => {
      selectedHomeworkId = task.id;
      await render();
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



async function updateRecord(taskId, studentId, status) {
  const task = classTasksCache.find((item) => item.id === taskId);
  if (!task) return;
  
  task.records = task.records || {};
  task.records[studentId] = status;

  try {
    const res = await authenticatedFetch("/api/homework/update", {
      method: "POST",
      body: JSON.stringify({ id: taskId, records: task.records })
    });
    if (res.status === 401 || res.status === 403) {
      sessionStorage.removeItem('bighoe_token');
      sessionStorage.removeItem('bighoe_csrf_token');
      window.location.href = 'login.html';
      return;
    }
    if (!res.ok) throw new Error("Failed to update homework records");
    await render();
  } catch (err) {
    console.error("Failed to update record:", err);
  }
}

async function createHomework() {
  const title = homeworkEls.titleInput.value.trim();
  if (!title) {
    alert("请填写作业标题。");
    return;
  }

  const activeCls = activeClass();
  if (!activeCls) return;

  const assignedDate = homeworkEls.dateInput.value || todayText();
  const records = {};
  classStudents().forEach((student) => {
    records[student.id] = "missing";
  });

  const task = {
    id: BighoeData.createId("homework"),
    classId: activeCls.id,
    title,
    subject: homeworkEls.subjectInput.value.trim(),
    assignedDate,
    weekStart: startOfWeek(assignedDate),
    note: homeworkEls.noteInput.value.trim(),
    records
  };

  try {
    const res = await authenticatedFetch("/api/homework/create", {
      method: "POST",
      body: JSON.stringify(task)
    });
    if (res.status === 401 || res.status === 403) {
      sessionStorage.removeItem('bighoe_token');
      sessionStorage.removeItem('bighoe_csrf_token');
      window.location.href = 'login.html';
      return;
    }
    if (!res.ok) throw new Error("Failed to create homework");

    selectedHomeworkId = task.id;
    homeworkEls.titleInput.value = "";
    homeworkEls.subjectInput.value = "";
    homeworkEls.noteInput.value = "";
    await render();
  } catch (err) {
    console.error("Failed to create homework:", err);
  }
}

async function markAllSubmitted() {
  const task = selectedTask();
  if (!task) return;

  const records = {};
  classStudents().forEach((student) => {
    records[student.id] = "submitted";
  });

  try {
    const res = await authenticatedFetch("/api/homework/update", {
      method: "POST",
      body: JSON.stringify({ id: task.id, records })
    });
    if (res.status === 401 || res.status === 403) {
      sessionStorage.removeItem('bighoe_token');
      sessionStorage.removeItem('bighoe_csrf_token');
      window.location.href = 'login.html';
      return;
    }
    if (!res.ok) throw new Error("Failed to update homework records");
    await render();
  } catch (err) {
    console.error("Failed to mark all submitted:", err);
  }
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

async function render() {
  const sharedState = await BighoeData.readState();
  const activeCls = activeClass();

  if (activeCls) {
    classStudentsCache = await BighoeData.getStudents(activeCls.id);
    const state = await readHomeworkState();
    classTasksCache = state.tasks;
  } else {
    classStudentsCache = [];
    classTasksCache = [];
  }

  const task = selectedTask();
  if (task && selectedHomeworkId !== task.id) selectedHomeworkId = task.id;

  renderClassSelectWithOptions(sharedState.classes, sharedState.activeClassId);
  renderHomeworkList(classTasksCache);
  homeworkEls.selectedTitle.textContent = task ? `${task.title}（${task.assignedDate}）` : "选择一项作业";
  renderSummary(task, classStudentsCache);
  renderRecordTable(task, classStudentsCache);
}

homeworkEls.dateInput.value = todayText();
homeworkEls.createBtn.addEventListener("click", createHomework);
homeworkEls.markAllSubmittedBtn.addEventListener("click", markAllSubmitted);
homeworkEls.copyMissingBtn.addEventListener("click", copyMissingList);
homeworkEls.classSelect.addEventListener("change", async () => {
  BighoeData.setActiveClass(homeworkEls.classSelect.value);
  selectedHomeworkId = null;
  await render();
});

render();
