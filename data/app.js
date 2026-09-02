/**
 * Climate Pro - OS : Frontend Controller & Device Manager
 * JavaScript natif pour ESP32 WebServer (LittleFS)
 */

// --- VARIABLES GLOBALES CLIMATISATION ---
let systemOn = false;
let targetEnabled = false;
let targetTemp = 21.0;
let currentRoomTemp = 23.4; 
let startTemp = null; 
let estimatedTimeToTarget = "45min";
let estimatedTimeToReady = "1h30";
let isWaterReady = true;
let waterCoolingEnabled = true;
let hyst = 0.5;
let watchdogInterval, watchdogCount = 30;
let chartsInitialized = false;

// --- VARIABLES DU GESTIONNAIRE DE MATÉRIEL ---
let devicesList = [];
let editingDeviceId = null;

// --- GESTION DE LA NAVIGATION & SESSION ---
function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  sidebar.classList.toggle('collapsed');
}

function checkLogin() {
  const u = document.getElementById('username').value;
  const p = document.getElementById('password').value;
  if(u === 'admin' && p === 'admin') {
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('app-screen').style.display = 'flex';
    
    if(window.innerWidth >= 768) {
      document.getElementById('sidebar').classList.remove('collapsed');
    }

    initCharts(); 
    startTelemetry();
    loadDeviceManager(); // Initialiser la liste du matériel
  } else { 
    document.getElementById('login-error').style.display = 'block'; 
  }
}

function logout() { 
  location.reload(); 
}

function switchTab(tabId, btn) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  
  const targetView = document.getElementById('view-' + tabId);
  if (targetView) targetView.classList.add('active');
  if (btn) btn.classList.add('active');
  
  if(window.innerWidth < 768) {
    document.getElementById('sidebar').classList.add('collapsed');
  }

  // Si l'utilisateur clique sur l'onglet Matériel, on rafraîchit la liste
  if (tabId === 'devices') {
    loadDeviceManager();
  }
}

// --- SYSTÈME DE NOTIFICATIONS (TOASTS) ---
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerText = message;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// =========================================================================
// GESTIONNAIRE DE MATÉRIEL (DEVICE MANAGER) - APPELS REST API
// =========================================================================

/**
 * Charge les équipements depuis l'ESP32 (/api/devices)
 */
async function loadDeviceManager() {
  try {
    const res = await fetch('/api/devices');
    if (!res.ok) throw new Error('Erreur réseau');
    const data = await res.json();
    devicesList = data.devices || [];
  } catch (err) {
    console.warn("API indisponible (mode hors-ligne ou dev local) : utilisation des données de secours.");
    if (devicesList.length === 0) {
      // Données mock pour test sans ESP32
      devicesList = [
        {"id": 1, "name": "Pompe boucle froide", "type": "RELAY", "gpio": 4, "state": 0, "value": 0, "isCore": true},
        {"id": 2, "name": "Lanterneau Fiamma", "type": "PWM", "gpio": 19, "state": 0, "value": 128, "isCore": false},
        {"id": 3, "name": "Spot Salon", "type": "RELAY", "gpio": 23, "state": 0, "value": 0, "isCore": false}
      ];
    }
  }

  renderDeviceTable(devicesList);
  renderDashboardAuxDevices(devicesList);
}

/**
 * Génère le tableau HTML de la vue Matériel
 */
