(function () {
  const ACTIVE_CLASS_KEY = "bighoe-active-class-id";
  const LEGACY_STORAGE_KEY = "bighoe-shared-state-v1";
  const LEGACY_SEAT_PREFIX = "bighoe-seat-plan-v1";
  const LEGACY_HOMEWORK_KEY = "bighoe-homework-v1";
  const LEGACY_GRADES_KEY = "bighoe-grades-v1";
  const TOKEN_STORAGE_KEY = "bighoe_token";
  const CSRF_TOKEN_STORAGE_KEY = "bighoe_csrf_token";

  let cachedState = {
    classes: [],
    activeClassId: null
  };

  let cachedStudents = [];

  function getToken() {
    return sessionStorage.getItem(TOKEN_STORAGE_KEY);
  }

  function getCsrfToken() {
    return sessionStorage.getItem(CSRF_TOKEN_STORAGE_KEY);
  }

  function setToken(token) {
    sessionStorage.setItem(TOKEN_STORAGE_KEY, token);
  }

  function setCsrfToken(token) {
    sessionStorage.setItem(CSRF_TOKEN_STORAGE_KEY, token);
  }

  function clearAuth() {
    sessionStorage.removeItem(TOKEN_STORAGE_KEY);
    sessionStorage.removeItem(CSRF_TOKEN_STORAGE_KEY);
  }

  function createId(prefix) {
    return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function normalizeNames(text) {
    return String(text || "")
      .split(/[\n,，、;\s]+/)
      .map((name) => name.trim())
      .filter(Boolean);
  }

  async function authenticatedFetch(url, options = {}) {
    const token = getToken();
    const csrfToken = getCsrfToken();
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

    const response = await fetch(url, {
      ...options,
      headers
    });

    if (response.status === 401) {
      clearAuth();
      window.location.href = 'login.html';
      throw new Error('Unauthorized');
    }

    if (response.status === 403) {
      clearAuth();
      window.location.href = 'login.html';
      throw new Error('CSRF error');
    }

    return response;
  }

  async function checkAndMigrate() {
    const legacyState = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!legacyState) return;

    console.log("Detecting legacy localStorage data. Starting migration to SQLite...");
    try {
      const state = JSON.parse(legacyState);
      const hw = JSON.parse(localStorage.getItem(LEGACY_HOMEWORK_KEY) || '{"tasks":[]}');
      const grades = JSON.parse(localStorage.getItem(LEGACY_GRADES_KEY) || '{"subjects":[],"exams":[]}');

      const seatPlans = {};
      if (Array.isArray(state.classes)) {
        state.classes.forEach((c) => {
          const seatKey = `${LEGACY_SEAT_PREFIX}-${c.id}`;
          const seatData = localStorage.getItem(seatKey);
          if (seatData) {
            try {
              seatPlans[c.id] = JSON.parse(seatData);
            } catch (e) {}
          }
        });
      }

      const payload = {
        classes: state.classes || [],
        students: state.students || [],
        seatPlans,
        homeworkTasks: hw.tasks || [],
        subjects: grades.subjects || [],
        exams: grades.exams || []
      };

      const res = await authenticatedFetch("/api/migrate", {
        method: "POST",
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        console.log("Migration to SQLite successful!");
        localStorage.setItem(`${LEGACY_STORAGE_KEY}-migrated-backup`, legacyState);
        localStorage.removeItem(LEGACY_STORAGE_KEY);
        localStorage.removeItem(LEGACY_HOMEWORK_KEY);
        localStorage.removeItem(LEGACY_GRADES_KEY);
        if (Array.isArray(state.classes)) {
          state.classes.forEach((c) => {
            localStorage.removeItem(`${LEGACY_SEAT_PREFIX}-${c.id}`);
          });
        }
      } else {
        console.error("Migration request failed status:", res.status);
      }
    } catch (err) {
      console.error("Migration to SQLite failed:", err);
    }
  }

  async function readState() {
    await checkAndMigrate();

    const classes = await authenticatedFetch("/api/classes").then((r) => r.json());
    let activeClassId = localStorage.getItem(ACTIVE_CLASS_KEY);
    if (!activeClassId || !classes.some((item) => item.id === activeClassId)) {
      activeClassId = classes[0] ? classes[0].id : null;
      if (activeClassId) {
        localStorage.setItem(ACTIVE_CLASS_KEY, activeClassId);
      }
    }

    cachedState = { classes, activeClassId };
    return cachedState;
  }

  function getActiveClass(state = cachedState) {
    return state.classes.find((item) => item.id === state.activeClassId) || state.classes[0] || null;
  }

  async function getStudents(classId = cachedState.activeClassId, options = {}) {
    if (!classId) {
      classId = localStorage.getItem(ACTIVE_CLASS_KEY);
    }
    if (!classId) {
      cachedStudents = [];
      return [];
    }

    const students = await authenticatedFetch(`/api/students?classId=${classId}`).then((r) => r.json());
    const sorted = students
      .filter((student) => options.includeInactive || student.status !== "transferred")
      .sort((a, b) => (a.createdAt || "").localeCompare(b.createdAt || ""));

    cachedStudents = sorted;
    return sorted;
  }

  async function importStudents(text, classId = cachedState.activeClassId) {
    if (!classId) classId = localStorage.getItem(ACTIVE_CLASS_KEY);
    const names = normalizeNames(text);
    if (!names.length) return { added: 0 };

    const existingStudents = await getStudents(classId, { includeInactive: true });
    const existingNames = new Set(existingStudents.map((s) => s.name));

    const toAdd = [];
    names.forEach((name) => {
      if (existingNames.has(name)) return;
      existingNames.add(name);
      toAdd.push({
        id: createId("student"),
        name,
        studentNo: "",
        status: "active",
        joinedAt: new Date().toISOString().slice(0, 10),
        note: ""
      });
    });

    if (!toAdd.length) return { added: 0 };

    const res = await authenticatedFetch("/api/students/import", {
      method: "POST",
      body: JSON.stringify({ classId, students: toAdd })
    });
    if (!res.ok) throw new Error("Failed to import students");

    const result = await res.json();
    return { added: result.count };
  }

  async function addStudent(student, classId = cachedState.activeClassId) {
    if (!classId) classId = localStorage.getItem(ACTIVE_CLASS_KEY);
    const name = String(student?.name || "").trim();
    if (!name) return null;

    const existingStudents = await getStudents(classId, { includeInactive: true });
    const duplicated = existingStudents.some((item) => item.name === name);
    if (duplicated) return null;

    const newStudent = {
      id: createId("student"),
      classId,
      name,
      studentNo: String(student?.studentNo || "").trim(),
      status: student?.status || "active",
      joinedAt: student?.joinedAt || new Date().toISOString().slice(0, 10),
      note: String(student?.note || "").trim()
    };

    const res = await authenticatedFetch("/api/students/create", {
      method: "POST",
      body: JSON.stringify(newStudent)
    });
    if (!res.ok) throw new Error("Failed to create student");

    return await res.json();
  }

  async function updateStudent(studentId, patch) {
    const name = String(patch.name || "").trim();
    if (!name) return null;

    const res = await authenticatedFetch("/api/students/update", {
      method: "POST",
      body: JSON.stringify({
        id: studentId,
        name,
        studentNo: patch.studentNo,
        status: patch.status,
        joinedAt: patch.joinedAt,
        leftAt: patch.leftAt,
        note: patch.note
      })
    });
    if (!res.ok) throw new Error("Failed to update student");

    return await res.json();
  }

  async function addClass(name) {
    const trimmed = String(name || "").trim();
    if (!trimmed) return null;

    const id = createId("class");
    const res = await authenticatedFetch("/api/classes/create", {
      method: "POST",
      body: JSON.stringify({ id, name: trimmed })
    });
    if (!res.ok) throw new Error("Failed to create class");

    localStorage.setItem(ACTIVE_CLASS_KEY, id);
    cachedState.activeClassId = id;
    return await res.json();
  }

  async function updateClass(classId, patch) {
    const nextName = String(patch.name || "").trim();
    if (!nextName) return null;

    const res = await authenticatedFetch("/api/classes/update", {
      method: "POST",
      body: JSON.stringify({
        id: classId,
        name: nextName,
        schoolYear: patch.schoolYear,
        term: patch.term
      })
    });
    if (!res.ok) throw new Error("Failed to update class");

    return await res.json();
  }

  async function deleteClass(classId) {
    const res = await authenticatedFetch("/api/classes/delete", {
      method: "POST",
      body: JSON.stringify({ id: classId })
    });
    if (!res.ok) throw new Error("Failed to delete class");

    const state = await readState();
    if (state.activeClassId === classId) {
      const nextActiveId = state.classes[0] ? state.classes[0].id : null;
      setActiveClass(nextActiveId);
    }
    return true;
  }

  async function deleteStudent(studentId) {
    const res = await authenticatedFetch("/api/students/delete", {
      method: "POST",
      body: JSON.stringify({ id: studentId })
    });
    if (!res.ok) throw new Error("Failed to delete student");
    return true;
  }

  function setActiveClass(classId) {
    localStorage.setItem(ACTIVE_CLASS_KEY, classId);
    cachedState.activeClassId = classId;
  }

  function findStudentByName(name, classId = cachedState.activeClassId) {
    return cachedStudents.find((student) => student.name === name);
  }

  function getStudentById(studentId) {
    return cachedStudents.find((student) => student.id === studentId);
  }

  window.BighoeData = {
    createId,
    normalizeNames,
    readState,
    getActiveClass,
    getStudents,
    getStudentById,
    findStudentByName,
    addStudent,
    updateStudent,
    importStudents,
    addClass,
    updateClass,
    setActiveClass,
    deleteClass,
    deleteStudent,
    getToken,
    getCsrfToken,
    setToken,
    setCsrfToken,
    clearAuth
  };
})();