'use strict';

// ── [0] LOADING SCREEN ────────────────────────
window.addEventListener('load', () => {
  const loader = document.getElementById('loadingScreen');
  if (loader) {
    // Memberikan sedikit delay agar animasi dan aset terlihat selesai dimuat
    setTimeout(() => {
      loader.classList.add('hidden');
    }, 800);
  }
});

/* =============================================
   dashboard.js — Logika Dashboard IoT MQTT
   ============================================= */


// ── [1] STATE GLOBAL ──────────────────────────
// Menyimpan koneksi MQTT, status, dan data sensor
let mqttClient = null;
let isConnected = false;
let chartWindow = 30;

const sensorState = {
  temperature: { value: null, min: null, max: null },
  humidity: { value: null, min: null, max: null },
  ldr: { value: null },
  i2c: { line1: '', line2: '' },
  relays: { 1: false, 2: false, 3: false, 4: false }
};


// ── [2] CHART.JS ──────────────────────────────
// Konfigurasi default tampilan chart premium
const chartDefaults = {
  responsive: true,
  maintainAspectRatio: false,
  animation: { duration: 500, easing: 'easeOutQuart' },
  interaction: { mode: 'index', intersect: false },
  plugins: {
    legend: { display: false },
    tooltip: {
      backgroundColor: 'rgba(13,21,38,0.95)',
      borderColor: 'rgba(99,179,237,0.25)',
      borderWidth: 1,
      titleColor: '#94a3b8',
      bodyColor: '#e2e8f0',
      padding: 12,
      cornerRadius: 10,
      displayColors: true,
      boxWidth: 8,
      boxHeight: 8,
      boxPadding: 4,
      callbacks: {
        title: items => items[0]?.label || ''
      }
    }
  },
  scales: {
    x: {
      ticks: { color: '#4b6177', maxTicksLimit: 6, font: { size: 10, family: "'JetBrains Mono', monospace" }, maxRotation: 0 },
      grid: { color: 'rgba(255,255,255,0.03)', drawBorder: false },
      border: { display: false }
    },
    y: {
      ticks: { color: '#4b6177', font: { size: 10, family: "'JetBrains Mono', monospace" }, padding: 8 },
      grid: { color: 'rgba(255,255,255,0.04)', drawBorder: false },
      border: { display: false }
    }
  }
};

let tempChart, humidChart;

// Membuat gradient fill untuk chart
function makeGradient(ctx, colorTop, colorBot) {
  const grad = ctx.createLinearGradient(0, 0, 0, 260);
  grad.addColorStop(0, colorTop);
  grad.addColorStop(1, colorBot);
  return grad;
}

// Membuat chart garis premium untuk suhu dan kelembaban
function initCharts() {
  const ctxT = document.getElementById('chartTemp').getContext('2d');
  const ctxH = document.getElementById('chartHumid').getContext('2d');

  const makeOptions = (min, max, unit) => ({
    ...chartDefaults,
    scales: {
      ...chartDefaults.scales,
      y: {
        ...chartDefaults.scales.y,
        min, max,
        ticks: { ...chartDefaults.scales.y.ticks, callback: v => v + unit }
      }
    }
  });

  const tempGradient = makeGradient(ctxT, 'rgba(251,146,60,0.35)', 'rgba(251,146,60,0.0)');
  const humidGradient = makeGradient(ctxH, 'rgba(56,189,248,0.35)', 'rgba(56,189,248,0.0)');

  tempChart = new Chart(ctxT, {
    type: 'line',
    data: {
      labels: [],
      datasets: [{
        label: 'Suhu °C',
        data: [],
        borderColor: '#fb923c',
        backgroundColor: tempGradient,
        borderWidth: 2.5,
        pointRadius: 0,
        pointHoverRadius: 5,
        pointHoverBackgroundColor: '#fb923c',
        pointHoverBorderColor: '#fff',
        pointHoverBorderWidth: 2,
        fill: true,
        tension: 0.45
      }]
    },
    options: makeOptions(15, 45, '°C')
  });

  humidChart = new Chart(ctxH, {
    type: 'line',
    data: {
      labels: [],
      datasets: [{
        label: 'Kelembaban %',
        data: [],
        borderColor: '#38bdf8',
        backgroundColor: humidGradient,
        borderWidth: 2.5,
        pointRadius: 0,
        pointHoverRadius: 5,
        pointHoverBackgroundColor: '#38bdf8',
        pointHoverBorderColor: '#fff',
        pointHoverBorderWidth: 2,
        fill: true,
        tension: 0.45
      }]
    },
    options: makeOptions(20, 100, '%')
  });

  // Set tinggi canvas agar proporsional
  document.getElementById('chartTemp').style.height = '220px';
  document.getElementById('chartHumid').style.height = '220px';
}

// Menambah data baru ke chart + update stats bar
function pushChartData(chart, label, value, type) {
  chart.data.labels.push(label);
  chart.data.datasets[0].data.push(value);
  if (chart.data.labels.length > chartWindow) {
    chart.data.labels.shift();
    chart.data.datasets[0].data.shift();
  }
  chart.update('none');

  // Update stats bar di HTML
  const prefix = type === 'temperature' ? 'chartTemp' : 'chartHumid';
  const data = chart.data.datasets[0].data;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const unit = type === 'temperature' ? '°' : '%';

  const el = id => document.getElementById(id);
  if (el(`${prefix}Current`)) el(`${prefix}Current`).textContent = value.toFixed(1) + unit;
  if (el(`${prefix}Min`)) el(`${prefix}Min`).textContent = min.toFixed(1) + unit;
  if (el(`${prefix}Max`)) el(`${prefix}Max`).textContent = max.toFixed(1) + unit;
  if (el(`${prefix}Count`)) el(`${prefix}Count`).textContent = data.length;
}