function renderDeviceTable(devices) {
  const tbody = document.getElementById('device-table-body');
  if (!tbody) return;

  if (devices.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:var(--text-muted); padding:30px;">Aucun équipement configuré. Cliquez sur "+ Ajouter un équipement".</td></tr>`;
    return;
  }

  tbody.innerHTML = devices.map(dev => {
    const isRelay = dev.type === 'RELAY';
    const typeBadge = isRelay 
      ? `<span class="badge badge-relay">⚡ Relais ON/OFF</span>`
      : `<span class="badge badge-pwm">〰️ Variateur PWM</span>`;

    const coreBadge = dev.isCore 
      ? `<span class="badge badge-core">🔒 Système (Core)</span>`
      : `<span class="badge badge-custom">⚙️ Personnalisé</span>`;

    const stateDisplay = isRelay
      ? (dev.state ? '<span style="color:var(--cyan-light); font-weight:bold;">ON</span>' : '<span style="color:var(--text-muted);">OFF</span>')
      : `<span style="color:var(--purple-pwm); font-weight:bold;">${Math.round((dev.value / 255) * 100)}%</span>`;

    const deleteBtn = dev.isCore
      ? `<button class="action-btn disabled" title="Équipement système protégé contre la suppression"><svg viewBox="0 0 24 24"><path d="M12,17A2,2 0 0,0 14,15C14,13.89 13.1,13 12,13A2,2 0 0,0 10,15A2,2 0 0,0 12,17M18,8A2,2 0 0,1 20,10V20A2,2 0 0,1 18,22H6A2,2 0 0,1 4,20V10C4,8.89 4.89,8 6,8H7V6A5,5 0 0,1 12,1A5,5 0 0,1 17,6V8H18M12,3A3,3 0 0,0 9,6V8H15V6A3,3 0 0,0 12,3Z"/></svg> Core</button>`
      : `<button class="action-btn delete-btn" onclick="deleteDevice(${dev.id}, '${escapeHtml(dev.name)}')"><svg viewBox="0 0 24 24"><path d="M19,4H15.5L14.5,3H9.5L8.5,4H5V6H19M6,19A2,2 0 0,0 8,21H16A2,2 0 0,0 18,19V7H6V19Z"/></svg> Supprimer</button>`;

    return `
      <tr>
        <td style="font-weight:700; color:var(--text-main);">${escapeHtml(dev.name)}</td>
        <td>${typeBadge}</td>
        <td><span class="badge-gpio">GPIO ${dev.gpio}</span></td>
        <td>${coreBadge}</td>
        <td>${stateDisplay}</td>
        <td>
          <div class="actions-cell">
            <button class="action-btn test-btn" id="btn-test-${dev.id}" onclick="testDevice(${dev.id}, this)">
              <svg viewBox="0 0 24 24"><path d="M7,2V4H8V18A4,4 0 0,0 12,22A4,4 0 0,0 16,18V4H17V2H7M11,16C10.45,16 10,15.55 10,15C10,14.45 10.45,14 11,14C11.55,14 12,14.45 12,15C12,15.55 11.55,16 11,16M13,12C12.45,12 12,11.55 12,11C12,10.45 12.45,10 13,10C13.55,10 14,10.45 14,11C14,11.55 13.55,12 13,12Z"/></svg>
              Tester
            </button>
            <button class="action-btn" onclick="openEditDeviceModal(${dev.id})">
              <svg viewBox="0 0 24 24"><path d="M20.71,7.04C21.1,6.65 21.1,6 20.71,5.63L18.37,3.29C18,2.9 17.35,2.9 16.96,3.29L15.12,5.12L18.87,8.87M3,17.25V21H6.75L17.81,9.93L14.06,6.18L3,17.25Z"/></svg>
              Modifier
            </button>
            ${deleteBtn}
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

/**
 * Affiche dynamiquement les périphériques sur la page d'accueil (Dashboard)
 */
function renderDashboardAuxDevices(devices) {
  const container = document.getElementById('aux-devices-container');
  if (!container) return;

  if (devices.length === 0) {
    container.innerHTML = `<div style="color:var(--text-muted); font-size:13px;">Aucun actionneur supplémentaire configuré.</div>`;
    return;
  }

  container.innerHTML = devices.map(dev => {
    const isRelay = dev.type === 'RELAY';
    
    if (isRelay) {
      return `
        <div class="aux-card">
          <div class="aux-header">
            <span class="aux-name">${escapeHtml(dev.name)}</span>
            <span class="badge-gpio">GPIO ${dev.gpio}</span>
          </div>
          <div class="aux-controls" style="justify-content: space-between;">
            <span style="font-size:12px; color:var(--text-muted);">Relais</span>
            <label class="toggle-switch">
              <input type="checkbox" id="aux-toggle-${dev.id}" ${dev.state ? 'checked' : ''} onchange="toggleAuxDevice(${dev.id}, this.checked)">
              <span class="slider"></span>
            </label>
          </div>
        </div>
      `;
    } else {
      const pct = Math.round((dev.value / 255) * 100);
      return `
        <div class="aux-card">
          <div class="aux-header">
            <span class="aux-name">${escapeHtml(dev.name)}</span>
            <span class="badge-gpio">GPIO ${dev.gpio}</span>
          </div>
          <div class="aux-controls" style="flex-direction:column; align-items:stretch;">
            <div style="display:flex; justify-content:space-between; font-size:12px; color:var(--text-muted);">
              <span>Variateur PWM</span>
              <span class="aux-slider-val" id="aux-val-${dev.id}">${pct}%</span>
            </div>
            <div class="aux-slider-wrap">
              <input type="range" min="0" max="100" value="${pct}" oninput="updateAuxPwm(${dev.id}, this.value)">
            </div>
          </div>
        </div>
      `;
    }
  }).join('');
}

/**
 * Commande directe d'un relais depuis le Dashboard
 */
async function toggleAuxDevice(id, isChecked) {
  const dev = devicesList.find(d => d.id === id);
  if (dev) dev.state = isChecked ? 1 : 0;

  try {
    await fetch('/api/devices/set-state', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: id, state: isChecked ? 1 : 0, value: dev ? dev.value : 0 })
    });
    showToast(`${dev ? dev.name : 'Équipement'} : ${isChecked ? 'Activé' : 'Désactivé'}`, 'success');
  } catch (err) {
    console.warn("Échec requête set-state (mode simulation).");
  }
}

/**
 * Commande d'un PWM depuis le Dashboard
 */
let pwmDebounceTimers = {};
function updateAuxPwm(id, percent) {
  const valLabel = document.getElementById(`aux-val-${id}`);
  if (valLabel) valLabel.innerText = percent + '%';

  const dev = devicesList.find(d => d.id === id);
  const rawPwm = Math.round((percent / 100) * 255);
  if (dev) dev.value = rawPwm;

  clearTimeout(pwmDebounceTimers[id]);
  pwmDebounceTimers[id] = setTimeout(async () => {
    try {
      await fetch('/api/devices/set-state', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: id, state: rawPwm > 0 ? 1 : 0, value: rawPwm })
      });
    } catch (err) {
      console.warn("Échec requête set-state PWM.");
    }
  }, 100);
}

/**
 * Ouvre le modal pour ajouter un équipement
 */
async function openAddDeviceModal() {
  editingDeviceId = null;
  document.getElementById('modal-title').innerText = "Ajouter un équipement";
  document.getElementById('device-name').value = "";
  document.getElementById('device-type').value = "RELAY";
  document.getElementById('device-type').disabled = false;
  
  await populatePinSelect();
  document.getElementById('device-modal').classList.add('active');
}

/**
 * Ouvre le modal pour modifier un équipement existant
 */
async function openEditDeviceModal(id) {
  const dev = devicesList.find(d => d.id === id);
  if (!dev) return;

  editingDeviceId = id;
  document.getElementById('modal-title').innerText = `Modifier : ${dev.name}`;
  document.getElementById('device-name').value = dev.name;
  document.getElementById('device-type').value = dev.type;
  document.getElementById('device-type').disabled = true; // Le type physique ne doit pas changer

  await populatePinSelect(dev.gpio);
  document.getElementById('device-modal').classList.add('active');
}

function closeDeviceModal() {
  document.getElementById('device-modal').classList.remove('active');
}

/**
 * Récupère les GPIO disponibles et remplit le sélecteur
 */
async function populatePinSelect(currentPin = null) {
  const select = document.getElementById('device-gpio');
  select.innerHTML = '<option value="">Chargement des broches...</option>';

  let availablePins = [];
  try {
    const res = await fetch('/api/available-pins');
    if (res.ok) {
      const data = await res.json();
      availablePins = data.pins || [];
    }
  } catch (e) {
    // Mode hors-ligne / fallback
    const usedPins = devicesList.map(d => d.gpio);
    const safeList = [4, 5, 13, 14, 16, 17, 18, 19, 21, 22, 23, 25, 26, 27, 32, 33];
    availablePins = safeList.filter(p => !usedPins.includes(p) || p === currentPin);
  }

  // Si on est en mode édition, inclure la broche actuelle dans la liste
  if (currentPin !== null && !availablePins.includes(currentPin)) {
    availablePins.unshift(currentPin);
  }

  if (availablePins.length === 0) {
    select.innerHTML = '<option value="">Aucune broche GPIO disponible !</option>';
    return;
  }

  select.innerHTML = availablePins.map(pin => {
    const isCurrent = (pin === currentPin);
    return `<option value="${pin}" ${isCurrent ? 'selected' : ''}>GPIO ${pin} ${isCurrent ? '(Actuel)' : '(Disponible)'}</option>`;
  }).join('');
}

/**
 * Enregistrement du formulaire (Création ou Modification)
 */
async function handleDeviceFormSubmit(e) {
  e.preventDefault();
  const name = document.getElementById('device-name').value.trim();
  const type = document.getElementById('device-type').value;
  const gpio = parseInt(document.getElementById('device-gpio').value, 10);

  if (!name) {
    showToast("Le nom de l'équipement est requis.", "error");
    return;
  }
  if (isNaN(gpio)) {
    showToast("Veuillez sélectionner une broche GPIO valide.", "error");
    return;
  }

  const isEditing = (editingDeviceId !== null);
  const endpoint = isEditing ? '/api/devices/update' : '/api/devices/add';
  const payload = isEditing 
    ? { id: editingDeviceId, name: name, gpio: gpio }
    : { name: name, type: type, gpio: gpio, isCore: false };

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const result = await res.json();
    if (!res.ok || !result.success) {
      throw new Error(result.error || "Échec de l'enregistrement");
    }

    showToast(isEditing ? "Périphérique modifié avec succès !" : "Périphérique ajouté avec succès !", "success");
    closeDeviceModal();
    await loadDeviceManager();
  } catch (err) {
    // Mode simulation locale
    if (isEditing) {
      const d = devicesList.find(x => x.id === editingDeviceId);
      if (d) { d.name = name; d.gpio = gpio; }
      showToast("Périphérique mis à jour (simulation).", "success");
    } else {
      const newId = (devicesList.length > 0 ? Math.max(...devicesList.map(d => d.id)) + 1 : 1);
      devicesList.push({ id: newId, name, type, gpio, state: 0, value: 0, isCore: false });
      showToast("Périphérique ajouté (simulation).", "success");
    }
    closeDeviceModal();
    renderDeviceTable(devicesList);
    renderDashboardAuxDevices(devicesList);
  }
}

/**
 * Supprime un équipement
 */
async function deleteDevice(id, name) {
  if (!confirm(`Êtes-vous sûr de vouloir supprimer définitivement l'équipement "${name}" ?\nSa broche GPIO sera libérée.`)) {
    return;
  }

  try {
    const res = await fetch('/api/devices/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: id })
    });

    const result = await res.json();
    if (!res.ok || !result.success) {
      throw new Error(result.error || "Impossible de supprimer");
    }

    showToast(`"${name}" a été supprimé et son GPIO libéré.`, "success");
    await loadDeviceManager();
  } catch (err) {
    // Mode simulation
    devicesList = devicesList.filter(d => d.id !== id);
    showToast(`"${name}" a été supprimé (simulation).`, "success");
    renderDeviceTable(devicesList);
    renderDashboardAuxDevices(devicesList);
  }
}

