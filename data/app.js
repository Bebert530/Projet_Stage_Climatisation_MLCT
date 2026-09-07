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
let automationRules = [];

// --- GESTION DE LA NAVIGATION & SESSION ---
function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  if (sidebar) sidebar.classList.toggle('collapsed');
}

function checkLogin() {
  const userEl = document.getElementById('username');
  const passEl = document.getElementById('password');
  const u = userEl ? userEl.value.trim() : '';
  const p = passEl ? passEl.value.trim() : '';
  if (u === 'admin' && p === 'admin') {
    const loginScreen = document.getElementById('login-screen');
    const appScreen = document.getElementById('app-screen');
    if (loginScreen) loginScreen.style.display = 'none';
    if (appScreen) appScreen.style.display = 'flex';
    
    if (window.innerWidth >= 768) {
      const sidebar = document.getElementById('sidebar');
      if (sidebar) sidebar.classList.remove('collapsed');
    }

    try { initCharts(); } catch (e) { console.warn("Erreur charts:", e); }
    try { startTelemetry(); } catch (e) { console.warn("Erreur télémétrie:", e); }
    try { loadDeviceManager(); } catch (e) { console.warn("Erreur loadDeviceManager:", e); }
    try { loadAutomations(); } catch (e) { console.warn("Erreur loadAutomations:", e); }
  } else { 
    const errEl = document.getElementById('login-error');
    if (errEl) errEl.style.display = 'block'; 
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
    const sidebar = document.getElementById('sidebar');
    if (sidebar) sidebar.classList.add('collapsed');
  }

  // Si l'utilisateur clique sur l'onglet Matériel ou Automatisation
  if (tabId === 'devices') {
    loadDeviceManager();
  } else if (tabId === 'automation') {
    loadAutomations();
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
// GESTIONNAIRE DE MATÉRIEL & DIDACTICIEL GUIDÉ (WIRING WIZARD)
// =========================================================================

// État temporaire du didacticiel en cours
let wizardState = {
  id: 0,
  name: '',
  category: 'ACTUATOR',
  voltage: '12V',
  mode: 'OUTPUT_RELAY',
  gpio: null,
  isCore: false
};

// Dictionnaire complet des didacticiels pas-à-pas selon [Catégorie + Mode]
const WIRING_TUTORIALS = {
  "ACTUATOR_OUTPUT_RELAY": {
    title: "Actionneur Tout-ou-Rien via Carte Relais",
    subtitle: (volt) => `Commande marche/arrêt pour équipement ${volt} (pompe, vanne, éclairage)`,
    warning: (volt) => (volt === '12V')
      ? `<strong>DANGER 12V :</strong> Ne reliez <u>JAMAIS</u> le +12V directement à l'ESP32 ! L'ESP32 fonctionne exclusivement en 3.3V. Le module relais assure l'isolation galvanique et protège votre microcontrôleur.`
      : `<strong>ISOLATION DU RELAIS (${volt}) :</strong> Le module relais isole l'ESP32 du circuit de puissance ${volt}. Veillez à relier la masse (GND) du relais à celle de l'ESP32.`,
    steps: (gpio, volt) => {
      const source = (volt === '12V') ? 'le +12V de votre batterie auxiliaire' : (volt === '5V' ? 'le +5V (borne VIN ou alim 5V)' : 'le +3.3V de la carte');
      return [
        {
          title: "1. Raccordement de la masse (GND)",
          desc: "Reliez la broche <strong>GND</strong> (Masse) du module relais à l'une des broches <strong>GND</strong> de l'ESP32."
        },
        {
          title: `2. Câblage du circuit de puissance (${volt})`,
          desc: `Raccordez <strong>${source}</strong> sur la borne <strong>COM</strong> (Commun) du relais, et le fil positif de l'équipement (${volt}) sur la borne <strong>NO</strong> (Normalement Ouvert). Le fil négatif retourne à la masse (0V / GND).`
        },
        {
          title: "3. Raccordement de la commande logique",
          desc: `Reliez la broche de commande <strong>IN / Signal</strong> du relais directement sur la broche <span class="step-tag">GPIO {{GPIO}}</span> de l'ESP32.`
        }
      ];
    },
    schematic: (gpio, volt) => `
      <svg viewBox="0 0 540 160" width="100%" height="150" style="max-width:540px; font-family:monospace;">
        <rect x="20" y="25" width="120" height="110" rx="8" fill="#151e32" stroke="#2dd4bf" stroke-width="2"/>
        <text x="80" y="50" fill="#2dd4bf" font-size="12" font-weight="bold" text-anchor="middle">ESP32</text>
        <circle cx="130" cy="80" r="5" fill="#2dd4bf"/>
        <text x="120" y="84" fill="#f8fafc" font-size="10" text-anchor="end">GPIO ${gpio}</text>
        <circle cx="130" cy="110" r="5" fill="#0ea5e9"/>
        <text x="120" y="114" fill="#8b98a5" font-size="10" text-anchor="end">GND</text>

        <path d="M135 80 L230 80" stroke="#2dd4bf" stroke-width="2.5" stroke-dasharray="4" fill="none"/>
        <text x="180" y="72" fill="#2dd4bf" font-size="9" text-anchor="middle">SIGNAL</text>

        <path d="M135 110 L230 110" stroke="#0ea5e9" stroke-width="2" fill="none"/>
        <text x="180" y="125" fill="#0ea5e9" font-size="9" text-anchor="middle">GND</text>

        <rect x="230" y="25" width="140" height="110" rx="8" fill="#1c273e" stroke="#0ea5e9" stroke-width="2"/>
        <text x="300" y="48" fill="#0ea5e9" font-size="11" font-weight="bold" text-anchor="middle">MODULE RELAIS</text>
        <text x="240" y="84" fill="#2dd4bf" font-size="10">IN</text>
        <text x="240" y="114" fill="#0ea5e9" font-size="10">GND</text>
        <text x="360" y="84" fill="#fb923c" font-size="10" text-anchor="end">COM</text>
        <text x="360" y="114" fill="#fb923c" font-size="10" text-anchor="end">NO</text>

        <path d="M370 80 L420 80 L420 40 L450 40" stroke="#fb923c" stroke-width="2.5" fill="none"/>
        <text x="435" y="32" fill="#fb923c" font-size="9" text-anchor="middle">+${volt}</text>

        <path d="M370 110 L450 110" stroke="#fb923c" stroke-width="2.5" fill="none"/>

        <rect x="450" y="25" width="80" height="110" rx="8" fill="#151e32" stroke="#fb923c" stroke-width="2"/>
        <text x="490" y="75" fill="#f8fafc" font-size="11" font-weight="bold" text-anchor="middle">APPAREIL</text>
        <text x="490" y="95" fill="#fb923c" font-size="10" text-anchor="middle">(${volt})</text>
      </svg>
    `
  },

  "ACTUATOR_OUTPUT_PWM": {
    title: "Actionneur Progressif (Variateur PWM / MOSFET)",
    subtitle: (volt) => `Idéal pour variateur ${volt} (ventilateur, lanterneau Fiamma, ruban LED)`,
    warning: (volt) => `<strong>ATTENTION MOSFET (${volt}) :</strong> Utilisez un module MOSFET compatible commande 3.3V (Logic-Level). La masse (GND) du module doit être reliée à celle de l'ESP32. Alimentez le MOSFET avec votre tension nominale (${volt}).`,
    steps: (gpio, volt) => {
      const source = (volt === '12V') ? 'au +12V de votre batterie' : (volt === '5V' ? 'au +5V (borne VIN ou alim)' : 'au +3.3V');
      return [
        {
          title: "1. Masse commune (GND)",
          desc: "Reliez la borne <strong>GND (Signal)</strong> du module MOSFET à une broche <strong>GND</strong> de l'ESP32 pour assurer le bon déclenchement de la grille (Gate)."
        },
        {
          title: `2. Alimentation de puissance (${volt})`,
          desc: `Raccordez l'entrée <strong>DC+ / VIN+</strong> ${source}, et <strong>DC- / VIN-</strong> à la masse (0V). Branchez ensuite votre équipement (${volt}) sur les bornes de sortie <strong>OUT+</strong> et <strong>OUT-</strong>.`
        },
        {
          title: "3. Raccordement du signal PWM",
          desc: `Reliez la borne <strong>PWM / TRIG / IN</strong> du MOSFET directement sur la broche <span class="step-tag">GPIO {{GPIO}}</span> de l'ESP32.`
        }
      ];
    },
    schematic: (gpio, volt) => `
      <svg viewBox="0 0 540 160" width="100%" height="150" style="max-width:540px; font-family:monospace;">
        <rect x="20" y="25" width="120" height="110" rx="8" fill="#151e32" stroke="#2dd4bf" stroke-width="2"/>
        <text x="80" y="50" fill="#2dd4bf" font-size="12" font-weight="bold" text-anchor="middle">ESP32</text>
        <circle cx="130" cy="80" r="5" fill="#a855f7"/>
        <text x="120" y="84" fill="#f8fafc" font-size="10" text-anchor="end">GPIO ${gpio}</text>
        <circle cx="130" cy="110" r="5" fill="#0ea5e9"/>
        <text x="120" y="114" fill="#8b98a5" font-size="10" text-anchor="end">GND</text>

        <path d="M135 80 L230 80" stroke="#a855f7" stroke-width="2.5" stroke-dasharray="3" fill="none"/>
        <text x="180" y="72" fill="#a855f7" font-size="9" text-anchor="middle">PWM</text>

        <path d="M135 110 L230 110" stroke="#0ea5e9" stroke-width="2" fill="none"/>
        <text x="180" y="125" fill="#0ea5e9" font-size="9" text-anchor="middle">GND</text>

        <rect x="230" y="25" width="140" height="110" rx="8" fill="#1c273e" stroke="#a855f7" stroke-width="2"/>
        <text x="300" y="48" fill="#a855f7" font-size="11" font-weight="bold" text-anchor="middle">MODULE MOSFET</text>
        <text x="240" y="84" fill="#a855f7" font-size="10">PWM IN</text>
        <text x="240" y="114" fill="#0ea5e9" font-size="10">GND</text>
        <text x="360" y="84" fill="#fb923c" font-size="10" text-anchor="end">OUT +</text>
        <text x="360" y="114" fill="#8b98a5" font-size="10" text-anchor="end">OUT -</text>

        <path d="M370 80 L450 80" stroke="#fb923c" stroke-width="2.5" fill="none"/>
        <path d="M370 110 L450 110" stroke="#8b98a5" stroke-width="2" fill="none"/>

        <rect x="450" y="25" width="80" height="110" rx="8" fill="#151e32" stroke="#a855f7" stroke-width="2"/>
        <text x="490" y="75" fill="#f8fafc" font-size="11" font-weight="bold" text-anchor="middle">VARIATEUR</text>
        <text x="490" y="95" fill="#a855f7" font-size="10" text-anchor="middle">(${volt})</text>
      </svg>
    `
  },

  "SENSOR_INPUT_DIGITAL": {
    title: "Capteur Tout-ou-Rien (Contact sec / Flotteur niveau)",
    subtitle: () => "Capteur mécanique passif sans alimentation (flotteur de cuve, fin de course, bouton)",
    warning: () => `<strong>PULL-UP INTERNE ACTIVÉ (3.3V) :</strong> Ce capteur est un contact mécanique passif. L'ESP32 intègre une résistance de rappel interne. <u>Ne reliez JAMAIS d'alimentation externe (+12V ou +5V)</u> sur les fils du contact sous peine de détruire l'ESP32 !`,
    steps: (gpio) => [
      {
        title: "1. Raccordement du premier fil (GND)",
        desc: "Branchez l'un des deux fils de votre contact sec / flotteur sur une borne <strong>GND</strong> (Masse) de l'ESP32."
      },
      {
        title: "2. Raccordement du second fil (Signal)",
        desc: "Branchez le second fil directement sur la broche <span class=\"step-tag\">GPIO {{GPIO}}</span> de l'ESP32. Aucune alimentation externe n'est nécessaire."
      },
      {
        title: "3. Logique de détection",
        desc: "Au repos (circuit ouvert), l'ESP32 lit un état <strong>HAUT (3.3V)</strong> grâce au pull-up interne. Lorsque le contact se ferme (flotteur basculé), la broche est reliée à la masse et l'ESP32 lit <strong>BAS (0V / Contact FERMÉ)</strong>."
      }
    ],
    schematic: (gpio) => `
      <svg viewBox="0 0 540 160" width="100%" height="150" style="max-width:540px; font-family:monospace;">
        <rect x="30" y="25" width="140" height="110" rx="8" fill="#151e32" stroke="#2dd4bf" stroke-width="2"/>
        <text x="100" y="50" fill="#2dd4bf" font-size="12" font-weight="bold" text-anchor="middle">ESP32 (PULL-UP 3.3V)</text>
        <circle cx="160" cy="80" r="5" fill="#2dd4bf"/>
        <text x="150" y="84" fill="#f8fafc" font-size="10" text-anchor="end">GPIO ${gpio}</text>
        <circle cx="160" cy="110" r="5" fill="#0ea5e9"/>
        <text x="150" y="114" fill="#8b98a5" font-size="10" text-anchor="end">GND</text>

        <path d="M165 80 L320 80" stroke="#2dd4bf" stroke-width="2.5" fill="none"/>
        <path d="M165 110 L320 110" stroke="#0ea5e9" stroke-width="2" fill="none"/>

        <rect x="320" y="35" width="180" height="90" rx="8" fill="#1c273e" stroke="#2dd4bf" stroke-width="2"/>
        <text x="410" y="65" fill="#2dd4bf" font-size="11" font-weight="bold" text-anchor="middle">CONTACT SEC / FLOTTEUR</text>
        <circle cx="350" cy="80" r="4" fill="#f8fafc"/>
        <circle cx="470" cy="110" r="4" fill="#f8fafc"/>
        <path d="M354 80 L440 95" stroke="#f8fafc" stroke-width="2.5" fill="none"/>
        <text x="410" y="115" fill="#8b98a5" font-size="9" text-anchor="middle">Contact passif (sans tension)</text>
      </svg>
    `
  },

  "SENSOR_INPUT_ADC": {
    title: "Capteur Analogique (Mesure 0 - 3.3V)",
    subtitle: (volt) => `Pour sondes de pression, capteurs de niveau capacitif ou jauges (${volt})`,
    warning: (volt) => (volt === '12V' || volt === '5V')
      ? `<strong>SIGNAL MAX 3.3V SUR L'ESP32 :</strong> Votre capteur est alimenté en <strong>${volt}</strong>. <u>Attention impérative :</u> la broche de mesure de l'ESP32 (GPIO {{GPIO}}) ne supporte que 3.3V maximum ! Si le signal de sortie du capteur dépasse 3.3V (ex: 0-5V ou 0-10V), vous devez obligatoirement intercaler un pont diviseur de tension pour protéger l'ESP32.`
      : `<strong>TENSION MAXIMALE 3.3V :</strong> La broche ADC sélectionnée (ADC1) accepte une tension entre 0 et 3.3V. Le capteur est alimenté directement par le 3.3V de l'ESP32.`,
    steps: (gpio, volt) => {
      const vccDesc = (volt === '3.3V') 
        ? "sur la broche <strong>3.3V</strong> de l'ESP32" 
        : (volt === '5V' ? "sur la broche <strong>VIN (5V)</strong> de l'ESP32" : "sur le <strong>+12V</strong> de votre batterie");
      return [
        {
          title: "1. Masse de référence (GND)",
          desc: "Reliez la borne <strong>GND</strong> du capteur à l'une des broches <strong>GND</strong> de l'ESP32 (masse commune obligatoire)."
        },
        {
          title: `2. Alimentation du capteur (${volt})`,
          desc: `Connectez le fil d'alimentation (VCC) du capteur ${vccDesc}.`
        },
        {
          title: "3. Raccordement du signal de mesure",
          desc: `Branchez le fil de mesure (VOUT / Signal analogique) sur la broche <span class="step-tag">GPIO {{GPIO}}</span> de l'ESP32 (veillez à ce que la tension ne dépasse jamais 3.3V).`
        }
      ];
    },
    schematic: (gpio, volt) => {
      const vccLabel = (volt === '12V') ? '+12V BAT' : (volt === '5V' ? 'VIN (5V)' : '3.3V');
      return `
      <svg viewBox="0 0 540 160" width="100%" height="150" style="max-width:540px; font-family:monospace;">
        <rect x="20" y="25" width="130" height="110" rx="8" fill="#151e32" stroke="#fb923c" stroke-width="2"/>
        <text x="85" y="48" fill="#fb923c" font-size="12" font-weight="bold" text-anchor="middle">ESP32 (ADC1)</text>
        <circle cx="140" cy="65" r="5" fill="#ef4444"/>
        <text x="130" y="69" fill="#ef4444" font-size="10" text-anchor="end">${vccLabel}</text>
        <circle cx="140" cy="90" r="5" fill="#fb923c"/>
        <text x="130" y="94" fill="#f8fafc" font-size="10" text-anchor="end">GPIO ${gpio}</text>
        <circle cx="140" cy="115" r="5" fill="#0ea5e9"/>
        <text x="130" y="119" fill="#8b98a5" font-size="10" text-anchor="end">GND</text>

        <path d="M145 65 L320 65" stroke="#ef4444" stroke-width="2" fill="none"/>
        <path d="M145 90 L320 90" stroke="#fb923c" stroke-width="2.5" fill="none"/>
        <path d="M145 115 L320 115" stroke="#0ea5e9" stroke-width="2" fill="none"/>

        <rect x="320" y="25" width="190" height="110" rx="8" fill="#1c273e" stroke="#fb923c" stroke-width="2"/>
        <text x="415" y="52" fill="#fb923c" font-size="11" font-weight="bold" text-anchor="middle">CAPTEUR ANALOGIQUE</text>
        <text x="330" y="69" fill="#ef4444" font-size="9">VCC (${volt})</text>
        <text x="330" y="94" fill="#fb923c" font-size="9">VOUT (0-3.3V)</text>
        <text x="330" y="119" fill="#0ea5e9" font-size="9">GND (0V)</text>
      </svg>
      `;
    }
  },

  "SENSOR_INPUT_ONEWIRE": {
    title: "Sonde de Température Numérique (DS18B20)",
    subtitle: (volt) => `Bus numérique 1-Wire haute précision (${volt})`,
    warning: (volt) => `<strong>RÉSISTANCE DE TIRAGE 4.7 kΩ :</strong> Le bus 1-Wire requiert une résistance de 4.7 kΩ branchée entre le fil de données jaune (DATA) et le fil d'alimentation rouge (VCC). <u>Ne branchez jamais de 12V</u> sur une sonde DS18B20 sous peine de destruction immédiate !`,
    steps: (gpio, volt) => [
      {
        title: "1. Fil Noir (GND)",
        desc: "Reliez le fil noir de la sonde à une broche <strong>GND</strong> de l'ESP32."
      },
      {
        title: `2. Fil Rouge (VCC ${volt})`,
        desc: `Reliez le fil rouge de la sonde à la broche <strong>${volt === '5V' ? 'VIN (5V)' : '3.3V'}</strong> de l'ESP32.`
      },
      {
        title: "3. Fil Jaune (DATA) sur GPIO {{GPIO}}",
        desc: `Reliez le fil jaune de la sonde sur la broche <span class="step-tag">GPIO {{GPIO}}</span> en insérant la résistance de 4.7 kΩ entre le fil jaune (DATA) et le fil rouge (VCC ${volt}).`
      }
    ],
    schematic: (gpio, volt) => {
      const vccLabel = (volt === '5V') ? 'VIN (5V)' : '3.3V';
      return `
      <svg viewBox="0 0 540 160" width="100%" height="150" style="max-width:540px; font-family:monospace;">
        <rect x="20" y="25" width="130" height="110" rx="8" fill="#151e32" stroke="#ec4899" stroke-width="2"/>
        <text x="85" y="48" fill="#ec4899" font-size="12" font-weight="bold" text-anchor="middle">ESP32</text>
        <circle cx="140" cy="65" r="5" fill="#ef4444"/>
        <text x="130" y="69" fill="#ef4444" font-size="10" text-anchor="end">${vccLabel}</text>
        <circle cx="140" cy="90" r="5" fill="#ec4899"/>
        <text x="130" y="94" fill="#f8fafc" font-size="10" text-anchor="end">GPIO ${gpio}</text>
        <circle cx="140" cy="115" r="5" fill="#0ea5e9"/>
        <text x="130" y="119" fill="#8b98a5" font-size="10" text-anchor="end">GND</text>

        <path d="M145 65 L320 65" stroke="#ef4444" stroke-width="2" fill="none"/>
        <path d="M145 90 L320 90" stroke="#ec4899" stroke-width="2.5" fill="none"/>
        <path d="M145 115 L320 115" stroke="#0ea5e9" stroke-width="2" fill="none"/>

        <!-- Résistance 4.7k -->
        <rect x="220" y="70" width="30" height="15" fill="#334155" stroke="#fb923c" stroke-width="1.5"/>
        <path d="M235 65 L235 70" stroke="#ef4444" stroke-width="1.5" fill="none"/>
        <path d="M235 85 L235 90" stroke="#ec4899" stroke-width="1.5" fill="none"/>
        <text x="260" y="82" fill="#fb923c" font-size="9">4.7kΩ</text>

        <rect x="320" y="25" width="190" height="110" rx="8" fill="#1c273e" stroke="#ec4899" stroke-width="2"/>
        <text x="415" y="52" fill="#ec4899" font-size="11" font-weight="bold" text-anchor="middle">SONDE DS18B20</text>
        <text x="330" y="69" fill="#ef4444" font-size="9">ROUGE (${volt})</text>
        <text x="330" y="94" fill="#ec4899" font-size="9">JAUNE (DATA)</text>
        <text x="330" y="119" fill="#0ea5e9" font-size="9">NOIR (GND)</text>
      </svg>
      `;
    }
  }
};

/**
 * Adapte dynamiquement les options de tension et les conseils de sécurité
 * selon la catégorie et le type de signal choisis
 */
function updateVoltageOptions() {
  const catEl = document.getElementById('device-category');
  const modeEl = document.getElementById('device-signal-mode');
  const voltSelect = document.getElementById('device-voltage');
  const hintEl = document.getElementById('device-voltage-hint');
  if (!catEl || !modeEl || !voltSelect) return;

  const cat = catEl.value;
  const mode = modeEl.value;
  const currentVal = voltSelect.value;

  if (cat === 'ACTUATOR') {
    voltSelect.disabled = false;
    voltSelect.innerHTML = `
      <option value="12V">12V (Batterie van / puissance)</option>
      <option value="5V">5V (Alimentation USB / Rail 5V)</option>
      <option value="3.3V">3.3V (Natif ESP32)</option>
    `;
    if (['12V', '5V', '3.3V'].includes(currentVal)) {
      voltSelect.value = currentVal;
    } else {
      voltSelect.value = '12V';
    }
    if (hintEl) {
      hintEl.innerText = (mode === 'OUTPUT_PWM')
        ? "Tension alimentant le variateur / MOSFET (ex: 12V pour lanterneau ou ruban LED)."
        : "Tension alimentant l'appareil commandé par le relais (ex: 12V pour pompe).";
    }
  } else {
    // SENSOR
    if (mode === 'INPUT_DIGITAL') {
      // Contact sec (flotteur, fin de course) : passif, sans tension !
      voltSelect.innerHTML = `
        <option value="3.3V">Passif (Sans tension / Pull-up 3.3V)</option>
      `;
      voltSelect.value = '3.3V';
      voltSelect.disabled = true;
      if (hintEl) {
        hintEl.innerText = "Un contact sec (flotteur, bouton) est passif : aucune alimentation externe requise.";
      }
    } else if (mode === 'INPUT_ONEWIRE') {
      // DS18B20 : 3.3V recommandé ou 5V (jamais 12V)
      voltSelect.disabled = false;
      voltSelect.innerHTML = `
        <option value="3.3V">3.3V (Recommandé - Direct ESP32)</option>
        <option value="5V">5V (Alimentation externe 5V)</option>
      `;
      voltSelect.value = (currentVal === '5V') ? '5V' : '3.3V';
      if (hintEl) {
        hintEl.innerText = "La sonde DS18B20 s'alimente en 3.3V ou 5V (ne jamais relier au 12V !).";
      }
    } else {
      // INPUT_ADC (Analogique)
      voltSelect.disabled = false;
      voltSelect.innerHTML = `
        <option value="3.3V">3.3V (Natif ESP32 / Direct)</option>
        <option value="5V">5V (Capteur 5V avec sortie max 3.3V)</option>
        <option value="12V">12V (Capteur 12V avec diviseur de tension)</option>
      `;
      if (['3.3V', '5V', '12V'].includes(currentVal)) {
        voltSelect.value = currentVal;
      } else {
        voltSelect.value = '3.3V';
      }
      if (hintEl) {
        hintEl.innerText = "Attention : la tension mesurée par l'ESP32 ne doit jamais dépasser 3.3V.";
      }
    }
  }
}

function onSignalModeChange() {
  updateVoltageOptions();
}

/**
 * Met à jour le menu déroulant du type de commande selon la catégorie
 */
function onCategoryChange() {
  const catEl = document.getElementById('device-category');
  const modeSelect = document.getElementById('device-signal-mode');
  const modeLabel = document.getElementById('device-signal-label');
  if (!catEl || !modeSelect) return;

  const cat = catEl.value;
  if (cat === 'ACTUATOR') {
    if (modeLabel) modeLabel.innerText = "Type de commande";
    modeSelect.innerHTML = `
      <option value="OUTPUT_RELAY">Tout ou Rien (Relais isolé)</option>
      <option value="OUTPUT_PWM">Progressif (Variateur PWM / MOSFET)</option>
    `;
  } else {
    if (modeLabel) modeLabel.innerText = "Type de mesure";
    modeSelect.innerHTML = `
      <option value="INPUT_DIGITAL">Tout ou Rien (Contact sec / Flotteur)</option>
      <option value="INPUT_ADC">Analogique 0-3.3V (Sonde pression / jauge)</option>
      <option value="INPUT_ONEWIRE">Bus numérique 1-Wire (DS18B20)</option>
    `;
  }
  updateVoltageOptions();
}

/**
 * Charge les équipements depuis l'ESP32 (/api/devices)
 */
async function loadDeviceManager() {
  try {
    const res = await fetch('/api/devices');
    if (!res.ok) throw new Error('Erreur réseau');
    const data = await res.json();
    devicesList = data.devices || [];
    try { localStorage.setItem('climate_pro_sim_devices', JSON.stringify(devicesList)); } catch(e){}
  } catch (err) {
    console.warn("Mode simulation / fallback hors ligne.");
    let loadedFromStorage = false;
    try {
      const savedSim = localStorage.getItem('climate_pro_sim_devices');
      if (savedSim) {
        const parsed = JSON.parse(savedSim);
        if (Array.isArray(parsed) && parsed.length > 0) {
          devicesList = parsed;
          loadedFromStorage = true;
        }
      }
    } catch(e) {}

    if (!loadedFromStorage && devicesList.length === 0) {
      devicesList = [
        {"id": 1, "name": "Pompe boucle froide", "category": "ACTUATOR", "voltage": "12V", "mode": "OUTPUT_RELAY", "type": "RELAY", "gpio": 4, "state": 0, "value": 0, "isCore": true},
        {"id": 2, "name": "Lanterneau Fiamma", "category": "ACTUATOR", "voltage": "12V", "mode": "OUTPUT_PWM", "type": "PWM", "gpio": 19, "state": 0, "value": 128, "isCore": false},
        {"id": 3, "name": "Spot Salon", "category": "ACTUATOR", "voltage": "12V", "mode": "OUTPUT_RELAY", "type": "RELAY", "gpio": 23, "state": 0, "value": 0, "isCore": false}
      ];
      try { localStorage.setItem('climate_pro_sim_devices', JSON.stringify(devicesList)); } catch(e){}
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
    const isActuator = (dev.category === 'ACTUATOR');
    const catBadge = isActuator
      ? `<span class="badge badge-actuator">Actionneur</span> <span class="badge-volt">${dev.voltage || '12V'}</span>`
      : `<span class="badge badge-sensor">Capteur</span> <span class="badge-volt">${dev.voltage || '3.3V'}</span>`;

    let signalBadge = '';
    switch(dev.mode) {
      case 'OUTPUT_PWM':
        signalBadge = `<span class="badge badge-pwm">PWM</span>`;
        break;
      case 'INPUT_DIGITAL':
        signalBadge = `<span class="badge badge-digital">Contact Sec</span>`;
        break;
      case 'INPUT_ADC':
        signalBadge = `<span class="badge badge-adc">ADC (0-3.3V)</span>`;
        break;
      case 'INPUT_ONEWIRE':
        signalBadge = `<span class="badge badge-onewire">1-Wire</span>`;
        break;
      case 'OUTPUT_RELAY':
      default:
        signalBadge = `<span class="badge badge-relay">Relais</span>`;
        break;
    }

    const isCoreTag = dev.isCore 
      ? ` <span class="badge-volt" style="color:var(--orange-alert); border-color:rgba(251, 146, 60, 0.3); font-size:10px; margin-left:6px;" title="Équipement système protégé">Système</span>`
      : '';

    let stateDisplay = '';
    if (dev.mode === 'OUTPUT_PWM') {
      stateDisplay = `<span style="color:var(--purple-pwm); font-weight:bold;">${Math.round((dev.value / 255) * 100)}%</span>`;
    } else if (dev.mode === 'INPUT_DIGITAL') {
      stateDisplay = dev.state ? `<span style="color:var(--cyan-light); font-weight:bold;">ON</span>` : `<span style="color:var(--text-muted);">OFF</span>`;
    } else if (dev.mode === 'INPUT_ADC') {
      stateDisplay = `<span style="color:var(--cyan-light); font-weight:bold;">${((dev.value / 4095) * 3.3).toFixed(2)}V</span>`;
    } else {
      stateDisplay = dev.state 
        ? `<span style="color:var(--cyan-light); font-weight:bold;">ON</span>` 
        : `<span style="color:var(--text-muted);">OFF</span>`;
    }

    const deleteBtn = dev.isCore
      ? `<button class="action-btn disabled" title="Équipement système protégé"><svg viewBox="0 0 24 24"><path d="M12,17A2,2 0 0,0 14,15C14,13.89 13.1,13 12,13A2,2 0 0,0 10,15A2,2 0 0,0 12,17M18,8A2,2 0 0,1 20,10V20A2,2 0 0,1 18,22H6A2,2 0 0,1 4,20V10C4,8.89 4.89,8 6,8H7V6A5,5 0 0,1 12,1A5,5 0 0,1 17,6V8H18M12,3A3,3 0 0,0 9,6V8H15V6A3,3 0 0,0 12,3Z"/></svg></button>`
      : `<button class="action-btn delete-btn" title="Supprimer" onclick="deleteDevice(${dev.id}, '${escapeHtml(dev.name)}')"><svg viewBox="0 0 24 24"><path d="M19,4H15.5L14.5,3H9.5L8.5,4H5V6H19M6,19A2,2 0 0,0 8,21H16A2,2 0 0,0 18,19V7H6V19Z"/></svg></button>`;

    return `
      <tr>
        <td style="font-weight:700; color:var(--text-main); white-space:nowrap;">
          ${escapeHtml(dev.name)}${isCoreTag}
        </td>
        <td>${catBadge}</td>
        <td>${signalBadge}</td>
        <td class="col-center"><span class="badge-gpio">GPIO ${dev.gpio}</span></td>
        <td class="col-center">${stateDisplay}</td>
        <td class="col-right">
          <div class="actions-cell">
            <button class="action-btn test-btn" id="btn-test-${dev.id}" title="Tester" onclick="testDevice(${dev.id}, this)">
              <svg viewBox="0 0 24 24"><path d="M7,2V4H8V18A4,4 0 0,0 12,22A4,4 0 0,0 16,18V4H17V2H7M11,16C10.45,16 10,15.55 10,15C10,14.45 10.45,14 11,14C11.55,14 12,14.45 12,15C12,15.55 11.55,16 11,16M13,12C12.45,12 12,11.55 12,11C12,10.45 12.45,10 13,10C13.55,10 14,10.45 14,11C14,11.55 13.55,12 13,12Z"/></svg>
              Tester
            </button>
            <button class="action-btn" title="Didacticiel de câblage" onclick="openWizardForExistingDevice(${dev.id})">
              <svg viewBox="0 0 24 24"><path d="M19,2L14,6.5V17.5L19,13V2M6.5,5C4.55,5 2.45,5.4 1,6.5V21.16C1,21.41 1.25,21.66 1.5,21.66C1.6,21.66 1.65,21.61 1.75,21.61C3.1,20.95 5.05,20.5 6.5,20.5C8.45,20.5 10.55,20.95 12,22C13.35,21.05 15.8,20.5 17.5,20.5C19.15,20.5 20.85,20.8 22.25,21.56C22.35,21.61 22.4,21.66 22.5,21.66C22.75,21.66 23,21.41 23,21.16V6.5C22.4,6.05 21.75,5.75 21,5.5V19C19.9,18.65 18.7,18.5 17.5,18.5C15.8,18.5 13.35,19.05 12,20V6.5C10.55,5.4 8.45,5 6.5,5Z"/></svg>
              Câbler
            </button>
            <button class="action-btn" title="Modifier" onclick="openEditDeviceModal(${dev.id})">
              <svg viewBox="0 0 24 24"><path d="M20.71,7.04C21.1,6.65 21.1,6 20.71,5.63L18.37,3.29C18,2.9 17.35,2.9 16.96,3.29L15.12,5.12L18.87,8.87M3,17.25V21H6.75L17.81,9.93L14.06,6.18L3,17.25Z"/></svg>
            </button>
            ${deleteBtn}
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

/**
 * Affiche dynamiquement les périphériques sur la page principale (Dashboard)
 */
function renderDashboardAuxDevices(devices) {
  const container = document.getElementById('aux-devices-container');
  if (!container) return;

  if (devices.length === 0) {
    container.innerHTML = `<div style="color:var(--text-muted); font-size:13px;">Aucun actionneur ou capteur supplémentaire configuré.</div>`;
    return;
  }

  container.innerHTML = devices.map(dev => {
    if (dev.mode === 'OUTPUT_PWM') {
      const pct = Math.round((dev.value / 255) * 100);
      return `
        <div class="aux-card">
          <div class="aux-header">
            <span class="aux-name">${escapeHtml(dev.name)}</span>
            <span class="badge-gpio">GPIO ${dev.gpio}</span>
          </div>
          <div class="aux-controls" style="flex-direction:column; align-items:stretch;">
            <div style="display:flex; justify-content:space-between; font-size:12px; color:var(--text-muted);">
              <span>Variateur PWM (${dev.voltage || '12V'})</span>
              <span class="aux-slider-val" id="aux-val-${dev.id}">${pct}%</span>
            </div>
            <div class="aux-slider-wrap">
              <input type="range" min="0" max="100" value="${pct}" oninput="updateAuxPwm(${dev.id}, this.value)">
            </div>
          </div>
        </div>
      `;
    } else if (dev.category === 'SENSOR') {
      let valText = dev.state ? 'ON' : 'OFF';
      if (dev.mode === 'INPUT_ADC') valText = ((dev.value / 4095) * 3.3).toFixed(2) + ' V';
      return `
        <div class="aux-card">
          <div class="aux-header">
            <span class="aux-name">${escapeHtml(dev.name)}</span>
            <span class="badge-gpio">GPIO ${dev.gpio}</span>
          </div>
          <div class="aux-controls" style="justify-content:space-between;">
            <span style="font-size:12px; color:var(--text-muted);">Capteur (${dev.voltage || '3.3V'})</span>
            <span style="font-weight:bold; color:var(--cyan-light);" id="sensor-val-${dev.id}">${valText}</span>
          </div>
        </div>
      `;
    } else {
      // Relais standard
      return `
        <div class="aux-card">
          <div class="aux-header">
            <span class="aux-name">${escapeHtml(dev.name)}</span>
            <span class="badge-gpio">GPIO ${dev.gpio}</span>
          </div>
          <div class="aux-controls" style="justify-content: space-between;">
            <span style="font-size:12px; color:var(--text-muted);">Relais ${dev.voltage || '12V'}</span>
            <label class="toggle-switch">
              <input type="checkbox" id="aux-toggle-${dev.id}" ${dev.state ? 'checked' : ''} onchange="toggleAuxDevice(${dev.id}, this.checked)">
              <span class="slider"></span>
            </label>
          </div>
        </div>
      `;
    }
  }).join('');
}

/**
 * Commande d'un relais depuis le Dashboard
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
    console.warn("set-state simulation");
    try { localStorage.setItem('climate_pro_sim_devices', JSON.stringify(devicesList)); } catch(e){}
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
      console.warn("set-state PWM simulation");
      try { localStorage.setItem('climate_pro_sim_devices', JSON.stringify(devicesList)); } catch(e){}
    }
  }, 100);
}

/**
 * Ouvre la modale Étape 1 : Déclaration d'équipement
 */
async function openAddDeviceModal() {
  wizardState.id = 0;
  wizardState.isCore = false;

  document.getElementById('modal-title').innerText = "1. Déclarer un équipement";
  document.getElementById('device-name').value = "";
  document.getElementById('device-category').value = "ACTUATOR";
  document.getElementById('btn-submit-step1').innerText = "Suivant : Câbler sur la carte";
  
  onCategoryChange();
  await populatePinSelect();

  document.getElementById('device-modal').classList.add('active');
}

/**
 * Ouvre la modale pour modifier un équipement existant
 */
async function openEditDeviceModal(id) {
  const dev = devicesList.find(d => d.id === id);
  if (!dev) return;

  wizardState.id = dev.id;
  wizardState.isCore = dev.isCore;

  document.getElementById('modal-title').innerText = `Modifier : ${dev.name}`;
  document.getElementById('device-name').value = dev.name;
  document.getElementById('device-category').value = dev.category || 'ACTUATOR';
  document.getElementById('btn-submit-step1').innerText = "Suivant : Vérifier le câblage";

  onCategoryChange();
  document.getElementById('device-signal-mode').value = dev.mode || 'OUTPUT_RELAY';
  updateVoltageOptions();
  if (dev.voltage) {
    document.getElementById('device-voltage').value = dev.voltage;
  }

  await populatePinSelect(dev.gpio);
  document.getElementById('device-modal').classList.add('active');
}

function closeDeviceModal() {
  document.getElementById('device-modal').classList.remove('active');
}

/**
 * Récupère les GPIO disponibles pour le sélecteur manuel optionnel
 */
async function populatePinSelect(currentPin = null) {
  const select = document.getElementById('device-gpio');
  select.innerHTML = '<option value="auto">Attribution automatique optimale par l\'ESP32</option>';

  let availablePins = [];
  try {
    const res = await fetch('/api/available-pins');
    if (res.ok) {
      const data = await res.json();
      availablePins = data.pins || [];
    }
  } catch (e) {
    const usedPins = devicesList.map(d => d.gpio);
    const safeList = [4, 5, 13, 14, 16, 17, 18, 19, 21, 22, 23, 25, 26, 27, 32, 33];
    availablePins = safeList.filter(p => !usedPins.includes(p) || p === currentPin);
  }

  if (currentPin !== null && !availablePins.includes(currentPin)) {
    availablePins.unshift(currentPin);
  }

  availablePins.forEach(pin => {
    const isCurrent = (pin === currentPin);
    select.innerHTML += `<option value="${pin}" ${isCurrent ? 'selected' : ''}>GPIO ${pin} ${isCurrent ? '(Actuel)' : '(Libre)'}</option>`;
  });
}

/**
 * Soumission de l'Étape 1 -> Ouvre le Didacticiel de câblage (Étape 2)
 */
async function handleDeviceFormSubmit(e) {
  e.preventDefault();
  const name = document.getElementById('device-name').value.trim();
  const category = document.getElementById('device-category').value;
  const voltage = document.getElementById('device-voltage').value;
  const mode = document.getElementById('device-signal-mode').value;
  const gpioSelect = document.getElementById('device-gpio').value;

  if (!name) {
    showToast("Le nom de l'équipement est requis.", "error");
    return;
  }

  wizardState.name = name;
  wizardState.category = category;
  wizardState.voltage = voltage;
  wizardState.mode = mode;
  wizardState.gpio = (gpioSelect === 'auto') ? null : parseInt(gpioSelect, 10);

  closeDeviceModal();
  await openWizardModal();
}

/**
 * Ouvre le didacticiel de câblage guidé (Wizard)
 */
async function openWizardModal() {
  const modal = document.getElementById('wizard-modal');
  const title = document.getElementById('wizard-title');
  const subtitle = document.getElementById('wizard-subtitle');
  const pinDisplay = document.getElementById('wizard-assigned-gpio');
  const pinReason = document.getElementById('wizard-pin-reason');
  const testStatus = document.getElementById('wizard-test-status');

  title.innerText = `Câbler : ${wizardState.name}`;
  
  const modeLabels = {
    'OUTPUT_RELAY': 'Relais (Tout-ou-Rien)',
    'OUTPUT_PWM': 'Variateur PWM / MOSFET',
    'INPUT_DIGITAL': 'Contact Sec (Passif)',
    'INPUT_ADC': 'Analogique (0-3.3V)',
    'INPUT_ONEWIRE': 'Bus 1-Wire (DS18B20)'
  };
  const modeName = modeLabels[wizardState.mode] || wizardState.mode;
  const voltDisplay = (wizardState.mode === 'INPUT_DIGITAL') ? 'Passif (sans tension)' : wizardState.voltage;
  subtitle.innerText = `${wizardState.category === 'ACTUATOR' ? 'Actionneur' : 'Capteur'} • ${voltDisplay} • ${modeName}`;

  testStatus.className = "wizard-test-status";
  testStatus.innerHTML = (wizardState.category === 'ACTUATOR')
    ? "En attente du test... (Prévention 5s puis impulsion 3s)"
    : "En attente du test... (Lecture immédiate)";

  // 1. Réservation intelligente de la broche GPIO auprès de l'ESP32 si auto
  if (!wizardState.gpio) {
    pinDisplay.innerText = "Recherche...";
    try {
      const res = await fetch(`/api/pins/suggest?type=${wizardState.mode}`);
      const data = await res.json();
      if (data.success && data.gpio) {
        wizardState.gpio = data.gpio;
        pinReason.innerText = data.message || "Broche sécurisée sélectionnée par l'ESP32";
      } else {
        throw new Error(data.error || "Aucune broche disponible");
      }
    } catch (err) {
      // Fallback local
      const usedPins = devicesList.map(d => d.gpio);
      const candidates = (wizardState.mode === 'INPUT_ADC') 
        ? [32, 33, 34, 35, 36, 39] 
        : [4, 5, 13, 14, 16, 17, 18, 19, 21, 22, 23, 25, 26, 27, 32, 33];
      wizardState.gpio = candidates.find(p => !usedPins.includes(p)) || 18;
      pinReason.innerText = `GPIO ${wizardState.gpio} alloué automatiquement`;
    }
  }

  pinDisplay.innerText = `GPIO ${wizardState.gpio}`;

  // 2. Sélection du didacticiel sur-mesure
  const tutKey = `${wizardState.category}_${wizardState.mode}`;
  const tutorial = WIRING_TUTORIALS[tutKey] || WIRING_TUTORIALS["ACTUATOR_OUTPUT_RELAY"];

  // 3. Remplissage de l'alerte sécurité
  const alertBox = document.getElementById('wizard-safety-alert');
  const warningText = (typeof tutorial.warning === 'function') 
    ? tutorial.warning(wizardState.voltage) 
    : tutorial.warning;
  const formattedWarning = warningText.replace(/\{\{GPIO\}\}/g, `<strong>GPIO ${wizardState.gpio}</strong>`);
  alertBox.innerHTML = `
    <svg viewBox="0 0 24 24"><path d="M12,2L1,21H23L12,2M12,6L19.53,19H4.47L12,6M11,10V14H13V10H11M11,16V18H13V16H11Z"/></svg>
    <div>${formattedWarning}</div>
  `;

  // 4. Génération du schéma synoptique
  const schematicBox = document.getElementById('wizard-schematic');
  schematicBox.innerHTML = tutorial.schematic(wizardState.gpio, wizardState.voltage);

  // 5. Génération des étapes de câblage avec remplacement de {{GPIO}}
  const stepsContainer = document.getElementById('wizard-steps-container');
  const stepsList = (typeof tutorial.steps === 'function') 
    ? tutorial.steps(wizardState.gpio, wizardState.voltage) 
    : tutorial.steps;
  stepsContainer.innerHTML = stepsList.map((step, idx) => {
    const formattedDesc = step.desc.replace(/\{\{GPIO\}\}/g, `<strong>GPIO ${wizardState.gpio}</strong>`);
    return `
      <div class="step-card">
        <div class="step-num">${idx + 1}</div>
        <div class="step-content">
          <div class="step-title">${step.title}</div>
          <div class="step-desc">${formattedDesc}</div>
        </div>
      </div>
    `;
  }).join('');

  // 6. Adaptation du libellé du bouton de test
  const testBtnText = document.getElementById('wizard-test-btn-text');
  if (wizardState.category === 'ACTUATOR') {
    testBtnText.innerText = "Tester l'actionneur";
  } else {
    testBtnText.innerText = "Tester la lecture du capteur";
  }

  modal.classList.add('active');
}

/**
 * Lance le didacticiel pour un équipement existant
 */
function openWizardForExistingDevice(id) {
  const dev = devicesList.find(d => d.id === id);
  if (!dev) return;

  wizardState = {
    id: dev.id,
    name: dev.name,
    category: dev.category || 'ACTUATOR',
    voltage: dev.voltage || '12V',
    mode: dev.mode || 'OUTPUT_RELAY',
    gpio: dev.gpio,
    isCore: dev.isCore
  };

  openWizardModal();
}

let wizardDelayTimer = null;
let wizardActTimer = null;

function closeWizardModal() {
  if (wizardDelayTimer) { clearInterval(wizardDelayTimer); wizardDelayTimer = null; }
  if (wizardActTimer) { clearInterval(wizardActTimer); wizardActTimer = null; }
  const btn = document.getElementById('wizard-btn-test');
  if (btn) btn.disabled = false;
  document.getElementById('wizard-modal').classList.remove('active');
}

function backToFormModal() {
  closeWizardModal();
  document.getElementById('device-modal').classList.add('active');
}

/**
 * Test physique interactif pendant le Wizard
 */
async function runWizardTest() {
  const btn = document.getElementById('wizard-btn-test');
  const btnText = document.getElementById('wizard-test-btn-text');
  const statusBox = document.getElementById('wizard-test-status');

  if (wizardDelayTimer) { clearInterval(wizardDelayTimer); wizardDelayTimer = null; }
  if (wizardActTimer) { clearInterval(wizardActTimer); wizardActTimer = null; }

  if (wizardState.category === 'ACTUATOR') {
    // --- TEST ACTIONNEUR : Prévention 5s puis action 3s ---
    btn.disabled = true;
    statusBox.className = "wizard-test-status warning";

    let delaySec = 5;
    btnText.innerText = `Démarrage dans ${delaySec}s...`;
    statusBox.innerHTML = `Attention : l'appareil va démarrer dans <strong>${delaySec} secondes</strong> !`;
    showToast("Attention : l'appareil va démarrer dans 5 secondes !", "warning");

    wizardDelayTimer = setInterval(() => {
      delaySec--;
      if (delaySec > 0) {
        btnText.innerText = `Démarrage dans ${delaySec}s...`;
        statusBox.innerHTML = `Attention : l'appareil va démarrer dans <strong>${delaySec} secondes</strong> !`;
      } else {
        clearInterval(wizardDelayTimer);
        wizardDelayTimer = null;

        // Phase 2 : Mise en marche pendant 3 secondes
        statusBox.className = "wizard-test-status testing";
        let actSec = 3;
        btnText.innerText = `En marche (${actSec}s)...`;
        statusBox.innerHTML = `Impulsion active sur GPIO ${wizardState.gpio} (${actSec}s)...`;

        // Déclenchement matériel sur l'ESP32
        fetch('/api/devices/test', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            id: wizardState.id, 
            gpio: wizardState.gpio, 
            mode: wizardState.mode, 
            duration: 3000 
          })
        }).catch(e => console.warn("Erreur test matériel", e));

        wizardActTimer = setInterval(() => {
          actSec--;
          if (actSec > 0) {
            btnText.innerText = `En marche (${actSec}s)...`;
            statusBox.innerHTML = `Impulsion active sur GPIO ${wizardState.gpio} (${actSec}s)...`;
          } else {
            clearInterval(wizardActTimer);
            wizardActTimer = null;
            statusBox.className = "wizard-test-status success";
            statusBox.innerHTML = `Test validé : Actionneur activé pendant 3 secondes sur GPIO ${wizardState.gpio}.`;
            btn.disabled = false;
            btnText.innerText = "Re-tester l'actionneur";
            showToast("Test actionneur terminé avec succès.", "success");
          }
        }, 1000);
      }
    }, 1000);

  } else {
    // --- TEST CAPTEUR : lecture instantanée avec affichage de la valeur (ON/OFF ou tension) ---
    btn.disabled = true;
    statusBox.className = "wizard-test-status testing";
    btnText.innerText = "Lecture du signal...";
    statusBox.innerText = `Lecture de la broche GPIO ${wizardState.gpio}...`;

    try {
      const res = await fetch('/api/devices/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          id: wizardState.id, 
          gpio: wizardState.gpio, 
          mode: wizardState.mode, 
          duration: 100 
        })
      });
      const data = await res.json();
      statusBox.className = "wizard-test-status success";
      if (wizardState.mode === 'INPUT_ADC') {
        const volts = (data.voltage !== undefined) ? data.voltage : ((data.reading / 4095) * 3.3);
        statusBox.innerHTML = `Valeur mesurée : <strong>${volts.toFixed(2)} V</strong> (ADC : ${data.reading} / 4095)`;
        showToast(`Valeur capteur : ${volts.toFixed(2)} V`, "success");
      } else {
        // Digital / contact sec / tout ou rien (0 = fermé = ON, 1 = ouvert = OFF)
        const isOn = (data.reading === 0);
        const stateStr = isOn ? 'ON' : 'OFF';
        const descStr = isOn ? 'Contact fermé' : 'Contact ouvert';
        statusBox.innerHTML = `Valeur du capteur : <strong style="font-size:16px; color:var(--cyan-light);">${stateStr}</strong> (${descStr})`;
        showToast(`Valeur capteur : ${stateStr}`, "success");
      }
    } catch (e) {
      statusBox.className = "wizard-test-status success";
      if (wizardState.mode === 'INPUT_ADC') {
        statusBox.innerHTML = `Valeur mesurée (Simulation) : <strong>2.15 V</strong>`;
        showToast("Valeur capteur (Simulation) : 2.15 V", "info");
      } else {
        statusBox.innerHTML = `Valeur du capteur (Simulation) : <strong style="font-size:16px; color:var(--cyan-light);">ON</strong> (Contact fermé)`;
        showToast("Valeur capteur (Simulation) : ON", "info");
      }
    } finally {
      btn.disabled = false;
      btnText.innerText = "Tester la lecture du capteur";
    }
  }
}