// Mengubah jumlah data yang ditampilkan di chart
function setChartWindow(n, btn) {
  chartWindow = n;
  document.querySelectorAll('.btn-chart-ctrl').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
}

// Menghapus semua data dari kedua chart + reset stats
function clearChartData() {
  [tempChart, humidChart].forEach((c, i) => {
    c.data.labels = [];
    c.data.datasets[0].data = [];
    c.update();
  });
  // Reset stat labels
  ['chartTempCurrent', 'chartTempMin', 'chartTempMax', 'chartTempCount',
    'chartHumidCurrent', 'chartHumidMin', 'chartHumidMax', 'chartHumidCount'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.textContent = id.includes('Count') ? '0' : '--';
    });
  addLog('Data chart dihapus', 'warn');
}


// ── [3] GAUGE CANVAS ──────────────────────────
// Menggambar gauge setengah lingkaran menggunakan Canvas API
function drawGauge(canvasId, value, min, max, color, bgColor) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);

  const cx = W / 2, cy = H - 20;
  const r = Math.min(W, H * 1.5) * 0.42;
  const startAngle = Math.PI;
  const ratio = Math.max(0, Math.min(1, (value - min) / (max - min)));
  const fillAngle = startAngle + ratio * Math.PI;

  // Lingkaran latar (track)
  ctx.beginPath();
  ctx.arc(cx, cy, r, startAngle, 2 * Math.PI);
  ctx.strokeStyle = 'rgba(255,255,255,0.07)';
  ctx.lineWidth = 12; ctx.lineCap = 'round';
  ctx.stroke();

  // Isian nilai dengan gradient
  const grad = ctx.createLinearGradient(cx - r, cy, cx + r, cy);
  grad.addColorStop(0, bgColor);
  grad.addColorStop(1, color);
  ctx.beginPath();
  ctx.arc(cx, cy, r, startAngle, fillAngle);
  ctx.strokeStyle = grad;
  ctx.lineWidth = 12; ctx.lineCap = 'round';
  ctx.shadowColor = color; ctx.shadowBlur = 14;
  ctx.stroke();
  ctx.shadowBlur = 0;

  // Garis-garis skala (tick marks)
  for (let i = 0; i <= 10; i++) {
    const a = Math.PI + (i / 10) * Math.PI;
    const inner = i % 5 === 0 ? r - 18 : r - 12;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    ctx.lineTo(cx + Math.cos(a) * inner, cy + Math.sin(a) * inner);
    ctx.strokeStyle = i % 5 === 0 ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.1)';
    ctx.lineWidth = i % 5 === 0 ? 2 : 1;
    ctx.stroke();
  }
}

// Memperbarui gauge suhu dan kelembaban sesuai nilai terkini
function updateGauges() {
  const { temperature: t, humidity: h } = sensorState;
  if (t.value !== null) drawGauge('gaugeTemp', t.value, 0, 60, '#fb923c', '#7c3aed');
  if (h.value !== null) drawGauge('gaugeHumid', h.value, 0, 100, '#38bdf8', '#0ea5e9');
}


// ── [4] MQTT CONFIG & CONNECT ─────────────────
// Membaca nilai input konfigurasi dari panel
function getConfig() {
  const clientId = document.getElementById('cfgClientId').value ||
    'iot-dash-' + Math.random().toString(36).substr(2, 8);
  document.getElementById('cfgClientId').value = clientId;

  return {
    host: document.getElementById('cfgHost').value || 'broker.hivemq.com',
    port: parseInt(document.getElementById('cfgPort').value) || 8000,
    clientId,
    username: document.getElementById('cfgUsername').value || undefined,
    password: document.getElementById('cfgPassword').value || undefined,
    topics: {
      temperature: document.getElementById('topicTemp')?.value || 'smk/iot/sensor/temperature',
      humidity: document.getElementById('topicHumid')?.value || 'smk/iot/sensor/humidity',
      ldr: document.getElementById('topicLdr')?.value || 'smk/iot/sensor/ldr',
      i2c: document.getElementById('topicI2c')?.value || 'smk/iot/sensor/lcd',
      relayStatus: document.getElementById('topicRelayStatus')?.value || 'smk/iot/relay/status',
      relayCtrl: document.getElementById('topicRelayCtrl')?.value || 'smk/iot/relay/control',
    }
  };
}