/**
 * Lance un test matériel temporaire pour vérifier le câblage
 */
async function testDevice(id, btnElement) {
  btnElement.classList.add('testing');
  btnElement.disabled = true;

  try {
    await fetch('/api/devices/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: id, duration: 1200 })
    });
    showToast("Signal de test envoyé à l'équipement (1.2s).", "success");
  } catch (err) {
    showToast("Signal de test simulé (1.2s).", "info");
  } finally {
    setTimeout(() => {
      btnElement.classList.remove('testing');
      btnElement.disabled = false;
    }, 1300);
  }
}

function escapeHtml(text) {
  if (!text) return '';
  return text.replace(/[&<>"']/g, function(m) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m];
  });
}

// =========================================================================
// LOGIQUE CLIMATISATION EXISTANTE (REPRISE INTÉGRALE)
// =========================================================================

function updateRing() {
  const dial = document.getElementById('main-dial');
  const timeEstDisplay = document.getElementById('dial-time-est');
  if (!dial || !timeEstDisplay) return;
  
  if (!systemOn) {
    dial.style.background = 'conic-gradient(from -90deg, #334155 0%, #334155 100%)';
    timeEstDisplay.classList.add('off');
    timeEstDisplay.innerText = waterCoolingEnabled ? ("Estimated time until device is ready: " + estimatedTimeToReady) : "Water Cooling (Chiller) Standby";
    return;
  }

  if (!waterCoolingEnabled) {
    dial.style.background = 'conic-gradient(from -90deg, #fb923c 0%, #fb923c 100%)';
    timeEstDisplay.classList.remove('off');
    timeEstDisplay.innerText = "Water Cooling OFF (Fan Only / Standby)";
    return;
  }

  if (!isWaterReady) {
    dial.style.background = 'conic-gradient(from -90deg, #334155 0%, #334155 100%)';
    timeEstDisplay.classList.remove('off');
    timeEstDisplay.innerText = "Estimated time until device is ready: " + estimatedTimeToReady;
    return;
  }

  timeEstDisplay.classList.remove('off');
  if (targetEnabled) {
    timeEstDisplay.innerText = "Estimated time to " + targetTemp.toFixed(1) + "°: " + estimatedTimeToTarget;
  } else {
    timeEstDisplay.innerText = "Continuous Cooling Active";
  }

  let progress = 0;
  if (targetEnabled && startTemp !== null && startTemp > targetTemp) { 
    progress = ((startTemp - currentRoomTemp) / (startTemp - targetTemp)) * 100;
  } else if (systemOn) {
    progress = 100;
  }

  if (progress < 5) progress = 5; 
  if (progress > 100) progress = 100;
  if (isNaN(progress)) progress = 0;

  dial.style.background = `conic-gradient(from -90deg, #2dd4bf 0%, #0ea5e9 ${progress}%, #334155 ${progress}%, #334155 100%)`;
}

