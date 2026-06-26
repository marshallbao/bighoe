const els = {
  classSelect: document.querySelector("#classSelect"),
  logoutBtn: document.querySelector("#logoutBtn"),
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

async function render() {
  const state = await BighoeData.readState();
  const activeClass = BighoeData.getActiveClass(state);
  
  let allStudents = [];
  if (activeClass) {
    allStudents = await BighoeData.getStudents(state.activeClassId, { includeInactive: true });
  }
  const activeStudents = allStudents.filter((student) => student.status === "active");
  const termParts = activeClass ? [activeClass.schoolYear, activeClass.term].filter(Boolean) : [];

  renderClassSelect(state);
  els.activeClassMeta.textContent = activeClass ? activeClass.name : "暂无班级";
  els.classNameMeta.textContent = activeClass ? activeClass.name : "暂无班级";
  els.studentCount.textContent = `${allStudents.length} 人`;
  els.activeStudentCount.textContent = `${activeStudents.length} 人`;
  els.termMeta.textContent = termParts.length ? termParts.join(" / ") : "未设置";
}

els.classSelect.addEventListener("change", async () => {
  BighoeData.setActiveClass(els.classSelect.value);
  await render();
});

els.logoutBtn.addEventListener("click", async () => {
  const csrfToken = sessionStorage.getItem('bighoe_csrf_token');
  try {
    await fetch('/api/auth/logout', {
      method: 'POST',
      headers: csrfToken ? { 'X-CSRF-Token': csrfToken } : {},
      credentials: 'same-origin'
    });
  } catch (err) {
    console.error('Failed to logout:', err);
  }
  sessionStorage.removeItem('bighoe_csrf_token');
  window.location.href = 'login.html';
});

render();
