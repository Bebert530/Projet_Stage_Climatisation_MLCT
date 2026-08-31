<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Climate Pro - OS</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <style>
    :root { 
      --bg-main: #0b1120;
      --bg-surface: #151e32;
      --border-color: #2a3441;
      --text-main: #f8fafc; 
      --text-muted: #8b98a5; 
      --cyan-light: #2dd4bf;
      --cyan-dark: #0ea5e9;
      --orange-alert: #fb923c;
      --danger: #ef4444;
      --success: #10b981; 
    }
    
    * { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
    body { background-color: var(--bg-main); color: var(--text-main); margin: 0; padding: 0; height: 100vh; display: flex; flex-direction: column; overflow: hidden; }
    
    /* --- LOGIN & TABS --- */
    #login-screen { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; width: 100vw; background: var(--bg-main); position: absolute; z-index: 100; }
    .login-box { background: var(--bg-surface); padding: 40px; border-radius: 15px; width: 90%; max-width: 350px; text-align: center; border: 1px solid var(--border-color); }
    .login-box h2 { color: var(--cyan-light); margin-top: 0; margin-bottom: 25px; letter-spacing: 2px;}
    .input-group { margin-bottom: 15px; text-align: left; }
    .input-group label { display: block; font-size: 12px; color: var(--text-muted); margin-bottom: 5px; text-transform: uppercase; }
    .input-group input { width: 100%; padding: 12px; border-radius: 8px; border: none; background: var(--bg-main); color: white; outline: none; }
    .login-btn { width: 100%; padding: 122px; background: linear-gradient(90deg, var(--cyan-light), var(--cyan-dark)); color: #000; font-weight: bold; font-size: 16px; border: none; border-radius: 8px; cursor: pointer; margin-top: 10px;}
    .error-msg { color: var(--danger); font-size: 13px; margin-top: 10px; display: none; }

    .alert-banner { display: none; background: rgba(239, 68, 68, 0.2); border-bottom: 2px solid var(--danger); color: white; padding: 15px; text-align: center; font-weight: bold; z-index: 50; width: 100%; }

    #app-screen { display: none; height: 100vh; width: 100vw; flex-direction: column; }
    .sidebar { background: var(--bg-surface); display: flex; justify-content: space-around; padding: 10px; border-top: 1px solid var(--border-color); z-index: 10;}
    .nav-btn { background: none; border: none; color: var(--text-muted); padding: 10px; border-radius: 8px; cursor: pointer; display: flex; flex-direction: column; align-items: center; font-size: 12px; font-weight: 600; flex: 1;}
    .nav-btn.active { color: var(--cyan-light); }
    .nav-icon { font-size: 20px; margin-bottom: 4px; }
    
    .main-content { flex: 1; overflow-y: auto; padding: 20px; }
    .view { display: none; width: 100%; max-width: 1000px; margin: 0 auto; }
    .view.active { display: block; }
    
    .section-title { font-size: 14px; font-weight: bold; color: var(--text-muted); text-transform: uppercase; margin: 30px 0 15px 0; border-bottom: 1px solid var(--border-color); padding-bottom: 5px; }

    /* --- BARRE DES MODES --- */
    .mode-bar { display: flex; gap: 12px; margin-bottom: 30px; overflow-x: auto; padding-bottom: 5px; scrollbar-width: none; }
    .mode-btn { background: var(--bg-surface); border: 1px solid var(--border-color); color: var(--text-muted); border-radius: 25px; padding: 10px 20px; font-size: 12px; font-weight: 700; display: flex; align-items: center; gap: 8px; cursor: pointer; white-space: nowrap; transition: 0.2s; }
    .mode-btn svg { width: 14px; height: 14px; fill: currentColor; }
    .mode-btn.active { background: linear-gradient(90deg, #34d399, #38bdf8); color: #020617; border: none; box-shadow: 0 0 15px rgba(56, 189, 248, 0.2); }
    .mode-btn.manual.active { background: linear-gradient(90deg, #fb923c, #f59e0b); box-shadow: 0 0 15px rgba(245, 158, 11, 0.2); }

    /* --- GRILLE PRINCIPALE --- */
    .dashboard-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 25px; align-items: start; }

    /* --- CADRAN THERMOSTAT & BOUTON POWER --- */
    .dial-wrapper { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; }
    .dial-outer {
      width: 280px; height: 280px; border-radius: 50%;
      display: flex; justify-content: center; align-items: center; position: relative;
      cursor: pointer; transition: all 0.5s ease;
    }
    
    /* Le dégradé dynamique sera appliqué via JavaScript. Par défaut c'est OFF */
    .dial-outer.off { background: conic-gradient(from -90deg, #475569 0%, #334155 35%, #1e293b 35%, #1e293b 100%); box-shadow: -5px 10px 25px rgba(0,0,0,0.3); }
    .dial-outer.on { box-shadow: -5px 10px 25px rgba(14, 165, 233, 0.15); }
    
    .dial-inner { width: 240px; height: 240px; background-color: var(--bg-main); border-radius: 50%; display: flex; flex-direction: column; justify-content: center; align-items: center; z-index: 2; }
    
    .temp-controls { display: flex; align-items: center; gap: 20px; }
    .temp-btn { width: 36px; height: 36px; border-radius: 50%; background: var(--bg-surface); border: 1px solid var(--border-color); color: var(--text-main); font-size: 20px; font-weight: 300; cursor: pointer; display: flex; align-items: center; justify-content: center; z-index: 10; transition: 0.2s;}
    .temp-btn:hover { background: var(--border-color); }
    .temp-value { font-size: 48px; font-weight: 700; letter-spacing: -1px; margin: 0; }
    
    .status-container { display: flex; align-items: center; gap: 6px; margin-top: 15px; }
    .status-dot { width: 8px; height: 8px; border-radius: 50%; transition: 0.3s;}
    .status-text { font-size: 13px; font-weight: 500; transition: 0.3s;}
    
    .status-dot.on { background: var(--cyan-light); box-shadow: 0 0 8px var(--cyan-light);}
    .status-text.on { color: var(--cyan-light); }
    .status-dot.off { background: var(--text-muted); }
    .status-text.off { color: var(--text-muted); }

    /* Texte sous l'anneau pour le temps estimé */
    .dial-time-est { color: var(--cyan-light); font-size: 13px; font-weight: 600; margin-top: 25px; letter-spacing: 1px;}
    .dial-time-est.off { color: var(--text-muted); }

    /* --- CARTES DE DROITE --- */
    .cards-column { display: flex; flex-direction: column; gap: 20px; }
    .ui-card { background: var(--bg-surface); border: 1px solid var(--border-color); border-radius: 20px; padding: 25px; }
    .card-header { display: flex; align-items: center; gap: 10px; color: var(--text-muted); font-size: 11px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; margin-bottom: 15px; }
    .card-header svg { width: 14px; height: 14px; fill: currentColor; }

    .room-temp-val { font-size: 32px; font-weight: 700; }
    
    .timer-top-row { display: flex; justify-content: space-between; align-items: center; }
    .timer-val { font-size: 28px; font-weight: 700; }
    .timer-sub { color: var(--text-muted); font-size: 13px; margin-top: 5px; margin-bottom: 25px; }
    
    .presets-row { display: flex; gap: 10px; flex-wrap: wrap; }
    .preset-btn { background: transparent; border: 1px solid var(--border-color); color: var(--text-muted); border-radius: 8px; padding: 6px 14px; font-size: 12px; font-weight: 600; cursor: pointer; transition: 0.2s; }
    .preset-btn.active { color: var(--cyan-light); border-color: var(--cyan-light); }

    .timer-custom-inputs { display: none; align-items: center; gap: 5px; margin-top: 15px; }
    .timer-custom-inputs.active { display: flex; }
    .timer-custom-inputs input { width: 50px; background: var(--bg-main); border: 1px solid var(--border-color); color: white; padding: 8px; border-radius: 5px; text-align: center; font-weight: bold; }

    .toggle-switch { position: relative; display: inline-block; width: 50px; height: 28px; }
    .toggle-switch input { opacity: 0; width: 0; height: 0; }
    .slider { position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: var(--border-color); transition: .4s; border-radius: 30px; }
    .slider:before { position: absolute; content: ""; height: 20px; width: 20px; left: 4px; bottom: 4px; background-color: white; transition: .4s; border-radius: 50%; }
    input:checked + .slider { background-color: var(--cyan-dark); }
    input:checked + .slider:before { transform: translateX(22px); }

    /* --- TÉLÉMÉTRIE AVANCÉE --- */
    .telemetry-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-top: 15px; }
    .mini-card { background: var(--bg-surface); border: 1px solid var(--border-color); border-radius: 15px; padding: 15px; }
    .mini-card.full { grid-column: span 2; }
    .mini-label { font-size: 10px; color: var(--text-muted); font-weight: 600; text-transform: uppercase; margin-bottom: 5px; }
    .mini-val { font-size: 20px; font-weight: 700; }

    #manual-slider-container { display: none; background: var(--bg-surface); border-radius: 15px; padding: 15px; margin-bottom: 25px; align-items: center; gap: 15px; border: 1px solid var(--orange-alert); }
    #manual-slider-container.active { display: flex; }
    input[type="range"] { -webkit-appearance: none; background: transparent; flex: 1; }
    input[type="range"]::-webkit-slider-runnable-track { width: 100%; height: 6px; background: var(--border-color); border-radius: 3px; }
    input[type="range"]::-webkit-slider-thumb { -webkit-appearance: none; height: 16px; width: 16px; border-radius: 50%; background: var(--orange-alert); margin-top: -5px; cursor: pointer; }
    .btn-auto { background: var(--border-color); color: white; border: none; padding: 10px 15px; border-radius: 8px; cursor: pointer; font-size: 12px; font-weight: bold; transition: 0.2s; }

    canvas { width: 100% !important; height: 200px !important; margin-top: 10px; }

    .settings-row { display: flex; justify-content: space-between; align-items: center; padding: 12px 0; border-bottom: 1px solid var(--border-color); }
    .settings-row:last-child { border-bottom: none; }
    .settings-btn { padding: 8px 15px; border-radius: 8px; border: none; font-weight: bold; cursor: pointer; }
    .btn-outline { background: transparent; border: 1px solid var(--cyan-light); color: var(--cyan-light); }
    .btn-danger { background: rgba(239, 68, 68, 0.1); color: var(--danger); border: 1px solid var(--danger); }
    select { background: var(--bg-main); color: white; border: 1px solid var(--border-color); padding: 5px; border-radius: 5px; }

    /* Responsive */
    @media (min-width: 768px) {
      #app-screen { flex-direction: row; }
      .sidebar { flex-direction: column; justify-content: flex-start; width: 200px; border-top: none; border-right: 1px solid var(--border-color); padding: 20px 10px;}
      .nav-btn { flex-direction: row; font-size: 14px; padding: 15px; margin-bottom: 5px; flex: none;}
      .nav-icon { margin-bottom: 0; margin-right: 15px; }
      .telemetry-grid { grid-template-columns: repeat(4, 1fr); }
      .mini-card.full { grid-column: span 4; }
    }
    @media (max-width: 767px) {
      .dashboard-grid { grid-template-columns: 1fr; gap: 30px; }
    }
  </style>
</head>
<body>
  
  <!-- LOGIN -->
  <div id="login-screen">
    <div class="login-box">
      <h2>PoC ACCESS</h2>
      <div class="input-group">
        <label>Identifiant</label>
        <input type="text" id="username" value="admin">
      </div>
      <div class="input-group">
        <label>Mot de passe</label>
        <input type="password" id="password" value="admin">
      </div>
      <button class="login-btn" onclick="checkLogin()">SE CONNECTER</button>
      <div class="error-msg" id="login-error">Identifiants incorrects.</div>
    </div>
  </div>

  <!-- APPLICATION -->
  <div id="app-screen">
    <div class="alert-banner" id="watchdog-banner">
      ⚠️ ALERTE: Perte de capteur. Coupure de sécurité dans <span id="watchdog-timer">30</span>s...
    </div>

    <nav class="sidebar">
      <button class="nav-btn active" onclick="switchTab('clim', this)"><span class="nav-icon">❄️</span> Climatisation</button>
      <button class="nav-btn" onclick="switchTab('settings', this)"><span class="nav-icon">⚙️</span> Paramètres</button>
      <button class="nav-btn" onclick="switchTab('account', this)"><span class="nav-icon">👤</span> Compte</button>
    </nav>

    <main class="main-content">
      
      <!-- === VUE CLIMATISATION === -->
      <div id="view-clim" class="view active">
        
        <!-- BARRE DES MODES -->
        <div class="mode-bar">
          <button class="mode-btn" onclick="setMode('eco+', this)">
            <svg viewBox="0 0 24 24"><path d="M12,2L12,5M12,19L12,22M22,12L19,12M5,12L2,12M19.07,4.93L16.95,7.05M7.05,16.95L4.93,19.07M19.07,19.07L16.95,16.95M7.05,7.05L4.93,4.93M12,7A5,5 0 0,0 7,12A5,5 0 0,0 12,17A5,5 0 0,0 17,12A5,5 0 0,0 12,7Z"/></svg> ÉCO+
          </button>
          <button class="mode-btn" onclick="setMode('eco', this)">
            <svg viewBox="0 0 24 24"><path d="M12,2L12,5M12,19L12,22M22,12L19,12M5,12L2,12M19.07,4.93L16.95,7.05M7.05,16.95L4.93,19.07M19.07,19.07L16.95,16.95M7.05,7.05L4.93,4.93M12,7A5,5 0 0,0 7,12A5,5 0 0,0 12,17A5,5 0 0,0 17,12A5,5 0 0,0 12,7Z"/></svg> ÉCO
          </button>
          <button class="mode-btn active" id="btn-default-mode" onclick="setMode('normal', this)">
            <svg viewBox="0 0 24 24"><path d="M12,20A6,6 0 0,1 6,14C6,10 12,3.25 12,3.25C12,3.25 18,10 18,14A6,6 0 0,1 12,20Z"/></svg> NORMAL
          </button>
          <button class="mode-btn" onclick="setMode('boost', this)">
            <svg viewBox="0 0 24 24"><path d="M7,2V13H10V22L17,10H13L17,2H7Z"/></svg> BOOST
          </button>
          <button class="mode-btn" onclick="setMode('boost+', this)">
            <svg viewBox="0 0 24 24"><path d="M7,2V13H10V22L17,10H13L17,2H7Z"/></svg> BOOST+
          </button>
          <button class="mode-btn manual" id="btn-manual" onclick="toggleManual()">
            <svg viewBox="0 0 24 24"><path d="M3,17V19H9V17H3M3,5V7H13V5H3M13,21V19H21V17H13V15H11V21H13M7,9V11H3V13H7V15H9V9H7M21,13V11H11V13H21M15,9H17V7H21V5H17V3H15V9Z"/></svg> MANUEL
          </button>
        </div>

        <!-- SLIDER MANUEL (Caché) -->
        <div id="manual-slider-container">
          <div style="font-size: 11px; font-weight: bold; color: var(--text-muted); text-transform: uppercase;">Ventilateur (PWM)</div>
          <input type="range" id="fan-slider" min="0" max="100" value="70" oninput="updateFanSpeed()">
          <span id="fan-val" style="font-weight: bold; width: 45px; text-align: right; color: white;">70%</span>
          <button class="btn-auto" onclick="returnToAuto()">AUTO</button>
        </div>

        <!-- GRILLE DASHBOARD (Cadran + Cartes) -->
        <div class="dashboard-grid">
          
          <!-- LE CADRAN (INTERRUPTEUR POWER) -->
          <div class="dial-wrapper">
            <div class="dial-outer off" id="main-dial" onclick="togglePower(event)">
              <div class="dial-inner">
                <div class="temp-controls">
                  <!-- L'event propagation est bloquée ici pour ne pas déclencher le ON/OFF -->
                  <button class="temp-btn" onclick="changeTemp(-0.5, event)">-</button>
                  <div class="temp-value" id="target_temp">21.0°</div>
                  <button class="temp-btn" onclick="changeTemp(0.5, event)">+</button>
                </div>
                <div class="status-container">
                  <div class="status-dot off" id="status-dot"></div>
                  <div class="status-text off" id="status-text">OFF</div>
                </div>
              </div>
            </div>
            <!-- L'affichage du temps estimé qui remplace les anciennes limites -->
            <div class="dial-time-est off" id="dial-time-est">Système en veille</div>
          </div>

          <!-- COLONNE DROITE (CARTES) -->
          <div class="cards-column">
            
            <div class="ui-card">
              <div class="card-header">
                <svg viewBox="0 0 24 24"><path d="M15,13V5A3,3 0 0,0 9,5V13A5,5 0 1,0 15,13M12,4A1,1 0 0,1 13,5V8H11V5A1,1 0 0,1 12,4Z"/></svg>
                TEMPÉRATURE DE LA PIÈCE
              </div>
              <div class="room-temp-val" id="v_t_amb">23.4°</div>
            </div>

            <div class="ui-card">
              <div class="card-header">
                <svg viewBox="0 0 24 24"><path d="M12,20A8,8 0 0,0 20,12A8,8 0 0,0 12,4A8,8 0 0,0 4,12A8,8 0 0,0 12,20M12,2A10,10 0 0,1 22,12A10,10 0 0,1 12,22C6.47,22 2,17.5 2,12A10,10 0 0,1 12,2M12.5,7V12.25L17,14.92L16.25,16.15L11,13V7H12.5Z"/></svg>
                PROGRAMMATEUR
              </div>
              <div class="timer-top-row">
                <div class="timer-val" id="timer-display">--h --m</div>
                <label class="toggle-switch">
                  <input type="checkbox" id="timer-toggle">
                  <span class="slider"></span>
                </label>
              </div>
              <div class="timer-sub">Gère l'arrêt automatique</div>
              
              <div class="presets-row">
                <button class="preset-btn" onclick="setPreset('30m', this)">30m</button>
                <button class="preset-btn" onclick="setPreset('1h', this)">1h</button>
                <button class="preset-btn" onclick="setPreset('2h', this)">2h</button>
                <button class="preset-btn" onclick="setPreset('perso', this)">Perso</button>
              </div>

              <div class="timer-custom-inputs" id="timer-inputs">
                <input type="number" id="t-hours" min="0" max="24" value="0"> h 
                <input type="number" id="t-mins" min="0" max="59" value="0"> m
                <button class="btn-outline" style="padding: 6px; font-size: 11px;" onclick="applyCustomTimer()">OK</button>
              </div>
            </div>

          </div>
        </div>
        
        <!-- === SECTION TÉLÉMÉTRIE === -->
        <div class="section-title">Télémétrie & Données (R&D)</div>
        <div class="telemetry-grid">
          <div class="mini-card"><div class="mini-label">Circuit d'eau</div><div class="mini-val" id="t_water">12.0°</div></div>
          <div class="mini-card"><div class="mini-label">Puissance instantanée</div><div class="mini-val" id="v_power" style="color: var(--orange-alert);">-- W</div></div>
          <div class="mini-card full"><div class="mini-label">Énergie totale cumulée</div><div class="mini-val" id="v_energy" style="color: #a78bfa;">-- Wh</div></div>
          
          <div class="mini-card full">
            <div class="mini-label">Courbe Thermique</div>
            <canvas id="tempChart"></canvas>
          </div>
        </div>

      </div>

      <!-- === VUE PARAMÈTRES === -->
      <div id="view-settings" class="view">
        <h2 style="margin-top:0;">Paramètres Système</h2>
        <div class="telemetry-grid">
          <div class="mini-card full" style="display:flex; justify-content: space-between; align-items:center;">
            <div>
              <div style="font-weight:bold;">Hystérésis (Régulation)</div>
              <div style="font-size:12px; color:var(--text-muted)">Écart de température avant déclenchement</div>
            </div>
            <div style="display: flex; align-items: center; gap: 10px;">
              <button class="temp-btn" style="width:30px; height:30px; font-size:16px;" onclick="changeHyst(-0.1)">-</button>
              <div id="target_hyst" style="font-weight:bold; font-size:16px;">±0.5°</div>
              <button class="temp-btn" style="width:30px; height:30px; font-size:16px;" onclick="changeHyst(0.1)">+</button>
            </div>
          </div>
          <div class="mini-card full">
            <div class="settings-row"><span style="font-size: 14px;">Réseau Wi-Fi</span><span style="color: var(--text-muted); font-size: 14px;">Prototype_Clim</span></div>
            <div class="settings-row"><span style="font-size: 14px;">Adresse IP</span><span style="color: var(--text-muted); font-size: 14px;">192.168.4.1</span></div>
            <div class="settings-row"><span style="font-size: 14px;">Sondes DS18B20</span><span style="color: var(--success); font-weight: bold; font-size: 14px;">OK (5/5)</span></div>
          </div>
          <div class="mini-card full">
            <div class="settings-row"><span style="font-size: 14px;">Test Sécurité (Watchdog)</span><button class="settings-btn btn-outline" onclick="triggerWatchdogTest()">Simuler Perte</button></div>
            <div class="settings-row"><span style="font-size: 14px;">Redémarrage</span><button class="settings-btn btn-danger" onclick="alert('Redémarrage...')">Reboot ESP32</button></div>
          </div>
        </div>
      </div>

      <!-- === VUE COMPTE === -->
      <div id="view-account" class="view">
        <h2 style="margin-top:0;">Gestion du Compte</h2>
        <div class="mini-card full">
          <div style="margin-top: 10px; font-size: 14px; color: var(--text-muted); line-height: 1.6;">
            Niveau d'accès : <strong style="color:white;">Root (R&D)</strong><br>
            Dernière connexion : Aujourd'hui<br>
            Enregistrement Data : Actif (LittleFS)
          </div>
          <button style="width:100%; margin-top: 20px; padding: 12px; background: var(--bg-surface); color: var(--danger); border: 1px solid var(--danger); border-radius: 8px; font-weight:bold; cursor: pointer;" onclick="logout()">Se déconnecter</button>
        </div>
      </div>

    </main>
  </div>

  <script>
    // --- VARIABLES GLOBALES ---
    let systemOn = false;
    let targetTemp = 21.0;
    let currentRoomTemp = 23.4; // Température de base
    let startTemp = null; // Enregistre la température de la pièce au moment d'allumer
    let estimatedTime = "45"; // Sera mis à jour par l'ESP32

    // --- AUTHENTIFICATION ---
    function checkLogin() {
      if(document.getElementById('username').value === 'admin' && document.getElementById('password').value === 'admin') {
        document.getElementById('login-screen').style.display = 'none';
        document.getElementById('app-screen').style.display = 'flex';
        initChart(); 
        startTelemetry();
      } else { document.getElementById('login-error').style.display = 'block'; }
    }
    function logout() { location.reload(); }

    function switchTab(tabId, btn) {
      document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
      document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
      document.getElementById('view-' + tabId).classList.add('active');
      btn.classList.add('active');
    }

    // --- MISE À JOUR DE L'ANNEAU DYNAMIQUE ---
    function updateRing() {
      const dial = document.getElementById('main-dial');
      const timeEstDisplay = document.getElementById('dial-time-est');
      
      if (!systemOn || startTemp === null) {
        dial.style.background = ''; // Revient au CSS par défaut (Gris)
        timeEstDisplay.innerText = "Système en veille";
        timeEstDisplay.classList.add('off');
        return;
      }

      timeEstDisplay.classList.remove('off');
      timeEstDisplay.innerText = estimatedTime + " min estimées";

      // Calcul de la progression du refroidissement
      let progress = 0;
      if (startTemp > targetTemp) { // Mode refroidissement
        progress = ((startTemp - currentRoomTemp) / (startTemp - targetTemp)) * 100;
      }

      // Limites pour s'assurer que le cadran a du sens visuellement
      if (progress < 5) progress = 5; // Minimum visible pour montrer que c'est allumé
      if (progress > 100) progress = 100;
      if (isNaN(progress)) progress = 0;

      // Met à jour le dégradé en temps réel
      dial.style.background = `conic-gradient(from -90deg, #2dd4bf 0%, #0ea5e9 ${progress}%, #1e293b ${progress}%, #1e293b 100%)`;
    }

    // --- LE CADRAN (POWER & TEMPÉRATURE) ---
    function togglePower(e) {
      // Bloque l'action si on a cliqué sur un bouton + ou - 
      if(e.target.tagName === 'BUTTON') return;
      
      systemOn = !systemOn;
      const dial = document.getElementById('main-dial');
      const dot = document.getElementById('status-dot');
      const text = document.getElementById('status-text');
      
      if(systemOn) {
        startTemp = currentRoomTemp; // On fige la température de départ
        dial.classList.remove('off'); dial.classList.add('on');
        dot.classList.remove('off'); dot.classList.add('on');
        text.classList.remove('off'); text.classList.add('on');
        text.innerText = 'ON';
      } else {
        startTemp = null;
        dial.classList.remove('on'); dial.classList.add('off');
        dot.classList.remove('on'); dot.classList.add('off');
        text.classList.remove('on'); text.classList.add('off');
        text.innerText = 'OFF';
      }
      
      updateRing(); // Actualise l'anneau visuel
      fetch('/action?power=' + (systemOn ? '1' : '0')).catch(() => {});
    }

    function changeTemp(change, e) {
      e.stopPropagation(); 
      targetTemp += change;
      if (targetTemp < 16.0) targetTemp = 16.0;
      if (targetTemp > 30.0) targetTemp = 30.0;
      
      document.getElementById('target_temp').innerText = targetTemp.toFixed(1) + '°';
      updateRing(); // Recalcule la progression si on change la cible
      fetch('/action?temp=' + targetTemp.toFixed(1)).catch(() => {});
    }

    // --- BARRE DES MODES & PWM ---
    function setMode(mode, btnElement) {
      document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
      btnElement.classList.add('active');
      document.getElementById('manual-slider-container').classList.remove('active');
      
      let speed = 60;
      if(mode === 'eco+') speed = 15;
      if(mode === 'eco') speed = 30;
      if(mode === 'normal') speed = 60;
      if(mode === 'boost') speed = 85;
      if(mode === 'boost+') speed = 100;
      
      document.getElementById('fan-slider').value = speed;
      document.getElementById('fan-val').innerText = speed + '%';
      
      fetch('/action?fan=' + speed).catch(() => {});
    }

    function toggleManual() {
      document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
      document.getElementById('btn-manual').classList.add('active');
      document.getElementById('manual-slider-container').classList.add('active');
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

    // --- PROGRAMMATEUR ---
    function setPreset(time, btn) {
      document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      
      const inputs = document.getElementById('timer-inputs');
      const display = document.getElementById('timer-display');
      const toggle = document.getElementById('timer-toggle');
      
      if(time === 'perso') {
        inputs.classList.add('active');
      } else {
        inputs.classList.remove('active');
        toggle.checked = true;
        if(time === '30m') display.innerText = '0h 30m';
        if(time === '1h') display.innerText = '1h 00m';
        if(time === '2h') display.innerText = '2h 00m';
      }
    }
    
    function applyCustomTimer() {
      const h = document.getElementById('t-hours').value;
      const m = document.getElementById('t-mins').value;
      document.getElementById('timer-display').innerText = h + 'h ' + m + 'm';
      document.getElementById('timer-toggle').checked = true;
    }

    // --- PARAMÈTRES (Hystérésis & Watchdog) ---
    let hyst = 0.5;
    function changeHyst(val) { 
      hyst += val; if(hyst < 0.1) hyst = 0.1; 
      document.getElementById('target_hyst').innerText = '±' + hyst.toFixed(1) + '°'; 
    }

    let watchdogInterval, watchdogCount = 30;
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
          document.getElementById('watchdog-banner').innerHTML = '🚨 COUPURE SÉCURITÉ ACTIVÉE.';
          if(systemOn) {
            const fakeEvent = { target: { tagName: 'DIV' } };
            togglePower(fakeEvent);
          }
        }
      }, 1000);
    }

    // --- TÉLÉMÉTRIE & GRAPHIQUE ---
    let chartInitialized = false;
    function initChart() {
      if(chartInitialized) return;
      const ctx = document.getElementById('tempChart').getContext('2d');
      new Chart(ctx, {
        type: 'line',
        data: {
          labels: ['0m', '5m', '10m', '15m', '20m', '25m'],
          datasets: [{ label: 'Air (°C)', borderColor: '#2dd4bf', data: [26, 25.5, 24.8, 24.2, 23.5, 22.9] }, 
                     { label: 'Eau (°C)', borderColor: '#0ea5e9', data: [15, 12, 9, 8.5, 7.2, 6.8] }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: '#8b98a5' } } }, scales: { x: { ticks: { color: '#2a3441' }, grid:{color:'#151e32'} }, y: { ticks: { color: '#2a3441' }, grid:{color:'#151e32'} } } }
      });
      chartInitialized = true;
    }

    function startTelemetry() {
      setInterval(function() {
        fetch('/data')
          .then(response => response.json())
          .then(data => {
            currentRoomTemp = parseFloat(data.t_amb);
            estimatedTime = data.est_time;
            
            document.getElementById('v_t_amb').innerText = currentRoomTemp.toFixed(1) + '°';
            document.getElementById('v_power').innerText = data.power + ' W';
            document.getElementById('v_energy').innerText = data.energy + ' Wh';
            
            updateRing(); // On actualise l'anneau à chaque nouvelle donnée
          })
          .catch(err => {
            console.log("Mode test sans ESP32 activé...");
            // SIMULATION POUR TESTER SANS LA CARTE ESP32 :
            // Fait baisser la température doucement si c'est allumé
            if (systemOn && currentRoomTemp > targetTemp) {
                currentRoomTemp -= 0.1;
                document.getElementById('v_t_amb').innerText = currentRoomTemp.toFixed(1) + '°';
                updateRing(); // Tu vas voir l'anneau se remplir tout seul sur ton écran !
            }
          });
      }, 2000);
    }
  </script>
</body>
</html>