function togglePower() {
  systemOn = !systemOn;
  const dot = document.getElementById('status-dot');
  const powerStatus = document.getElementById('power-status-text');
  
  if(systemOn) {
    startTemp = currentRoomTemp; 
    dot.classList.remove('off'); dot.classList.add('on');
    powerStatus.classList.remove('off'); powerStatus.classList.add('on');
    powerStatus.innerText = 'ON';
  } else {
    startTemp = null;
    dot.classList.remove('on'); dot.classList.add('off');
    powerStatus.classList.remove('on'); powerStatus.classList.add('off');
    powerStatus.innerText = 'OFF';
  }
  
  updateRing(); 
  fetch('/action?power=' + (systemOn ? '1' : '0')).catch(() => {});
}

function toggleTarget() {
  targetEnabled = document.getElementById('target-toggle').checked;
  const controls = document.getElementById('target-controls');
  const sub = document.getElementById('target-sub');
  
  if(targetEnabled) {
    controls.classList.remove('disabled');
    sub.innerText = 'Thermostat active';
    sub.style.color = 'var(--cyan-light)';
  } else {
    controls.classList.add('disabled');
    sub.innerText = 'Thermostat disabled';
    sub.style.color = 'var(--text-muted)';
  }

  if(window.myTempChart) {
    window.myTempChart.data.datasets[2].hidden = !targetEnabled;
    window.myTempChart.update();
  }

  updateRing();
  fetch('/action?target_enabled=' + (targetEnabled ? '1' : '0')).catch(() => {});
}

