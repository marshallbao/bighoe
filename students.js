const statusText = {
  active: "在读",
  transferred: "已转出",
  paused: "休学",
  graduated: "毕业"
};

const els = {
  classSelect: document.querySelector("#classSelect"),
  classNameInput: document.querySelector("#classNameInput"),
  addClassBtn: document.querySelector("#addClassBtn"),
  editClassNameInput: document.querySelector("#editClassNameInput"),
  schoolYearInput: document.querySelector("#schoolYearInput"),
  termInput: document.querySelector("#termInput"),
  saveClassBtn: document.querySelector("#saveClassBtn"),
  studentNameInput: document.querySelector("#studentNameInput"),
  studentNoInput: document.querySelector("#studentNoInput"),
  studentStatusInput: document.querySelector("#studentStatusInput"),
  addStudentBtn: document.querySelector("#addStudentBtn"),
  studentInput: document.querySelector("#studentInput"),
  importStudentsBtn: document.querySelector("#importStudentsBtn"),
  studentFileInput: document.querySelector("#studentFileInput"),
  exportStudentsBtn: document.querySelector("#exportStudentsBtn"),
  studentCount: document.querySelector("#studentCount"),
  activeClassMeta: document.querySelector("#activeClassMeta"),
  studentTable: document.querySelector("#studentTable")
};

function renderClassSelect(state) {
  els.classSelect.innerHTML = "";
  state.classes.forEach((classItem) => {
    const option = document.createElement("option");
    option.value = classItem.id;
    option.textContent = classItem.name;
    option.selected = classItem.id === state.activeClassId;
    els.classSelect.appendChild(option);
  });
}

function renderStudentTable(students) {
  els.studentTable.innerHTML = "";

  if (!students.length) {
    const empty = document.createElement("p");
    empty.className = "empty-copy";
    empty.textContent = "当前班级还没有学生。";
    els.studentTable.appendChild(empty);
    return;
  }

  const header = document.createElement("div");
  header.className = "student-table-row student-table-head";
  header.innerHTML = "<span>序号</span><span>姓名</span><span>学号</span><span>状态</span><span>操作</span>";
  els.studentTable.appendChild(header);

  students.forEach((student, index) => {
    const row = document.createElement("div");
    row.className = "student-table-row";
    row.dataset.id = student.id;
    row.innerHTML = `
      <span>${index + 1}</span>
      <input class="student-name-edit" type="text" value="">
      <input class="student-no-edit" type="text" value="">
      <select class="student-status-edit">
        <option value="active">在读</option>
        <option value="transferred">已转出</option>
        <option value="paused">休学</option>
        <option value="graduated">毕业</option>
      </select>
      <button type="button">保存</button>
    `;
    row.querySelector(".student-name-edit").value = student.name;
    row.querySelector(".student-no-edit").value = student.studentNo || "";
    row.querySelector(".student-status-edit").value = student.status || "active";
    row.querySelector("button").addEventListener("click", () => {
      BighoeData.updateStudent(student.id, {
        name: row.querySelector(".student-name-edit").value,
        studentNo: row.querySelector(".student-no-edit").value,
        status: row.querySelector(".student-status-edit").value
      });
      render();
    });
    els.studentTable.appendChild(row);
  });
}

function render() {
  const state = BighoeData.readState();
  const activeClass = BighoeData.getActiveClass(state);
  const students = BighoeData.getStudents(state.activeClassId, { includeInactive: true });

  renderClassSelect(state);
  els.editClassNameInput.value = activeClass.name;
  els.schoolYearInput.value = activeClass.schoolYear || "";
  els.termInput.value = activeClass.term || "";
  els.studentCount.textContent = `${students.length} 人`;
  els.activeClassMeta.textContent = activeClass.name;
  renderStudentTable(students);
}

function importStudentText(text) {
  const result = BighoeData.importStudents(text);
  els.studentInput.value = "";
  render();
  if (!result.added) alert("没有新增学生，可能名单为空或姓名已存在。");
}

function exportStudents() {
  const activeClass = BighoeData.getActiveClass();
  const students = BighoeData.getStudents(activeClass.id, { includeInactive: true });
  const lines = students.map((student) => {
    const status = statusText[student.status] || student.status || "";
    return [student.name, student.studentNo || "", status].join(",");
  });
  const blob = new Blob([["姓名,学号,状态", ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `${activeClass.name}-学生名单.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}

els.classSelect.addEventListener("change", () => {
  BighoeData.setActiveClass(els.classSelect.value);
  render();
});

els.addClassBtn.addEventListener("click", () => {
  const created = BighoeData.addClass(els.classNameInput.value);
  if (!created) return;
  els.classNameInput.value = "";
  render();
});

els.saveClassBtn.addEventListener("click", () => {
  BighoeData.updateClass(BighoeData.getActiveClass().id, {
    name: els.editClassNameInput.value,
    schoolYear: els.schoolYearInput.value,
    term: els.termInput.value
  });
  render();
});

els.addStudentBtn.addEventListener("click", () => {
  const created = BighoeData.addStudent({
    name: els.studentNameInput.value,
    studentNo: els.studentNoInput.value,
    status: els.studentStatusInput.value
  });
  if (!created) {
    alert("没有添加学生，请检查姓名是否为空或已存在。");
    return;
  }
  els.studentNameInput.value = "";
  els.studentNoInput.value = "";
  els.studentStatusInput.value = "active";
  render();
});

els.importStudentsBtn.addEventListener("click", () => importStudentText(els.studentInput.value));

els.studentFileInput.addEventListener("change", async () => {
  const [file] = els.studentFileInput.files;
  if (!file) return;
  importStudentText(await file.text());
  els.studentFileInput.value = "";
});

els.exportStudentsBtn.addEventListener("click", exportStudents);

render();