// Memulai koneksi ke broker MQTT via WebSocket
function connectMQTT() {
  if (mqttClient) disconnectMQTT();
  const cfg = getConfig();
  // Use wss:// for TLS ports (8884, 8883, 443), ws:// otherwise
  const useTLS = [8884, 8883, 443].includes(cfg.port);
  const protocol = useTLS ? 'wss' : 'ws';
  const url = `${protocol}://${cfg.host}:${cfg.port}/mqtt`;

  addLog(`Connecting → ${url}`, 'info');
  setConnectionUI('connecting');

  const opts = {
    clientId: cfg.clientId,
    clean: true,
    reconnectPeriod: 5000,
    connectTimeout: 10000,
    protocolVersion: 4
  };
  if (useTLS) {
    opts.rejectUnauthorized = false;
  }
  if (cfg.username) opts.username = cfg.username;
  if (cfg.password) opts.password = cfg.password;

  try { mqttClient = mqtt.connect(url, opts); }
  catch (e) { addLog('Gagal terhubung: ' + e.message, 'error'); return; }

  mqttClient.on('connect', () => {
    isConnected = true;
    setConnectionUI('connected');
    addLog('✓ Terhubung ke ' + cfg.host, 'success');
    document.getElementById('footerBroker').textContent = `${cfg.host}:${cfg.port}`;

    // Subscribe ke semua topik sensor dan relay
    const allTopics = Object.values(cfg.topics).filter(t => t);
    allTopics.forEach(t => {
      mqttClient.subscribe(t, err => {
        if (err) addLog(`Gagal mendaftar penerimaan data: ${t.split('/').pop()}`, 'error');
      });
    });

    // Subscribe wildcard untuk menangkap semua sub-topik (sensor + relay)
    mqttClient.subscribe('smk/iot/#', err => {
      if (!err) addLog('✓ Sistem siap menerima pembaruan data real-time', 'success');
    });
  });

  mqttClient.on('error', err => { addLog('Kesalahan MQTT: ' + err.message, 'error'); setConnectionUI('error'); });
  mqttClient.on('offline', () => { isConnected = false; setConnectionUI('disconnected'); addLog('MQTT terputus (offline)', 'warn'); });
  mqttClient.on('reconnect', () => { addLog('Mencoba sambung ulang...', 'warn'); setConnectionUI('connecting'); });
  mqttClient.on('message', (topic, payload) => handleMessage(topic, payload.toString(), cfg.topics));

  toggleConfig();
}

// Memutus koneksi MQTT dan reset state
function disconnectMQTT() {
  if (mqttClient) { mqttClient.end(true); mqttClient = null; }
  isConnected = false;
  setConnectionUI('disconnected');
  addLog('Disconnected', 'warn');
}