function changeTemp(change) {
  if(!targetEnabled) return;
  targetTemp += change;
  if (targetTemp < 16.0) targetTemp = 16.0;
  if (targetTemp > 30.0) targetTemp = 30.0;
  
  document.getElementById('target_temp').innerText = targetTemp.toFixed(1) + '°';
  
  if(window.myTempChart) {
     window.myTempChart.data.datasets[2].data = Array(6).fill(targetTemp);
     window.myTempChart.update();
  }

  updateRing(); 
  fetch('/action?temp=' + targetTemp.toFixed(1)).catch(() => {});
}

function setMode(mode, btnElement) {
  document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
  btnElement.classList.add('active');
  
  const sliderBox = document.getElementById('manual-slider-container');
  const slider = document.getElementById('fan-slider');
  const fanVal = document.getElementById('fan-val');
  
  sliderBox.classList.remove('active');
  sliderBox.classList.add('locked');
  slider.disabled = true;
  fanVal.style.color = 'var(--text-muted)';
  
  let speed = 60;
  if(mode === 'eco+') speed = 15;
  if(mode === 'eco') speed = 30;
  if(mode === 'normal') speed = 60;
  if(mode === 'boost') speed = 85;
  if(mode === 'boost+') speed = 100;
  
  slider.value = speed;
  fanVal.innerText = speed + '%';
  
  fetch('/action?fan=' + speed).catch(() => {});
}