/**
 * Validation finale du Wizard : Enregistrement et activation
 */
async function finishAndActivateWizard() {
  const payload = {
    id: wizardState.id,
    name: wizardState.name,
    category: wizardState.category,
    voltage: wizardState.voltage,
    mode: wizardState.mode,
    gpio: wizardState.gpio,
    isCore: wizardState.isCore
  };

  try {
    const res = await fetch('/api/devices/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const result = await res.json();
    if (!res.ok || !result.success) {
      throw new Error(result.error || "Erreur de sauvegarde");
    }
    showToast(`"${wizardState.name}" câblé et activé avec succès sur GPIO ${wizardState.gpio} !`, "success");
  } catch (err) {
    // Mode simulation
    if (wizardState.id > 0) {
      const existing = devicesList.find(d => d.id === wizardState.id);
      if (existing) Object.assign(existing, payload);
    } else {
      const newId = (devicesList.length > 0 ? Math.max(...devicesList.map(d => d.id)) + 1 : 1);
      devicesList.push({ ...payload, id: newId, state: 0, value: 0 });
    }
    try { localStorage.setItem('climate_pro_sim_devices', JSON.stringify(devicesList)); } catch(e){}
    showToast(`"${wizardState.name}" activé sur GPIO ${wizardState.gpio} (simulation) !`, "success");
  }

  closeWizardModal();
  await loadDeviceManager();
}

/**
 * Supprime un équipement
 */
async function deleteDevice(id, name) {
  if (!confirm(`Êtes-vous sûr de vouloir supprimer définitivement l'équipement "${name}" ?\nSa broche GPIO sera libérée.`)) {
    return;
  }

  if (tableTestTimers[id]) {
    if (tableTestTimers[id].delay) clearInterval(tableTestTimers[id].delay);
    if (tableTestTimers[id].act) clearInterval(tableTestTimers[id].act);
    delete tableTestTimers[id];
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
    automationRules = automationRules.filter(r => r.triggerId !== id && r.targetId !== id);
    saveAutomations();
    await loadDeviceManager();
    renderAutomationTable();
  } catch (err) {
    devicesList = devicesList.filter(d => d.id !== id);
    automationRules = automationRules.filter(r => r.triggerId !== id && r.targetId !== id);
    saveAutomations();
    try { localStorage.setItem('climate_pro_sim_devices', JSON.stringify(devicesList)); } catch(e){}
    showToast(`"${name}" a été supprimé (simulation).`, "success");
    renderDeviceTable(devicesList);
    renderDashboardAuxDevices(devicesList);
    renderAutomationTable();
  }
}

let tableTestTimers = {};

/**
 * Lance un test depuis le tableau Matériel
 * - Capteur : lecture immédiate et affichage de la valeur (ON/OFF ou tension)
 * - Actionneur : prévention 5 secondes puis mise en marche 3 secondes
 */
async function testDevice(id, btnElement) {
  const dev = devicesList.find(d => d.id === id);
  if (!dev) return;

  // Nettoyage de tout timer précédent pour cet équipement
  if (tableTestTimers[id]) {
    if (tableTestTimers[id].delay) clearInterval(tableTestTimers[id].delay);
    if (tableTestTimers[id].act) clearInterval(tableTestTimers[id].act);
    delete tableTestTimers[id];
  }

  if (dev.category === 'SENSOR') {
    // --- TEST CAPTEUR : Lecture immédiate de la valeur ---
    btnElement.disabled = true;
    btnElement.innerHTML = "Lecture...";

    try {
      const res = await fetch('/api/devices/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: dev.id, duration: 100 })
      });
      const data = await res.json();
      let displayVal = '';
      if (dev.mode === 'INPUT_ADC') {
        const volts = (data.voltage !== undefined) ? data.voltage : ((data.reading / 4095) * 3.3);
        dev.value = (data.reading !== undefined) ? data.reading : Math.round((volts / 3.3) * 4095);
        displayVal = `${volts.toFixed(2)} V`;
      } else {
        // Tout ou rien : 0 = Contact fermé (ON), 1 = Contact ouvert (OFF)
        const isOn = (data.reading === 0);
        dev.state = isOn ? 1 : 0;
        displayVal = isOn ? 'ON' : 'OFF';
      }
      showToast(`${dev.name} : Valeur lue = ${displayVal}`, 'success');
      renderDeviceTable(devicesList);
      renderDashboardAuxDevices(devicesList);
    } catch (err) {
      // Simulation locale
      dev.state = dev.state ? 0 : 1;
      const displayVal = (dev.mode === 'INPUT_ADC') ? '2.15 V' : (dev.state ? 'ON' : 'OFF');
      try { localStorage.setItem('climate_pro_sim_devices', JSON.stringify(devicesList)); } catch(e){}
      showToast(`${dev.name} (Simulation) : Valeur = ${displayVal}`, 'info');
      renderDeviceTable(devicesList);
      renderDashboardAuxDevices(devicesList);
    } finally {
      const btn = document.getElementById(`btn-test-${id}`);
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = `<svg viewBox="0 0 24 24"><path d="M7,2V4H8V18A4,4 0 0,0 12,22A4,4 0 0,0 16,18V4H17V2H7M11,16C10.45,16 10,15.55 10,15C10,14.45 10.45,14 11,14C11.55,14 12,14.45 12,15C12,15.55 11.55,16 11,16M13,12C12.45,12 12,11.55 12,11C12,10.45 12.45,10 13,10C13.55,10 14,10.45 14,11C14,11.55 13.55,12 13,12Z"/></svg> Tester`;
      }
    }

  } else {
    // --- TEST ACTIONNEUR : Prévention 5s puis mise en marche 3s ---
    btnElement.disabled = true;
    btnElement.classList.add('warning-pulse');

    let delaySec = 5;
    btnElement.innerHTML = `Attention (${delaySec}s)...`;
    showToast(`Attention : "${dev.name}" va démarrer dans 5 secondes !`, 'warning');

    tableTestTimers[id] = {};
    tableTestTimers[id].delay = setInterval(() => {
      delaySec--;
      const curBtn = document.getElementById(`btn-test-${id}`);
      if (delaySec > 0) {
        if (curBtn) curBtn.innerHTML = `Attention (${delaySec}s)...`;
      } else {
        clearInterval(tableTestTimers[id].delay);
        delete tableTestTimers[id].delay;

        // Phase 2 : Mise en marche pendant 3 secondes
        if (curBtn) {
          curBtn.classList.remove('warning-pulse');
          curBtn.classList.add('testing');
        }

        let actSec = 3;
        if (curBtn) curBtn.innerHTML = `En marche (${actSec}s)...`;

        // Déclenchement matériel sur l'ESP32
        fetch('/api/devices/test', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: dev.id, duration: 3000 })
        }).catch(e => console.warn("Erreur test actionneur", e));

        tableTestTimers[id].act = setInterval(() => {
          actSec--;
          const activeBtn = document.getElementById(`btn-test-${id}`);
          if (actSec > 0) {
            if (activeBtn) activeBtn.innerHTML = `En marche (${actSec}s)...`;
          } else {
            clearInterval(tableTestTimers[id].act);
            delete tableTestTimers[id];

            if (activeBtn) {
              activeBtn.classList.remove('testing');
              activeBtn.disabled = false;
              activeBtn.innerHTML = `<svg viewBox="0 0 24 24"><path d="M7,2V4H8V18A4,4 0 0,0 12,22A4,4 0 0,0 16,18V4H17V2H7M11,16C10.45,16 10,15.55 10,15C10,14.45 10.45,14 11,14C11.55,14 12,14.45 12,15C12,15.55 11.55,16 11,16M13,12C12.45,12 12,11.55 12,11C12,10.45 12.45,10 13,10C13.55,10 14,10.45 14,11C14,11.55 13.55,12 13,12Z"/></svg> Tester`;
            }
            showToast(`Test terminé pour "${dev.name}".`, 'success');
          }
        }, 1000);
      }
    }, 1000);
  }
}

