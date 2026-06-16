(function () {
  const STORAGE_KEY = "bighoe-shared-state-v1";
  const LEGACY_SEAT_KEY = "seat-planner-state-v1";

  function createId(prefix) {
    return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function normalizeNames(text) {
    return String(text || "")
      .split(/[\n,，、;\s]+/)
      .map((name) => name.trim())
      .filter(Boolean);
  }

  function defaultState() {
    const classId = createId("class");
    return {
      version: 1,
      activeClassId: classId,
      classes: [
        {
          id: classId,
          name: "默认班级",
          schoolYear: "",
          term: "",
          createdAt: new Date().toISOString()
        }
      ],
      students: []
    };
  }

  function readState() {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      const fresh = defaultState();
      writeState(fresh);
      return fresh;
    }

    try {
      const parsed = JSON.parse(stored);
      if (!Array.isArray(parsed.classes) || !Array.isArray(parsed.students)) {
        const fresh = defaultState();
        writeState(fresh);
        return fresh;
      }
      if (!parsed.classes.length) {
        const fresh = defaultState();
        fresh.students = parsed.students;
        writeState(fresh);
        return fresh;
      }
      if (!parsed.activeClassId || !parsed.classes.some((item) => item.id === parsed.activeClassId)) {
        parsed.activeClassId = parsed.classes[0].id;
        writeState(parsed);
      }
      return parsed;
    } catch {
      const fresh = defaultState();
      writeState(fresh);
      return fresh;
    }
  }

  function writeState(state) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function updateState(mutator) {
    const state = readState();
    const result = mutator(state) || state;
    writeState(result);
    return result;
  }

  function getActiveClass(state = readState()) {
    return state.classes.find((item) => item.id === state.activeClassId) || state.classes[0];
  }

  function getStudents(classId = readState().activeClassId, options = {}) {
    const state = readState();
    return state.students
      .filter((student) => student.classId === classId)
      .filter((student) => options.includeInactive || student.status !== "transferred")
      .sort((a, b) => (a.createdAt || "").localeCompare(b.createdAt || ""));
  }

  function importStudents(text, classId = readState().activeClassId) {
    const names = normalizeNames(text);
    let added = 0;
    const state = updateState((draft) => {
      const existing = new Set(
        draft.students.filter((student) => student.classId === classId).map((student) => student.name)
      );

      names.forEach((name) => {
        if (existing.has(name)) return;
        existing.add(name);
        added += 1;
        draft.students.push({
          id: createId("student"),
          classId,
          name,
          studentNo: "",
          status: "active",
          joinedAt: new Date().toISOString().slice(0, 10),
          leftAt: "",
          note: "",
          createdAt: new Date().toISOString()
        });
      });

      return draft;
    });

    return { added, state };
  }

  function addStudent(student, classId = readState().activeClassId) {
    const name = String(student?.name || "").trim();
    if (!name) return null;

    let created = null;
    updateState((draft) => {
      const duplicated = draft.students.some((item) => item.classId === classId && item.name === name);
      if (duplicated) return draft;

      created = {
        id: createId("student"),
        classId,
        name,
        studentNo: String(student?.studentNo || "").trim(),
        status: student?.status || "active",
        joinedAt: student?.joinedAt || new Date().toISOString().slice(0, 10),
        leftAt: student?.leftAt || "",
        note: String(student?.note || "").trim(),
        createdAt: new Date().toISOString()
      };
      draft.students.push(created);
      return draft;
    });

    return created;
  }

  function updateStudent(studentId, patch) {
    let updated = null;
    updateState((draft) => {
      const student = draft.students.find((item) => item.id === studentId);
      if (!student) return draft;

      const nextName = String(patch.name ?? student.name).trim();
      if (!nextName) return draft;

      student.name = nextName;
      student.studentNo = String(patch.studentNo ?? student.studentNo ?? "").trim();
      student.status = patch.status || student.status || "active";
      student.joinedAt = patch.joinedAt ?? student.joinedAt ?? "";
      student.leftAt = patch.leftAt ?? student.leftAt ?? "";
      student.note = String(patch.note ?? student.note ?? "").trim();
      student.updatedAt = new Date().toISOString();
      updated = student;
      return draft;
    });
    return updated;
  }

  function addClass(name) {
    const trimmed = String(name || "").trim();
    if (!trimmed) return null;

    let created = null;
    updateState((draft) => {
      created = {
        id: createId("class"),
        name: trimmed,
        schoolYear: "",
        term: "",
        createdAt: new Date().toISOString()
      };
      draft.classes.push(created);
      draft.activeClassId = created.id;
      return draft;
    });

    return created;
  }

  function updateClass(classId, patch) {
    let updated = null;
    updateState((draft) => {
      const classItem = draft.classes.find((item) => item.id === classId);
      if (!classItem) return draft;

      const nextName = String(patch.name ?? classItem.name).trim();
      if (!nextName) return draft;

      classItem.name = nextName;
      classItem.schoolYear = String(patch.schoolYear ?? classItem.schoolYear ?? "").trim();
      classItem.term = String(patch.term ?? classItem.term ?? "").trim();
      classItem.updatedAt = new Date().toISOString();
      updated = classItem;
      return draft;
    });
    return updated;
  }

  function setActiveClass(classId) {
    updateState((draft) => {
      if (draft.classes.some((item) => item.id === classId)) draft.activeClassId = classId;
      return draft;
    });
  }

  function findStudentByName(name, classId = readState().activeClassId) {
    return getStudents(classId, { includeInactive: true }).find((student) => student.name === name);
  }

  function getStudentById(studentId) {
    return readState().students.find((student) => student.id === studentId);
  }

  function migrateLegacySeatPlanner() {
    const legacy = localStorage.getItem(LEGACY_SEAT_KEY);
    if (!legacy || localStorage.getItem(`${LEGACY_SEAT_KEY}-migrated`)) return null;

    try {
      const parsed = JSON.parse(legacy);
      if (!Array.isArray(parsed.students) || !parsed.students.length) return null;
      const state = readState();
      const classId = state.activeClassId;
      const oldToNew = new Map();

      importStudents(
        parsed.students.map((student) => student.name).join("\n"),
        classId
      );

      parsed.students.forEach((legacyStudent) => {
        const current = findStudentByName(legacyStudent.name, classId);
        if (current) oldToNew.set(legacyStudent.id, current.id);
      });

      localStorage.setItem(`${LEGACY_SEAT_KEY}-migrated`, "true");
      return {
        classId,
        rows: Number(parsed.rows) || 4,
        cols: Number(parsed.cols) || 6,
        seats: Array.isArray(parsed.seats) ? parsed.seats.map((id) => oldToNew.get(id) || null) : []
      };
    } catch {
      return null;
    }
  }

  window.BighoeData = {
    STORAGE_KEY,
    createId,
    normalizeNames,
    readState,
    writeState,
    updateState,
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
    migrateLegacySeatPlanner
  };
})();