function setManualMode() {
  document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('btn-manual').classList.add('active');
  
  const sliderBox = document.getElementById('manual-slider-container');
  const slider = document.getElementById('fan-slider');
  const fanVal = document.getElementById('fan-val');
  
  sliderBox.classList.remove('locked');
  sliderBox.classList.add('active');
  slider.disabled = false;
  fanVal.style.color = 'var(--orange-alert)';
}

function returnToAuto() {
  let defaultBtn = document.getElementById('btn-default-mode');
  setMode('normal', defaultBtn);
}

function updateFanSpeed() {
  const val = document.getElementById('fan-slider').value;
  document.getElementById('fan-val').innerText = val + '%';
  fetch('/action?fan=' + val).catch(() => {});
}

function toggleTimerSwitch() {
  const isChecked = document.getElementById('timer-toggle').checked;
  const controlsArea = document.getElementById('timer-controls-area');
  
  if(!isChecked) {
    controlsArea.classList.add('disabled');
    document.getElementById('timer-display').innerText = '00h 00m';
    document.getElementById('timer-inputs').classList.remove('active');
    document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
  } else {
    controlsArea.classList.remove('disabled');
    setPreset('30m', document.querySelector('.preset-btn'));
  }
}

function setPreset(time, btn) {
  document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  
  const inputs = document.getElementById('timer-inputs');
  const display = document.getElementById('timer-display');
  
  if(time === 'perso') {
    inputs.classList.add('active');
  } else {
    inputs.classList.remove('active');
    if(time === '30m') display.innerText = '00h 30m';
    if(time === '1h') display.innerText = '01h 00m';
    if(time === '2h') display.innerText = '02h 00m';
  }
}

function applyCustomTimer() {
  const h = String(document.getElementById('t-hours').value).padStart(2, '0');
  const m = String(document.getElementById('t-mins').value).padStart(2, '0');
  document.getElementById('timer-display').innerText = h + 'h ' + m + 'm';
}

function changeHyst(val) { 
  hyst += val; if(hyst < 0.1) hyst = 0.1; 
  document.getElementById('target_hyst').innerText = '±' + hyst.toFixed(1) + '°'; 
}

function toggleChiller() {
  waterCoolingEnabled = document.getElementById('chiller-toggle').checked;
  const sub = document.getElementById('chiller-sub');
  if (waterCoolingEnabled) {
    sub.innerText = 'Auto-chills water to minimum temp.';
    sub.style.color = 'var(--text-muted)';
  } else {
    sub.innerText = 'Water cooling OFF (Van parked / Battery save mode).';
    sub.style.color = 'var(--orange-alert)';
  }
  updateRing();
  fetch('/action?chiller=' + (waterCoolingEnabled ? '1' : '0')).catch(() => {});
}

function triggerWatchdogTest() {
  document.getElementById('watchdog-banner').style.display = 'block';
  document.getElementById('watchdog-timer').innerText = watchdogCount;
  switchTab('clim', document.querySelector('.nav-btn'));
  clearInterval(watchdogInterval);
  watchdogCount = 30; 
  watchdogInterval = setInterval(() => {
    watchdogCount--;
    document.getElementById('watchdog-timer').innerText = watchdogCount;
    if(watchdogCount <= 0) {
      clearInterval(watchdogInterval);
      document.getElementById('watchdog-banner').innerHTML = 'SAFETY CUTOFF TRIGGERED.';
      if(systemOn) {
        togglePower();
      }
    }
  }, 1000);
}

