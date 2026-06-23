const gradeEls = {
  classSelect: document.querySelector("#classSelect"),
  subjectNameInput: document.querySelector("#subjectNameInput"),
  addSubjectBtn: document.querySelector("#addSubjectBtn"),
  subjectList: document.querySelector("#subjectList"),
  examCount: document.querySelector("#examCount"),
  examList: document.querySelector("#examList"),
  examNameInput: document.querySelector("#examNameInput"),
  examDateInput: document.querySelector("#examDateInput"),
  examTermInput: document.querySelector("#examTermInput"),
  createExamBtn: document.querySelector("#createExamBtn"),
  selectedExamTitle: document.querySelector("#selectedExamTitle"),
  exportScoresBtn: document.querySelector("#exportScoresBtn"),
  importScoresBtn: document.querySelector("#importScoresBtn"),
  scoreImportInput: document.querySelector("#scoreImportInput"),
  scoreTable: document.querySelector("#scoreTable"),
  trendStudentSelect: document.querySelector("#trendStudentSelect"),
  trendSubjectSelect: document.querySelector("#trendSubjectSelect"),
  trendChart: document.querySelector("#trendChart"),
  gradeAnalysis: document.querySelector("#gradeAnalysis")
};

let selectedExamId = null;
let classStudentsCache = [];
let classSubjectsCache = [];
let classExamsCache = [];

function todayText() {
  return new Date().toISOString().slice(0, 10);
}

async function readGradeState() {
  const activeCls = activeClass();
  if (!activeCls) return { subjects: [], exams: [] };
  try {
    const subjects = await fetch(`/api/subjects?classId=${activeCls.id}`).then((r) => r.json());
    const exams = await fetch(`/api/exams?classId=${activeCls.id}`).then((r) => r.json());
    return { subjects, exams };
  } catch (err) {
    console.error("Failed to read grade state:", err);
    return { subjects: [], exams: [] };
  }
}

function activeClass() {
  return BighoeData.getActiveClass();
}

function classStudents() {
  return classStudentsCache;
}

function classSubjects(options = {}) {
  return classSubjectsCache
    .filter((subject) => options.includeInactive || subject.active !== false);
}

function classExams() {
  return classExamsCache;
}

function selectedExam() {
  return classExams().find((exam) => exam.id === selectedExamId) || classExams()[0] || null;
}

function renderClassSelectWithOptions(classes, activeClassId) {
  gradeEls.classSelect.innerHTML = "";
  classes.forEach((classItem) => {
    const option = document.createElement("option");
    option.value = classItem.id;
    option.textContent = classItem.name;
    option.selected = classItem.id === activeClassId;
    gradeEls.classSelect.appendChild(option);
  });
}

async function addSubject() {
  const name = gradeEls.subjectNameInput.value.trim();
  if (!name) return;
  const activeCls = activeClass();
  if (!activeCls) return;

  const duplicated = classSubjectsCache.some((subject) => subject.name === name);
  if (duplicated) {
    alert("这个科目已经存在。");
    return;
  }

  try {
    const res = await fetch("/api/subjects/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: BighoeData.createId("subject"),
        classId: activeCls.id,
        name
      })
    });
    if (!res.ok) throw new Error("Failed to create subject");
    gradeEls.subjectNameInput.value = "";
    await render();
  } catch (err) {
    console.error("Failed to add subject:", err);
  }
}

async function toggleSubject(subjectId, active) {
  try {
    const res = await fetch("/api/subjects/update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: subjectId, active })
    });
    if (!res.ok) throw new Error("Failed to update subject status");
    await render();
  } catch (err) {
    console.error("Failed to toggle subject:", err);
  }
}

async function createExam() {
  const name = gradeEls.examNameInput.value.trim();
  const subjects = classSubjects();
  if (!name) {
    alert("请填写考试名称。");
    return;
  }
  if (!subjects.length) {
    alert("请先添加至少一个科目。");
    return;
  }

  const activeCls = activeClass();
  if (!activeCls) return;

  const exam = {
    id: BighoeData.createId("exam"),
    classId: activeCls.id,
    name,
    examDate: gradeEls.examDateInput.value || todayText(),
    term: gradeEls.examTermInput.value.trim(),
    subjectIds: subjects.map((subject) => subject.id),
    scores: {}
  };

  try {
    const res = await fetch("/api/exams/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(exam)
    });
    if (!res.ok) throw new Error("Failed to create exam");

    selectedExamId = exam.id;
    gradeEls.examNameInput.value = "";
    gradeEls.examTermInput.value = "";
    await render();
  } catch (err) {
    console.error("Failed to create exam:", err);
  }
}