// ── [5] MESSAGE HANDLER ───────────────────────
// Memproses pesan masuk dari broker MQTT sesuai topiknya
function handleMessage(topic, payload, topics) {
  let data;
  try { data = JSON.parse(payload); } catch { data = payload; }

  const includes = kw => topic.includes(kw);

  let friendlyMsg = `Pesan baru (${topic.split('/').pop()})`;
  if (topic === topics.i2c || (topic.endsWith('/sensor') && !includes('temperature') && !includes('humidity') && !includes('ldr'))) {
    if (typeof data === 'object') {
      let f = `Update Data Sensor: Suhu ruangan ${data.temperature ?? '--'}°C, Kelembaban ${data.humidity ?? '--'}%, Kondisi cahaya ${data.ldr ?? '--'}.`;
      if (data.mode) f += ` Mode alat: ${data.mode.toUpperCase()}.`;
      if (data.uptime) f += ` Sistem menyala: ${data.uptime} detik.`;
      friendlyMsg = f;
    } else {
      friendlyMsg = `Menerima pembaruan data sensor (Format tidak dikenali)`;
    }
  } else if (topic === topics.temperature || includes('temperature')) {
    const val = typeof data === 'object' ? (data.value ?? data.temp ?? data.temperature) : data;
    friendlyMsg = `Update Suhu: ${val}°C`;
  } else if (topic === topics.humidity || includes('humidity')) {
    const val = typeof data === 'object' ? (data.value ?? data.humidity) : data;
    friendlyMsg = `Update Kelembaban: ${val}%`;
  } else if (topic === topics.ldr || includes('ldr')) {
    const val = typeof data === 'object' ? (data.value ?? data.ldr ?? data.raw) : data;
    friendlyMsg = `Update Sensor Cahaya: ${val}`;
  } else if (topic === topics.relayStatus || includes('relay/status')) {
    friendlyMsg = `Menerima status sinkronisasi semua relay`;
  } else if (topic.match(/relay\/(?:control\/)?(\d)/)) {
    const match = topic.match(/relay\/(?:control\/)?(\d)/);
    friendlyMsg = `Status Relay ${match[1]} diubah menjadi ${payload}`;
  } else if (topic === 'smk/iot/relay/mode/status' || includes('relay/mode')) {
    friendlyMsg = `Mode sistem disinkronkan ke: ${payload.toUpperCase()}`;
  } else {
    const shortPayload = payload.length > 25 ? payload.substring(0, 25) + '...' : payload;
    friendlyMsg = `Menerima pesan: ${shortPayload}`;
  }

  addLog(`📥 ${friendlyMsg}`, 'data');
  updateLastUpdate();
  const numVal = (obj, ...keys) => typeof obj === 'object'
    ? parseFloat(obj[keys.find(k => obj[k] !== undefined)])
    : parseFloat(obj);

  // ── Combined sensor JSON (smk/iot/sensor) ──
  // Arduino publishes {"temperature":28.5, "humidity":65.0, "ldr":"Terang", "uptime":123}
  if (topic === topics.i2c || (topic.endsWith('/sensor') && !topic.includes('/' + 'temperature') && !topic.includes('/' + 'humidity') && !topic.includes('/' + 'ldr'))) {
    if (typeof data === 'object') {
      // Extract temperature
      if (data.temperature !== undefined) {
        const t = parseFloat(data.temperature);
        if (!isNaN(t)) updateSensor('temperature', t);
      }
      // Extract humidity
      if (data.humidity !== undefined) {
        const h = parseFloat(data.humidity);
        if (!isNaN(h)) updateSensor('humidity', h);
      }
      // Extract LDR (string: "Terang"/"Gelap")
      if (data.ldr !== undefined) {
        updateLDRDigital(data.ldr);
      }
      // Update LCD with combined info
      const line1 = `T:${data.temperature ?? '--'}C H:${data.humidity ?? '--'}%`;
      const line2 = `LDR:${data.ldr ?? '--'} Up:${data.uptime ?? 0}s`;
      updateI2C(line1, line2);
    }
    return;
  }

  // ── Suhu (individual topic) ──
  if (topic === topics.temperature || includes('temperature')) {
    const val = numVal(data, 'value', 'temp', 'temperature');
    if (isNaN(val) && typeof data === 'string') {
      const parsed = parseFloat(data);
      if (!isNaN(parsed)) updateSensor('temperature', parsed);
    } else if (!isNaN(val)) {
      updateSensor('temperature', val);
    }
    return;
  }

  // ── Kelembaban (individual topic) ──
  if (topic === topics.humidity || includes('humidity')) {
    const val = numVal(data, 'value', 'humidity');
    if (isNaN(val) && typeof data === 'string') {
      const parsed = parseFloat(data);
      if (!isNaN(parsed)) updateSensor('humidity', parsed);
    } else if (!isNaN(val)) {
      updateSensor('humidity', val);
    }
    return;
  }

  // ── LDR (individual topic — Arduino sends "Terang"/"Gelap" string) ──
  if (topic === topics.ldr || includes('ldr')) {
    // Handle string values from Arduino ("Terang" / "Gelap")
    const strVal = typeof data === 'object' ? (data.value ?? data.ldr ?? data.raw) : data;
    if (typeof strVal === 'string' && (strVal === 'Terang' || strVal === 'Gelap')) {
      updateLDRDigital(strVal);
    } else {
      // Fallback: numeric ADC value
      const val = numVal(data, 'value', 'raw', 'ldr');
      if (!isNaN(val)) updateLDR(val);
    }
    return;
  }

  // ── Status relay (paket objek semua relay) ──
  if (topic === topics.relayStatus || includes('relay/status')) {
    if (typeof data === 'object') {
      [1, 2, 3, 4].forEach(i => {
        const v = data[`relay${i}`] ?? data[`r${i}`];
        if (v !== undefined) setRelayUI(i, v == 1 || v === 'ON' || v === true);
      });
    }
    return;
  }

  // ── Status relay individual, contoh: smk/iot/relay/control/1 ──
  const match = topic.match(/relay\/(?:control\/)?(\d)/);
  if (match) setRelayUI(parseInt(match[1]), payload === 'ON' || payload === '1' || payload === 'true');

  // ── Sinkronisasi mode dari Arduino (BTN5) ──
  if (topic === 'smk/iot/relay/mode/status') {
    const newMode = (payload === 'auto' || payload === 'AUTO') ? 'auto' : 'manual';
    if (newMode !== currentRelayMode) {
      // Sinkron UI tanpa publish balik ke MQTT (hindari loop)
      currentRelayMode = newMode;
      const manualPanel = document.getElementById('manualPanel');
      const autoPanel = document.getElementById('autoPanel');
      const btnManual = document.getElementById('btnModeManual');
      const btnAuto = document.getElementById('btnModeAuto');
      const dot = document.querySelector('.mode-indicator-dot');
      const text = document.getElementById('modeIndicatorText');
      if (newMode === 'manual') {
        if (manualPanel) manualPanel.style.display = '';
        if (autoPanel) autoPanel.style.display = 'none';
        if (btnManual) btnManual.classList.add('active');
        if (btnAuto) btnAuto.classList.remove('active');
        if (dot) dot.className = 'mode-indicator-dot manual-dot';
        if (text) text.textContent = 'Mode Manual — BTN1-4 untuk kontrol relay';
        [1, 2, 3, 4].forEach(n => { const b = document.getElementById(`manualBtn${n}`); if (b) b.disabled = false; });
        addLog('🎛️ [Arduino BTN5] Mode → MANUAL', 'info');
      } else {
        if (manualPanel) manualPanel.style.display = 'none';
        if (autoPanel) autoPanel.style.display = '';
        if (btnManual) btnManual.classList.remove('active');
        if (btnAuto) btnAuto.classList.add('active');
        if (dot) dot.className = 'mode-indicator-dot auto-dot';
        if (text) text.textContent = 'Mode Automatisasi — Relay dikontrol otomatis oleh sensor';
        [1, 2, 3, 4].forEach(n => { const b = document.getElementById(`manualBtn${n}`); if (b) b.disabled = true; });
        addLog('🤖 [Arduino BTN5] Mode → AUTOMATISASI', 'info');
      }
    }
  }
}