function initCharts() {
  if(chartsInitialized) return;
  
  const chartCanvas = document.getElementById('tempChart');
  if (chartCanvas) {
    const ctxLine = chartCanvas.getContext('2d');
    window.myTempChart = new Chart(ctxLine, {
      type: 'line',
      data: {
        labels: ['0m', '5m', '10m', '15m', '20m', '25m'],
        datasets: [
          { label: 'Room Air (°C)', borderColor: '#2dd4bf', backgroundColor: 'transparent', data: [26, 25.5, 24.8, 24.2, 23.5, 22.9] }, 
          { label: 'Water Circuit (°C)', borderColor: '#0ea5e9', backgroundColor: 'transparent', data: [15, 12, 9, 8.5, 7.2, 6.8] },
          { label: 'Setpoint (°C)', borderColor: '#fb923c', backgroundColor: 'transparent', borderDash: [5, 5], data: [21, 21, 21, 21, 21, 21], hidden: true }
        ]
      },
      options: { 
        responsive: true, maintainAspectRatio: false, 
        plugins: { legend: { labels: { color: '#8b98a5', usePointStyle: true, boxWidth: 8 } } }, 
        scales: { x: { ticks: { color: '#2a3441' }, grid:{color:'#151e32'} }, y: { ticks: { color: '#2a3441' }, grid:{color:'#151e32'} } },
        elements: { line: { tension: 0.3 } }
      }
    });
  }

  const doughnutCanvas = document.getElementById('modeChart');
  if (doughnutCanvas) {
    const ctxDoughnut = doughnutCanvas.getContext('2d');
    new Chart(ctxDoughnut, {
      type: 'doughnut',
      data: {
        labels: ['Normal', 'Eco', 'Boost'],
        datasets: [{
          data: [60, 30, 10],
          backgroundColor: ['#0ea5e9', '#34d399', '#fb923c'],
          borderWidth: 0,
          hoverOffset: 4
        }]
      },
      options: { 
        responsive: true, 
        maintainAspectRatio: false, 
        cutout: '75%', 
        plugins: { legend: { display: false }, tooltip: { enabled: true } }
      }
    });
  }

  chartsInitialized = true;
}

function startTelemetry() {
  setInterval(function() {
    fetch('/data')
      .then(response => response.json())
      .then(data => {
        currentRoomTemp = parseFloat(data.t_amb);
        if(data.est_time) estimatedTimeToTarget = data.est_time + " min";
        if(data.est_water) estimatedTimeToReady = data.est_water;
        if(typeof data.water_ready !== 'undefined') isWaterReady = data.water_ready;
        if(data.compressor_status) {
          const compState = document.getElementById('compressor-state');
          if (compState) compState.innerText = data.compressor_status;
        }
        if(typeof data.chiller_enabled !== 'undefined') {
          waterCoolingEnabled = (data.chiller_enabled === 1 || data.chiller_enabled === true);
          const cToggle = document.getElementById('chiller-toggle');
          if (cToggle) cToggle.checked = waterCoolingEnabled;
          const sub = document.getElementById('chiller-sub');
          if (sub) {
            sub.innerText = waterCoolingEnabled ? 'Auto-chills water to minimum temp.' : 'Water cooling OFF (Van parked / Battery save mode).';
            sub.style.color = waterCoolingEnabled ? 'var(--text-muted)' : 'var(--orange-alert)';
          }
        }
        
        document.getElementById('v_t_amb').innerText = currentRoomTemp.toFixed(1) + '°';
        if(data.t_water) document.getElementById('t_water').innerText = data.t_water + '°';
        
        if(data.energy) {
           document.getElementById('v_energy').innerText = (data.energy / 1000).toFixed(2) + ' kWh';
        }
        
        updateRing();
      })
      .catch(err => {
        if (systemOn && targetEnabled && currentRoomTemp > targetTemp) {
            currentRoomTemp -= 0.1;
            document.getElementById('v_t_amb').innerText = currentRoomTemp.toFixed(1) + '°';
            updateRing(); 
        }
      });
  }, 2000);
}

