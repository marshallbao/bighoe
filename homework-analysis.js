const analysisEls = {
  classSelect: document.querySelector("#classSelect"),
  periodButtons: document.querySelectorAll("[data-period]"),
  totalHomework: document.querySelector("#totalHomework"),
  avgOnTimeRate: document.querySelector("#avgOnTimeRate"),
  totalMissing: document.querySelector("#totalMissing"),
  totalLate: document.querySelector("#totalLate"),
  subjectStats: document.querySelector("#subjectStats"),
  trendChart: document.querySelector("#trendChart"),
  studentRanking: document.querySelector("#studentRanking"),
  dailyAnalysis: document.querySelector("#dailyAnalysis")
};

let analysisPeriod = "week";
let classStudentsCache = [];
let classTasksCache = [];

function todayText() {
  return new Date().toISOString().slice(0, 10);
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

async function readHomeworkState() {
  const activeCls = activeClass();
  if (!activeCls) return { tasks: [] };
  try {
    const res = await authenticatedFetch(`/api/homework?classId=${activeCls.id}`);
    if (res.status === 401 || res.status === 403) {
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

function startOfWeek(dateStr) {
  const date = new Date(dateStr);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(date.setDate(diff)).toISOString().slice(0, 10);
}

function startOfMonth(dateStr) {
  const date = new Date(dateStr);
  return new Date(date.getFullYear(), date.getMonth(), 1).toISOString().slice(0, 10);
}

function getPeriodStart(period) {
  const today = new Date();
  if (period === "week") {
    return startOfWeek(today.toISOString().slice(0, 10));
  } else if (period === "month") {
    return startOfMonth(today.toISOString().slice(0, 10));
  } else {
    return "2024-09-01";
  }
}

function filterTasksByPeriod(tasks, period) {
  const startDate = getPeriodStart(period);
  return tasks.filter(task => task.assignedDate >= startDate);
}

function calculateStats(tasks, students) {
  const stats = {
    totalTasks: tasks.length,
    totalSubmitted: 0,
    totalMissing: 0,
    totalLate: 0,
    subjectStats: {},
    dailyStats: {},
    studentStats: {}
  };

  students.forEach(student => {
    stats.studentStats[student.id] = {
      name: student.name,
      submitted: 0,
      missing: 0,
      late: 0,
      total: 0
    };
  });

  tasks.forEach(task => {
    const subject = task.subject || "未分类";
    if (!stats.subjectStats[subject]) {
      stats.subjectStats[subject] = { total: 0, submitted: 0, missing: 0, late: 0 };
    }
    stats.subjectStats[subject].total++;

    if (!stats.dailyStats[task.assignedDate]) {
      stats.dailyStats[task.assignedDate] = { submitted: 0, missing: 0, late: 0, total: 0 };
    }

    students.forEach(student => {
      const status = task.records?.[student.id] || "missing";
      stats.dailyStats[task.assignedDate].total++;
      stats.studentStats[student.id].total++;

      if (status === "submitted") {
        stats.totalSubmitted++;
        stats.subjectStats[subject].submitted++;
        stats.dailyStats[task.assignedDate].submitted++;
        stats.studentStats[student.id].submitted++;
      } else if (status === "missing") {
        stats.totalMissing++;
        stats.subjectStats[subject].missing++;
        stats.dailyStats[task.assignedDate].missing++;
        stats.studentStats[student.id].missing++;
      } else if (status === "late") {
        stats.totalLate++;
        stats.subjectStats[subject].late++;
        stats.dailyStats[task.assignedDate].late++;
        stats.studentStats[student.id].late++;
      }
    });
  });

  const totalPossible = students.length * tasks.length;
  stats.avgOnTimeRate = totalPossible > 0 ? Math.round((stats.totalSubmitted / totalPossible) * 100) : 0;

  return stats;
}

function renderClassSelect(classes, activeClassId) {
  analysisEls.classSelect.innerHTML = "";
  classes.forEach(classItem => {
    const option = document.createElement("option");
    option.value = classItem.id;
    option.textContent = classItem.name;
    option.selected = classItem.id === activeClassId;
    analysisEls.classSelect.appendChild(option);
  });
}

function renderSummary(stats) {
  analysisEls.totalHomework.textContent = stats.totalTasks;
  analysisEls.avgOnTimeRate.textContent = `${stats.avgOnTimeRate}%`;
  analysisEls.totalMissing.textContent = stats.totalMissing;
  analysisEls.totalLate.textContent = stats.totalLate;
}

function renderSubjectStats(subjectStats) {
  analysisEls.subjectStats.innerHTML = "";
  
  const subjects = Object.entries(subjectStats);
  if (!subjects.length) {
    const empty = document.createElement("p");
    empty.className = "empty-copy";
    empty.textContent = "暂无科目数据";
    analysisEls.subjectStats.appendChild(empty);
    return;
  }

  subjects.forEach(([subject, data]) => {
    const rate = data.total > 0 ? Math.round((data.submitted / data.total) * 100) : 0;
    const item = document.createElement("div");
    item.className = "subject-stat-item";
    item.innerHTML = `
      <div class="subject-name">${subject}</div>
      <div class="subject-rate">${rate}%</div>
      <div class="subject-bar">
        <div style="width: ${rate}%"></div>
      </div>
      <div class="subject-detail">${data.submitted}/${data.total}</div>
    `;
    analysisEls.subjectStats.appendChild(item);
  });
}

function renderTrendChart(dailyStats) {
  analysisEls.trendChart.innerHTML = "";
  
  const dates = Object.keys(dailyStats).sort();
  if (!dates.length) {
    const empty = document.createElement("p");
    empty.className = "empty-copy";
    empty.textContent = "暂无趋势数据";
    analysisEls.trendChart.appendChild(empty);
    return;
  }

  const chart = document.createElement("div");
  chart.className = "trend-chart";
  
  const maxRate = Math.max(...dates.map(date => {
    const data = dailyStats[date];
    return data.total > 0 ? Math.round((data.submitted / data.total) * 100) : 0;
  }), 100);

  dates.forEach(date => {
    const data = dailyStats[date];
    const rate = data.total > 0 ? Math.round((data.submitted / data.total) * 100) : 0;
    const height = (rate / maxRate) * 100;
    
    const bar = document.createElement("div");
    bar.className = "chart-bar";
    bar.innerHTML = `
      <div class="bar-wrapper">
        <div class="bar-fill" style="height: ${height}%"></div>
      </div>
      <div class="bar-label">${date.slice(5)}</div>
      <div class="bar-value">${rate}%</div>
    `;
    chart.appendChild(bar);
  });
  
  analysisEls.trendChart.appendChild(chart);
}

function renderStudentRanking(studentStats) {
  analysisEls.studentRanking.innerHTML = "";
  
  const students = Object.values(studentStats).filter(s => s.total > 0);
  if (!students.length) {
    const empty = document.createElement("p");
    empty.className = "empty-copy";
    empty.textContent = "暂无学生数据";
    analysisEls.studentRanking.appendChild(empty);
    return;
  }

  const sorted = students.sort((a, b) => {
    const rateA = a.total > 0 ? a.submitted / a.total : 0;
    const rateB = b.total > 0 ? b.submitted / b.total : 0;
    return rateB - rateA;
  });

  const header = document.createElement("div");
  header.className = "ranking-header";
  header.innerHTML = "<span>排名</span><span>姓名</span><span>已交</span><span>未交</span><span>迟交</span><span>按时率</span>";
  analysisEls.studentRanking.appendChild(header);

  sorted.forEach((student, index) => {
    const rate = student.total > 0 ? Math.round((student.submitted / student.total) * 100) : 0;
    const row = document.createElement("div");
    row.className = "ranking-row";
    row.innerHTML = `
      <span>${index + 1}</span>
      <strong>${student.name}</strong>
      <span>${student.submitted}</span>
      <span class="missing">${student.missing}</span>
      <span class="late">${student.late}</span>
      <span class="rate">${rate}%</span>
    `;
    analysisEls.studentRanking.appendChild(row);
  });
}

function renderDailyAnalysis(dailyStats) {
  analysisEls.dailyAnalysis.innerHTML = "";
  
  const dates = Object.keys(dailyStats).sort((a, b) => b.localeCompare(a));
  if (!dates.length) {
    const empty = document.createElement("p");
    empty.className = "empty-copy";
    empty.textContent = "暂无每日统计数据";
    analysisEls.dailyAnalysis.appendChild(empty);
    return;
  }

  const header = document.createElement("div");
  header.className = "analysis-header";
  header.innerHTML = "<span>日期</span><span>应交</span><span>已交</span><span>未交</span><span>迟交</span><span>按时率</span>";
  analysisEls.dailyAnalysis.appendChild(header);

  dates.forEach(date => {
    const data = dailyStats[date];
    const rate = data.total > 0 ? Math.round((data.submitted / data.total) * 100) : 0;
    const row = document.createElement("div");
    row.className = "analysis-row";
    row.innerHTML = `
      <span>${date}</span>
      <span>${data.total}</span>
      <span>${data.submitted}</span>
      <span>${data.missing}</span>
      <span>${data.late}</span>
      <span>${rate}%</span>
    `;
    analysisEls.dailyAnalysis.appendChild(row);
  });
}

async function render() {
  const state = await BighoeData.readState();
  const activeCls = BighoeData.getActiveClass(state);
  
  renderClassSelect(state.classes, state.activeClassId);

  if (!activeCls) {
    analysisEls.trendChart.innerHTML = "<p class='empty-copy'>请先选择班级</p>";
    analysisEls.studentRanking.innerHTML = "<p class='empty-copy'>请先选择班级</p>";
    analysisEls.dailyAnalysis.innerHTML = "<p class='empty-copy'>请先选择班级</p>";
    return;
  }

  classStudentsCache = await BighoeData.getStudents(state.activeClassId);
  const homeworkState = await readHomeworkState();
  classTasksCache = homeworkState.tasks;

  const filteredTasks = filterTasksByPeriod(classTasks(), analysisPeriod);
  const stats = calculateStats(filteredTasks, classStudents());

  renderSummary(stats);
  renderSubjectStats(stats.subjectStats);
  renderTrendChart(stats.dailyStats);
  renderStudentRanking(stats.studentStats);
  renderDailyAnalysis(stats.dailyStats);
}

analysisEls.classSelect.addEventListener("change", async () => {
  BighoeData.setActiveClass(analysisEls.classSelect.value);
  await render();
});

analysisEls.periodButtons.forEach(button => {
  button.addEventListener("click", async () => {
    analysisPeriod = button.dataset.period;
    analysisEls.periodButtons.forEach(item => item.classList.toggle("active", item === button));
    await render();
  });
});

render();