async function updateScore(examId, studentId, subjectId, value) {
  const exam = classExamsCache.find((item) => item.id === examId);
  if (!exam) return;

  exam.scores = exam.scores || {};
  exam.scores[studentId] = exam.scores[studentId] || {};
  const normalized = String(value).trim();
  if (normalized === "") {
    delete exam.scores[studentId][subjectId];
  } else {
    exam.scores[studentId][subjectId] = Number(normalized);
  }

  try {
    const res = await fetch("/api/exams/update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: examId, scores: exam.scores })
    });
    if (!res.ok) throw new Error("Failed to update score");
    renderAnalysis();
  } catch (err) {
    console.error("Failed to update score:", err);
  }
}

function renderSubjectList(subjects) {
  gradeEls.subjectList.innerHTML = "";
  if (!subjects.length) {
    const empty = document.createElement("p");
    empty.className = "empty-copy";
    empty.textContent = "还没有科目。";
    gradeEls.subjectList.appendChild(empty);
    return;
  }

  subjects.forEach((subject) => {
    const item = document.createElement("div");
    item.className = "list-item static";
    item.innerHTML = `<strong></strong><select><option value="true">启用</option><option value="false">停用</option></select>`;
    item.querySelector("strong").textContent = subject.name;
    const select = item.querySelector("select");
    select.value = String(subject.active !== false);
    select.addEventListener("change", () => toggleSubject(subject.id, select.value === "true"));
    gradeEls.subjectList.appendChild(item);
  });
}

function renderExamList(exams) {
  gradeEls.examList.innerHTML = "";
  gradeEls.examCount.textContent = `${exams.length} 场`;
  if (!exams.length) {
    const empty = document.createElement("p");
    empty.className = "empty-copy";
    empty.textContent = "还没有考试记录。";
    gradeEls.examList.appendChild(empty);
    return;
  }

  exams.forEach((exam) => {
    const item = document.createElement("button");
    item.type = "button";
    item.className = `list-item ${exam.id === selectedExamId ? "active" : ""}`;
    item.innerHTML = `<strong></strong><span>${exam.examDate} · ${exam.term || "未设置学期"}</span>`;
    item.querySelector("strong").textContent = exam.name;
    item.addEventListener("click", async () => {
      selectedExamId = exam.id;
      await render();
    });
    gradeEls.examList.appendChild(item);
  });
}

function renderScoreTable(exam, students, subjects) {
  gradeEls.scoreTable.innerHTML = "";
  if (!exam) {
    const empty = document.createElement("p");
    empty.className = "empty-copy";
    empty.textContent = "先创建或选择一场考试。";
    gradeEls.scoreTable.appendChild(empty);
    return;
  }

  const examSubjects = subjects.filter((subject) => exam.subjectIds.includes(subject.id));
  if (!students.length || !examSubjects.length) {
    const empty = document.createElement("p");
    empty.className = "empty-copy";
    empty.textContent = "当前班级缺少在读学生或启用科目。";
    gradeEls.scoreTable.appendChild(empty);
    return;
  }

  const table = document.createElement("div");
  table.className = "score-grid";
  table.style.setProperty("--score-cols", examSubjects.length);

  const headers = ["序号", "姓名", ...examSubjects.map((subject) => subject.name)];
  headers.forEach((text) => {
    const cell = document.createElement("div");
    cell.className = "score-cell score-head";
    cell.textContent = text;
    table.appendChild(cell);
  });

  students.forEach((student, index) => {
    const no = document.createElement("div");
    no.className = "score-cell";
    no.textContent = index + 1;
    table.appendChild(no);

    const name = document.createElement("div");
    name.className = "score-cell score-name";
    name.textContent = student.name;
    table.appendChild(name);

    examSubjects.forEach((subject) => {
      const cell = document.createElement("div");
      cell.className = "score-cell";
      const input = document.createElement("input");
      input.type = "number";
      input.min = "0";
      input.step = "0.5";
      input.value = exam.scores?.[student.id]?.[subject.id] ?? "";
      input.addEventListener("input", () => updateScore(exam.id, student.id, subject.id, input.value));
      input.addEventListener("change", () => updateScore(exam.id, student.id, subject.id, input.value));
      cell.appendChild(input);
      table.appendChild(cell);
    });
  });

  gradeEls.scoreTable.appendChild(table);
}

