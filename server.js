const http = require("http");
const fs = require("fs");
const path = require("path");
const { DatabaseSync } = require("node:sqlite");

const root = __dirname;
const port = Number(process.env.PORT || process.argv[2]) || 5173;
const host = process.env.HOST || "0.0.0.0"; // Allow external access, especially for WSL to host mapping

// Initialize SQLite database
const dbPath = path.resolve(root, "bighoe.db");
const db = new DatabaseSync(dbPath);

// Enable foreign keys
db.exec("PRAGMA foreign_keys = ON;");

// Initialize tables
db.exec(`
  CREATE TABLE IF NOT EXISTS classes (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    school_year TEXT DEFAULT '',
    term TEXT DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT
  );

  CREATE TABLE IF NOT EXISTS students (
    id TEXT PRIMARY KEY,
    class_id TEXT NOT NULL,
    name TEXT NOT NULL,
    student_no TEXT DEFAULT '',
    status TEXT DEFAULT 'active',
    joined_at TEXT DEFAULT '',
    left_at TEXT DEFAULT '',
    note TEXT DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT,
    FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS seating (
    class_id TEXT PRIMARY KEY,
    rows INTEGER NOT NULL DEFAULT 4,
    cols INTEGER NOT NULL DEFAULT 6,
    seats TEXT NOT NULL,
    FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS homework (
    id TEXT PRIMARY KEY,
    class_id TEXT NOT NULL,
    title TEXT NOT NULL,
    subject TEXT DEFAULT '',
    assigned_date TEXT NOT NULL,
    week_start TEXT NOT NULL,
    note TEXT DEFAULT '',
    records TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT,
    FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS subjects (
    id TEXT PRIMARY KEY,
    class_id TEXT NOT NULL,
    name TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT,
    FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS exams (
    id TEXT PRIMARY KEY,
    class_id TEXT NOT NULL,
    name TEXT NOT NULL,
    exam_date TEXT NOT NULL,
    term TEXT DEFAULT '',
    subject_ids TEXT NOT NULL,
    scores TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT,
    FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE
  );
`);

console.log("SQLite database initialized at:", dbPath);

const types = {
  ".html": "text/html;charset=utf-8",
  ".css": "text/css;charset=utf-8",
  ".js": "text/javascript;charset=utf-8",
  ".txt": "text/plain;charset=utf-8",
  ".json": "application/json;charset=utf-8"
};

// Helper to read JSON body
function readJSONBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString();
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", (err) => reject(err));
  });
}

// Helper to send JSON response
function sendJSON(res, data, status = 200) {
  res.writeHead(status, { "Content-Type": "application/json;charset=utf-8" });
  res.end(JSON.stringify(data));
}