function escapeHtml(text) {
  if (!text) return '';
  return text.replace(/[&<>"']/g, function(m) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m];
  });
}

// =========================================================================
// MOTEUR D'AUTOMATISATION (SI ... EST ... ALORS ...)
// =========================================================================

/**
 * Charge les règles d'automatisation depuis l'ESP32 ou le stockage local
 */
async function loadAutomations() {
  if (!devicesList || devicesList.length === 0) {
    try { await loadDeviceManager(); } catch (e) {}
  }

  try {
    const res = await fetch('/api/automations');
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.rules)) {
        automationRules = data.rules;
        try { localStorage.setItem('climate_pro_automations', JSON.stringify(automationRules)); } catch (e) {}
      }
    } else {
      throw new Error("Erreur serveur automations");
    }
  } catch (err) {
    // Mode simulation / hors ligne
    try {
      const cached = localStorage.getItem('climate_pro_automations');
      if (cached) {
        automationRules = JSON.parse(cached);
      } else {
        // Règle d'exemple par défaut
        const firstSensor = devicesList.find(d => d.category === 'SENSOR') || devicesList[0];
        const actuators = devicesList.filter(d => d.category === 'ACTUATOR');
        const firstActuator = actuators.length > 0 ? actuators[0] : devicesList[0];
        if (firstSensor && firstActuator) {
          automationRules = [
            {
              id: 1,
              enabled: true,
              triggerId: firstSensor.id,
              conditionValue: 'ON',
              operator: '>',
              threshold: 2.5,
              targetId: firstActuator.id,
              actionValue: 'ON',
              actionPercent: 100
            }
          ];
          try { localStorage.setItem('climate_pro_automations', JSON.stringify(automationRules)); } catch (e) {}
        } else {
          automationRules = [];
        }
      }
    } catch (e) {
      automationRules = [];
    }
  }

  renderAutomationTable();
}