function renderTrendSelectors(students, subjects) {
  const currentStudent = gradeEls.trendStudentSelect.value;
  const currentSubject = gradeEls.trendSubjectSelect.value;
  gradeEls.trendStudentSelect.innerHTML = "";
  gradeEls.trendSubjectSelect.innerHTML = "";

  students.forEach((student) => {
    const option = document.createElement("option");
    option.value = student.id;
    option.textContent = student.name;
    gradeEls.trendStudentSelect.appendChild(option);
  });

  subjects.forEach((subject) => {
    const option = document.createElement("option");
    option.value = subject.id;
    option.textContent = subject.name;
    gradeEls.trendSubjectSelect.appendChild(option);
  });

  if (students.some((student) => student.id === currentStudent)) gradeEls.trendStudentSelect.value = currentStudent;
  if (subjects.some((subject) => subject.id === currentSubject)) gradeEls.trendSubjectSelect.value = currentSubject;
}

function trendPoints(studentId, subjectId) {
  return classExams()
    .slice()
    .reverse()
    .map((exam) => ({
      label: exam.examDate,
      score: exam.scores?.[studentId]?.[subjectId]
    }))
    .filter((point) => typeof point.score === "number" && !Number.isNaN(point.score));
}

function renderChart(points) {
  const svg = gradeEls.trendChart;
  svg.innerHTML = "";
  const width = 640;
  const height = 240;
  const padding = 34;

  const axis = document.createElementNS("http://www.w3.org/2000/svg", "path");
  axis.setAttribute("d", `M${padding} ${height - padding}H${width - padding}M${padding} ${height - padding}V${padding}`);
  axis.setAttribute("class", "chart-axis");
  svg.appendChild(axis);

  if (!points.length) {
    const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
    text.setAttribute("x", width / 2);
    text.setAttribute("y", height / 2);
    text.setAttribute("text-anchor", "middle");
    text.setAttribute("class", "chart-empty");
    text.textContent = "暂无趋势数据";
    svg.appendChild(text);
    return;
  }

  const maxScore = Math.max(100, ...points.map((point) => point.score));
  const xStep = points.length > 1 ? (width - padding * 2) / (points.length - 1) : 0;
  const coords = points.map((point, index) => {
    const x = padding + xStep * index;
    const y = height - padding - (point.score / maxScore) * (height - padding * 2);
    return { x, y, ...point };
  });

  const polyline = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
  polyline.setAttribute("points", coords.map((point) => `${point.x},${point.y}`).join(" "));
  polyline.setAttribute("class", "chart-line");
  svg.appendChild(polyline);

  coords.forEach((point) => {
    const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    circle.setAttribute("cx", point.x);
    circle.setAttribute("cy", point.y);
    circle.setAttribute("r", "4");
    circle.setAttribute("class", "chart-dot");
    svg.appendChild(circle);

    const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
    label.setAttribute("x", point.x);
    label.setAttribute("y", point.y - 9);
    label.setAttribute("text-anchor", "middle");
    label.setAttribute("class", "chart-label");
    label.textContent = point.score;
    svg.appendChild(label);
  });
}

function renderAnalysis() {
  const students = classStudents();
  const subjects = classSubjects({ includeInactive: true });
  const exams = classExams();
  renderTrendSelectors(students, subjects);

  const points = trendPoints(gradeEls.trendStudentSelect.value, gradeEls.trendSubjectSelect.value);
  renderChart(points);

  gradeEls.gradeAnalysis.innerHTML = "";
  if (!students.length || !exams.length) {
    const empty = document.createElement("p");
    empty.className = "empty-copy";
    empty.textContent = "暂无可分析成绩。";
    gradeEls.gradeAnalysis.appendChild(empty);
    return;
  }

  const latest = exams[0];
  const header = document.createElement("div");
  header.className = "analysis-row analysis-head";
  header.innerHTML = "<span>学生</span><span>已录科目</span><span>平均分</span><span>考试</span>";
  gradeEls.gradeAnalysis.appendChild(header);

  students.forEach((student) => {
    const values = Object.values(latest.scores?.[student.id] || {}).filter((value) => typeof value === "number");
    const average = values.length ? Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10 : "";
    const row = document.createElement("div");
    row.className = "analysis-row";
    row.innerHTML = `<strong></strong><span>${values.length}</span><span>${average || "-"}</span><span></span>`;
    row.querySelector("strong").textContent = student.name;
    row.querySelector("span:last-child").textContent = latest.name;
    gradeEls.gradeAnalysis.appendChild(row);
  });
}

