const state = {
  token: localStorage.getItem('token') || '',
  role: localStorage.getItem('role') || 'user',
  charts: {},
};

const $ = (s) => document.querySelector(s);
const views = document.querySelectorAll('.view');

document.querySelectorAll('.nav-btn[data-view]').forEach((btn) => {
  btn.addEventListener('click', () => setView(btn.dataset.view));
});

function setView(id) {
  views.forEach((v) => v.classList.toggle('active', v.id === id));
}

async function api(path, options = {}) {
  const headers = options.headers || {};
  if (state.token) headers.Authorization = `Bearer ${state.token}`;
  if (!(options.body instanceof FormData)) headers['Content-Type'] = 'application/json';
  const res = await fetch(path, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

$('#signupForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  try {
    const data = await api('/api/auth/signup', { method: 'POST', body: JSON.stringify(Object.fromEntries(fd.entries())) });
    state.token = data.token;
    state.role = 'user';
    localStorage.setItem('token', data.token);
    localStorage.setItem('role', 'user');
    $('#authMsg').textContent = 'Signup successful';
    await bootstrap();
    setView('onboarding');
  } catch (err) {
    $('#authMsg').textContent = err.message;
  }
});

$('#loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  try {
    const data = await api('/api/auth/login', { method: 'POST', body: JSON.stringify(Object.fromEntries(fd.entries())) });
    state.token = data.token;
    state.role = data.role || 'user';
    localStorage.setItem('token', data.token);
    localStorage.setItem('role', state.role);
    $('#authMsg').textContent = 'Login successful';
    await bootstrap();
    setView('dashboard');
  } catch (err) {
    $('#authMsg').textContent = err.message;
  }
});

$('#logout').addEventListener('click', () => {
  localStorage.removeItem('token');
  localStorage.removeItem('role');
  state.token = '';
  setView('auth');
});

$('#profileForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const body = Object.fromEntries(new FormData(e.target).entries());
  try {
    const data = await api('/api/profile', { method: 'PUT', body: JSON.stringify(body) });
    $('#profileMsg').textContent = `Profile saved. Targets: ${data.targets.calories} kcal, ${data.targets.protein}g protein.`;
    await loadMealPlan();
    await loadWorkout();
    await loadDashboard();
  } catch (err) {
    $('#profileMsg').textContent = err.message;
  }
});

$('#weightForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  await api('/api/weight', { method: 'POST', body: JSON.stringify(Object.fromEntries(new FormData(e.target).entries())) });
  await loadDashboard();
});

$('#waterForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  await api('/api/water', { method: 'POST', body: JSON.stringify(Object.fromEntries(new FormData(e.target).entries())) });
  await loadDashboard();
});

$('#mealImageForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  try {
    const data = await api('/api/upload-meal', { method: 'POST', body: fd });
    $('#mealFeedback').innerHTML = `${data.feedback}<br/><img src="${data.image}" width="160" style="margin-top:8px;border-radius:8px"/>`;
  } catch (err) {
    $('#mealFeedback').textContent = err.message;
  }
});

$('#progressPhotoForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  try {
    const data = await api('/api/progress-photo', { method: 'POST', body: fd });
    $('#photoMsg').innerHTML = `Uploaded successfully<br/><img src="${data.path}" width="120" style="margin-top:8px;border-radius:8px"/>`;
  } catch (err) {
    $('#photoMsg').textContent = err.message;
  }
});