/**
 * Sauvegarde les règles d'automatisation (LittleFS + localStorage)
 */
async function saveAutomations() {
  try {
    localStorage.setItem('climate_pro_automations', JSON.stringify(automationRules));
  } catch (e) {}

  try {
    await fetch('/api/automations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rules: automationRules })
    });
  } catch (err) {
    console.warn("Sauvegarde automations en mode simulation locale.");
  }
}

/**
 * Génère le tableau des règles d'automatisation
 */
function renderAutomationTable() {
  const tbody = document.getElementById('automation-table-body');
  if (!tbody) return;

  if (!devicesList || devicesList.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; color:var(--text-muted); padding:30px;">Aucun équipement configuré. Ajoutez d'abord vos capteurs et actionneurs dans l'onglet Matériel.</td></tr>`;
    return;
  }

  if (automationRules.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; color:var(--text-muted); padding:30px;">Aucune règle d'automatisation. Cliquez sur "+ Ajouter une règle" pour créer un premier scénario.</td></tr>`;
    return;
  }

  const actuators = devicesList.filter(d => d.category === 'ACTUATOR');
  const targetCandidates = actuators.length > 0 ? actuators : devicesList;

  tbody.innerHTML = automationRules.map(rule => {
    // 1. Équipement source (déclencheur)
    let triggerDev = devicesList.find(d => d.id === rule.triggerId);
    if (!triggerDev) {
      triggerDev = devicesList[0];
      rule.triggerId = triggerDev.id;
    }

    // 2. Équipement cible (actionneur)
    let targetDev = devicesList.find(d => d.id === rule.targetId);
    if (!targetDev) {
      targetDev = targetCandidates[0];
      rule.targetId = targetDev.id;
    }

    // 3. Rendu de la condition (colonne 3)
    let conditionHtml = '';
    const isTriggerAnalog = (triggerDev.mode === 'INPUT_ADC' || triggerDev.mode === 'INPUT_ONEWIRE');
    const isTriggerPwm = (triggerDev.mode === 'OUTPUT_PWM');

    if (isTriggerAnalog || isTriggerPwm) {
      const unit = (triggerDev.mode === 'INPUT_ADC') ? 'V' : ((triggerDev.mode === 'INPUT_ONEWIRE') ? '°C' : '%');
      const step = (triggerDev.mode === 'INPUT_ADC') ? '0.1' : '1';
      const op = rule.operator || '>';
      const thresh = (rule.threshold !== undefined) ? rule.threshold : (triggerDev.mode === 'INPUT_ADC' ? 2.5 : 50);

      conditionHtml = `
        <div class="rule-inline-group">
          <select class="rule-select-op" onchange="onRuleOperatorChange(${rule.id}, this.value)">
            <option value="<" ${op === '<' ? 'selected' : ''}>&lt;</option>
            <option value=">" ${op !== '<' ? 'selected' : ''}>&gt;</option>
          </select>
          <input type="number" step="${step}" class="rule-input-num" value="${thresh}" onchange="onRuleThresholdChange(${rule.id}, this.value)">
          <span class="rule-unit">${unit}</span>
        </div>
      `;
    } else {
      // Tout ou Rien (Relais ou Contact sec / SENSOR digital)
      const val = rule.conditionValue || 'ON';
      conditionHtml = `
        <select class="rule-select" onchange="onRuleConditionValueChange(${rule.id}, this.value)">
          <option value="ON" ${val === 'ON' ? 'selected' : ''}>ON</option>
          <option value="OFF" ${val === 'OFF' ? 'selected' : ''}>OFF</option>
        </select>
      `;
    }

    // 4. Rendu de l'action (colonne 6)
    let actionHtml = '';
    const isTargetPwm = (targetDev.mode === 'OUTPUT_PWM');

    if (isTargetPwm) {
      const pct = (rule.actionPercent !== undefined) ? rule.actionPercent : 100;
      actionHtml = `
        <div class="rule-inline-group">
          <input type="number" min="0" max="100" class="rule-input-num" placeholder="0-100" value="${pct}" onchange="onRuleActionPercentChange(${rule.id}, this.value)">
          <span class="rule-unit">%</span>
        </div>
      `;
    } else {
      const actVal = rule.actionValue || 'ON';
      actionHtml = `
        <select class="rule-select" onchange="onRuleActionValueChange(${rule.id}, this.value)">
          <option value="ON" ${actVal === 'ON' ? 'selected' : ''}>ON</option>
          <option value="OFF" ${actVal === 'OFF' ? 'selected' : ''}>OFF</option>
        </select>
      `;
    }

    // Options pour la liste déroulante déclencheur
    const triggerOptions = devicesList.map(d => {
      const typeLabel = (d.category === 'SENSOR') ? 'Capteur' : 'Actionneur';
      return `<option value="${d.id}" ${d.id === triggerDev.id ? 'selected' : ''}>${escapeHtml(d.name)} (${typeLabel})</option>`;
    }).join('');

    // Options pour la liste déroulante cible
    const targetOptions = targetCandidates.map(d => {
      const typeLabel = (d.mode === 'OUTPUT_PWM') ? 'Variateur PWM' : 'Relais';
      return `<option value="${d.id}" ${d.id === targetDev.id ? 'selected' : ''}>${escapeHtml(d.name)} (${typeLabel})</option>`;
    }).join('');

    return `
      <tr>
        <td class="col-center"><span class="badge-cond-si">SI</span></td>
        <td>
          <select class="rule-select" onchange="onRuleTriggerChange(${rule.id}, this.value)">
            ${triggerOptions}
          </select>
        </td>
        <td>${conditionHtml}</td>
        <td class="col-center"><span class="badge-action-alors">ALORS</span></td>
        <td>
          <select class="rule-select" onchange="onRuleTargetChange(${rule.id}, this.value)">
            ${targetOptions}
          </select>
        </td>
        <td>${actionHtml}</td>
        <td class="col-center">
          <label class="toggle-switch" style="transform: scale(0.8); margin: 0 auto;">
            <input type="checkbox" ${rule.enabled ? 'checked' : ''} onchange="toggleRuleActive(${rule.id}, this.checked)">
            <span class="slider"></span>
          </label>
        </td>
        <td class="col-right">
          <button class="action-btn delete-btn" title="Supprimer cette règle" onclick="deleteAutomationRule(${rule.id})">
            <svg viewBox="0 0 24 24"><path d="M19,4H15.5L14.5,3H9.5L8.5,4H5V6H19M6,19A2,2 0 0,0 8,21H16A2,2 0 0,0 18,19V7H6V19Z"/></svg>
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

/**
 * Ajoute une nouvelle règle avec des valeurs par défaut adaptées
 */
function addAutomationRule() {
  if (!devicesList || devicesList.length === 0) {
    showToast("Ajoutez d'abord des équipements dans l'onglet Matériel.", "warning");
    return;
  }

  const newId = (automationRules.length > 0 ? Math.max(...automationRules.map(r => r.id)) + 1 : 1);
  const firstSensor = devicesList.find(d => d.category === 'SENSOR') || devicesList[0];
  const actuators = devicesList.filter(d => d.category === 'ACTUATOR');
  const firstActuator = actuators.length > 0 ? actuators[0] : devicesList[0];

  automationRules.push({
    id: newId,
    enabled: true,
    triggerId: firstSensor.id,
    conditionValue: 'ON',
    operator: '>',
    threshold: (firstSensor.mode === 'INPUT_ADC' ? 2.5 : 50),
    targetId: firstActuator.id,
    actionValue: 'ON',
    actionPercent: 100
  });

  saveAutomations();
  renderAutomationTable();
  showToast("Nouvelle règle d'automatisation ajoutée.", "info");
}

/**
 * Supprime une règle d'automatisation
 */
function deleteAutomationRule(id) {
  automationRules = automationRules.filter(r => r.id !== id);
  saveAutomations();
  renderAutomationTable();
  showToast("Règle supprimée.", "info");
}

/**
 * Gestionnaire de changement de l'équipement déclencheur
 */
function onRuleTriggerChange(ruleId, newDevId) {
  const rule = automationRules.find(r => r.id === ruleId);
  if (!rule) return;
  rule.triggerId = parseInt(newDevId, 10);
  const dev = devicesList.find(d => d.id === rule.triggerId);
  if (dev) {
    if (dev.mode === 'INPUT_ADC') {
      rule.threshold = 2.5;
      rule.operator = '>';
    } else if (dev.mode === 'OUTPUT_PWM') {
      rule.threshold = 50;
      rule.operator = '>';
    } else {
      rule.conditionValue = 'ON';
    }
  }
  saveAutomations();
  renderAutomationTable();
}

function onRuleConditionValueChange(ruleId, val) {
  const rule = automationRules.find(r => r.id === ruleId);
  if (rule) {
    rule.conditionValue = val;
    saveAutomations();
  }
}

function onRuleOperatorChange(ruleId, op) {
  const rule = automationRules.find(r => r.id === ruleId);
  if (rule) {
    rule.operator = op;
    saveAutomations();
  }
}

function onRuleThresholdChange(ruleId, val) {
  const rule = automationRules.find(r => r.id === ruleId);
  if (rule) {
    rule.threshold = parseFloat(val) || 0;
    saveAutomations();
  }
}

/**
 * Gestionnaire de changement de l'équipement cible
 */
function onRuleTargetChange(ruleId, newDevId) {
  const rule = automationRules.find(r => r.id === ruleId);
  if (!rule) return;
  rule.targetId = parseInt(newDevId, 10);
  const dev = devicesList.find(d => d.id === rule.targetId);
  if (dev && dev.mode === 'OUTPUT_PWM') {
    rule.actionPercent = 100;
  } else {
    rule.actionValue = 'ON';
  }
  saveAutomations();
  renderAutomationTable();
}

function onRuleActionValueChange(ruleId, val) {
  const rule = automationRules.find(r => r.id === ruleId);
  if (rule) {
    rule.actionValue = val;
    saveAutomations();
  }
}

function onRuleActionPercentChange(ruleId, val) {
  const rule = automationRules.find(r => r.id === ruleId);
  if (rule) {
    let pct = parseInt(val, 10);
    if (isNaN(pct)) pct = 0;
    if (pct < 0) pct = 0;
    if (pct > 100) pct = 100;
    rule.actionPercent = pct;
    saveAutomations();
  }
}

function toggleRuleActive(ruleId, isChecked) {
  const rule = automationRules.find(r => r.id === ruleId);
  if (rule) {
    rule.enabled = isChecked;
    saveAutomations();
    showToast(`Règle ${isChecked ? 'activée' : 'désactivée'}.`, 'info');
  }
}

/**
 * Évalue les règles d'automatisation actives
 */
function evaluateAutomations() {
  if (!automationRules || automationRules.length === 0 || !devicesList || devicesList.length === 0) return;

  automationRules.forEach(rule => {
    if (!rule.enabled) return;

    const triggerDev = devicesList.find(d => d.id === rule.triggerId);
    const targetDev = devicesList.find(d => d.id === rule.targetId);
    if (!triggerDev || !targetDev) return;

    let isTriggered = false;

    if (triggerDev.mode === 'INPUT_ADC') {
      const curVolts = (triggerDev.value / 4095) * 3.3;
      const thresh = (rule.threshold !== undefined) ? rule.threshold : 2.5;
      if (rule.operator === '<') isTriggered = (curVolts < thresh);
      else isTriggered = (curVolts > thresh);
    } else if (triggerDev.mode === 'OUTPUT_PWM') {
      const curPct = Math.round((triggerDev.value / 255) * 100);
      const thresh = (rule.threshold !== undefined) ? rule.threshold : 50;
      if (rule.operator === '<') isTriggered = (curPct < thresh);
      else isTriggered = (curPct > thresh);
    } else {
      // Tout ou rien : ON = 1, OFF = 0
      const targetState = (rule.conditionValue === 'ON') ? 1 : 0;
      isTriggered = (triggerDev.state === targetState);
    }

    if (isTriggered) {
      if (targetDev.mode === 'OUTPUT_PWM') {
        const desiredPct = (rule.actionPercent !== undefined) ? rule.actionPercent : 100;
        const desiredRaw = Math.round((desiredPct / 100) * 255);
        if (targetDev.value !== desiredRaw) {
          targetDev.value = desiredRaw;
          targetDev.state = (desiredRaw > 0) ? 1 : 0;
          updateAuxPwm(targetDev.id, desiredPct);
        }
      } else {
        const desiredState = (rule.actionValue === 'ON') ? 1 : 0;
        if (targetDev.state !== desiredState) {
          targetDev.state = desiredState;
          toggleAuxDevice(targetDev.id, desiredState === 1);
        }
      }
    }
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
  if (chartsInitialized) return;
  if (typeof Chart === 'undefined') {
    console.warn("Chart.js non disponible (mode hors ligne / AP Wi-Fi sans accès Internet).");
    return;
  }
  
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
        try { evaluateAutomations(); } catch (e) {}
      })
      .catch(err => {
        if (systemOn && targetEnabled && currentRoomTemp > targetTemp) {
            currentRoomTemp -= 0.1;
            document.getElementById('v_t_amb').innerText = currentRoomTemp.toFixed(1) + '°';
            updateRing(); 
        }
        try { evaluateAutomations(); } catch (e) {}
      });
  }, 2000);
}