function exportScores() {
  const exam = selectedExam();
  if (!exam) return;
  const subjects = classSubjects({ includeInactive: true }).filter((subject) => exam.subjectIds.includes(subject.id));
  const students = classStudents();
  const lines = [["姓名", ...subjects.map((subject) => subject.name)].join(",")];
  students.forEach((student) => {
    lines.push([student.name, ...subjects.map((subject) => exam.scores?.[student.id]?.[subject.id] ?? "")].join(","));
  });
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `${activeClass().name}-${exam.name}-成绩.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}

function parseScoreRows(text) {
  return String(text || "")
    .trim()
    .split(/\r?\n/)
    .map((line) => line.split(/[\t,，]/).map((cell) => cell.trim()));
}

async function importScores() {
  const exam = selectedExam();
  if (!exam) {
    alert("请先创建或选择一场考试。");
    return;
  }

  const rows = parseScoreRows(gradeEls.scoreImportInput.value);
  if (rows.length < 2) {
    alert("没有识别到可导入的成绩。");
    return;
  }

  const subjects = classSubjects({ includeInactive: true });
  const students = classStudents();
  const subjectMap = new Map(subjects.map((subject) => [subject.name, subject]));
  const studentMap = new Map(students.map((student) => [student.name, student]));
  const headerSubjects = rows[0].slice(1).map((name) => subjectMap.get(name));
  const missingSubjects = rows[0].slice(1).filter((name, index) => name && !headerSubjects[index]);
  const missingStudents = [];

  if (missingSubjects.length) {
    alert(`以下科目未配置，请先添加科目：\n${missingSubjects.join("、")}`);
    return;
  }

  rows.slice(1).forEach((row) => {
    const student = studentMap.get(row[0]);
    if (!student) {
      if (row[0]) missingStudents.push(row[0]);
      return;
    }

    exam.scores = exam.scores || {};
    exam.scores[student.id] = exam.scores[student.id] || {};
    headerSubjects.forEach((subject, index) => {
      if (!subject) return;
      const rawValue = row[index + 1];
      if (rawValue === "") return;
      const score = Number(rawValue);
      if (!Number.isNaN(score)) exam.scores[student.id][subject.id] = score;
    });
  });

  if (missingStudents.length) {
    alert(`以下学生不在当前班级名单中，已跳过：\n${missingStudents.join("、")}`);
  }

  try {
    const res = await fetch("/api/exams/update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: exam.id, scores: exam.scores })
    });
    if (!res.ok) throw new Error("Failed to save imported scores");
    gradeEls.scoreImportInput.value = "";
    await render();
  } catch (err) {
    console.error("Failed to import scores:", err);
  }
}

async function render() {
  const sharedState = await BighoeData.readState();
  const activeCls = activeClass();

  if (activeCls) {
    classStudentsCache = await BighoeData.getStudents(activeCls.id);
    const state = await readGradeState();
    classSubjectsCache = state.subjects;
    classExamsCache = state.exams;
  } else {
    classStudentsCache = [];
    classSubjectsCache = [];
    classExamsCache = [];
  }

  const exam = selectedExam();
  if (exam && selectedExamId !== exam.id) selectedExamId = exam.id;

  renderClassSelectWithOptions(sharedState.classes, sharedState.activeClassId);
  renderSubjectList(classSubjectsCache);
  renderExamList(classExamsCache);
  gradeEls.selectedExamTitle.textContent = exam ? `${exam.name}（${exam.examDate}）` : "选择一场考试";
  renderScoreTable(exam, classStudentsCache, classSubjectsCache);
  renderAnalysis();
}

gradeEls.examDateInput.value = todayText();
gradeEls.addSubjectBtn.addEventListener("click", addSubject);
gradeEls.createExamBtn.addEventListener("click", createExam);
gradeEls.exportScoresBtn.addEventListener("click", exportScores);
gradeEls.importScoresBtn.addEventListener("click", importScores);
gradeEls.classSelect.addEventListener("change", async () => {
  BighoeData.setActiveClass(gradeEls.classSelect.value);
  selectedExamId = null;
  await render();
});
gradeEls.trendStudentSelect.addEventListener("change", renderAnalysis);
gradeEls.trendSubjectSelect.addEventListener("change", renderAnalysis);

render();
