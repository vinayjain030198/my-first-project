const express = require('express');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const Database = require('better-sqlite3');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'dev_super_secret_change_me';

const db = new Database(path.join(__dirname, 'fitness.db'));
db.pragma('journal_mode = WAL');

function initDb() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS profiles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER UNIQUE NOT NULL,
      name TEXT,
      age INTEGER,
      gender TEXT,
      height_cm REAL,
      weight_kg REAL,
      goal TEXT,
      activity_level TEXT,
      dietary_preference TEXT,
      protein_target REAL DEFAULT 90,
      calorie_target REAL DEFAULT 2000,
      FOREIGN KEY(user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS meal_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      meal_date TEXT NOT NULL,
      meal_type TEXT NOT NULL,
      meal_name TEXT NOT NULL,
      calories REAL NOT NULL,
      protein REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'planned',
      UNIQUE(user_id, meal_date, meal_type),
      FOREIGN KEY(user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS meal_uploads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      image_path TEXT NOT NULL,
      calories_est REAL NOT NULL,
      protein_est REAL NOT NULL,
      feedback TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS weight_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      log_date TEXT NOT NULL,
      weight_kg REAL NOT NULL,
      UNIQUE(user_id, log_date),
      FOREIGN KEY(user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS water_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      log_date TEXT NOT NULL,
      glasses INTEGER NOT NULL,
      UNIQUE(user_id, log_date),
      FOREIGN KEY(user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS progress_photos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      image_path TEXT NOT NULL,
      uploaded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id)
    );
  `);
}

initDb();

if (!db.prepare('SELECT id FROM users WHERE role = ?').get('admin')) {
  const hash = bcrypt.hashSync('Admin@12345', 10);
  db.prepare('INSERT INTO users (email, password_hash, role) VALUES (?, ?, ?)').run('admin@fittrack.dev', hash, 'admin');
}

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(express.static(path.join(__dirname, 'public')));

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, path.join(__dirname, 'uploads')),
    filename: (_req, file, cb) => {
      const safe = `${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, '_')}`;
      cb(null, safe);
    },
  }),
});

function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validatePassword(password) {
  return /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^\w\s]).{8,}$/.test(password);
}

function auth(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Missing token' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    return next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

function adminOnly(req, res, next) {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin only' });
  }
  return next();
}

function getTargets(goal, weight) {
  const base = weight ? Math.round(weight * 28) : 2000;
  if (goal === 'Lose Weight') return { calories: Math.max(base - 400, 1400), protein: Math.max(90, Math.round((weight || 65) * 1.8)) };
  if (goal === 'Gain Muscle') return { calories: base + 350, protein: Math.max(110, Math.round((weight || 65) * 2.1)) };
  return { calories: base, protein: Math.max(95, Math.round((weight || 65) * 1.6)) };
}

const mealBank = {
  breakfast: [
    ['Moong dal chilla with paneer stuffing', 360, 26],
    ['Greek yogurt parfait with nuts and seeds', 330, 22],
    ['Besan cheela + soy curd + fruit', 340, 21],
    ['Overnight oats with peanut butter and chia', 390, 19],
    ['Tofu bhurji with multigrain toast', 350, 24],
    ['Ragi dosa with sambar', 320, 16],
    ['Sprouts poha with roasted peanuts', 310, 18],
  ],
  lunch: [
    ['Rajma brown rice bowl + salad', 520, 24],
    ['Chole quinoa bowl + cucumber raita', 540, 27],
    ['Palak paneer + 2 phulka + dal', 560, 32],
    ['Tofu tikka wrap + hummus', 500, 30],
    ['Soya chunk pulao + veg raita', 550, 34],
    ['Dal makhani + millet roti + salad', 530, 25],
    ['Paneer bhurji roll + buttermilk', 510, 31],
  ],
  dinner: [
    ['Mixed dal khichdi + curd + sautéed veggies', 470, 22],
    ['Grilled paneer with stir fry veggies', 430, 33],
    ['Tofu curry + red rice', 460, 28],
    ['Lentil soup + quinoa salad', 410, 24],
    ['Soy keema + whole wheat roti', 450, 32],
    ['Vegetable sambar + idli + peanut chutney', 420, 19],
    ['Chickpea spinach curry + jeera rice', 480, 23],
  ],
  snack: [
    ['Roasted chana + coconut water', 180, 8],
    ['Protein smoothie (banana + whey/pea + milk)', 260, 24],
    ['Apple + peanut butter', 210, 7],
    ['Paneer cubes + black salt + pepper', 220, 18],
    ['Trail mix + green tea', 200, 6],
    ['Boiled corn chaat with sprouts', 190, 9],
    ['Soy nuts + buttermilk', 210, 14],
  ],
};

function mealAdjustment(goal, calories, protein) {
  if (goal === 'Lose Weight') return { calories: Math.round(calories * 0.9), protein: Math.round(protein * 1.1) };
  if (goal === 'Gain Muscle') return { calories: Math.round(calories * 1.15), protein: Math.round(protein * 1.2) };
  return { calories, protein };
}

function buildMealPlan(goal = 'Maintain Fitness') {
  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  return days.map((day, i) => {
    const b = mealBank.breakfast[i % 7];
    const l = mealBank.lunch[(i + 2) % 7];
    const d = mealBank.dinner[(i + 4) % 7];
    const s = mealBank.snack[(i + 1) % 7];

    const meals = {
      Breakfast: { name: b[0], ...mealAdjustment(goal, b[1], b[2]) },
      Lunch: { name: l[0], ...mealAdjustment(goal, l[1], l[2]) },
      Dinner: { name: d[0], ...mealAdjustment(goal, d[1], d[2]) },
      Snacks: { name: s[0], ...mealAdjustment(goal, s[1], s[2]) },
    };

    return { day, meals };
  });
}

function workoutPlan(goal) {
  if (goal === 'Lose Weight') {
    return [
      { day: 'Mon', focus: 'HIIT + Core', exercises: ['Jump rope 5x2 min', 'Mountain climbers 4x30s', 'Plank 4x45s'] },
      { day: 'Tue', focus: 'Cardio Endurance', exercises: ['Brisk walk 40 min', 'Cycling 20 min', 'Mobility 10 min'] },
      { day: 'Wed', focus: 'Full-body Circuit', exercises: ['Bodyweight squats 4x15', 'Push-ups 4x10', 'Lunges 4x12'] },
    ];
  }
  if (goal === 'Gain Muscle') {
    return [
      { day: 'Mon', focus: 'Push', exercises: ['Bench press 4x8', 'Shoulder press 4x10', 'Tricep pushdown 3x12'] },
      { day: 'Tue', focus: 'Pull', exercises: ['Lat pulldown 4x10', 'Barbell row 4x8', 'Bicep curls 3x12'] },
      { day: 'Wed', focus: 'Legs', exercises: ['Squats 5x5', 'Romanian deadlift 4x8', 'Leg press 3x12'] },
    ];
  }
  return [
    { day: 'Mon', focus: 'Mobility + Core', exercises: ['Yoga flow 20 min', 'Plank 3x60s', 'Bird dog 3x12'] },
    { day: 'Tue', focus: 'Light Strength', exercises: ['Goblet squat 4x10', 'Dumbbell rows 4x10', 'Incline pushups 4x12'] },
    { day: 'Wed', focus: 'Cardio', exercises: ['Jogging 30 min', 'Cycling 15 min', 'Stretching 10 min'] },
  ];
}

app.post('/api/auth/signup', (req, res) => {
  const { email, password } = req.body;
  if (!validateEmail(email)) return res.status(400).json({ error: 'Invalid email format' });
  if (!validatePassword(password)) {
    return res.status(400).json({ error: 'Password must be 8+ chars with upper, lower, number, special char' });
  }

  try {
    const hash = bcrypt.hashSync(password, 10);
    const info = db.prepare('INSERT INTO users (email, password_hash) VALUES (?, ?)').run(email.toLowerCase(), hash);
    const token = jwt.sign({ id: info.lastInsertRowid, email, role: 'user' }, JWT_SECRET, { expiresIn: '7d' });
    return res.json({ token });
  } catch {
    return res.status(409).json({ error: 'Email already exists' });
  }
});

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get((email || '').toLowerCase());
  if (!user || !bcrypt.compareSync(password || '', user.password_hash)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
  return res.json({ token, role: user.role });
});

app.get('/api/profile', auth, (req, res) => {
  const profile = db.prepare('SELECT * FROM profiles WHERE user_id = ?').get(req.user.id);
  return res.json({ profile: profile || null });
});

app.put('/api/profile', auth, (req, res) => {
  const p = req.body;
  const targets = getTargets(p.goal, p.weight_kg);
  db.prepare(`
    INSERT INTO profiles (user_id, name, age, gender, height_cm, weight_kg, goal, activity_level, dietary_preference, protein_target, calorie_target)
    VALUES (@user_id, @name, @age, @gender, @height_cm, @weight_kg, @goal, @activity_level, @dietary_preference, @protein_target, @calorie_target)
    ON CONFLICT(user_id) DO UPDATE SET
      name=excluded.name, age=excluded.age, gender=excluded.gender, height_cm=excluded.height_cm, weight_kg=excluded.weight_kg,
      goal=excluded.goal, activity_level=excluded.activity_level, dietary_preference=excluded.dietary_preference,
      protein_target=excluded.protein_target, calorie_target=excluded.calorie_target
  `).run({
    user_id: req.user.id,
    name: p.name,
    age: Number(p.age),
    gender: p.gender,
    height_cm: Number(p.height_cm),
    weight_kg: Number(p.weight_kg),
    goal: p.goal,
    activity_level: p.activity_level,
    dietary_preference: p.dietary_preference,
    protein_target: targets.protein,
    calorie_target: targets.calories,
  });

  return res.json({ ok: true, targets });
});

app.get('/api/meal-plan', auth, (req, res) => {
  const profile = db.prepare('SELECT goal FROM profiles WHERE user_id = ?').get(req.user.id);
  const plan = buildMealPlan(profile?.goal || 'Maintain Fitness');
  return res.json({ plan });
});

app.post('/api/meal-action', auth, (req, res) => {
  const { meal_date, meal_type, meal_name, calories, protein, status } = req.body;
  db.prepare(`
    INSERT INTO meal_logs (user_id, meal_date, meal_type, meal_name, calories, protein, status)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id, meal_date, meal_type)
    DO UPDATE SET meal_name=excluded.meal_name, calories=excluded.calories, protein=excluded.protein, status=excluded.status
  `).run(req.user.id, meal_date, meal_type, meal_name, calories, protein, status);
  return res.json({ ok: true });
});

function inferNutrition(filename) {
  const key = filename.toLowerCase();
  const hints = [
    { key: 'paneer', protein: 26, calories: 340 },
    { key: 'tofu', protein: 21, calories: 290 },
    { key: 'dal', protein: 16, calories: 250 },
    { key: 'salad', protein: 9, calories: 170 },
    { key: 'smoothie', protein: 24, calories: 260 },
  ];
  const found = hints.find((h) => key.includes(h.key));
  if (found) return found;
  return {
    protein: 12 + (filename.length % 15),
    calories: 180 + (filename.length * 7) % 280,
  };
}

app.post('/api/upload-meal', auth, upload.single('mealImage'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Image required' });
  const estimate = inferNutrition(req.file.originalname);

  const profile = db.prepare('SELECT protein_target FROM profiles WHERE user_id = ?').get(req.user.id);
  const today = new Date().toISOString().slice(0, 10);
  const consumed = db.prepare('SELECT COALESCE(SUM(protein), 0) AS protein FROM meal_logs WHERE user_id = ? AND meal_date = ? AND status = ?').get(req.user.id, today, 'completed');
  const remaining = Math.max((profile?.protein_target || 100) - consumed.protein - estimate.protein, 0);
  const feedback = `This meal has approx ${estimate.protein}g protein and ${estimate.calories} kcal. You need +${Math.round(remaining)}g more protein today.`;

  db.prepare('INSERT INTO meal_uploads (user_id, image_path, calories_est, protein_est, feedback) VALUES (?, ?, ?, ?, ?)')
    .run(req.user.id, `/uploads/${req.file.filename}`, estimate.calories, estimate.protein, feedback);

  return res.json({
    image: `/uploads/${req.file.filename}`,
    protein: estimate.protein,
    calories: estimate.calories,
    feedback,
  });
});

app.post('/api/weight', auth, (req, res) => {
  const { log_date, weight_kg } = req.body;
  db.prepare('INSERT INTO weight_logs (user_id, log_date, weight_kg) VALUES (?, ?, ?) ON CONFLICT(user_id, log_date) DO UPDATE SET weight_kg=excluded.weight_kg')
    .run(req.user.id, log_date, Number(weight_kg));
  res.json({ ok: true });
});

app.post('/api/water', auth, (req, res) => {
  const { log_date, glasses } = req.body;
  db.prepare('INSERT INTO water_logs (user_id, log_date, glasses) VALUES (?, ?, ?) ON CONFLICT(user_id, log_date) DO UPDATE SET glasses=excluded.glasses')
    .run(req.user.id, log_date, Number(glasses));
  res.json({ ok: true });
});

app.post('/api/progress-photo', auth, upload.single('photo'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Photo required' });
  db.prepare('INSERT INTO progress_photos (user_id, image_path) VALUES (?, ?)').run(req.user.id, `/uploads/${req.file.filename}`);
  res.json({ ok: true, path: `/uploads/${req.file.filename}` });
});

app.get('/api/workout', auth, (req, res) => {
  const profile = db.prepare('SELECT goal FROM profiles WHERE user_id = ?').get(req.user.id);
  res.json({ plan: workoutPlan(profile?.goal || 'Maintain Fitness') });
});

app.get('/api/reminders', auth, (_req, res) => {
  res.json({
    reminders: [
      '8:00 AM: Hydration + protein-rich breakfast',
      '1:00 PM: Balanced lunch and 10-min walk',
      '6:30 PM: Workout session reminder',
      '9:00 PM: Log meals, water, and weight update',
    ],
  });
});

app.get('/api/dashboard', auth, (req, res) => {
  const profile = db.prepare('SELECT * FROM profiles WHERE user_id = ?').get(req.user.id) || {};
  const today = new Date().toISOString().slice(0, 10);

  const daily = db.prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN status='completed' THEN calories ELSE 0 END), 0) AS calories,
      COALESCE(SUM(CASE WHEN status='completed' THEN protein ELSE 0 END), 0) AS protein,
      COALESCE(SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END), 0) AS completedMeals
    FROM meal_logs WHERE user_id = ? AND meal_date = ?
  `).get(req.user.id, today);

  const weekly = db.prepare(`
    SELECT meal_date,
      SUM(CASE WHEN status='completed' THEN calories ELSE 0 END) AS calories,
      SUM(CASE WHEN status='completed' THEN protein ELSE 0 END) AS protein
    FROM meal_logs
    WHERE user_id = ? AND meal_date >= date('now', '-6 day')
    GROUP BY meal_date ORDER BY meal_date
  `).all(req.user.id);

  const weights = db.prepare("SELECT log_date, weight_kg FROM weight_logs WHERE user_id = ? ORDER BY log_date DESC LIMIT 8").all(req.user.id);
  const water = db.prepare('SELECT glasses FROM water_logs WHERE user_id = ? AND log_date = ?').get(req.user.id, today);
  const uploads = db.prepare('SELECT * FROM meal_uploads WHERE user_id = ? ORDER BY created_at DESC LIMIT 3').all(req.user.id);

  const streak = db.prepare(`
    SELECT COUNT(*) AS days
    FROM (
      SELECT meal_date FROM meal_logs WHERE user_id = ? AND status='completed' GROUP BY meal_date
    )
  `).get(req.user.id).days;

  res.json({
    profile,
    daily,
    weekly,
    weights,
    water: water?.glasses || 0,
    streak,
    uploads,
  });
});

app.get('/api/admin/users', auth, adminOnly, (_req, res) => {
  const users = db.prepare(`
    SELECT u.id, u.email, u.role, u.created_at, p.name, p.goal, p.weight_kg, p.protein_target, p.calorie_target
    FROM users u
    LEFT JOIN profiles p ON p.user_id = u.id
    ORDER BY u.created_at DESC
  `).all();
  res.json({ users });
});

app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  if (!fs.existsSync(path.join(__dirname, 'uploads'))) fs.mkdirSync(path.join(__dirname, 'uploads'));
  console.log(`FitTrack Pro running on http://localhost:${PORT}`);
});