// ── [6] SENSOR UPDATE ─────────────────────────
// Fungsi generik untuk update suhu DAN kelembaban (menghindari duplikasi)
function updateSensor(type, val) {
  const s = sensorState[type];
  s.value = val;
  s.min = s.min === null ? val : Math.min(s.min, val);
  s.max = s.max === null ? val : Math.max(s.max, val);

  const isTemp = type === 'temperature';
  const prefix = isTemp ? 'temp' : 'humid';
  const suffix = isTemp ? '°' : '%';
  const chart = isTemp ? tempChart : humidChart;

  document.getElementById(`${prefix}Value`).textContent = val.toFixed(1);
  document.getElementById(`${prefix}Min`).textContent = s.min.toFixed(1) + suffix;
  document.getElementById(`${prefix}Max`).textContent = s.max.toFixed(1) + suffix;
  setActive(`${prefix}Dot`, true);

  updateGauges();

  // Check temperature warning when temperature updates
  if (type === 'temperature') checkTemperatureWarning(val);

  const timeLabel = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  pushChartData(chart, timeLabel, val, type);
}

// Update nilai LDR dan progress bar intensitas cahaya (numeric ADC)
function updateLDR(val) {
  sensorState.ldr.value = val;
  document.getElementById('ldrValue').textContent = Math.round(val);

  const pct = Math.min(100, (val / 4095) * 100);
  document.getElementById('ldrBarFill').style.width = pct + '%';
  setActive('ldrDot', true);

  // Menentukan kondisi cahaya berdasarkan persentase
  let cond = '☁️ Mendung';
  if (pct > 75) cond = '☀️ Sangat Terang';
  else if (pct > 50) cond = '🌤️ Cerah';
  else if (pct > 25) cond = '🌥️ Redup';
  document.getElementById('ldrCondition').textContent = cond;
}

// Update LDR dari nilai digital Arduino ("Terang" / "Gelap")
function updateLDRDigital(strVal) {
  const isTerang = (strVal === 'Terang');
  sensorState.ldr.value = isTerang ? 4095 : 0;
  document.getElementById('ldrValue').textContent = isTerang ? 'Terang' : 'Gelap';
  document.getElementById('ldrBarFill').style.width = isTerang ? '100%' : '5%';
  setActive('ldrDot', true);
  document.getElementById('ldrCondition').textContent = isTerang ? '☀️ Terang (Digital HIGH)' : '🌑 Gelap (Digital LOW)';

  // Update auto indicator status
  updateAutoLdrStatus(strVal);

  // RL4 = indikator LDR: Gelap → ON, Terang → OFF (hanya di mode auto)
  if (currentRelayMode === 'auto') updateLdrRelayIndicator(!isTerang);
}

// Update tampilan LCD I2C (2 baris)
function updateI2C(line1, line2) {
  sensorState.i2c = { line1, line2 };
  const el1 = document.getElementById('lcdLine1');
  const el2 = document.getElementById('lcdLine2');
  if (el1) el1.textContent = line1 || '                ';
  if (el2) el2.textContent = line2 || '                ';
  setActive('i2cDot', true);
}


// ── [6b] TEMPERATURE & LDR RELAY INDICATORS ──
// RL1 = suhu 20-25°C (blink 3s)
// RL2 = suhu 26-30°C (blink 1s)
// RL3 = suhu >30°C (nyala terus, terkunci)
// RL4 = LDR (gelap=ON, terang=OFF, selalu terkunci)
let tempWarningDismissed = false;
let lastLockedTempRelay = 0;  // track relay suhu mana yg terakhir di-lock

function checkTemperatureWarning(temp) {
  // Update auto indicator status regardless of mode
  updateAutoTempStatus(temp);
  const banner = document.getElementById('tempWarningBanner');
  const detail = document.getElementById('tempWarningDetail');
  const card = document.getElementById('cardTemp');

  // Tentukan relay indikator suhu yang aktif
  let activeRelay = 0;
  let levelText = '';
  if (temp > 30.0) {
    activeRelay = 3;
    levelText = `Suhu ${temp.toFixed(1)}°C (>30°C) — RL3 terkunci ON (alert kritis)`;
  } else if (temp >= 26.0 && temp <= 30.0) {
    activeRelay = 2;
    levelText = `Suhu ${temp.toFixed(1)}°C (26-30°C) — RL2 berkedip 1 detik`;
  } else if (temp >= 20.0 && temp <= 25.0) {
    activeRelay = 1;
    levelText = `Suhu ${temp.toFixed(1)}°C (20-25°C) — RL1 berkedip 3 detik`;
  }

  // Lepas kunci relay suhu lama jika berubah
  if (lastLockedTempRelay !== activeRelay && lastLockedTempRelay >= 1 && lastLockedTempRelay <= 3) {
    const oldToggle = document.getElementById(`relay${lastLockedTempRelay}Toggle`);
    const oldCard = document.getElementById(`relayCard${lastLockedTempRelay}`);
    if (oldToggle) oldToggle.disabled = false;
    if (oldCard) oldCard.classList.remove('locked');
  }
  lastLockedTempRelay = activeRelay;

  if (activeRelay > 0) {
    // Update warning detail
    if (detail) detail.textContent = levelText;

    // Show banner only for >30°C (critical)
    if (temp > 30.0) {
      if (!tempWarningDismissed && banner) banner.classList.add('show');
      // Danger glow on temp card
      if (card) {
        card.style.borderColor = 'rgba(239,68,68,0.5)';
        card.style.boxShadow = '0 0 30px rgba(239,68,68,0.2), inset 0 0 30px rgba(239,68,68,0.05)';
      }
    } else {
      if (banner) banner.classList.remove('show');
      tempWarningDismissed = false;
      if (card) {
        card.style.borderColor = '';
        card.style.boxShadow = '';
      }
    }

    // Lock relay indikator suhu hanya di mode auto
    if (currentRelayMode === 'auto') {
      setRelayUI(activeRelay, true);
      const rlToggle = document.getElementById(`relay${activeRelay}Toggle`);
      const rlCard = document.getElementById(`relayCard${activeRelay}`);
      if (rlToggle) rlToggle.disabled = true;
      if (rlCard) rlCard.classList.add('locked');
    }

    addLog(`⚠️ Indikator suhu: ${levelText}`, temp > 30.0 ? 'error' : 'warn');
  } else {
    // Suhu < 20°C — tidak ada indikator suhu aktif
    if (banner) banner.classList.remove('show');
    tempWarningDismissed = false;
    if (card) {
      card.style.borderColor = '';
      card.style.boxShadow = '';
    }
  }
}