async function loadMealPlan() {
  const data = await api('/api/meal-plan');
  const today = new Date().toISOString().slice(0, 10);
  const root = $('#mealPlan');
  root.innerHTML = '';

  data.plan.forEach((d) => {
    const card = document.createElement('div');
    card.className = 'day-card';
    card.innerHTML = `<h4>${d.day}</h4>`;

    Object.entries(d.meals).forEach(([type, meal]) => {
      const row = document.createElement('div');
      row.className = 'meal-row';
      row.innerHTML = `
        <div>
          <strong>${type}</strong> - ${meal.name}
          <div class="hint">${meal.calories} kcal • ${meal.protein}g protein</div>
        </div>
        <span class="pill">${meal.calories} kcal</span>
        <button data-status="completed">Completed</button>
        <button data-status="skipped" style="background:#f59e0b">Skipped</button>
      `;
      row.querySelectorAll('button').forEach((btn) => {
        btn.addEventListener('click', async () => {
          await api('/api/meal-action', {
            method: 'POST',
            body: JSON.stringify({
              meal_date: today,
              meal_type: type,
              meal_name: meal.name,
              calories: meal.calories,
              protein: meal.protein,
              status: btn.dataset.status,
            }),
          });
          await loadDashboard();
        });
      });
      card.appendChild(row);
    });

    root.appendChild(card);
  });
}

function drawChart(id, config) {
  if (state.charts[id]) state.charts[id].destroy();
  state.charts[id] = new Chart(document.getElementById(id), config);
}

async function loadDashboard() {
  const data = await api('/api/dashboard');
  $('#summaryCards').innerHTML = `
    <div class="metric"><small>Calories Today</small><h3>${Math.round(data.daily.calories || 0)} / ${Math.round(data.profile.calorie_target || 0)}</h3></div>
    <div class="metric"><small>Protein Today</small><h3>${Math.round(data.daily.protein || 0)}g / ${Math.round(data.profile.protein_target || 0)}g</h3></div>
    <div class="metric"><small>Meals Completed</small><h3>${data.daily.completedMeals || 0}</h3></div>
    <div class="metric"><small>Streak Days</small><h3>${data.streak || 0}</h3></div>
    <div class="metric"><small>Water Today</small><h3>${data.water || 0} glasses</h3></div>
  `;

  drawChart('weeklyChart', {
    type: 'bar',
    data: {
      labels: data.weekly.map((w) => w.meal_date),
      datasets: [
        { label: 'Calories', data: data.weekly.map((w) => w.calories), backgroundColor: '#34d399' },
        { label: 'Protein', data: data.weekly.map((w) => w.protein), backgroundColor: '#60a5fa' },
      ],
    },
  });

  drawChart('weightChart', {
    type: 'line',
    data: {
      labels: [...data.weights].reverse().map((w) => w.log_date),
      datasets: [{ label: 'Weight (kg)', data: [...data.weights].reverse().map((w) => w.weight_kg), borderColor: '#f472b6' }],
    },
  });
}

async function loadWorkout() {
  const workout = await api('/api/workout');
  const reminders = await api('/api/reminders');
  $('#workoutPlan').innerHTML = workout.plan.map((d) => `
    <div class="day-card"><strong>${d.day}: ${d.focus}</strong><ul>${d.exercises.map((e) => `<li>${e}</li>`).join('')}</ul></div>
  `).join('');
  $('#reminders').innerHTML = reminders.reminders.map((r) => `<li>${r}</li>`).join('');
}

async function loadAdmin() {
  if (state.role !== 'admin') {
    $('#adminUsers').innerHTML = '<p class="hint">Login as admin to view users.</p>';
    return;
  }
  const data = await api('/api/admin/users');
  $('#adminUsers').innerHTML = `
    <table style="width:100%;border-collapse:collapse">
      <thead><tr><th>Email</th><th>Name</th><th>Goal</th><th>Weight</th><th>Targets</th><th>Role</th></tr></thead>
      <tbody>
        ${data.users.map((u) => `<tr><td>${u.email}</td><td>${u.name || '-'}</td><td>${u.goal || '-'}</td><td>${u.weight_kg || '-'}</td><td>${u.calorie_target || '-'} kcal / ${u.protein_target || '-'}g</td><td>${u.role}</td></tr>`).join('')}
      </tbody>
    </table>
  `;
}

async function bootstrap() {
  if (!state.token) return;
  await Promise.all([loadMealPlan(), loadDashboard(), loadWorkout(), loadAdmin()]);
}

bootstrap();
