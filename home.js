const els = {
  classSelect: document.querySelector("#classSelect"),
  activeClassMeta: document.querySelector("#activeClassMeta"),
  classNameMeta: document.querySelector("#classNameMeta"),
  studentCount: document.querySelector("#studentCount"),
  activeStudentCount: document.querySelector("#activeStudentCount"),
  termMeta: document.querySelector("#termMeta")
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

function render() {
  const state = BighoeData.readState();
  const activeClass = BighoeData.getActiveClass(state);
  const allStudents = BighoeData.getStudents(state.activeClassId, { includeInactive: true });
  const activeStudents = allStudents.filter((student) => student.status === "active");
  const termParts = [activeClass.schoolYear, activeClass.term].filter(Boolean);

  renderClassSelect(state);
  els.activeClassMeta.textContent = activeClass.name;
  els.classNameMeta.textContent = activeClass.name;
  els.studentCount.textContent = `${allStudents.length} 人`;
  els.activeStudentCount.textContent = `${activeStudents.length} 人`;
  els.termMeta.textContent = termParts.length ? termParts.join(" / ") : "未设置";
}

els.classSelect.addEventListener("change", () => {
  BighoeData.setActiveClass(els.classSelect.value);
  render();
});

render();