// Update RL4 sebagai indikator LDR (selalu terkunci)
function updateLdrRelayIndicator(isOn) {
  setRelayUI(4, isOn);
  const rl4Toggle = document.getElementById('relay4Toggle');
  const rl4Card = document.getElementById('relayCard4');
  if (rl4Toggle) rl4Toggle.disabled = true;  // RL4 selalu terkunci
  if (rl4Card) rl4Card.classList.add('locked');
}

function dismissTempWarning() {
  const banner = document.getElementById('tempWarningBanner');
  if (banner) banner.classList.remove('show');
  tempWarningDismissed = true;
  addLog('Peringatan suhu tinggi ditutup sementara', 'warn');
}


// ── [7] RELAY CONTROL ─────────────────────────
// Toggle relay dari UI dan kirim via MQTT
function toggleRelay(num, checkbox) {
  // Cegah kontrol manual jika sedang di mode automatisasi
  if (currentRelayMode === 'auto') {
    checkbox.checked = !checkbox.checked; // batalkan status checkbox
    addLog(`Ditolak: Relay ${num} dikontrol otomatis oleh sensor!`, 'error');
    return;
  }

  const isOn = checkbox.checked;
  const topic = getConfig().topics.relayCtrl + '/' + num;
  const payload = isOn ? 'ON' : 'OFF';

  if (isConnected && mqttClient) {
    mqttClient.publish(topic, payload, { qos: 1 }, err => {
      if (err) addLog(`Gagal mengirim perintah ke Relay ${num}: ${err.message}`, 'error');
      else { addLog(`📤 Mengirim perintah untuk mengubah Relay ${num} menjadi ${payload}`, 'publish'); setRelayUI(num, isOn); }
    });
  } else {
    addLog('Belum terhubung — perintah relay tidak dikirim', 'error');
    checkbox.checked = !isOn; // kembalikan posisi toggle jika gagal
  }
}

// Memperbarui tampilan kartu relay (ON/OFF, warna, state)
function setRelayUI(num, isOn) {
  const card = document.getElementById(`relayCard${num}`);
  const toggle = document.getElementById(`relay${num}Toggle`);
  const status = document.getElementById(`relay${num}Status`);
  
  if (card && toggle && status) {
    toggle.checked = isOn;
    sensorState.relays[num] = isOn;
    card.classList.toggle('active', isOn);
    status.textContent = isOn ? 'ON' : 'OFF';
    status.classList.toggle('on', isOn);
  }

  // Sinkronisasi juga ke manual UI agar saat dikontrol dari device lain (via MQTT), status di layar manual ikut berubah
  manualRelayState[num] = isOn;
  if (typeof updateManualRelayUI === 'function') {
    updateManualRelayUI(num, isOn);
  }
}


// ── [8] UI HELPERS ────────────────────────────
// Memperbarui tampilan badge koneksi (dot + teks + tombol)
function setConnectionUI(state) {
  const dot = document.getElementById('connDot');
  const text = document.getElementById('connText');
  const btnC = document.getElementById('btnConnect');
  const btnD = document.getElementById('btnDisconnect');

  dot.className = 'conn-dot';
  // Peta status koneksi: [kelas CSS, teks label, nonaktifkan-Connect, nonaktifkan-Disconnect]
  const map = {
    connected: ['connected', 'Terhubung', true, false],
    connecting: ['', 'Menghubungkan…', true, false],
    error: ['error', 'Gagal Terhubung', false, false],
  };
  const [cls, label, disableC, disableD] = map[state] || ['', 'Terputus', false, true];
  if (cls) dot.classList.add(cls);
  text.textContent = label;
  btnC.disabled = disableC;
  btnD.disabled = disableD;
}

// Toggle kelas 'active' pada dot indikator sensor
function setActive(dotId, active) {
  document.getElementById(dotId)?.classList.toggle('active', active);
}

// Menampilkan waktu update terakhir di header
function updateLastUpdate() {
  document.getElementById('lastUpdate').textContent =
    'Update: ' + new Date().toLocaleTimeString('id-ID');
}