// Helper to run in a transaction
function runInTransaction(callback) {
  db.exec("BEGIN TRANSACTION");
  try {
    const result = callback();
    db.exec("COMMIT");
    return result;
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${host}:${port}`);
  const pathname = url.pathname;

  // API Routing
  if (pathname.startsWith("/api/")) {
    try {
      // 1. Classes API
      if (pathname === "/api/classes" && req.method === "GET") {
        const stmt = db.prepare("SELECT * FROM classes ORDER BY created_at ASC");
        const rows = stmt.all();
        const classes = rows.map((row) => ({
          id: row.id,
          name: row.name,
          schoolYear: row.school_year,
          term: row.term,
          createdAt: row.created_at,
          updatedAt: row.updated_at
        }));
        return sendJSON(res, classes);
      }

      if (pathname === "/api/classes/create" && req.method === "POST") {
        const body = await readJSONBody(req);
        const { id, name } = body;
        if (!name) return sendJSON(res, { error: "Name is required" }, 400);

        const createdAt = new Date().toISOString();
        const stmt = db.prepare("INSERT INTO classes (id, name, school_year, term, created_at) VALUES (?, ?, '', '', ?)");
        stmt.run(id, name, createdAt);
        return sendJSON(res, { id, name, schoolYear: "", term: "", createdAt });
      }

      if (pathname === "/api/classes/update" && req.method === "POST") {
        const body = await readJSONBody(req);
        const { id, name, schoolYear, term } = body;
        if (!id || !name) return sendJSON(res, { error: "ID and Name are required" }, 400);

        const updatedAt = new Date().toISOString();
        const stmt = db.prepare("UPDATE classes SET name = ?, school_year = ?, term = ?, updated_at = ? WHERE id = ?");
        stmt.run(name, schoolYear, term, updatedAt, id);
        return sendJSON(res, { id, name, schoolYear, term, updatedAt });
      }

      if (pathname === "/api/classes/delete" && req.method === "POST") {
        const body = await readJSONBody(req);
        const { id } = body;
        if (!id) return sendJSON(res, { error: "ID is required" }, 400);

        const stmt = db.prepare("DELETE FROM classes WHERE id = ?");
        stmt.run(id);
        return sendJSON(res, { success: true });
      }

      // 2. Students API
      if (pathname === "/api/students" && req.method === "GET") {
        const classId = url.searchParams.get("classId");
        if (!classId) return sendJSON(res, { error: "classId is required" }, 400);

        const stmt = db.prepare("SELECT * FROM students WHERE class_id = ? ORDER BY created_at ASC");
        const rows = stmt.all(classId);
        const students = rows.map((row) => ({
          id: row.id,
          classId: row.class_id,
          name: row.name,
          studentNo: row.student_no,
          status: row.status,
          joinedAt: row.joined_at,
          leftAt: row.left_at,
          note: row.note,
          createdAt: row.created_at,
          updatedAt: row.updated_at
        }));
        return sendJSON(res, students);
      }

      if (pathname === "/api/students/create" && req.method === "POST") {
        const body = await readJSONBody(req);
        const { id, classId, name, studentNo, status, joinedAt, note } = body;
        if (!classId || !name) return sendJSON(res, { error: "classId and name are required" }, 400);

        const createdAt = new Date().toISOString();
        const stmt = db.prepare(
          "INSERT INTO students (id, class_id, name, student_no, status, joined_at, left_at, note, created_at) VALUES (?, ?, ?, ?, ?, ?, '', ?, ?)"
        );
        stmt.run(id, classId, name, studentNo || "", status || "active", joinedAt || "", note || "", createdAt);
        return sendJSON(res, { id, classId, name, studentNo, status, joinedAt, note, createdAt });
      }

      if (pathname === "/api/students/update" && req.method === "POST") {
        const body = await readJSONBody(req);
        const { id, name, studentNo, status, joinedAt, leftAt, note } = body;
        if (!id || !name) return sendJSON(res, { error: "id and name are required" }, 400);

        const updatedAt = new Date().toISOString();
        const stmt = db.prepare(
          "UPDATE students SET name = ?, student_no = ?, status = ?, joined_at = ?, left_at = ?, note = ?, updated_at = ? WHERE id = ?"
        );
        stmt.run(name, studentNo || "", status || "active", joinedAt || "", leftAt || "", note || "", updatedAt, id);
        return sendJSON(res, { id, name, studentNo, status, joinedAt, leftAt, note, updatedAt });
      }

      if (pathname === "/api/students/delete" && req.method === "POST") {
        const body = await readJSONBody(req);
        const { id } = body;
        if (!id) return sendJSON(res, { error: "id is required" }, 400);

        const stmt = db.prepare("DELETE FROM students WHERE id = ?");
        stmt.run(id);
        return sendJSON(res, { success: true });
      }

      if (pathname === "/api/students/import" && req.method === "POST") {
        const body = await readJSONBody(req);
        const { classId, students } = body;
        if (!classId || !Array.isArray(students)) return sendJSON(res, { error: "classId and students list are required" }, 400);

        const createdAt = new Date().toISOString();
        const addedStudents = [];

        runInTransaction(() => {
          const insertStmt = db.prepare(
            "INSERT INTO students (id, class_id, name, student_no, status, joined_at, left_at, note, created_at) VALUES (?, ?, ?, ?, ?, ?, '', ?, ?)"
          );
          students.forEach((student) => {
            insertStmt.run(
              student.id,
              classId,
              student.name,
              student.studentNo || "",
              student.status || "active",
              student.joinedAt || "",
              student.note || "",
              createdAt
            );
            addedStudents.push({ ...student, classId, createdAt });
          });
        });

        return sendJSON(res, { success: true, count: addedStudents.length, students: addedStudents });
      }

      // 3. Seating API
      if (pathname === "/api/seating" && req.method === "GET") {
        const classId = url.searchParams.get("classId");
        if (!classId) return sendJSON(res, { error: "classId is required" }, 400);

        const stmt = db.prepare("SELECT * FROM seating WHERE class_id = ?");
        const row = stmt.get(classId);

        if (!row) {
          return sendJSON(res, { classId, rows: 4, cols: 6, seats: [] });
        }

        return sendJSON(res, {
          classId: row.class_id,
          rows: row.rows,
          cols: row.cols,
          seats: JSON.parse(row.seats)
        });
      }

      if (pathname === "/api/seating/update" && req.method === "POST") {
        const body = await readJSONBody(req);
        const { classId, rows, cols, seats } = body;
        if (!classId || typeof rows !== "number" || typeof cols !== "number" || !Array.isArray(seats)) {
          return sendJSON(res, { error: "Invalid seating parameters" }, 400);
        }

        const seatsJSON = JSON.stringify(seats);
        const stmt = db.prepare(
          "INSERT INTO seating (class_id, rows, cols, seats) VALUES (?, ?, ?, ?) ON CONFLICT(class_id) DO UPDATE SET rows = excluded.rows, cols = excluded.cols, seats = excluded.seats"
        );
        stmt.run(classId, rows, cols, seatsJSON);
        return sendJSON(res, { success: true });
      }

      // 4. Homework API
      if (pathname === "/api/homework" && req.method === "GET") {
        const classId = url.searchParams.get("classId");
        if (!classId) return sendJSON(res, { error: "classId is required" }, 400);

        const stmt = db.prepare("SELECT * FROM homework WHERE class_id = ? ORDER BY assigned_date DESC");
        const rows = stmt.all(classId);
        const tasks = rows.map((row) => ({
          id: row.id,
          classId: row.class_id,
          title: row.title,
          subject: row.subject,
          assignedDate: row.assigned_date,
          weekStart: row.week_start,
          note: row.note,
          records: JSON.parse(row.records),
          createdAt: row.created_at,
          updatedAt: row.updated_at
        }));
        return sendJSON(res, tasks);
      }

      if (pathname === "/api/homework/create" && req.method === "POST") {
        const body = await readJSONBody(req);
        const { id, classId, title, subject, assignedDate, weekStart, note, records } = body;
        if (!id || !classId || !title) return sendJSON(res, { error: "id, classId, and title are required" }, 400);

        const createdAt = new Date().toISOString();
        const recordsJSON = JSON.stringify(records || {});
        const stmt = db.prepare(
          "INSERT INTO homework (id, class_id, title, subject, assigned_date, week_start, note, records, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
        );
        stmt.run(id, classId, title, subject || "", assignedDate, weekStart, note || "", recordsJSON, createdAt);
        return sendJSON(res, { id, classId, title, subject, assignedDate, weekStart, note, records, createdAt });
      }

      if (pathname === "/api/homework/update" && req.method === "POST") {
        const body = await readJSONBody(req);
        const { id, records } = body;
        if (!id || !records) return sendJSON(res, { error: "id and records are required" }, 400);

        const updatedAt = new Date().toISOString();
        const recordsJSON = JSON.stringify(records);
        const stmt = db.prepare("UPDATE homework SET records = ?, updated_at = ? WHERE id = ?");
        stmt.run(recordsJSON, updatedAt, id);
        return sendJSON(res, { success: true, updatedAt });
      }

      // 5. Grades (Subjects & Exams) API
      if (pathname === "/api/subjects" && req.method === "GET") {
        const classId = url.searchParams.get("classId");
        if (!classId) return sendJSON(res, { error: "classId is required" }, 400);

        const stmt = db.prepare("SELECT * FROM subjects WHERE class_id = ? ORDER BY created_at ASC");
        const rows = stmt.all(classId);
        const subjects = rows.map((row) => ({
          id: row.id,
          classId: row.class_id,
          name: row.name,
          active: row.active === 1,
          createdAt: row.created_at,
          updatedAt: row.updated_at
        }));
        return sendJSON(res, subjects);
      }

      if (pathname === "/api/subjects/create" && req.method === "POST") {
        const body = await readJSONBody(req);
        const { id, classId, name } = body;
        if (!id || !classId || !name) return sendJSON(res, { error: "id, classId and name are required" }, 400);

        const createdAt = new Date().toISOString();
        const stmt = db.prepare("INSERT INTO subjects (id, class_id, name, active, created_at) VALUES (?, ?, ?, 1, ?)");
        stmt.run(id, classId, name, createdAt);
        return sendJSON(res, { id, classId, name, active: true, createdAt });
      }

      if (pathname === "/api/subjects/update" && req.method === "POST") {
        const body = await readJSONBody(req);
        const { id, active } = body;
        if (!id || typeof active !== "boolean") return sendJSON(res, { error: "id and active are required" }, 400);

        const updatedAt = new Date().toISOString();
        const activeInt = active ? 1 : 0;
        const stmt = db.prepare("UPDATE subjects SET active = ?, updated_at = ? WHERE id = ?");
        stmt.run(activeInt, updatedAt, id);
        return sendJSON(res, { success: true, active, updatedAt });
      }

      if (pathname === "/api/exams" && req.method === "GET") {
        const classId = url.searchParams.get("classId");
        if (!classId) return sendJSON(res, { error: "classId is required" }, 400);

        const stmt = db.prepare("SELECT * FROM exams WHERE class_id = ? ORDER BY exam_date DESC");
        const rows = stmt.all(classId);
        const exams = rows.map((row) => ({
          id: row.id,
          classId: row.class_id,
          name: row.name,
          examDate: row.exam_date,
          term: row.term,
          subjectIds: JSON.parse(row.subject_ids),
          scores: JSON.parse(row.scores),
          createdAt: row.created_at,
          updatedAt: row.updated_at
        }));
        return sendJSON(res, exams);
      }

      if (pathname === "/api/exams/create" && req.method === "POST") {
        const body = await readJSONBody(req);
        const { id, classId, name, examDate, term, subjectIds, scores } = body;
        if (!id || !classId || !name || !Array.isArray(subjectIds)) {
          return sendJSON(res, { error: "Missing required exam fields" }, 400);
        }

        const createdAt = new Date().toISOString();
        const subjectIdsJSON = JSON.stringify(subjectIds);
        const scoresJSON = JSON.stringify(scores || {});
        const stmt = db.prepare(
          "INSERT INTO exams (id, class_id, name, exam_date, term, subject_ids, scores, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
        );
        stmt.run(id, classId, name, examDate, term || "", subjectIdsJSON, scoresJSON, createdAt);
        return sendJSON(res, { id, classId, name, examDate, term, subjectIds, scores, createdAt });
      }

      if (pathname === "/api/exams/update" && req.method === "POST") {
        const body = await readJSONBody(req);
        const { id, scores } = body;
        if (!id || !scores) return sendJSON(res, { error: "id and scores are required" }, 400);

        const updatedAt = new Date().toISOString();
        const scoresJSON = JSON.stringify(scores);
        const stmt = db.prepare("UPDATE exams SET scores = ?, updated_at = ? WHERE id = ?");
        stmt.run(scoresJSON, updatedAt, id);
        return sendJSON(res, { success: true, updatedAt });
      }

      // 6. Migrate API
      if (pathname === "/api/migrate" && req.method === "POST") {
        const body = await readJSONBody(req);
        const { classes, students, seatPlans, homeworkTasks, subjects, exams } = body;

        runInTransaction(() => {
          // Clear current tables
          db.exec("DELETE FROM exams;");
          db.exec("DELETE FROM subjects;");
          db.exec("DELETE FROM homework;");
          db.exec("DELETE FROM seating;");
          db.exec("DELETE FROM students;");
          db.exec("DELETE FROM classes;");

          // Import classes
          if (Array.isArray(classes)) {
            const stmt = db.prepare(
              "INSERT INTO classes (id, name, school_year, term, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)"
            );
            classes.forEach((c) => {
              stmt.run(c.id, c.name, c.schoolYear || "", c.term || "", c.createdAt || new Date().toISOString(), c.updatedAt || null);
            });
          }

          // Import students
          if (Array.isArray(students)) {
            const stmt = db.prepare(
              "INSERT INTO students (id, class_id, name, student_no, status, joined_at, left_at, note, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
            );
            students.forEach((s) => {
              stmt.run(
                s.id,
                s.classId,
                s.name,
                s.studentNo || "",
                s.status || "active",
                s.joinedAt || "",
                s.leftAt || "",
                s.note || "",
                s.createdAt || new Date().toISOString(),
                s.updatedAt || null
              );
            });
          }

          // Import seating
          if (typeof seatPlans === "object" && seatPlans !== null) {
            const stmt = db.prepare("INSERT INTO seating (class_id, rows, cols, seats) VALUES (?, ?, ?, ?)");
            Object.entries(seatPlans).forEach(([classId, plan]) => {
              if (plan && Array.isArray(plan.seats)) {
                stmt.run(classId, plan.rows || 4, plan.cols || 6, JSON.stringify(plan.seats));
              }
            });
          }

          // Import homework
          if (Array.isArray(homeworkTasks)) {
            const stmt = db.prepare(
              "INSERT INTO homework (id, class_id, title, subject, assigned_date, week_start, note, records, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
            );
            homeworkTasks.forEach((h) => {
              stmt.run(
                h.id,
                h.classId,
                h.title,
                h.subject || "",
                h.assignedDate,
                h.weekStart,
                h.note || "",
                JSON.stringify(h.records || {}),
                h.createdAt || new Date().toISOString(),
                h.updatedAt || null
              );
            });
          }

          // Import subjects
          if (Array.isArray(subjects)) {
            const stmt = db.prepare("INSERT INTO subjects (id, class_id, name, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)");
            subjects.forEach((sub) => {
              stmt.run(
                sub.id,
                sub.classId,
                sub.name,
                sub.active !== false ? 1 : 0,
                sub.createdAt || new Date().toISOString(),
                sub.updatedAt || null
              );
            });
          }

          // Import exams
          if (Array.isArray(exams)) {
            const stmt = db.prepare(
              "INSERT INTO exams (id, class_id, name, exam_date, term, subject_ids, scores, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
            );
            exams.forEach((ex) => {
              stmt.run(
                ex.id,
                ex.classId,
                ex.name,
                ex.examDate,
                ex.term || "",
                JSON.stringify(ex.subjectIds || []),
                JSON.stringify(ex.scores || {}),
                ex.createdAt || new Date().toISOString(),
                ex.updatedAt || null
              );
            });
          }
        });

        return sendJSON(res, { success: true });
      }

      // No endpoint matched
      return sendJSON(res, { error: "Not Found" }, 404);
    } catch (err) {
      console.error("API error:", err);
      return sendJSON(res, { error: err.message || "Internal Server Error" }, 500);
    }
  }

  // Static File Service
  const requestedPath = pathname === "/" ? "index.html" : pathname.slice(1);
  const filePath = path.resolve(root, requestedPath);

  if (!filePath.startsWith(root)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }

    res.writeHead(200, { "Content-Type": types[path.extname(filePath)] || "application/octet-stream" });
    res.end(data);
  });
});

server.listen(port, host, () => {
  console.log(`Bighoe tools are running at http://${host === "0.0.0.0" ? "127.0.0.1" : host}:${port}/`);
});