// Membuka/menutup panel konfigurasi MQTT
function toggleConfig() {
  document.getElementById('configPanel').classList.toggle('open');
  document.getElementById('configOverlay').classList.toggle('open');
}

// Menambah baris log ke panel dengan tipe warna berbeda
function addLog(msg, type = 'data') {
  const panel = document.getElementById('logPanel');
  const entry = document.createElement('div');
  entry.className = `log-entry log-${type}`;
  entry.innerHTML = `<span class="log-time">${new Date().toLocaleTimeString('id-ID')}</span><span class="log-msg">${msg}</span>`;
  panel.appendChild(entry);
  panel.scrollTop = panel.scrollHeight;
  // Batasi maksimal 20 entri agar log mudah dibaca dan tidak memenuhi memori
  while (panel.children.length > 20) panel.removeChild(panel.firstChild);
}

// Menghapus semua entri log
function clearLog() {
  document.getElementById('logPanel').innerHTML = '';
  addLog('Log telah dihapus', 'warn');
}


// ── [9] DEMO MODE ─────────────────────────────


// ── [10a] RELAY MODE CONTROL ──────────────────
// 'manual' = kontrol manual, 'auto' = automatisasi berdasar sensor
let currentRelayMode = 'manual';

// State manual relay (terpisah dari auto-relay)
const manualRelayState = { 1: false, 2: false, 3: false, 4: false };

function setRelayMode(mode) {
  currentRelayMode = mode;
  const manualPanel = document.getElementById('manualPanel');
  const autoPanel = document.getElementById('autoPanel');
  const btnManual = document.getElementById('btnModeManual');
  const btnAuto = document.getElementById('btnModeAuto');
  const dot = document.querySelector('.mode-indicator-dot');
  const text = document.getElementById('modeIndicatorText');

  if (mode === 'manual') {
    if (manualPanel) manualPanel.style.display = '';
    if (autoPanel) autoPanel.style.display = 'none';
    if (btnManual) btnManual.classList.add('active');
    if (btnAuto) btnAuto.classList.remove('active');
    if (dot) dot.className = 'mode-indicator-dot manual-dot';
    if (text) text.textContent = 'Mode Manual — BTN1-4 untuk kontrol relay';
    // Enable semua tombol
    [1, 2, 3, 4].forEach(n => {
      const btn = document.getElementById(`manualBtn${n}`);
      if (btn) btn.disabled = false;
      const tgl = document.getElementById(`relay${n}Toggle`);
      if (tgl) tgl.disabled = false;
      const card = document.getElementById(`relayCard${n}`);
      if (card) card.classList.remove('locked');
    });
    addLog('🏛️ Mode berubah ke MANUAL', 'info');
  } else {
    if (manualPanel) manualPanel.style.display = 'none';
    if (autoPanel) autoPanel.style.display = '';
    if (btnManual) btnManual.classList.remove('active');
    if (btnAuto) btnAuto.classList.add('active');
    if (dot) dot.className = 'mode-indicator-dot auto-dot';
    if (text) text.textContent = 'Mode Automatisasi — Relay dikontrol otomatis oleh sensor suhu & LDR';
    // Disable semua tombol dan toggle agar terkunci dari user
    [1, 2, 3, 4].forEach(n => {
      const btn = document.getElementById(`manualBtn${n}`);
      if (btn) btn.disabled = true;
      const tgl = document.getElementById(`relay${n}Toggle`);
      if (tgl) tgl.disabled = true;
    });
    addLog('🤖 Mode berubah ke AUTOMATISASI', 'info');
  }

  // Kirim perintah mode ke Arduino via MQTT
  if (isConnected && mqttClient) {
    mqttClient.publish('smk/iot/relay/mode', mode, { qos: 1, retain: true });
    addLog(`📤 Meminta perangkat beralih ke mode ${mode.toUpperCase()}`, 'publish');
  }
}


// Toggle relay manual (1 dari 4 relay button)
function manualToggleRelay(num) {
  const newState = !manualRelayState[num];
  manualRelayState[num] = newState;

  const topic = getConfig().topics.relayCtrl + '/' + num;
  const payload = newState ? 'ON' : 'OFF';

  if (isConnected && mqttClient) {
    mqttClient.publish(topic, payload, { qos: 1 }, err => {
      if (err) {
        addLog(`Publish error relay ${num}: ${err.message}`, 'error');
        manualRelayState[num] = !newState; // rollback
        updateManualRelayUI(num, !newState);
      } else {
        addLog(`↑ [Manual] ${topic}: ${payload}`, 'publish');
        updateManualRelayUI(num, newState);
      }
    });
  } else {
    addLog('Belum terhubung — simulasi kontrol relay manual', 'warn');
    updateManualRelayUI(num, newState);
  }
}

// Toggle semua relay manual sekaligus (ON semua atau OFF semua)
function manualResetAllRelays() {
  // Jika ada satu saja yang ON, maka matikan semua. Jika semua OFF, nyalakan semua.
  const anyOn = [1, 2, 3, 4].some(num => manualRelayState[num]);
  const targetState = !anyOn;
  const payload = targetState ? 'ON' : 'OFF';

  [1, 2, 3, 4].forEach(num => {
    if (manualRelayState[num] !== targetState) {
      manualRelayState[num] = targetState;
      updateManualRelayUI(num, targetState);

      const topic = getConfig().topics.relayCtrl + '/' + num;
      if (isConnected && mqttClient) {
        mqttClient.publish(topic, payload, { qos: 1 }, err => {
          if (err) addLog(`Toggle relay ${num} error: ${err.message}`, 'error');
          else addLog(`↑ [Manual All] ${topic}: ${payload}`, 'publish');
        });
      }
    }
  });

  const btn = document.getElementById('manualResetAllBtn');
  if (btn) {
    btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18.36 6.64a9 9 0 1 1-12.73 0"></path><line x1="12" y1="2" x2="12" y2="12"></line></svg> Semua Relay (${targetState ? 'OFF' : 'ON'})`;
  }
  
  addLog(`🔄 Semua relay diubah ke ${payload}`, 'warn');
}

// Update tampilan tombol manual relay (ON/OFF state)
function updateManualRelayUI(num, isOn) {
  const card = document.getElementById(`manualRelayCard${num}`);
  const btn = document.getElementById(`manualBtn${num}`);
  const label = document.getElementById(`manualBtnLabel${num}`);
  const led = document.getElementById(`manualLed${num}`);
  if (!card) return;

  card.classList.toggle('relay-on', isOn);
  if (btn) {
    if (btn.tagName === 'INPUT' && btn.type === 'checkbox') {
      btn.checked = isOn;
    } else {
      btn.classList.toggle('btn-relay-on', isOn);
    }
  }
  if (label) {
    label.textContent = isOn ? 'ON' : 'OFF';
    label.classList.toggle('on', isOn);
  }
  if (led) led.classList.toggle('led-on', isOn);
}

// Update status di auto indicator card (suhu)
function updateAutoTempStatus(temp) {
  const el = document.getElementById('autoTempStatus');
  if (!el) return;
  let status = '< 20°C';
  let color = 'rgba(56,189,248,0.1)';
  let border = 'rgba(56,189,248,0.2)';
  let textC = 'var(--accent)';
  if (temp > 30) {
    status = `🔴 ${temp.toFixed(1)}°C → RL3 ON`;
    color = 'rgba(239,68,68,0.15)'; border = 'rgba(239,68,68,0.35)'; textC = '#f87171';
  } else if (temp >= 26) {
    status = `🟡 ${temp.toFixed(1)}°C → RL2 ON`;
    color = 'rgba(251,191,36,0.15)'; border = 'rgba(251,191,36,0.35)'; textC = 'var(--accent-yellow)';
  } else if (temp >= 20) {
    status = `🟢 ${temp.toFixed(1)}°C → RL1 ON`;
    color = 'rgba(52,211,153,0.12)'; border = 'rgba(52,211,153,0.3)'; textC = 'var(--accent-green)';
  }
  el.textContent = status;
  el.style.background = color;
  el.style.borderColor = border;
  el.style.color = textC;
}

// Update status di auto indicator card (LDR)
function updateAutoLdrStatus(strVal) {
  const el = document.getElementById('autoLdrStatus');
  if (!el) return;
  const isGelap = (strVal === 'Gelap');
  el.textContent = isGelap ? '🌑 Gelap → RL4 ON' : '☀️ Terang → RL4 OFF';
  el.style.background = isGelap ? 'rgba(129,140,248,0.15)' : 'rgba(251,191,36,0.12)';
  el.style.borderColor = isGelap ? 'rgba(129,140,248,0.35)' : 'rgba(251,191,36,0.3)';
  el.style.color = isGelap ? 'var(--accent2)' : 'var(--accent-yellow)';
}


// ── [10] INIT ─────────────────────────────────
// Dijalankan saat halaman selesai dimuat
document.addEventListener('DOMContentLoaded', () => {
  initCharts();
  drawGauge('gaugeTemp', 0, 0, 60, '#fb923c', '#7c3aed');
  drawGauge('gaugeHumid', 0, 0, 100, '#38bdf8', '#0ea5e9');
  addLog('Dashboard initialized. Tekan "Konfigurasi MQTT" untuk connect.', 'info');

  // Init mode default = manual
  setRelayMode('manual');

  // Auto-connect ke broker MQTT
  setTimeout(() => {
    connectMQTT();
  }, 800);

  // Buat partikel latar belakang animasi
  const bp = document.getElementById('bgParticles');
  for (let i = 0; i < 20; i++) {
    const p = document.createElement('div');
    p.style.cssText = `
      position:absolute;
      width:${2 + Math.random() * 3}px;
      height:${2 + Math.random() * 3}px;
      background:rgba(56,189,248,${0.1 + Math.random() * 0.2});
      border-radius:50%;
      left:${Math.random() * 100}%;
      top:${Math.random() * 100}%;
      animation: floatParticle ${6 + Math.random() * 8}s ease-in-out infinite;
      animation-delay: -${Math.random() * 10}s;
    `;
    bp.appendChild(p);
  }

  // Animasi CSS untuk partikel
  const style = document.createElement('style');
  style.textContent = `
    @keyframes floatParticle {
      0%, 100% { transform: translateY(0) translateX(0); opacity: 0.3; }
      33%       { transform: translateY(-30px) translateX(15px); opacity: 0.8; }
      66%       { transform: translateY(15px) translateX(-20px); opacity: 0.5; }
    }
  `;
  document.head.appendChild(style);
});
