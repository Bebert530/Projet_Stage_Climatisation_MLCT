/**
 * Climate Pro - OS : Frontend Controller & Device Manager
 * JavaScript natif pour ESP32 WebServer (LittleFS)
 */

// --- VARIABLES GLOBALES CLIMATISATION ---
let systemOn = false;
let targetEnabled = false;
let targetTemp = 21.0;
let currentRoomTemp = null; 
let startTemp = null; 
let estimatedTimeToTarget = "45min";
let estimatedTimeToReady = "1h30";
let isWaterReady = true;
let waterCoolingEnabled = true;
let targetWaterTemp = 8.0;
let hyst = 0.5;
let timerEnabled = false;
let timerDurationSec = 1800; // 30 min par défaut
let timerRemainingSec = 1800;
let localTimerInterval = null;
let watchdogInterval, watchdogCount = 30;
let chartsInitialized = false;

// --- VARIABLES DU GESTIONNAIRE DE MATÉRIEL & SYSTÈMES ---
let devicesList = [];
let systemsList = [];
let pendingSlotBinding = null;
let editingDeviceId = null;
let automationRules = [];

// --- VARIABLES DE L'HISTORIQUE DES CYCLES ---
let cyclesList = [];
let currentCycleStartTime = null;
let currentCycleStartTemp = null;
let currentCycleTargetTemp = null;
let currentCycleMode = 'NORMAL';

// =========================================================================
// SYSTÈME MULTILINGUE (i18n) : FRANÇAIS / ENGLISH / ESPAÑOL
// =========================================================================
let currentLang = 'fr';
try {
  currentLang = localStorage.getItem('climate_pro_lang') || 'fr';
  if (!['fr', 'en', 'es'].includes(currentLang)) currentLang = 'fr';
} catch (e) {
  currentLang = 'fr';
}

const TRANSLATIONS = {
  fr: {
    login_username: "Identifiant",
    login_password: "Mot de passe",
    login_submit: "SE CONNECTER",
    login_error: "Identifiants incorrects.",
    header_connected: "ESP32 Connecté",
    header_connected_ws: "ESP32 Connecté (Temps Réel)",
    header_reconnecting: "ESP32 Reconnexion...",
    anti_cycle_badge: "Protection Compresseur (Anti-court-cycle) :",
    watchdog_alert_prefix: "ALERTE : Perte de communication capteurs. Coupure de sécurité dans",
    watchdog_alert_suffix: "s...",
    nav_clim: "Climatisation",
    nav_devices: "Matériel",
    nav_automation: "Automatisation",
    nav_stats: "Statistiques",
    nav_settings: "Paramètres",
    nav_account: "Compte",
    mode_manual: "MANUEL",
    label_ventilation: "Ventilation",
    ring_est_ready_default: "Temps estimé avant disponibilité : 1h30",
    ring_est_ready_prefix: "Temps estimé avant disponibilité : ",
    ring_chiller_standby: "Refroidissement d'eau (Chiller) en veille",
    ring_chiller_off: "Refroidissement eau COUPÉ (Ventilation seule / Veille)",
    ring_est_target_prefix: "Temps estimé jusqu'à ",
    ring_continuous: "Refroidissement continu actif",
    card_amb_title: "TEMPÉRATURE AMBIANTE",
    card_amb_sub: "Capteur intérieur habitacle",
    card_target_title: "TEMPÉRATURE CIBLE",
    card_target_sub_active: "Thermostat actif",
    card_target_sub_inactive: "Thermostat inactif",
    card_timer_title: "MINUTERIE",
    preset_custom: "Perso",
    btn_history_title: "Historique des cycles",
    stats_title: "Tableau de Bord",
    stats_setpoint_hold: "Maintien de consigne",
    stats_total_energy: "Énergie totale consommée",
    stats_runtime: "Durée de fonctionnement",
    stats_water_temp: "Température boucle d'eau",
    stats_chart_curves: "Courbes thermiques & Consigne",
    stats_chart_modes: "Répartition des modes",
    settings_title: "Paramètres Système",
    settings_chiller_title: "Refroidissement d'eau (Chiller)",
    settings_chiller_sub: "Auto-refroidissement à basse température. Économie batterie van.",
    settings_chiller_sub_off: "Refroidissement eau COUPÉ (Mode stationnement / Économie batterie).",
    settings_water_temp_title: "Consigne d'eau (Chiller)",
    settings_water_temp_sub: "Température cible du bac d'eau froide (2°C à 20°C)",
    target_prefix: "Consigne :",
    settings_hyst_title: "Hystérésis de régulation",
    settings_hyst_sub: "Plage de déclenchement avant réactivation",
    settings_compressor: "Compresseur (Chiller)",
    settings_wifi: "Réseau Wi-Fi (Point d'accès)",
    settings_ip: "Adresse IP",
    settings_probes: "Sondes DS18B20",
    settings_probes_ok: "OK (5/5 connectées)",
    settings_watchdog_test: "Test Watchdog Sécurité",
    settings_btn_simulate: "Simuler Perte",
    settings_reboot: "Redémarrage ESP32",
    settings_btn_reboot: "Redémarrer",
    settings_reboot_msg: "Redémarrage demandé...",
    devices_title: "Gestionnaire de Matériel & Systèmes",
    devices_desc: "Déclarez vos équipements et associez-les aux systèmes applicatifs du van.",
    devices_btn_add: "Ajouter un équipement",
    btn_unified_add: "+ Ajouter",
    modal_unified_title: "Que souhaitez-vous ajouter ?",
    modal_unified_sub: "Choisissez la catégorie de matériel ou de fonction pour votre van",
    choice_sensor_title: "Capteur",
    choice_sensor_desc: "Équipement individuel de mesure : Sonde 1-Wire DS18B20, Sonde température NTC 10k, Capteur analogique 0-3.3V, Flotteur niveau d'eau.",
    choice_actuator_title: "Actionneur",
    choice_actuator_desc: "Équipement individuel de commande : Variateur de vitesse PWM, Relais de puissance 12V/230V, Électrovanne, MOSFET.",
    choice_system_title: "Système Composite",
    choice_system_desc: "Fonction complète et modulaire : Climatisation Réversible / Rafraîchisseur d'air avec association de 4 slots matériels.",
    badge_system: "Système",
    modal_system_title: "Nouveau Système",
    modal_system_sub: "Déclarez une fonction applicative pour votre van",
    label_system_name: "Nom du système",
    label_system_type: "Type de système",
    opt_sys_clim: "Climatisation Réversible / Rafraîchisseur",
    label_system_target: "Consigne par défaut (°C)",
    btn_create_system: "Créer et configurer les slots",
    systems_title: "Systèmes Configurés",
    devices_raw_title: "Équipements Individuels Déclarés",
    system_status_operational: "Opérationnel",
    system_status_incomplete: "Incomplet",
    system_missing_prefix: "Slots obligatoires non raccordés :",
    slot_air_name: "Sonde Température Air",
    slot_air_desc: "1-Wire DS18B20 ou NTC 10k / ADC",
    slot_water_name: "Sonde Température Eau",
    slot_water_desc: "1-Wire DS18B20 ou NTC 10k / ADC",
    slot_fan_name: "Ventilateur / Pulseur",
    slot_fan_desc: "Variateur PWM (0-100%)",
    slot_pump_name: "Pompe de Circulation",
    slot_pump_desc: "Relais Tout-ou-Rien (12V)",
    slot_comp_name: "Compresseur de Froid",
    slot_comp_desc: "Relais Tout-ou-Rien / Contact sec (12V)",
    card_comp_title: "COMPRESSEUR GLACIÈRE",
    comp_status_running: "En marche",
    comp_status_waiting: "Temporisation de sécurité",
    comp_status_off: "Éteint",
    comp_delay_prefix: "Sécurité compresseur : reprise dans",
    comp_mode_auto: "AUTO",
    comp_mode_force_on: "FORCÉ",
    comp_mode_force_off: "COUPÉ",
    toast_comp_mode: "Mode compresseur : {mode}",
    slot_req: "Requis",
    slot_opt: "Optionnel",
    slot_unassigned: "Non assigné",
    slot_select_placeholder: "-- Sélectionner un équipement --",
    btn_assign: "Assigner",
    btn_wire_assign: "⚡ Assigner & Câbler",
    btn_unbind: "Détacher",
    clim_incomplete_title: "Système Climatisation Incomplet",
    clim_incomplete_desc: "Pour démarrer la régulation thermique autonome, tous les équipements obligatoires du système doivent être pourvus et raccordés.",
    btn_configure_hardware: "Configurer et câbler dans Matériel",
    toast_system_created: "Système créé avec succès.",
    toast_system_deleted: "Système supprimé.",
    toast_slot_bound: "Équipement assigné au slot.",
    toast_slot_unbound: "Slot détaché.",
    th_device_name: "Nom de l'équipement",
    th_device_cat: "Catégorie / Tension",
    th_device_type: "Type",
    th_device_gpio: "Broche GPIO",
    th_device_state: "État Actuel",
    th_device_actions: "Actions",
    devices_empty: "Aucun équipement configuré. Cliquez sur \"Ajouter un équipement\".",
    btn_test: "Tester",
    btn_wire: "Câbler",
    btn_edit: "Modifier",
    btn_delete: "Supprimer",
    badge_actuator: "Actionneur",
    badge_sensor: "Capteur",
    badge_relay: "Relais",
    badge_pwm: "PWM",
    badge_digital: "Contact Sec",
    badge_adc: "ADC (0-3.3V)",
    badge_onewire: "1-Wire",
    badge_pwm_dimmer: "Variateur PWM",
    dash_aux_empty: "Aucun actionneur ou capteur supplémentaire configuré.",
    dash_aux_pwm: "Variateur PWM",
    dash_aux_sensor: "Capteur",
    auto_title: "Règles d'Automatisation",
    auto_desc: "Configurez des scénarios autonomes intelligents pour piloter vos équipements.",
    auto_btn_add: "Ajouter une règle",
    th_auto_if: "SI",
    th_auto_source: "Équipement source",
    th_auto_condition: "Condition",
    th_auto_then: "ALORS",
    th_auto_target: "Équipement cible",
    th_auto_action: "Action",
    th_auto_active: "Actif",
    th_auto_actions: "Actions",
    auto_empty_nodes: "Aucun équipement configuré. Ajoutez d'abord vos capteurs et actionneurs dans l'onglet Matériel.",
    auto_empty_rules: "Aucune règle d'automatisation. Cliquez sur \"Ajouter une règle\" pour créer un premier scénario.",
    auto_badge_si: "SI",
    auto_badge_alors: "ALORS",
    auto_delete_rule: "Supprimer cette règle",
    account_title: "Gestion du Compte",
    account_lang_title: "Langue de l'application",
    account_lang_sub: "Sélectionnez la langue d'affichage de l'interface",
    account_access_level: "Niveau d'accès",
    account_role: "Administrateur (R&D)",
    account_flash_storage: "Stockage flash",
    account_storage_status: "LittleFS Actif",
    account_firmware: "Firmware",
    account_logout: "Se déconnecter",
    modal_dev_title: "1. Déclarer un équipement",
    modal_dev_title_edit: "Modifier l'équipement",
    modal_dev_step: "Étape 1/2 : Caractéristiques du matériel",
    label_dev_name: "Nom de l'équipement",
    placeholder_dev_name: "Ex: Pompe bac froid, Spot LED cuisine, Flotteur eau...",
    label_dev_cat: "Catégorie",
    opt_cat_actuator: "Actionneur (Puissance / Moteur)",
    opt_cat_sensor: "Capteur (Mesure / Détection)",
    label_dev_mode_cmd: "Type de commande",
    label_dev_mode_meas: "Type de mesure",
    opt_mode_relay: "Tout ou Rien (Relais isolé)",
    opt_mode_pwm: "Progressif (Variateur PWM / MOSFET)",
    opt_mode_digital: "Tout ou Rien (Contact sec / Flotteur)",
    opt_mode_adc: "Capteur analogique actif 3 fils (Pression, Niveau, 0-3.3V direct)",
    opt_mode_ntc: "Sonde de température résistive 2 fils (NTC / CTN avec résistance 10k)",
    opt_mode_onewire: "Bus numérique 1-Wire",
    badge_ntc: "NTC (Pont 10k)",
    volt_ntc_3v3: "3.3V (Natif ESP32 / Pont diviseur)",
    volt_hint_ntc: "Une thermistance NTC 2 fils requiert un pont diviseur externe avec une résistance de 10 kΩ reliée au GND.",
    label_dev_voltage: "Tension d'alimentation",
    label_dev_gpio: "Broche GPIO (Attribution automatique recommandée)",
    opt_gpio_auto: "Attribution automatique optimale par l'ESP32",
    btn_cancel: "Annuler",
    btn_next_wire: "Suivant : Câbler sur la carte",
    btn_save_changes: "Enregistrer les modifications",
    volt_actuator_12v: "12V (Batterie van / puissance)",
    volt_actuator_5v: "5V (Alimentation USB / Rail 5V)",
    volt_actuator_3v3: "3.3V (Natif ESP32)",
    volt_hint_pwm: "Tension alimentant le variateur / MOSFET (ex: 12V pour lanterneau ou ruban LED).",
    volt_hint_relay: "Tension alimentant l'appareil commandé par le relais (ex: 12V pour pompe).",
    volt_sensor_passive: "Passif (Sans tension / Pull-up 3.3V)",
    volt_hint_passive: "Un contact sec (flotteur, bouton) est passif : aucune alimentation externe requise.",
    volt_onewire_3v3: "3.3V (Recommandé - Direct ESP32)",
    volt_onewire_5v: "5V (Alimentation externe 5V)",
    volt_hint_onewire: "Les équipements sur bus 1-Wire s'alimentent généralement en 3.3V ou 5V (ne jamais relier au 12V !).",
    volt_adc_3v3: "3.3V (Natif ESP32 / Direct)",
    volt_adc_5v: "5V (Capteur 5V avec sortie max 3.3V)",
    volt_adc_12v: "12V (Capteur 12V avec diviseur de tension)",
    volt_hint_adc: "Attention : la tension mesurée par l'ESP32 ne doit jamais dépasser 3.3V.",
    wizard_title: "Didacticiel de Câblage Assisté",
    wizard_subtitle: "Guide pas-à-pas pour votre installation",
    wizard_wire_prefix: "Câbler : ",
    wizard_assigned_pin: "Broche assignée :",
    wizard_pin_reserved: "Sélectionnée et réservée par l'ESP32",
    wizard_pin_allocated: "allouée automatiquement",
    wizard_test_title: "Test du branchement physique",
    wizard_test_sub: "Vérifiez le fonctionnement électrique avant de refermer le boîtier",
    wizard_btn_test_actuator: "Tester l'actionneur",
    wizard_btn_test_sensor: "Tester la lecture du capteur",
    wizard_test_waiting: "En attente du test...",
    wizard_test_waiting_act: "En attente du test... (Prévention 5s puis impulsion 3s)",
    wizard_test_waiting_sens: "En attente du test... (Lecture immédiate)",
    wizard_btn_back: "Revenir",
    wizard_btn_finish: "Câblage terminé & Activer",
    hist_title: "Historique des Cycles",
    hist_subtitle: "Base de données des cycles enregistrés (LittleFS)",
    hist_total_cycles: "Cycles totaux",
    hist_total_time: "Temps cumulé",
    hist_total_energy: "Énergie estimée",
    hist_filter_label: "Filtrer par mode :",
    hist_filter_all: "Tous les modes",
    hist_btn_refresh: "Actualiser",
    hist_btn_csv: "Exporter CSV",
    th_hist_cycle: "Cycle",
    th_hist_datetime: "Date & Heure",
    th_hist_mode: "Mode",
    th_hist_tstart: "Temp. Début",
    th_hist_tend: "Temp. Fin",
    th_hist_target: "Consigne",
    th_hist_duration: "Durée",
    th_hist_energy: "Énergie",
    th_hist_status: "Statut",
    hist_btn_close: "Fermer",
    hist_empty: "Aucun cycle enregistré pour ce critère.",
    hist_status_done: "Terminé",
    hist_status_interrupted: "Arrêt manuel",
    hist_status_target_reached: "Consigne atteinte",
    toast_save_success: "Configuration sauvegardée avec succès.",
    toast_dev_deleted: "Équipement supprimé avec succès.",
    toast_rule_added: "Règle ajoutée.",
    toast_rule_deleted: "Règle supprimée.",
    toast_add_dev_first: "Ajoutez d'abord des équipements dans l'onglet Matériel.",
    toast_no_csv: "Aucun cycle à exporter",
    toast_csv_success: "Export CSV généré avec succès",
    toast_delete_confirm: "Êtes-vous sûr de vouloir supprimer définitivement l'équipement",
    toast_wizard_success: "Équipement activé et configuré avec succès.",
    toast_name_required: "Le nom de l'équipement est requis.",
    toast_cycle_recorded: "Cycle {id} enregistré ({dur}, {energy} kWh)",
    toast_db_refreshed: "Base de données des cycles actualisée",
    toast_rule_status: "Règle {status}.",
    status_active: "activée",
    status_inactive: "désactivée",
    watchdog_cutoff: "COUPURE DE SÉCURITÉ DÉCLENCHÉE.",
    hist_status_timer: "Minuterie terminée",
    toast_warn_starting_5s: "Attention : l'appareil va démarrer dans 5 secondes !",
    toast_actuator_test_success: "Test actionneur terminé avec succès.",
    toast_sensor_val: "Valeur capteur : {val}",
    toast_sensor_val_sim: "Valeur capteur (Simulation) : {val}",
    toast_dev_read_val: "{name} : Valeur lue = {val}",
    toast_dev_sim_val: "{name} (Simulation) : Valeur = {val}",
    toast_dev_warn_start_5s: "Attention : \"{name}\" va démarrer dans 5 secondes !",
    toast_dev_test_done: "Test terminé pour \"{name}\".",
    label_device_fallback: "Équipement",
    test_starting_in: "Démarrage dans {sec}s...",
    test_warn_starting_html: "Attention : l'appareil va démarrer dans <strong>{sec} secondes</strong> !",
    test_running_sec: "En marche ({sec}s)...",
    test_pulse_active_html: "Impulsion active sur GPIO {gpio} ({sec}s)...",
    test_actuator_validated_html: "Test validé : Actionneur activé pendant 3 secondes sur GPIO {gpio}.",
    test_retest_actuator: "Re-tester l'actionneur",
    test_reading_signal: "Lecture du signal...",
    test_reading_gpio: "Lecture de la broche GPIO {gpio}...",
    test_measured_volts_html: "Valeur mesurée : <strong>{volts} V</strong> (ADC : {raw} / 4095)",
    test_sensor_state_html: "Valeur du capteur : <strong style=\"font-size:16px; color:var(--cyan-light);\">{state}</strong> ({desc})",
    test_contact_closed: "Contact fermé",
    test_contact_open: "Contact ouvert",
    test_measured_sim_volts_html: "Valeur mesurée (Simulation) : <strong>2.15 V</strong>",
    test_sensor_sim_state_html: "Valeur du capteur (Simulation) : <strong style=\"font-size:16px; color:var(--cyan-light);\">ON</strong> (Contact fermé)",
    test_btn_caution_sec: "Attention ({sec}s)...",
    probe_alert_disconnected: "⚠️ ALERTE : Sonde de température déconnectée (-127°C). Sécurité compresseur active.",
    probes_status_alert: "ALERTE (-127°C Déconnexion)",
    probes_status_active: "OK ({count} sonde(s) active(s))",
    probes_status_none: "Aucune sonde détectée",
    test_sensor_onewire_html: "Sonde 1-Wire : <strong>{val}</strong>",
    toast_onewire_read: "Lecture 1-Wire : {msg}",
    toast_esp32_comm_error: "Erreur de communication avec l'ESP32.",
    toast_hardware_test_error: "Erreur de test matériel",
    toast_device_comm_error: "{name} : Erreur de communication avec l'ESP32",
    toast_sensor_test_success: "Test capteur réussi.",
    wifi_section_title: "Paramètres Réseau Wi-Fi Hybride",
    wifi_section_sub: "Connectez l'ESP32 à la box ou au partage 4G de votre van sans jamais perdre l'accès au réseau local de secours.",
    wifi_ap_label: "Point d'accès de secours (AP)",
    wifi_sta_label: "Réseau du Van (Station)",
    wifi_mdns_label: "Accès direct mDNS",
    wifi_btn_scan: "Scanner les réseaux",
    wifi_btn_scanning: "Scan en cours...",
    wifi_select_placeholder: "-- Sélectionnez un réseau détecté --",
    wifi_field_ssid: "Nom du réseau Wi-Fi (SSID)",
    wifi_field_pass: "Mot de passe du Wi-Fi",
    wifi_btn_connect: "Valider la connexion",
    wifi_btn_connecting: "Connexion en cours...",
    wifi_btn_forget: "Oublier le réseau du van",
    wifi_badge_ap_only: "Mode autonome (Van-Clim-Local)",
    wifi_badge_connected: "Connecté à {ssid} ({ip})",
    wifi_badge_connecting: "Connexion à {ssid} en cours...",
    wifi_badge_failed: "Échec connexion à {ssid}",
    toast_wifi_scan_done: "{count} réseau(x) Wi-Fi détecté(s)",
    toast_wifi_connecting: "Connexion à \"{ssid}\" en cours. L'AP local reste actif.",
    toast_wifi_forget_confirm: "Êtes-vous sûr de vouloir oublier la connexion au réseau du van ?",
    toast_wifi_reset_done: "Réseau du van oublié. Retour au mode AP local seul.",
    toast_wifi_ssid_required: "Veuillez saisir le nom du réseau Wi-Fi (SSID)."
  },

  en: {
    login_username: "Username",
    login_password: "Password",
    login_submit: "LOG IN",
    login_error: "Incorrect credentials.",
    header_connected: "ESP32 Connected",
    header_connected_ws: "ESP32 Connected (Real-Time)",
    header_reconnecting: "ESP32 Reconnecting...",
    anti_cycle_badge: "Compressor Safety (Anti-short-cycle):",
    watchdog_alert_prefix: "ALERT: Sensor communication lost. Safety shutoff in",
    watchdog_alert_suffix: "s...",
    nav_clim: "Climate",
    nav_devices: "Hardware",
    nav_automation: "Automation",
    nav_stats: "Statistics",
    nav_settings: "Settings",
    nav_account: "Account",
    mode_manual: "MANUAL",
    label_ventilation: "Ventilation",
    ring_est_ready_default: "Estimated time until ready: 1h30",
    ring_est_ready_prefix: "Estimated time until ready: ",
    ring_chiller_standby: "Water Cooling (Chiller) Standby",
    ring_chiller_off: "Water Cooling OFF (Fan Only / Standby)",
    ring_est_target_prefix: "Estimated time to ",
    ring_continuous: "Continuous Cooling Active",
    card_amb_title: "ROOM TEMPERATURE",
    card_amb_sub: "Interior cabin sensor",
    card_target_title: "TARGET TEMPERATURE",
    card_target_sub_active: "Thermostat active",
    card_target_sub_inactive: "Thermostat inactive",
    card_timer_title: "TIMER",
    preset_custom: "Custom",
    btn_history_title: "Cycle history",
    stats_title: "Dashboard",
    stats_setpoint_hold: "Setpoint hold",
    stats_total_energy: "Total energy consumed",
    stats_runtime: "Operating time",
    stats_water_temp: "Water loop temperature",
    stats_chart_curves: "Thermal Curves & Setpoint",
    stats_chart_modes: "Mode Distribution",
    settings_title: "System Settings",
    settings_chiller_title: "Water Chiller",
    settings_chiller_sub: "Auto-chills water to low temp. Saves van battery.",
    settings_chiller_sub_off: "Water cooling OFF (Van parked / Battery save mode).",
    settings_water_temp_title: "Chilled Water Target",
    settings_water_temp_sub: "Target chilled water loop temperature (2°C to 20°C)",
    target_prefix: "Setpoint:",
    settings_hyst_title: "Regulation Hysteresis",
    settings_hyst_sub: "Trigger range before reactivation",
    settings_compressor: "Compressor (Chiller)",
    settings_wifi: "Wi-Fi Network (Access Point)",
    settings_ip: "IP Address",
    settings_probes: "DS18B20 Probes",
    settings_probes_ok: "OK (5/5 connected)",
    settings_watchdog_test: "Safety Watchdog Test",
    settings_btn_simulate: "Simulate Loss",
    settings_reboot: "ESP32 Reboot",
    settings_btn_reboot: "Reboot",
    settings_reboot_msg: "Reboot requested...",
    devices_title: "Hardware & Systems Manager",
    devices_desc: "Declare your hardware and bind them to your van's application systems.",
    devices_btn_add: "Add a device",
    btn_unified_add: "+ Add",
    modal_unified_title: "What would you like to add?",
    modal_unified_sub: "Choose the category of hardware or function for your camper van",
    choice_sensor_title: "Sensor",
    choice_sensor_desc: "Individual measurement hardware: 1-Wire DS18B20 probe, 10k NTC temperature probe, 0-3.3V analog sensor, water float switch.",
    choice_actuator_title: "Actuator",
    choice_actuator_desc: "Individual control hardware: PWM dimmer, 12V/230V power relay, solenoid valve, MOSFET.",
    choice_system_title: "Composite System",
    choice_system_desc: "Full modular function: Reversible Climate / Air Cooler with binding of 4 hardware slots.",
    badge_system: "System",
    modal_system_title: "New System",
    modal_system_sub: "Declare an application system for your van",
    label_system_name: "System Name",
    label_system_type: "System Type",
    opt_sys_clim: "Reversible Climate / Air Cooler",
    label_system_target: "Default Setpoint (°C)",
    btn_create_system: "Create and configure slots",
    systems_title: "Configured Systems",
    devices_raw_title: "Individual Physical Devices",
    system_status_operational: "Operational",
    system_status_incomplete: "Incomplete",
    system_missing_prefix: "Required unassigned slots:",
    slot_air_name: "Air Temperature Probe",
    slot_air_desc: "1-Wire DS18B20 or 10k NTC / ADC",
    slot_water_name: "Water Temperature Probe",
    slot_water_desc: "1-Wire DS18B20 or 10k NTC / ADC",
    slot_fan_name: "Fan / Blower",
    slot_fan_desc: "PWM Dimmer (0-100%)",
    slot_pump_name: "Circulation Pump",
    slot_pump_desc: "On/Off Relay (12V)",
    slot_comp_name: "Cooling Compressor",
    slot_comp_desc: "On/Off Relay / Dry contact (12V)",
    card_comp_title: "COOLBOX COMPRESSOR",
    comp_status_running: "Running",
    comp_status_waiting: "Safety delay",
    comp_status_off: "Off",
    comp_delay_prefix: "Compressor safety: restart in",
    comp_mode_auto: "AUTO",
    comp_mode_force_on: "FORCED",
    comp_mode_force_off: "CUT OFF",
    toast_comp_mode: "Compressor mode: {mode}",
    slot_req: "Required",
    slot_opt: "Optional",
    slot_unassigned: "Unassigned",
    slot_select_placeholder: "-- Select a device --",
    btn_assign: "Assign",
    btn_wire_assign: "⚡ Assign & Wire",
    btn_unbind: "Detach",
    clim_incomplete_title: "Climate System Incomplete",
    clim_incomplete_desc: "To start autonomous thermal regulation, all required system equipment must be assigned and wired.",
    btn_configure_hardware: "Configure and wire in Hardware",
    toast_system_created: "System created successfully.",
    toast_system_deleted: "System deleted.",
    toast_slot_bound: "Device assigned to slot.",
    toast_slot_unbound: "Slot detached.",
    th_device_name: "Device Name",
    th_device_cat: "Category / Voltage",
    th_device_type: "Type",
    th_device_gpio: "GPIO Pin",
    th_device_state: "Current State",
    th_device_actions: "Actions",
    devices_empty: "No devices configured. Click \"Add a device\".",
    btn_test: "Test",
    btn_wire: "Wire",
    btn_edit: "Edit",
    btn_delete: "Delete",
    badge_actuator: "Actuator",
    badge_sensor: "Sensor",
    badge_relay: "Relay",
    badge_pwm: "PWM",
    badge_digital: "Dry Contact",
    badge_adc: "ADC (0-3.3V)",
    badge_onewire: "1-Wire",
    badge_pwm_dimmer: "PWM Dimmer",
    dash_aux_empty: "No additional actuators or sensors configured.",
    dash_aux_pwm: "PWM Dimmer",
    dash_aux_sensor: "Sensor",
    auto_title: "Automation Rules",
    auto_desc: "Configure intelligent autonomous scenarios to control your devices.",
    auto_btn_add: "Add a rule",
    th_auto_if: "IF",
    th_auto_source: "Source device",
    th_auto_condition: "Condition",
    th_auto_then: "THEN",
    th_auto_target: "Target device",
    th_auto_action: "Action",
    th_auto_active: "Active",
    th_auto_actions: "Actions",
    auto_empty_nodes: "No devices configured. First add your sensors and actuators in the Hardware tab.",
    auto_empty_rules: "No automation rules. Click \"Add a rule\" to create a first scenario.",
    auto_badge_si: "IF",
    auto_badge_alors: "THEN",
    auto_delete_rule: "Delete this rule",
    account_title: "Account Management",
    account_lang_title: "Application Language",
    account_lang_sub: "Select interface display language",
    account_access_level: "Access level",
    account_role: "Administrator (R&D)",
    account_flash_storage: "Flash storage",
    account_storage_status: "LittleFS Active",
    account_firmware: "Firmware",
    account_logout: "Log out",
    modal_dev_title: "1. Declare a Device",
    modal_dev_title_edit: "Edit Device",
    modal_dev_step: "Step 1/2: Hardware characteristics",
    label_dev_name: "Device Name",
    placeholder_dev_name: "E.g.: Cold loop pump, Kitchen LED, Water float...",
    label_dev_cat: "Category",
    opt_cat_actuator: "Actuator (Power / Motor)",
    opt_cat_sensor: "Sensor (Measurement / Detection)",
    label_dev_mode_cmd: "Control Type",
    label_dev_mode_meas: "Measurement Type",
    opt_mode_relay: "On/Off (Isolated Relay)",
    opt_mode_pwm: "Variable (PWM Dimmer / MOSFET)",
    opt_mode_digital: "On/Off (Dry Contact / Float)",
    opt_mode_adc: "Active 3-wire analog sensor (Pressure, Level, 0-3.3V direct)",
    opt_mode_ntc: "2-wire resistive temperature probe (NTC / Thermistor with 10k resistor)",
    opt_mode_onewire: "1-Wire digital bus",
    badge_ntc: "NTC (10k Bridge)",
    volt_ntc_3v3: "3.3V (ESP32 native / Voltage divider)",
    volt_hint_ntc: "A 2-wire NTC thermistor requires an external voltage divider bridge with a 10 kΩ reference resistor to GND.",
    label_dev_voltage: "Supply Voltage",
    label_dev_gpio: "GPIO Pin (Automatic allocation recommended)",
    opt_gpio_auto: "Optimal automatic allocation by ESP32",
    btn_cancel: "Cancel",
    btn_next_wire: "Next: Wire on board",
    btn_save_changes: "Save changes",
    volt_actuator_12v: "12V (Van battery / power)",
    volt_actuator_5v: "5V (USB power / 5V rail)",
    volt_actuator_3v3: "3.3V (ESP32 native)",
    volt_hint_pwm: "Voltage supplying the dimmer / MOSFET (e.g. 12V for roof hatch or LED strip).",
    volt_hint_relay: "Voltage supplying the device controlled by the relay (e.g. 12V for pump).",
    volt_sensor_passive: "Passive (No voltage / 3.3V pull-up)",
    volt_hint_passive: "A dry contact (float, push button) is passive: no external power needed.",
    volt_onewire_3v3: "3.3V (Recommended - Direct ESP32)",
    volt_onewire_5v: "5V (External 5V supply)",
    volt_hint_onewire: "1-Wire bus devices are generally powered by 3.3V or 5V (never connect to 12V!).",
    volt_adc_3v3: "3.3V (ESP32 native / Direct)",
    volt_adc_5v: "5V (5V sensor with max 3.3V output)",
    volt_adc_12v: "12V (12V sensor with voltage divider)",
    volt_hint_adc: "Caution: voltage measured by ESP32 must never exceed 3.3V.",
    wizard_title: "Assisted Wiring Tutorial",
    wizard_subtitle: "Step-by-step guide for your installation",
    wizard_wire_prefix: "Wire: ",
    wizard_assigned_pin: "Assigned pin:",
    wizard_pin_reserved: "Selected and reserved by ESP32",
    wizard_pin_allocated: "automatically allocated",
    wizard_test_title: "Physical connection test",
    wizard_test_sub: "Check electrical operation before closing enclosure",
    wizard_btn_test_actuator: "Test actuator",
    wizard_btn_test_sensor: "Test sensor reading",
    wizard_test_waiting: "Waiting for test...",
    wizard_test_waiting_act: "Waiting for test... (5s warning then 3s pulse)",
    wizard_test_waiting_sens: "Waiting for test... (Immediate reading)",
    wizard_btn_back: "Back",
    wizard_btn_finish: "Wiring complete & Activate",
    hist_title: "Cycle History",
    hist_subtitle: "Database of recorded cycles (LittleFS)",
    hist_total_cycles: "Total cycles",
    hist_total_time: "Cumulative time",
    hist_total_energy: "Estimated energy",
    hist_filter_label: "Filter by mode:",
    hist_filter_all: "All modes",
    hist_btn_refresh: "Refresh",
    hist_btn_csv: "Export CSV",
    th_hist_cycle: "Cycle",
    th_hist_datetime: "Date & Time",
    th_hist_mode: "Mode",
    th_hist_tstart: "Start Temp.",
    th_hist_tend: "End Temp.",
    th_hist_target: "Setpoint",
    th_hist_duration: "Duration",
    th_hist_energy: "Energy",
    th_hist_status: "Status",
    hist_btn_close: "Close",
    hist_empty: "No cycles recorded for this filter.",
    hist_status_done: "Completed",
    hist_status_interrupted: "Manual stop",
    hist_status_target_reached: "Setpoint reached",
    toast_save_success: "Configuration saved successfully.",
    toast_dev_deleted: "Device deleted successfully.",
    toast_rule_added: "Rule added.",
    toast_rule_deleted: "Rule deleted.",
    toast_add_dev_first: "First add devices in the Hardware tab.",
    toast_no_csv: "No cycles to export",
    toast_csv_success: "CSV export generated successfully",
    toast_delete_confirm: "Are you sure you want to permanently delete device",
    toast_wizard_success: "Device activated and configured successfully.",
    toast_name_required: "Device name is required.",
    toast_cycle_recorded: "Cycle {id} recorded ({dur}, {energy} kWh)",
    toast_db_refreshed: "Cycle database refreshed",
    toast_rule_status: "Rule {status}.",
    status_active: "enabled",
    status_inactive: "disabled",
    watchdog_cutoff: "SAFETY CUTOFF TRIGGERED.",
    hist_status_timer: "Timer elapsed",
    toast_warn_starting_5s: "Caution: device will start in 5 seconds!",
    toast_actuator_test_success: "Actuator test completed successfully.",
    toast_sensor_val: "Sensor value: {val}",
    toast_sensor_val_sim: "Sensor value (Simulation): {val}",
    toast_dev_read_val: "{name}: Read value = {val}",
    toast_dev_sim_val: "{name} (Simulation): Value = {val}",
    toast_dev_warn_start_5s: "Caution: \"{name}\" will start in 5 seconds!",
    toast_dev_test_done: "Test completed for \"{name}\".",
    label_device_fallback: "Device",
    test_starting_in: "Starting in {sec}s...",
    test_warn_starting_html: "Caution: device will start in <strong>{sec} seconds</strong>!",
    test_running_sec: "Running ({sec}s)...",
    test_pulse_active_html: "Active pulse on GPIO {gpio} ({sec}s)...",
    test_actuator_validated_html: "Test passed: Actuator activated for 3 seconds on GPIO {gpio}.",
    test_retest_actuator: "Retest actuator",
    test_reading_signal: "Reading signal...",
    test_reading_gpio: "Reading GPIO pin {gpio}...",
    test_measured_volts_html: "Measured value: <strong>{volts} V</strong> (ADC: {raw} / 4095)",
    test_sensor_state_html: "Sensor value: <strong style=\"font-size:16px; color:var(--cyan-light);\">{state}</strong> ({desc})",
    test_contact_closed: "Contact closed",
    test_contact_open: "Contact open",
    test_measured_sim_volts_html: "Measured value (Simulation): <strong>2.15 V</strong>",
    test_sensor_sim_state_html: "Sensor value (Simulation): <strong style=\"font-size:16px; color:var(--cyan-light);\">ON</strong> (Contact closed)",
    test_btn_caution_sec: "Caution ({sec}s)...",
    probe_alert_disconnected: "⚠️ ALERT: Temperature probe disconnected (-127°C). Compressor safety active.",
    probes_status_alert: "ALERT (-127°C Disconnected)",
    probes_status_active: "OK ({count} probe(s) active)",
    probes_status_none: "No probes detected",
    test_sensor_onewire_html: "1-Wire Probe: <strong>{val}</strong>",
    toast_onewire_read: "1-Wire Reading: {msg}",
    toast_esp32_comm_error: "Communication error with ESP32.",
    toast_hardware_test_error: "Hardware test error",
    toast_device_comm_error: "{name}: Communication error with ESP32",
    toast_sensor_test_success: "Sensor test successful.",
    wifi_section_title: "Hybrid Wi-Fi Network Settings",
    wifi_section_sub: "Connect ESP32 to your van router or 4G hotspot without ever losing access to the local fallback AP.",
    wifi_ap_label: "Fallback Access Point (AP)",
    wifi_sta_label: "Van Network (Station)",
    wifi_mdns_label: "Direct mDNS Access",
    wifi_btn_scan: "Scan networks",
    wifi_btn_scanning: "Scanning...",
    wifi_select_placeholder: "-- Select a detected network --",
    wifi_field_ssid: "Wi-Fi Network Name (SSID)",
    wifi_field_pass: "Wi-Fi Password",
    wifi_btn_connect: "Connect to Wi-Fi",
    wifi_btn_connecting: "Connecting...",
    wifi_btn_forget: "Forget van network",
    wifi_badge_ap_only: "Standalone mode (Van-Clim-Local)",
    wifi_badge_connected: "Connected to {ssid} ({ip})",
    wifi_badge_connecting: "Connecting to {ssid}...",
    wifi_badge_failed: "Failed to connect to {ssid}",
    toast_wifi_scan_done: "{count} Wi-Fi network(s) detected",
    toast_wifi_connecting: "Connecting to \"{ssid}\". Local AP remains active.",
    toast_wifi_forget_confirm: "Are you sure you want to forget the van Wi-Fi connection?",
    toast_wifi_reset_done: "Van network forgotten. Reverted to local AP only.",
    toast_wifi_ssid_required: "Please enter Wi-Fi network name (SSID)."
  },

  es: {
    login_username: "Usuario",
    login_password: "Contraseña",
    login_submit: "INICIAR SESIÓN",
    login_error: "Credenciales incorrectas.",
    header_connected: "ESP32 Conectado",
    header_connected_ws: "ESP32 Conectado (Tiempo Real)",
    header_reconnecting: "ESP32 Reconectando...",
    anti_cycle_badge: "Protección Compresor (Anti-ciclos cortos):",
    watchdog_alert_prefix: "ALERTA: Pérdida de comunicación de sensores. Corte de seguridad en",
    watchdog_alert_suffix: "s...",
    nav_clim: "Climatización",
    nav_devices: "Hardware",
    nav_automation: "Automatización",
    nav_stats: "Estadísticas",
    nav_settings: "Configuración",
    nav_account: "Cuenta",
    mode_manual: "MANUAL",
    label_ventilation: "Ventilación",
    ring_est_ready_default: "Tiempo estimado antes de disponibilidad: 1h30",
    ring_est_ready_prefix: "Tiempo estimado antes de disponibilidad: ",
    ring_chiller_standby: "Refrigeración de agua (Chiller) en espera",
    ring_chiller_off: "Refrigeración agua APAGADA (Solo ventilación / Espera)",
    ring_est_target_prefix: "Tiempo estimado hasta ",
    ring_continuous: "Refrigeración continua activa",
    card_amb_title: "TEMPERATURA AMBIENTE",
    card_amb_sub: "Sensor interior habitáculo",
    card_target_title: "TEMPERATURA OBJETIVO",
    card_target_sub_active: "Termostato activo",
    card_target_sub_inactive: "Termostato inactivo",
    card_timer_title: "TEMPORIZADOR",
    preset_custom: "Personalizado",
    btn_history_title: "Historial de ciclos",
    stats_title: "Panel de Control",
    stats_setpoint_hold: "Mantenimiento consigna",
    stats_total_energy: "Energía total consumida",
    stats_runtime: "Tiempo de funcionamiento",
    stats_water_temp: "Temperatura circuito agua",
    stats_chart_curves: "Curvas térmicas y consigna",
    stats_chart_modes: "Distribución de modos",
    settings_title: "Configuración del Sistema",
    settings_chiller_title: "Enfriador de Agua (Chiller)",
    settings_chiller_sub: "Auto-enfriamiento a baja temp. Ahorro batería camper.",
    settings_chiller_sub_off: "Refrigeración agua APAGADA (Modo estacionado / Ahorro de batería).",
    settings_water_temp_title: "Consigna de agua (Chiller)",
    settings_water_temp_sub: "Temperatura objetivo del circuito de agua fría (2°C a 20°C)",
    target_prefix: "Consigna:",
    settings_hyst_title: "Histéresis de regulación",
    settings_hyst_sub: "Rango de activación antes de reiniciar",
    settings_compressor: "Compresor (Chiller)",
    settings_wifi: "Red Wi-Fi (Punto de acceso)",
    settings_ip: "Dirección IP",
    settings_probes: "Sondas DS18B20",
    settings_probes_ok: "OK (5/5 conectadas)",
    settings_watchdog_test: "Prueba Watchdog de Seguridad",
    settings_btn_simulate: "Simular Pérdida",
    settings_reboot: "Reinicio ESP32",
    settings_btn_reboot: "Reiniciar",
    settings_reboot_msg: "Reinicio solicitado...",
    devices_title: "Gestor de Hardware y Sistemas",
    devices_desc: "Declare sus dispositivos y asócielos a los sistemas modulares de la camper.",
    devices_btn_add: "Añadir un dispositivo",
    btn_unified_add: "+ Añadir",
    modal_unified_title: "¿Qué desea añadir?",
    modal_unified_sub: "Seleccione la categoría de hardware o sistema para su furgoneta camper",
    choice_sensor_title: "Sensor",
    choice_sensor_desc: "Equipo individual de medición: Sonda 1-Wire DS18B20, Sonda NTC 10k, Sensor analógico 0-3.3V, Boya nivel de agua.",
    choice_actuator_title: "Actuador",
    choice_actuator_desc: "Equipo individual de control: Regulador PWM, Relé de potencia 12V/230V, Electroválvula, MOSFET.",
    choice_system_title: "Sistema Compuesto",
    choice_system_desc: "Función modular completa: Climatización Reversible / Enfriador con vinculación de slots de hardware.",
    badge_system: "Sistema",
    modal_system_title: "Nuevo Sistema",
    modal_system_sub: "Declare una función de aplicación para su furgoneta",
    label_system_name: "Nombre del sistema",
    label_system_type: "Tipo de sistema",
    opt_sys_clim: "Climatización Reversible / Enfriador",
    label_system_target: "Consigna por defecto (°C)",
    btn_create_system: "Crear y configurar slots",
    systems_title: "Sistemas Configurados",
    devices_raw_title: "Dispositivos Físicos Declarados",
    system_status_operational: "Operativo",
    system_status_incomplete: "Incompleto",
    system_missing_prefix: "Slots obligatorios no asignados:",
    slot_air_name: "Sonda Temperatura Aire",
    slot_air_desc: "1-Wire DS18B20 o NTC 10k / ADC",
    slot_water_name: "Sonda Temperatura Agua",
    slot_water_desc: "1-Wire DS18B20 o NTC 10k / ADC",
    slot_fan_name: "Ventilador / Impulsor",
    slot_fan_desc: "Regulador PWM (0-100%)",
    slot_pump_name: "Bomba de Circulación",
    slot_pump_desc: "Relé Todo o Nada (12V)",
    slot_comp_name: "Compresor de Frío",
    slot_comp_desc: "Relé Todo o Nada / Contacto seco (12V)",
    card_comp_title: "COMPRESOR NEVERA",
    comp_status_running: "En marcha",
    comp_status_waiting: "Temporización de seguridad",
    comp_status_off: "Apagado",
    comp_delay_prefix: "Seguridad compresor: reinicio en",
    comp_mode_auto: "AUTO",
    comp_mode_force_on: "FORZADO",
    comp_mode_force_off: "CORTADO",
    toast_comp_mode: "Modo compresor: {mode}",
    slot_req: "Requerido",
    slot_opt: "Opcional",
    slot_unassigned: "Sin asignar",
    slot_select_placeholder: "-- Seleccionar un dispositivo --",
    btn_assign: "Asignar",
    btn_wire_assign: "⚡ Asignar y Cablear",
    btn_unbind: "Desvincular",
    clim_incomplete_title: "Sistema Climatización Incompleto",
    clim_incomplete_desc: "Para iniciar la regulación térmica autónoma, todos los equipos requeridos deben estar asignados y cableados.",
    btn_configure_hardware: "Configurar y cablear en Hardware",
    toast_system_created: "Sistema creado con éxito.",
    toast_system_deleted: "Sistema eliminado.",
    toast_slot_bound: "Dispositivo asignado al slot.",
    toast_slot_unbound: "Slot desvinculado.",
    th_device_name: "Nombre del dispositivo",
    th_device_cat: "Categoría / Voltaje",
    th_device_type: "Tipo",
    th_device_gpio: "Pin GPIO",
    th_device_state: "Estado Actual",
    th_device_actions: "Acciones",
    devices_empty: "No hay dispositivos configurados. Haga clic en \"Añadir un dispositivo\".",
    btn_test: "Probar",
    btn_wire: "Cablear",
    btn_edit: "Editar",
    btn_delete: "Eliminar",
    badge_actuator: "Actuador",
    badge_sensor: "Sensor",
    badge_relay: "Relé",
    badge_pwm: "PWM",
    badge_digital: "Contacto Seco",
    badge_adc: "ADC (0-3.3V)",
    badge_onewire: "1-Wire",
    badge_pwm_dimmer: "Regulador PWM",
    dash_aux_empty: "No hay actuadores o sensores adicionales configurados.",
    dash_aux_pwm: "Regulador PWM",
    dash_aux_sensor: "Sensor",
    auto_title: "Reglas de Automatización",
    auto_desc: "Configure escenarios autónomos inteligentes para controlar sus dispositivos.",
    auto_btn_add: "Añadir una regla",
    th_auto_if: "SI",
    th_auto_source: "Dispositivo origen",
    th_auto_condition: "Condición",
    th_auto_then: "ENTONCES",
    th_auto_target: "Dispositivo destino",
    th_auto_action: "Acción",
    th_auto_active: "Activo",
    th_auto_actions: "Acciones",
    auto_empty_nodes: "No hay dispositivos configurados. Primero agregue sus sensores y actuadores en la pestaña Hardware.",
    auto_empty_rules: "No hay reglas de automatización. Haga clic en \"Añadir una regla\" para crear un primer escenario.",
    auto_badge_si: "SI",
    auto_badge_alors: "ENTONCES",
    auto_delete_rule: "Eliminar esta regla",
    account_title: "Gestión de la Cuenta",
    account_lang_title: "Idioma de la aplicación",
    account_lang_sub: "Seleccione el idioma de visualización de la interfaz",
    account_access_level: "Nivel de acceso",
    account_role: "Administrador (I+D)",
    account_flash_storage: "Almacenamiento flash",
    account_storage_status: "LittleFS Activo",
    account_firmware: "Firmware",
    account_logout: "Cerrar sesión",
    modal_dev_title: "1. Declarar un dispositivo",
    modal_dev_title_edit: "Modificar dispositivo",
    modal_dev_step: "Paso 1/2: Características del hardware",
    label_dev_name: "Nombre del dispositivo",
    placeholder_dev_name: "Ej: Bomba circuito frío, Foco LED cocina, Boya agua...",
    label_dev_cat: "Categoría",
    opt_cat_actuator: "Actuador (Potencia / Motor)",
    opt_cat_sensor: "Sensor (Medición / Detección)",
    label_dev_mode_cmd: "Tipo de control",
    label_dev_mode_meas: "Tipo de medición",
    opt_mode_relay: "Todo o Nada (Relé aislado)",
    opt_mode_pwm: "Variable (Regulador PWM / MOSFET)",
    opt_mode_digital: "Todo o Nada (Contacto seco / Boya)",
    opt_mode_adc: "Sensor analógico activo de 3 hilos (Presión, Nivel, 0-3.3V directo)",
    opt_mode_ntc: "Sonda de temperatura resistiva de 2 hilos (NTC / Termistor con resistencia 10k)",
    opt_mode_onewire: "Bus digital 1-Wire",
    badge_ntc: "NTC (Puente 10k)",
    volt_ntc_3v3: "3.3V (Nativo ESP32 / Divisor de tensión)",
    volt_hint_ntc: "Un termistor NTC de 2 hilos requiere un divisor de tensión externo con una resistencia de 10 kΩ a masa (GND).",
    label_dev_voltage: "Voltaje de alimentación",
    label_dev_gpio: "Pin GPIO (Asignación automática recomendada)",
    opt_gpio_auto: "Asignación automática óptima por el ESP32",
    btn_cancel: "Cancelar",
    btn_next_wire: "Siguiente: Cablear en la placa",
    btn_save_changes: "Guardar cambios",
    volt_actuator_12v: "12V (Batería camper / potencia)",
    volt_actuator_5v: "5V (Alimentación USB / Carril 5V)",
    volt_actuator_3v3: "3.3V (Nativo ESP32)",
    volt_hint_pwm: "Voltaje que alimenta el regulador / MOSFET (ej: 12V para claraboya o tira LED).",
    volt_hint_relay: "Voltaje que alimenta el equipo controlado por el relé (ej: 12V para bomba).",
    volt_sensor_passive: "Pasivo (Sin voltaje / Pull-up 3.3V)",
    volt_hint_passive: "Un contacto seco (boya, pulsador) es pasivo: no se requiere alimentación externa.",
    volt_onewire_3v3: "3.3V (Recomendado - Directo ESP32)",
    volt_onewire_5v: "5V (Alimentación externa 5V)",
    volt_hint_onewire: "Los equipos del bus 1-Wire se alimentan normalmente a 3.3V o 5V (¡nunca conectar a 12V!).",
    volt_adc_3v3: "3.3V (Nativo ESP32 / Directo)",
    volt_adc_5v: "5V (Sensor 5V con salida máx 3.3V)",
    volt_adc_12v: "12V (Sensor 12V con divisor de voltaje)",
    volt_hint_adc: "Atención: el voltaje medido por el ESP32 nunca debe superar los 3.3V.",
    wizard_title: "Tutorial de Cableado Asistido",
    wizard_subtitle: "Guía paso a paso para su instalación",
    wizard_wire_prefix: "Cablear: ",
    wizard_assigned_pin: "Pin asignado:",
    wizard_pin_reserved: "Seleccionado y reservado por el ESP32",
    wizard_pin_allocated: "asignado automáticamente",
    wizard_test_title: "Prueba de conexión física",
    wizard_test_sub: "Verifique el funcionamiento eléctrico antes de cerrar la caja",
    wizard_btn_test_actuator: "Probar actuador",
    wizard_btn_test_sensor: "Probar lectura del sensor",
    wizard_test_waiting: "Esperando prueba...",
    wizard_test_waiting_act: "Esperando prueba... (Prevención 5s y pulso 3s)",
    wizard_test_waiting_sens: "Esperando prueba... (Lectura inmediata)",
    wizard_btn_back: "Volver",
    wizard_btn_finish: "Cableado terminado y Activar",
    hist_title: "Historial de Ciclos",
    hist_subtitle: "Base de datos de ciclos grabados (LittleFS)",
    hist_total_cycles: "Ciclos totales",
    hist_total_time: "Tiempo acumulado",
    hist_total_energy: "Energía estimada",
    hist_filter_label: "Filtrar por modo:",
    hist_filter_all: "Todos los modos",
    hist_btn_refresh: "Actualizar",
    hist_btn_csv: "Exportar CSV",
    th_hist_cycle: "Ciclo",
    th_hist_datetime: "Fecha y Hora",
    th_hist_mode: "Modo",
    th_hist_tstart: "Temp. Inicio",
    th_hist_tend: "Temp. Fin",
    th_hist_target: "Consigna",
    th_hist_duration: "Duración",
    th_hist_energy: "Energía",
    th_hist_status: "Estado",
    hist_btn_close: "Cerrar",
    hist_empty: "No hay ciclos grabados para este criterio.",
    hist_status_done: "Completado",
    hist_status_interrupted: "Parada manual",
    hist_status_target_reached: "Consigna alcanzada",
    toast_save_success: "Configuración guardada con éxito.",
    toast_dev_deleted: "Dispositivo eliminado con éxito.",
    toast_rule_added: "Regla añadida.",
    toast_rule_deleted: "Regla eliminada.",
    toast_add_dev_first: "Primero agregue dispositivos en la pestaña Hardware.",
    toast_no_csv: "No hay ciclos para exportar",
    toast_csv_success: "Exportación CSV generada con éxito",
    toast_delete_confirm: "¿Está seguro de eliminar definitivamente el equipo",
    toast_wizard_success: "Dispositivo activado y configurado con éxito.",
    toast_name_required: "El nombre del dispositivo es obligatorio.",
    toast_cycle_recorded: "Ciclo {id} guardado ({dur}, {energy} kWh)",
    toast_db_refreshed: "Base de datos de ciclos actualizada",
    toast_rule_status: "Regla {status}.",
    status_active: "activada",
    status_inactive: "desactivada",
    watchdog_cutoff: "CORTE DE SEGURIDAD ACTIVADO.",
    hist_status_timer: "Temporizador terminado",
    toast_warn_starting_5s: "Atención: ¡el dispositivo arrancará en 5 segundos!",
    toast_actuator_test_success: "Prueba del actuador completada con éxito.",
    toast_sensor_val: "Valor del sensor: {val}",
    toast_sensor_val_sim: "Valor del sensor (Simulación): {val}",
    toast_dev_read_val: "{name}: Valor leído = {val}",
    toast_dev_sim_val: "{name} (Simulación): Valor = {val}",
    toast_dev_warn_start_5s: "Atención: ¡\"{name}\" arrancará en 5 segundos!",
    toast_dev_test_done: "Prueba completada para \"{name}\".",
    label_device_fallback: "Dispositivo",
    test_starting_in: "Arrancando en {sec}s...",
    test_warn_starting_html: "Atención: ¡el dispositivo arrancará en <strong>{sec} segundos</strong>!",
    test_running_sec: "En marcha ({sec}s)...",
    test_pulse_active_html: "Pulso activo en GPIO {gpio} ({sec}s)...",
    test_actuator_validated_html: "Prueba validada: Actuador activado durante 3 segundos en GPIO {gpio}.",
    test_retest_actuator: "Volver a probar el actuador",
    test_reading_signal: "Leyendo señal...",
    test_reading_gpio: "Leyendo pin GPIO {gpio}...",
    test_measured_volts_html: "Valor medido: <strong>{volts} V</strong> (ADC: {raw} / 4095)",
    test_sensor_state_html: "Valor del sensor: <strong style=\"font-size:16px; color:var(--cyan-light);\">{state}</strong> ({desc})",
    test_contact_closed: "Contacto cerrado",
    test_contact_open: "Contacto abierto",
    test_measured_sim_volts_html: "Valor medido (Simulación): <strong>2.15 V</strong>",
    test_sensor_sim_state_html: "Valor del sensor (Simulación): <strong style=\"font-size:16px; color:var(--cyan-light);\">ON</strong> (Contacto cerrado)",
    test_btn_caution_sec: "Atención ({sec}s)...",
    probe_alert_disconnected: "⚠️ ALERTA: Sonda de temperatura desconectada (-127°C). Seguridad compresor activa.",
    probes_status_alert: "ALERTA (-127°C Desconectada)",
    probes_status_active: "OK ({count} sonda(s) activa(s))",
    probes_status_none: "Ninguna sonda detectada",
    test_sensor_onewire_html: "Sonda 1-Wire: <strong>{val}</strong>",
    toast_onewire_read: "Lectura 1-Wire: {msg}",
    toast_esp32_comm_error: "Error de comunicación con el ESP32.",
    toast_hardware_test_error: "Error de prueba de hardware",
    toast_device_comm_error: "{name}: Error de comunicación con el ESP32",
    toast_sensor_test_success: "Prueba de sensor exitosa.",
    wifi_section_title: "Configuración de Red Wi-Fi Híbrida",
    wifi_section_sub: "Conecte el ESP32 al router o compartir 4G de su camper sin perder nunca el acceso al AP local de respaldo.",
    wifi_ap_label: "Punto de acceso de respaldo (AP)",
    wifi_sta_label: "Red del Camper (Estación)",
    wifi_mdns_label: "Acceso directo mDNS",
    wifi_btn_scan: "Escanear redes",
    wifi_btn_scanning: "Escaneando...",
    wifi_select_placeholder: "-- Seleccione una red detectada --",
    wifi_field_ssid: "Nombre de la red Wi-Fi (SSID)",
    wifi_field_pass: "Contraseña Wi-Fi",
    wifi_btn_connect: "Conectar al Wi-Fi",
    wifi_btn_connecting: "Conectando...",
    wifi_btn_forget: "Olvidar red del camper",
    wifi_badge_ap_only: "Modo autónomo (Van-Clim-Local)",
    wifi_badge_connected: "Conectado a {ssid} ({ip})",
    wifi_badge_connecting: "Conectando a {ssid}...",
    wifi_badge_failed: "Error de conexión a {ssid}",
    toast_wifi_scan_done: "{count} red(es) Wi-Fi detectada(s)",
    toast_wifi_connecting: "Conectando a \"{ssid}\". El AP local sigue activo.",
    toast_wifi_forget_confirm: "¿Está seguro de olvidar la conexión a la red del camper?",
    toast_wifi_reset_done: "Red del camper olvidada. Regresado solo al AP local.",
    toast_wifi_ssid_required: "Por favor introduzca el nombre de la red Wi-Fi (SSID)."
  }
};

function t(key, fallback = '') {
  if (TRANSLATIONS[currentLang] && TRANSLATIONS[currentLang][key] !== undefined) {
    return TRANSLATIONS[currentLang][key];
  }
  if (TRANSLATIONS['fr'] && TRANSLATIONS['fr'][key] !== undefined) {
    return TRANSLATIONS['fr'][key];
  }
  return fallback || key;
}

function applyTranslations() {
  document.documentElement.lang = currentLang;

  // 1. Text elements
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    const translated = t(key);
    if (translated) el.textContent = translated;
  });

  // 2. Placeholders
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const key = el.getAttribute('data-i18n-placeholder');
    const translated = t(key);
    if (translated) el.placeholder = translated;
  });

  // 3. Titles
  document.querySelectorAll('[data-i18n-title]').forEach(el => {
    const key = el.getAttribute('data-i18n-title');
    const translated = t(key);
    if (translated) el.title = translated;
  });

  // 4. Update language flags active state
  ['fr', 'en', 'es'].forEach(code => {
    const btn = document.getElementById('lang-btn-' + code);
    if (btn) {
      if (code === currentLang) btn.classList.add('active');
      else btn.classList.remove('active');
    }
  });
}

function setLanguage(lang) {
  if (!['fr', 'en', 'es'].includes(lang)) lang = 'fr';
  currentLang = lang;
  try { localStorage.setItem('climate_pro_lang', lang); } catch (e) {}
  
  applyTranslations();

  const targetSub = document.getElementById('target-sub');
  if (targetSub) {
    targetSub.innerText = targetEnabled ? t('card_target_sub_active', 'Thermostat actif') : t('card_target_sub_inactive', 'Thermostat inactif');
  }
  const chillerSub = document.getElementById('chiller-sub');
  if (chillerSub) {
    chillerSub.innerText = waterCoolingEnabled ? t('settings_chiller_sub', 'Auto-refroidissement à basse température. Économie batterie van.') : t('settings_chiller_sub_off', 'Refroidissement eau COUPÉ (Mode stationnement / Économie batterie).');
  }

  try { updateVoltageOptions(); } catch (e) {}
  try { updateRing(); } catch (e) {}
  if (devicesList && devicesList.length > 0) {
    try { renderDeviceTable(devicesList); } catch (e) {}
    try { renderDashboardAuxDevices(devicesList); } catch (e) {}
  }
  try { renderAutomationTable(); } catch (e) {}
  try { renderCyclesHistory(); } catch (e) {}

  const watchdogBanner = document.getElementById('watchdog-banner');
  if (watchdogBanner && watchdogBanner.style.display !== 'none' && !watchdogInterval) {
    watchdogBanner.innerHTML = t('probe_alert_disconnected', "⚠️ ALERTE : Sonde de température déconnectée (-127°C). Sécurité compresseur active.");
  }

  const wizModal = document.getElementById('wizard-modal');
  if (wizModal && wizModal.classList.contains('active')) {
    try { openWizardModal(); } catch (e) {}
  }

  try {
    if (lastWifiData) renderWifiStatus(lastWifiData);
  } catch (e) {}
}

function triggerRebootConfirm() {
  alert(t('settings_reboot_msg', 'Redémarrage demandé...'));
}

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
    try { loadCyclesHistory(); } catch (e) { console.warn("Erreur loadCyclesHistory:", e); }
    try { loadWifiStatus(); } catch (e) { console.warn("Erreur loadWifiStatus:", e); }
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

  // Si l'utilisateur clique sur l'onglet Climatisation, Matériel, Automatisation ou Paramètres
  if (tabId === 'clim') {
    updateClimateOperationalView();
  } else if (tabId === 'devices') {
    loadDeviceManager();
  } else if (tabId === 'automation') {
    loadAutomations();
  } else if (tabId === 'settings') {
    loadWifiStatus();
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
    getTitle: () => {
      if (currentLang === 'en') return "On/Off Actuator via Relay Module";
      if (currentLang === 'es') return "Actuador Todo o Nada mediante Módulo de Relé";
      return "Actionneur Tout-ou-Rien via Carte Relais";
    },
    subtitle: (volt) => {
      if (currentLang === 'en') return `On/off control for ${volt} equipment (pump, valve, lighting)`;
      if (currentLang === 'es') return `Control de encendido/apagado para equipo ${volt} (bomba, válvula, iluminación)`;
      return `Commande marche/arrêt pour équipement ${volt} (pompe, vanne, éclairage)`;
    },
    warning: (volt) => {
      if (currentLang === 'en') {
        return (volt === '12V')
          ? `<strong>12V DANGER:</strong> NEVER connect +12V directly to the ESP32! The ESP32 operates exclusively at 3.3V. The relay module provides galvanic isolation and protects your microcontroller.`
          : `<strong>RELAY ISOLATION (${volt}):</strong> The relay module isolates the ESP32 from the ${volt} power circuit. Ensure relay ground (GND) is connected to ESP32 ground.`;
      }
      if (currentLang === 'es') {
        return (volt === '12V')
          ? `<strong>PELIGRO 12V:</strong> ¡NUNCA conecte el +12V directamente al ESP32! El ESP32 funciona exclusivamente a 3.3V. El módulo de relé proporciona aislamiento galvánico y protege su microcontrolador.`
          : `<strong>AISLAMIENTO DEL RELÉ (${volt}):</strong> El módulo de relé aísla el ESP32 del circuito de potencia de ${volt}. Asegúrese de conectar la masa (GND) del relé a la del ESP32.`;
      }
      return (volt === '12V')
        ? `<strong>DANGER 12V :</strong> Ne reliez <u>JAMAIS</u> le +12V directement à l'ESP32 ! L'ESP32 fonctionne exclusivement en 3.3V. Le module relais assure l'isolation galvanique et protège votre microcontrôleur.`
        : `<strong>ISOLATION DU RELAIS (${volt}) :</strong> Le module relais isole l'ESP32 du circuit de puissance ${volt}. Veillez à relier la masse (GND) du relais à celle de l'ESP32.`;
    },
    steps: (gpio, volt) => {
      if (currentLang === 'en') {
        const source = (volt === '12V') ? '+12V from your auxiliary battery' : (volt === '5V' ? '+5V (VIN pin or 5V PSU)' : 'board 3.3V');
        return [
          {
            title: "1. Ground connection (GND)",
            desc: "Connect the <strong>GND</strong> pin of the relay module to one of the <strong>GND</strong> pins of the ESP32."
          },
          {
            title: `2. Power circuit wiring (${volt})`,
            desc: `Connect <strong>${source}</strong> to the <strong>COM</strong> (Common) terminal of the relay, and the positive equipment wire (${volt}) to <strong>NO</strong> (Normally Open). The negative wire returns to ground (0V / GND).`
          },
          {
            title: "3. Logic control connection",
            desc: `Connect the relay <strong>IN / Signal</strong> control pin directly to <span class="step-tag">GPIO {{GPIO}}</span> of the ESP32.`
          }
        ];
      }
      if (currentLang === 'es') {
        const source = (volt === '12V') ? 'el +12V de su batería auxiliar' : (volt === '5V' ? 'el +5V (borne VIN o fuente 5V)' : 'el +3.3V de la placa');
        return [
          {
            title: "1. Conexión de masa (GND)",
            desc: "Conecte el pin <strong>GND</strong> (Masa) del módulo de relé a uno de los pines <strong>GND</strong> del ESP32."
          },
          {
            title: `2. Cableado de potencia (${volt})`,
            desc: `Conecte <strong>${source}</strong> al terminal <strong>COM</strong> (Común) del relé, y el cable positivo del equipo (${volt}) al terminal <strong>NO</strong> (Normalmente Abierto). El cable negativo regresa a masa (0V / GND).`
          },
          {
            title: "3. Conexión del control lógico",
            desc: `Conecte el pin de control <strong>IN / Signal</strong> del relé directamente al <span class="step-tag">GPIO {{GPIO}}</span> del ESP32.`
          }
        ];
      }
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
    getTitle: () => {
      if (currentLang === 'en') return "Variable Actuator (PWM Dimmer / MOSFET)";
      if (currentLang === 'es') return "Actuador Variable (Regulador PWM / MOSFET)";
      return "Actionneur Progressif (Variateur PWM / MOSFET)";
    },
    subtitle: (volt) => {
      if (currentLang === 'en') return `Ideal for ${volt} dimmer (fan, roof hatch, LED strip)`;
      if (currentLang === 'es') return `Ideal para regulador ${volt} (ventilador, claraboya, tira LED)`;
      return `Idéal pour variateur ${volt} (ventilateur, lanterneau Fiamma, ruban LED)`;
    },
    warning: (volt) => {
      if (currentLang === 'en') return `<strong>MOSFET CAUTION (${volt}):</strong> Use a 3.3V logic-level compatible MOSFET module. Module ground (GND) must be connected to ESP32 ground. Power the MOSFET with your nominal voltage (${volt}).`;
      if (currentLang === 'es') return `<strong>ATENCIÓN MOSFET (${volt}):</strong> Use un módulo MOSFET compatible con nivel lógico de 3.3V. La masa (GND) del módulo debe conectarse a la del ESP32. Alimente el MOSFET con su voltaje nominal (${volt}).`;
      return `<strong>ATTENTION MOSFET (${volt}) :</strong> Utilisez un module MOSFET compatible commande 3.3V (Logic-Level). La masse (GND) du module doit être reliée à celle de l'ESP32. Alimentez le MOSFET avec votre tension nominale (${volt}).`;
    },
    steps: (gpio, volt) => {
      if (currentLang === 'en') {
        const source = (volt === '12V') ? 'to +12V of your battery' : (volt === '5V' ? 'to +5V (VIN or PSU)' : 'to +3.3V');
        return [
          {
            title: "1. Common ground (GND)",
            desc: "Connect the <strong>GND (Signal)</strong> terminal of the MOSFET module to a <strong>GND</strong> pin of the ESP32 to ensure proper gate triggering."
          },
          {
            title: `2. Power supply (${volt})`,
            desc: `Connect <strong>DC+ / VIN+</strong> input ${source}, and <strong>DC- / VIN-</strong> to ground (0V). Then connect your device (${volt}) to output terminals <strong>OUT+</strong> and <strong>OUT-</strong>.`
          },
          {
            title: "3. PWM signal connection",
            desc: `Connect the <strong>PWM / TRIG / IN</strong> terminal of the MOSFET directly to <span class="step-tag">GPIO {{GPIO}}</span> of the ESP32.`
          }
        ];
      }
      if (currentLang === 'es') {
        const source = (volt === '12V') ? 'al +12V de su batería' : (volt === '5V' ? 'al +5V (borne VIN o fuente)' : 'al +3.3V');
        return [
          {
            title: "1. Masa común (GND)",
            desc: "Conecte el borne <strong>GND (Señal)</strong> del módulo MOSFET a un pin <strong>GND</strong> del ESP32 para asegurar el disparo de la compuerta (Gate)."
          },
          {
            title: `2. Alimentación de potencia (${volt})`,
            desc: `Conecte la entrada <strong>DC+ / VIN+</strong> ${source}, y <strong>DC- / VIN-</strong> a masa (0V). Luego conecte su equipo (${volt}) a las salidas <strong>OUT+</strong> y <strong>OUT-</strong>.`
          },
          {
            title: "3. Conexión de señal PWM",
            desc: `Conecte el borne <strong>PWM / TRIG / IN</strong> del MOSFET directamente al <span class="step-tag">GPIO {{GPIO}}</span> del ESP32.`
          }
        ];
      }
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
    getTitle: () => {
      if (currentLang === 'en') return "On/Off Sensor (Dry Contact / Level Float)";
      if (currentLang === 'es') return "Sensor Todo o Nada (Contacto Seco / Boya)";
      return "Capteur Tout-ou-Rien (Contact sec / Flotteur niveau)";
    },
    subtitle: () => {
      if (currentLang === 'en') return "Passive mechanical sensor without power (tank float, limit switch, button)";
      if (currentLang === 'es') return "Sensor mecánico pasivo sin alimentación (boya de depósito, final de carrera, pulsador)";
      return "Capteur mécanique passif sans alimentation (flotteur de cuve, fin de course, bouton)";
    },
    warning: () => {
      if (currentLang === 'en') return `<strong>INTERNAL PULL-UP ENABLED (3.3V):</strong> This sensor is a passive mechanical contact. The ESP32 uses its internal pull-up resistor. <u>NEVER connect external power (+12V or +5V)</u> to contact wires or the ESP32 will be permanently damaged!`;
      if (currentLang === 'es') return `<strong>PULL-UP INTERNO ACTIVADO (3.3V):</strong> Este sensor es un contacto mecánico pasivo. El ESP32 incluye una resistencia de pull-up interna. <u>¡NUNCA conecte alimentación externa (+12V o +5V)</u> a los cables del contacto o dañará el ESP32 permanentemente!`;
      return `<strong>PULL-UP INTERNE ACTIVÉ (3.3V) :</strong> Ce capteur est un contact mécanique passif. L'ESP32 intègre une résistance de rappel interne. <u>Ne reliez JAMAIS d'alimentation externe (+12V ou +5V)</u> sur les fils du contact sous peine de détruire l'ESP32 !`;
    },
    steps: (gpio) => {
      if (currentLang === 'en') {
        return [
          {
            title: "1. First wire connection (GND)",
            desc: "Connect one of the two wires of your dry contact / float to a <strong>GND</strong> pin of the ESP32."
          },
          {
            title: "2. Second wire connection (Signal)",
            desc: "Connect the second wire directly to <span class=\"step-tag\">GPIO {{GPIO}}</span> of the ESP32. No external power is required."
          },
          {
            title: "3. Detection logic",
            desc: "At rest (open circuit), the ESP32 reads <strong>HIGH (3.3V)</strong> via internal pull-up. When contact closes (float tilted), pin is grounded and ESP32 reads <strong>LOW (0V / CLOSED)</strong>."
          }
        ];
      }
      if (currentLang === 'es') {
        return [
          {
            title: "1. Conexión del primer cable (GND)",
            desc: "Conecte uno de los dos cables de su contacto seco / boya a un borne <strong>GND</strong> (Masa) del ESP32."
          },
          {
            title: "2. Conexión del segundo cable (Señal)",
            desc: "Conecte el segundo cable directamente al pin <span class=\"step-tag\">GPIO {{GPIO}}</span> del ESP32. No se requiere alimentación externa."
          },
          {
            title: "3. Lógica de detección",
            desc: "En reposo (circuito abierto), el ESP32 lee <strong>ALTO (3.3V)</strong> mediante pull-up interno. Cuando el contacto se cierra (boya basculada), el pin se conecta a masa y el ESP32 lee <strong>BAJO (0V / CERRADO)</strong>."
          }
        ];
      }
      return [
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
      ];
    },
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
    getTitle: () => {
      if (currentLang === 'en') return "Analog Sensor (0 - 3.3V Measurement)";
      if (currentLang === 'es') return "Sensor Analógico (Medición 0 - 3.3V)";
      return "Capteur Analogique (Mesure 0 - 3.3V)";
    },
    subtitle: (volt) => {
      if (currentLang === 'en') return `For pressure sensors, capacitive level gauges (${volt})`;
      if (currentLang === 'es') return `Para sensores de presión, aforadores capacitivos (${volt})`;
      return `Pour sondes de pression, capteurs de niveau capacitif ou jauges (${volt})`;
    },
    warning: (volt) => {
      if (currentLang === 'en') {
        return (volt === '12V' || volt === '5V')
          ? `<strong>MAX 3.3V SIGNAL ON ESP32:</strong> Your sensor is powered by <strong>${volt}</strong>. <u>Crucial note:</u> the ESP32 analog pin (GPIO {{GPIO}}) only supports a maximum of 3.3V! If the sensor output signal exceeds 3.3V (e.g. 0-5V or 0-10V), you MUST install a voltage divider to protect the ESP32.`
          : `<strong>MAXIMUM 3.3V VOLTAGE:</strong> The selected ADC pin (ADC1) accepts 0 to 3.3V. The sensor is powered directly from ESP32 3.3V.`;
      }
      if (currentLang === 'es') {
        return (volt === '12V' || volt === '5V')
          ? `<strong>SEÑAL MÁXIMA 3.3V EN ESP32:</strong> Su sensor está alimentado con <strong>${volt}</strong>. <u>Nota obligatoria:</u> ¡el pin de medición del ESP32 (GPIO {{GPIO}}) solo soporta un máximo de 3.3V! Si la señal de salida del sensor supera los 3.3V (ej: 0-5V o 0-10V), debe instalar obligatoriamente un divisor de voltaje para proteger el ESP32.`
          : `<strong>VOLTAJE MÁXIMO 3.3V:</strong> El pin ADC seleccionado (ADC1) acepta voltajes de 0 a 3.3V. El sensor se alimenta directamente desde los 3.3V del ESP32.`;
      }
      return (volt === '12V' || volt === '5V')
        ? `<strong>SIGNAL MAX 3.3V SUR L'ESP32 :</strong> Votre capteur est alimenté en <strong>${volt}</strong>. <u>Attention impérative :</u> la broche de mesure de l'ESP32 (GPIO {{GPIO}}) ne supporte que 3.3V maximum ! Si le signal de sortie du capteur dépasse 3.3V (ex: 0-5V ou 0-10V), vous devez obligatoirement intercaler un pont diviseur de tension pour protéger l'ESP32.`
        : `<strong>TENSION MAXIMALE 3.3V :</strong> La broche ADC sélectionnée (ADC1) accepte une tension entre 0 et 3.3V. Le capteur est alimenté directement par le 3.3V de l'ESP32.`;
    },
    steps: (gpio, volt) => {
      if (currentLang === 'en') {
        const vccDesc = (volt === '3.3V') ? "to <strong>3.3V</strong> pin of ESP32" : (volt === '5V' ? "to <strong>VIN (5V)</strong> pin of ESP32" : "to battery <strong>+12V</strong>");
        return [
          {
            title: "1. Reference ground (GND)",
            desc: "Connect sensor <strong>GND</strong> to one of the ESP32 <strong>GND</strong> pins (common ground required)."
          },
          {
            title: `2. Sensor power supply (${volt})`,
            desc: `Connect sensor power wire (VCC) ${vccDesc}.`
          },
          {
            title: "3. Measurement signal connection",
            desc: `Connect measurement wire (VOUT / Analog signal) to <span class="step-tag">GPIO {{GPIO}}</span> of the ESP32 (ensure voltage never exceeds 3.3V).`
          }
        ];
      }
      if (currentLang === 'es') {
        const vccDesc = (volt === '3.3V') ? "al pin <strong>3.3V</strong> del ESP32" : (volt === '5V' ? "al pin <strong>VIN (5V)</strong> del ESP32" : "al <strong>+12V</strong> de su batería");
        return [
          {
            title: "1. Masa de referencia (GND)",
            desc: "Conecte el borne <strong>GND</strong> del sensor a uno de los pines <strong>GND</strong> del ESP32 (masa común obligatoria)."
          },
          {
            title: `2. Alimentación del sensor (${volt})`,
            desc: `Conecte el cable de alimentación (VCC) del sensor ${vccDesc}.`
          },
          {
            title: "3. Conexión de señal de medición",
            desc: `Conecte el cable de medición (VOUT / Señal analógica) al pin <span class="step-tag">GPIO {{GPIO}}</span> del ESP32 (asegúrese de que nunca supere 3.3V).`
          }
        ];
      }
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

  "SENSOR_INPUT_ADC_NTC": {
    getTitle: () => {
      if (currentLang === 'en') return "Resistive Temperature Probe (NTC Thermistor with 10k Resistor)";
      if (currentLang === 'es') return "Sonda de Temperatura Resistiva (Termistor NTC con R=10k)";
      return "Sonde de température résistive (NTC / CTN avec R=10k)";
    },
    subtitle: () => {
      if (currentLang === 'en') return "2-wire thermal probe on voltage divider (3.3V)";
      if (currentLang === 'es') return "Sonda térmica de 2 hilos en divisor de tensión (3.3V)";
      return "Sonde thermique 2 fils sur pont diviseur de tension (3.3V)";
    },
    warning: () => {
      if (currentLang === 'en') {
        return `<strong>PASSIVE COMPONENT (10 kΩ RESISTOR REQUIRED):</strong> An NTC thermistor has only 2 wires and requires a <strong>10 kΩ</strong> reference resistor to form a voltage divider. <u>NEVER</u> connect a passive probe to 12V! Power the divider exclusively with <strong>3.3V</strong> from the ESP32.`;
      }
      if (currentLang === 'es') {
        return `<strong>COMPONENTE PASIVO (RESISTENCIA 10 kΩ OBLIGATORIA):</strong> Un termistor NTC solo tiene 2 cables y requiere una resistencia de referencia de <strong>10 kΩ</strong> para formar un divisor de tensión. ¡<u>NUNCA</u> conecte una sonda pasiva a 12V! Alimente el divisor exclusivamente con <strong>3.3V</strong> desde el ESP32.`;
      }
      return `<strong>COMPOSANT PASSIF (RÉSISTANCE 10 kΩ REQUISE) :</strong> Une thermistance NTC ne possède que 2 fils et nécessite une résistance de référence de <strong>10 kΩ</strong> pour former un pont diviseur de tension. Ne reliez <u>JAMAIS</u> une sonde passive au 12V ! Alimentez le pont exclusivement en <strong>3.3V</strong> depuis l'ESP32.`;
    },
    steps: (gpio) => {
      if (currentLang === 'en') {
        return [
          {
            title: "1. Probe 3.3V Power",
            desc: "Connect the first wire of the NTC probe (2 wires) to the <strong>3.3V</strong> pin of the ESP32."
          },
          {
            title: "2. Measurement & Divider",
            desc: `Connect the second wire of the NTC probe to <span class="step-tag">GPIO {{GPIO}}</span> of the ESP32.`
          },
          {
            title: "3. Reference Resistor (10 kΩ)",
            desc: `Insert a <strong>10 kΩ</strong> resistor between this same <span class="step-tag">GPIO {{GPIO}}</span> pin and the <strong>GND</strong> pin of the ESP32 to complete the voltage divider.`
          }
        ];
      }
      if (currentLang === 'es') {
        return [
          {
            title: "1. Alimentación 3.3V de la sonda",
            desc: "Conecte el primer cable de la sonda NTC (2 cables) al pin <strong>3.3V</strong> del ESP32."
          },
          {
            title: "2. Medición y divisor de tensión",
            desc: `Conecte el segundo cable de la sonda NTC al pin <span class="step-tag">GPIO {{GPIO}}</span> del ESP32.`
          },
          {
            title: "3. Resistencia de referencia (10 kΩ)",
            desc: `Inserte una resistencia de <strong>10 kΩ</strong> entre este mismo pin <span class="step-tag">GPIO {{GPIO}}</span> y el pin <strong>GND</strong> del ESP32 para completar el divisor.`
          }
        ];
      }
      return [
        {
          title: "1. Alimentation 3.3V de la sonde",
          desc: "Connectez le premier fil de la sonde NTC (2 fils) à la broche <strong>3.3V</strong> de l'ESP32."
        },
        {
          title: "2. Mesure et pont diviseur",
          desc: `Connectez le second fil de la sonde NTC à la broche <span class="step-tag">GPIO {{GPIO}}</span> de l'ESP32.`
        },
        {
          title: "3. Résistance de référence (10 kΩ)",
          desc: `Insérez une résistance de <strong>10 kΩ</strong> entre cette même broche <span class="step-tag">GPIO {{GPIO}}</span> et la broche <strong>GND</strong> (Masse) de l'ESP32 pour fermer le pont diviseur.`
        }
      ];
    },
    schematic: (gpio) => `
      <svg viewBox="0 0 540 170" width="100%" height="160" style="max-width:540px; font-family:monospace;">
        <!-- Boîtier ESP32 -->
        <rect x="20" y="25" width="130" height="120" rx="8" fill="#151e32" stroke="#2dd4bf" stroke-width="2"/>
        <text x="85" y="48" fill="#2dd4bf" font-size="12" font-weight="bold" text-anchor="middle">ESP32 (ADC1)</text>
        
        <circle cx="140" cy="65" r="5" fill="#ef4444"/>
        <text x="130" y="69" fill="#ef4444" font-size="10" text-anchor="end">3.3V</text>
        
        <circle cx="140" cy="95" r="5" fill="#2dd4bf"/>
        <text x="130" y="99" fill="#f8fafc" font-size="10" text-anchor="end">GPIO ${gpio}</text>
        
        <circle cx="140" cy="125" r="5" fill="#0ea5e9"/>
        <text x="130" y="129" fill="#8b98a5" font-size="10" text-anchor="end">GND</text>

        <!-- Ligne 3.3V vers Sonde Fil 1 -->
        <path d="M145 65 L340 65" stroke="#ef4444" stroke-width="2" fill="none"/>
        <text x="235" y="58" fill="#ef4444" font-size="9" text-anchor="middle">3.3V</text>

        <!-- Ligne GPIO vers Sonde Fil 2 + Point de jonction -->
        <path d="M145 95 L340 95" stroke="#2dd4bf" stroke-width="2.5" fill="none"/>
        <circle cx="240" cy="95" r="4" fill="#2dd4bf"/>
        <text x="190" y="88" fill="#2dd4bf" font-size="9" text-anchor="middle">SIGNAL</text>

        <!-- Branchement de la résistance 10k vers GND -->
        <path d="M240 95 L240 102" stroke="#2dd4bf" stroke-width="2" fill="none"/>
        <rect x="220" y="102" width="40" height="16" rx="3" fill="#1c273e" stroke="#fb923c" stroke-width="1.5"/>
        <text x="240" y="114" fill="#fb923c" font-size="8" font-weight="bold" text-anchor="middle">10 kΩ</text>
        <path d="M240 118 L240 125" stroke="#0ea5e9" stroke-width="2" fill="none"/>
        <circle cx="240" cy="125" r="3" fill="#0ea5e9"/>

        <!-- Ligne GND ESP32 vers jonction résistance -->
        <path d="M145 125 L240 125" stroke="#0ea5e9" stroke-width="2" fill="none"/>
        <text x="185" y="137" fill="#0ea5e9" font-size="9" text-anchor="middle">GND (0V)</text>

        <!-- Boîtier Sonde NTC -->
        <rect x="340" y="25" width="175" height="120" rx="8" fill="#1c273e" stroke="#2dd4bf" stroke-width="2"/>
        <text x="427" y="48" fill="#2dd4bf" font-size="11" font-weight="bold" text-anchor="middle">SONDE NTC (2 FILS)</text>
        <circle cx="350" cy="65" r="4" fill="#ef4444"/>
        <text x="362" y="69" fill="#f8fafc" font-size="10">Fil 1 (Alim)</text>
        <circle cx="350" cy="95" r="4" fill="#2dd4bf"/>
        <text x="362" y="99" fill="#f8fafc" font-size="10">Fil 2 (Signal)</text>
        <text x="427" y="128" fill="#8b98a5" font-size="9" text-anchor="middle">Thermistance 10k CTN</text>
      </svg>
    `
  },

  "SENSOR_INPUT_ONEWIRE": {
    getTitle: () => {
      if (currentLang === 'en') return "1-Wire Digital Sensor / Device";
      if (currentLang === 'es') return "Sensor / Equipo Digital 1-Wire";
      return "Capteur / Équipement Numérique 1-Wire";
    },
    subtitle: (volt) => {
      if (currentLang === 'en') return `1-Wire digital communication bus (${volt})`;
      if (currentLang === 'es') return `Bus de comunicación digital 1-Wire (${volt})`;
      return `Bus de communication numérique 1-Wire (${volt})`;
    },
    warning: (volt) => {
      if (currentLang === 'en') return `<strong>4.7 kΩ PULL-UP RESISTOR:</strong> The 1-Wire bus generally requires a 4.7 kΩ pull-up resistor connected between the data line (DATA) and power (VCC). <u>Never connect 12V</u> directly to a 1-Wire pin or hardware will be damaged!`;
      if (currentLang === 'es') return `<strong>RESISTENCIA PULL-UP 4.7 kΩ:</strong> El bus 1-Wire suele requerir una resistencia pull-up de 4.7 kΩ conectada entre la línea de datos (DATA) y la alimentación (VCC). <u>¡Nunca conecte 12V</u> directamente a una entrada 1-Wire o dañará el hardware!`;
      return `<strong>RÉSISTANCE DE TIRAGE 4.7 kΩ :</strong> Le bus 1-Wire requiert généralement une résistance de tirage (pull-up) de 4.7 kΩ branchée entre la ligne de données (DATA) et l'alimentation (VCC). <u>Ne branchez jamais de 12V</u> directement sur une entrée 1-Wire sous peine d'endommager le matériel !`;
    },
    steps: (gpio, volt) => {
      if (currentLang === 'en') {
        return [
          {
            title: "1. Ground (GND)",
            desc: "Connect equipment ground wire (GND) to an ESP32 <strong>GND</strong> pin."
          },
          {
            title: `2. Power supply (VCC ${volt})`,
            desc: `Connect equipment power wire (VCC) to the <strong>${volt === '5V' ? 'VIN (5V)' : '3.3V'}</strong> pin of the ESP32.`
          },
          {
            title: "3. Data line (DATA) to GPIO {{GPIO}}",
            desc: `Connect equipment data line (DATA) to <span class="step-tag">GPIO {{GPIO}}</span> and insert a 4.7 kΩ resistor between DATA and VCC (${volt}).`
          }
        ];
      }
      if (currentLang === 'es') {
        return [
          {
            title: "1. Masa (GND)",
            desc: "Conecte el borne o cable de masa (GND) del equipo a un pin <strong>GND</strong> del ESP32."
          },
          {
            title: `2. Alimentación (VCC ${volt})`,
            desc: `Conecte el borne de alimentación (VCC) del equipo al pin <strong>${volt === '5V' ? 'VIN (5V)' : '3.3V'}</strong> del ESP32.`
          },
          {
            title: "3. Línea de datos (DATA) al GPIO {{GPIO}}",
            desc: `Conecte la línea de datos (DATA) del equipo al pin <span class="step-tag">GPIO {{GPIO}}</span> insertando la resistencia de 4.7 kΩ entre DATA y VCC (${volt}).`
          }
        ];
      }
      return [
        {
          title: "1. Masse (GND)",
          desc: "Reliez la borne ou le fil de masse (GND) de l'équipement à une broche <strong>GND</strong> de l'ESP32."
        },
        {
          title: `2. Alimentation (VCC ${volt})`,
          desc: `Reliez la borne d'alimentation (VCC) de l'équipement à la broche <strong>${volt === '5V' ? 'VIN (5V)' : '3.3V'}</strong> de l'ESP32.`
        },
        {
          title: "3. Ligne de données (DATA) sur GPIO {{GPIO}}",
          desc: `Reliez la ligne de données (DATA) de l'équipement sur la broche <span class="step-tag">GPIO {{GPIO}}</span> en insérant la résistance de 4.7 kΩ entre la ligne DATA et l'alimentation (VCC ${volt}).`
        }
      ];
    },
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
        <text x="415" y="52" fill="#ec4899" font-size="11" font-weight="bold" text-anchor="middle">ÉQUIPEMENT 1-WIRE</text>
        <text x="330" y="69" fill="#ef4444" font-size="9">VCC (${volt})</text>
        <text x="330" y="94" fill="#ec4899" font-size="9">DATA (1-Wire)</text>
        <text x="330" y="119" fill="#0ea5e9" font-size="9">GND (0V)</text>
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
      <option value="12V">${t('volt_actuator_12v', '12V (Batterie van / puissance)')}</option>
      <option value="5V">${t('volt_actuator_5v', '5V (Alimentation USB / Rail 5V)')}</option>
      <option value="3.3V">${t('volt_actuator_3v3', '3.3V (Natif ESP32)')}</option>
    `;
    if (['12V', '5V', '3.3V'].includes(currentVal)) {
      voltSelect.value = currentVal;
    } else {
      voltSelect.value = '12V';
    }
    if (hintEl) {
      hintEl.innerText = (mode === 'OUTPUT_PWM')
        ? t('volt_hint_pwm', "Tension alimentant le variateur / MOSFET (ex: 12V pour lanterneau ou ruban LED).")
        : t('volt_hint_relay', "Tension alimentant l'appareil commandé par le relais (ex: 12V pour pompe).");
    }
  } else {
    // SENSOR
    if (mode === 'INPUT_DIGITAL') {
      // Contact sec (flotteur, fin de course) : passif, sans tension !
      voltSelect.innerHTML = `
        <option value="3.3V">${t('volt_sensor_passive', 'Passif (Sans tension / Pull-up 3.3V)')}</option>
      `;
      voltSelect.value = '3.3V';
      voltSelect.disabled = true;
      if (hintEl) {
        hintEl.innerText = t('volt_hint_passive', "Un contact sec (flotteur, bouton) est passif : aucune alimentation externe requise.");
      }
    } else if (mode === 'INPUT_ONEWIRE') {
      // 1-Wire : 3.3V recommandé ou 5V (jamais 12V)
      voltSelect.disabled = false;
      voltSelect.innerHTML = `
        <option value="3.3V">${t('volt_onewire_3v3', '3.3V (Recommandé - Direct ESP32)')}</option>
        <option value="5V">${t('volt_onewire_5v', '5V (Alimentation externe 5V)')}</option>
      `;
      voltSelect.value = (currentVal === '5V') ? '5V' : '3.3V';
      if (hintEl) {
        hintEl.innerText = t('volt_hint_onewire', "Les équipements sur bus 1-Wire s'alimentent généralement en 3.3V ou 5V (ne jamais relier au 12V !).");
      }
    } else if (mode === 'INPUT_ADC_NTC') {
      // Sonde résistive NTC (2 fils) : pont diviseur 3.3V + résistance 10k
      voltSelect.innerHTML = `
        <option value="3.3V">${t('volt_ntc_3v3', '3.3V (Natif ESP32 / Pont diviseur)')}</option>
      `;
      voltSelect.value = '3.3V';
      voltSelect.disabled = true;
      if (hintEl) {
        hintEl.innerText = t('volt_hint_ntc', "Une thermistance NTC 2 fils requiert un pont diviseur externe avec une résistance de 10 kΩ reliée au GND.");
      }
    } else {
      // INPUT_ADC (Analogique)
      // INPUT_ADC (Analogique actif 3 fils)
      voltSelect.disabled = false;
      voltSelect.innerHTML = `
        <option value="3.3V">${t('volt_adc_3v3', '3.3V (Natif ESP32 / Direct)')}</option>
        <option value="5V">${t('volt_adc_5v', '5V (Capteur 5V avec sortie max 3.3V)')}</option>
        <option value="12V">${t('volt_adc_12v', '12V (Capteur 12V avec diviseur de tension)')}</option>
      `;
      if (['3.3V', '5V', '12V'].includes(currentVal)) {
        voltSelect.value = currentVal;
      } else {
        voltSelect.value = '3.3V';
      }
      if (hintEl) {
        hintEl.innerText = t('volt_hint_adc', "Attention : la tension mesurée par l'ESP32 ne doit jamais dépasser 3.3V.");
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
  const currentMode = modeSelect.value;
  if (cat === 'ACTUATOR') {
    if (modeLabel) modeLabel.innerText = t('label_dev_mode_cmd', "Type de commande");
    modeSelect.innerHTML = `
      <option value="OUTPUT_RELAY">${t('opt_mode_relay', 'Tout ou Rien (Relais isolé)')}</option>
      <option value="OUTPUT_PWM">${t('opt_mode_pwm', 'Progressif (Variateur PWM / MOSFET)')}</option>
    `;
    if (['OUTPUT_RELAY', 'OUTPUT_PWM'].includes(currentMode)) modeSelect.value = currentMode;
  } else {
    if (modeLabel) modeLabel.innerText = t('label_dev_mode_meas', "Type de mesure");
    modeSelect.innerHTML = `
      <option value="INPUT_DIGITAL">${t('opt_mode_digital', 'Tout ou Rien (Contact sec / Flotteur)')}</option>
      <option value="INPUT_ADC">${t('opt_mode_adc', 'Capteur analogique actif 3 fils (Pression, Niveau, 0-3.3V direct)')}</option>
      <option value="INPUT_ADC_NTC">${t('opt_mode_ntc', 'Sonde de température résistive 2 fils (NTC / CTN avec résistance 10k)')}</option>
      <option value="INPUT_ONEWIRE">${t('opt_mode_onewire', 'Bus numérique 1-Wire')}</option>
    `;
    if (['INPUT_DIGITAL', 'INPUT_ADC', 'INPUT_ADC_NTC', 'INPUT_ONEWIRE'].includes(currentMode)) modeSelect.value = currentMode;
  }
  updateVoltageOptions();
}

// =========================================================================
// GESTION DES SYSTÈMES COMPOSITES (CLIMATISATION, ETC.)
// =========================================================================

function openUnifiedAddModal() {
  const modal = document.getElementById('unified-add-modal');
  if (modal) modal.classList.add('active');
}

function closeUnifiedAddModal() {
  const modal = document.getElementById('unified-add-modal');
  if (modal) modal.classList.remove('active');
}

function selectAddType(type) {
  closeUnifiedAddModal();
  if (type === 'sensor') {
    openAddSensorModal();
  } else if (type === 'actuator') {
    openAddActuatorModal();
  } else if (type === 'system') {
    openAddSystemModal();
  }
}

async function openAddSensorModal() {
  wizardState.id = 0;
  wizardState.isCore = false;
  document.getElementById('modal-title').innerText = t('modal_dev_title', "1. Déclarer un équipement");
  document.getElementById('device-name').value = "";
  document.getElementById('device-category').value = "SENSOR";
  document.getElementById('btn-submit-step1').innerText = t('btn_next_wire', "Suivant : Câbler sur la carte");
  onCategoryChange();
  await populatePinSelect();
  document.getElementById('device-modal').classList.add('active');
}

async function openAddActuatorModal() {
  wizardState.id = 0;
  wizardState.isCore = false;
  document.getElementById('modal-title').innerText = t('modal_dev_title', "1. Déclarer un équipement");
  document.getElementById('device-name').value = "";
  document.getElementById('device-category').value = "ACTUATOR";
  document.getElementById('btn-submit-step1').innerText = t('btn_next_wire', "Suivant : Câbler sur la carte");
  onCategoryChange();
  await populatePinSelect();
  document.getElementById('device-modal').classList.add('active');
}

function openAddSystemModal() {
  document.getElementById('system-name').value = "Climatisation Salon";
  document.getElementById('system-type').value = "climatisation";
  document.getElementById('system-target-temp').value = "21.0";
  document.getElementById('system-modal').classList.add('active');
}

function closeSystemModal() {
  document.getElementById('system-modal').classList.remove('active');
}

async function handleSystemFormSubmit(e) {
  e.preventDefault();
  const name = document.getElementById('system-name').value.trim();
  const type = document.getElementById('system-type').value;
  const targetTemp = parseFloat(document.getElementById('system-target-temp').value) || 21.0;

  if (!name) return;

  const newSys = {
    id: 'clim_' + Date.now(),
    type: type,
    name: name,
    enabled: true,
    bindings: {
      temp_air_id: null,
      temp_water_id: null,
      fan_pwm_id: null,
      pump_relay_id: null,
      compressor_relay_id: null
    },
    settings: {
      target_temp: targetTemp,
      mode: 'NORMAL'
    }
  };

  try {
    const res = await fetch('/api/systems/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newSys)
    });
    const result = await res.json();
    if (!res.ok || !result.success) throw new Error(result.error || "Erreur de création");
    showToast(t('toast_system_created', "Système créé avec succès."), "success");
  } catch (err) {
    systemsList.push(newSys);
    try { localStorage.setItem('climate_pro_sim_systems', JSON.stringify(systemsList)); } catch(e){}
    showToast(t('toast_system_created', "Système créé avec succès."), "success");
  }

  closeSystemModal();
  await loadSystems();
}

async function loadSystems() {
  try {
    const res = await fetch('/api/systems');
    if (!res.ok) throw new Error('Erreur réseau systems');
    const data = await res.json();
    systemsList = data.systems || [];
    try { localStorage.setItem('climate_pro_sim_systems', JSON.stringify(systemsList)); } catch(e){}
  } catch (err) {
    let loaded = false;
    try {
      const saved = localStorage.getItem('climate_pro_sim_systems');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          systemsList = parsed;
          loaded = true;
        }
      }
    } catch(e) {}

    if (!loaded && systemsList.length === 0) {
      systemsList = [
        {
          id: "clim_main",
          type: "climatisation",
          name: "Climatisation Salon",
          enabled: true,
          bindings: {
            temp_air_id: 4,
            temp_water_id: null,
            fan_pwm_id: 2,
            pump_relay_id: 1,
            compressor_relay_id: 5
          },
          settings: {
            target_temp: 21.0,
            mode: "NORMAL"
          },
          operational: true,
          missing_slots: []
        }
      ];
      try { localStorage.setItem('climate_pro_sim_systems', JSON.stringify(systemsList)); } catch(e){}
    }
  }

  renderSystemsCards(systemsList);
  updateNavTabsVisibility();
  updateClimateOperationalView();
}

function updateNavTabsVisibility() {
  const climTabBtn = document.getElementById('nav-btn-clim');
  if (!climTabBtn) return;
  const hasClimSys = systemsList.some(s => s.type === 'climatisation');
  climTabBtn.style.display = hasClimSys ? 'flex' : 'none';
}

function updateClimateOperationalView() {
  const climSys = systemsList.find(s => s.type === 'climatisation');
  const incompleteView = document.getElementById('clim-incomplete-view');
  const operationalView = document.getElementById('clim-operational-view');
  const checklist = document.getElementById('clim-incomplete-checklist');

  if (!climSys) {
    if (incompleteView) incompleteView.style.display = 'none';
    if (operationalView) operationalView.style.display = 'none';
    return;
  }

  // Vérifier la présence physique des équipements liés
  const b = climSys.bindings || {};
  const hasAir = b.temp_air_id && devicesList.some(d => d.id === b.temp_air_id);
  const hasFan = b.fan_pwm_id && devicesList.some(d => d.id === b.fan_pwm_id);
  const hasPump = b.pump_relay_id && devicesList.some(d => d.id === b.pump_relay_id);
  const hasComp = b.compressor_relay_id && devicesList.some(d => d.id === b.compressor_relay_id);
  const hasWater = b.temp_water_id ? devicesList.some(d => d.id === b.temp_water_id) : true;

  const isOperational = hasAir && hasFan && hasPump && hasComp && hasWater;

  if (isOperational) {
    if (incompleteView) incompleteView.style.display = 'none';
    if (operationalView) operationalView.style.display = 'block';
  } else {
    if (operationalView) operationalView.style.display = 'none';
    if (incompleteView) incompleteView.style.display = 'block';

    if (checklist) {
      checklist.innerHTML = `
        <div class="incomplete-slot-item ${hasAir ? 'ok' : 'missing'}">
          <span class="incomplete-slot-name">${t('slot_air_name', 'Sonde Température Air')} (${t('slot_req', 'Requis')})</span>
          <span class="incomplete-slot-status ${hasAir ? 'ok' : 'missing'}">${hasAir ? '✓ OK' : '✗ ' + t('slot_unassigned', 'Non assigné')}</span>
        </div>
        <div class="incomplete-slot-item ${hasFan ? 'ok' : 'missing'}">
          <span class="incomplete-slot-name">${t('slot_fan_name', 'Ventilateur / Pulseur')} (${t('slot_req', 'Requis')})</span>
          <span class="incomplete-slot-status ${hasFan ? 'ok' : 'missing'}">${hasFan ? '✓ OK' : '✗ ' + t('slot_unassigned', 'Non assigné')}</span>
        </div>
        <div class="incomplete-slot-item ${hasPump ? 'ok' : 'missing'}">
          <span class="incomplete-slot-name">${t('slot_pump_name', 'Pompe de Circulation')} (${t('slot_req', 'Requis')})</span>
          <span class="incomplete-slot-status ${hasPump ? 'ok' : 'missing'}">${hasPump ? '✓ OK' : '✗ ' + t('slot_unassigned', 'Non assigné')}</span>
        </div>
        <div class="incomplete-slot-item ${hasComp ? 'ok' : 'missing'}">
          <span class="incomplete-slot-name">${t('slot_comp_name', 'Compresseur de Froid')} (${t('slot_req', 'Requis')})</span>
          <span class="incomplete-slot-status ${hasComp ? 'ok' : 'missing'}">${hasComp ? '✓ OK' : '✗ ' + t('slot_unassigned', 'Non assigné')}</span>
        </div>
        <div class="incomplete-slot-item ${hasWater ? 'ok' : 'missing'}">
          <span class="incomplete-slot-name">${t('slot_water_name', 'Sonde Température Eau')} (${t('slot_opt', 'Optionnel')})</span>
          <span class="incomplete-slot-status ${hasWater ? 'ok' : 'missing'}">${b.temp_water_id ? (hasWater ? '✓ OK' : '✗ Invalide') : '— ' + t('slot_opt', 'Optionnel')}</span>
        </div>
      `;
    }
  }
}

function renderSystemsCards(systems) {
  const container = document.getElementById('systems-cards-container');
  const countBadge = document.getElementById('systems-count-badge');
  if (!container) return;

  if (countBadge) {
    countBadge.innerText = `${systems.length} ${systems.length > 1 ? t('systems_title', 'systèmes') : t('badge_system', 'système')}`;
  }

  if (systems.length === 0) {
    container.innerHTML = `
      <div style="text-align:center; color:var(--text-muted); padding:25px; border:1px dashed var(--border-color); border-radius:12px;">
        Aucun système configuré. Cliquez sur "+ Ajouter" puis "Système Composite" pour en créer un.
      </div>
    `;
    return;
  }

  container.innerHTML = systems.map(sys => {
    const b = sys.bindings || {};
    const hasAir = b.temp_air_id && devicesList.some(d => d.id === b.temp_air_id);
    const hasFan = b.fan_pwm_id && devicesList.some(d => d.id === b.fan_pwm_id);
    const hasPump = b.pump_relay_id && devicesList.some(d => d.id === b.pump_relay_id);
    const hasComp = b.compressor_relay_id && devicesList.some(d => d.id === b.compressor_relay_id);
    const isOperational = hasAir && hasFan && hasPump && hasComp;

    // Filtres des équipements compatibles selon le slot
    const sensorDevices = devicesList.filter(d => d.category === 'SENSOR');
    const pwmDevices = devicesList.filter(d => d.mode === 'OUTPUT_PWM');
    const relayDevices = devicesList.filter(d => d.mode === 'OUTPUT_RELAY');

    function buildSlotHtml(slotKey, slotName, slotDesc, isRequired, boundDevId, candidates) {
      const isBound = (boundDevId && devicesList.some(d => d.id === boundDevId));
      const boundDev = isBound ? devicesList.find(d => d.id === boundDevId) : null;
      
      const badgeClass = isBound ? 'bound' : (isRequired ? 'missing' : 'optional');
      const badgeText = isBound 
        ? `GPIO ${boundDev.gpio} • ${boundDev.name}` 
        : (isRequired ? `🔴 ${t('system_status_incomplete', 'Non assigné')}` : `⚪ ${t('slot_opt', 'Optionnel')}`);

      const optionsHtml = candidates.map(d => {
        const sel = (d.id === boundDevId) ? 'selected' : '';
        return `<option value="${d.id}" ${sel}>${escapeHtml(d.name)} (GPIO ${d.gpio} - ${d.voltage || ''})</option>`;
      }).join('');

      return `
        <div class="system-slot-card ${isBound ? 'bound' : (isRequired ? 'missing' : 'optional')}">
          <div class="slot-header">
            <div>
              <div class="slot-name">${slotName} ${isRequired ? `<span style="color:var(--orange-alert); font-size:10px;">*</span>` : ''}</div>
              <div class="slot-type">${slotDesc}</div>
            </div>
            <span class="slot-status-badge ${badgeClass}">${badgeText}</span>
          </div>

          <div class="slot-select-row">
            <select class="slot-select" onchange="bindSlot('${sys.id}', '${slotKey}', this.value)">
              <option value="0">${t('slot_select_placeholder', '-- Sélectionner un équipement --')}</option>
              ${optionsHtml}
            </select>
          </div>

          <div class="slot-actions">
            <button class="btn-slot-wire" onclick="wireNewDeviceForSlot('${sys.id}', '${slotKey}')">
              ${t('btn_wire_assign', '⚡ Assigner & Câbler')}
            </button>
            ${isBound ? `<button class="btn-slot-unbind" onclick="unbindSlot('${sys.id}', '${slotKey}')" title="${t('btn_unbind', 'Détacher')}">✕</button>` : ''}
          </div>
        </div>
      `;
    }

    return `
      <div class="system-card ${isOperational ? 'operational' : 'incomplete'}">
        <div class="system-card-header">
          <div class="system-card-title-box">
            <span class="system-type-badge">${t('badge_system', 'Système')} • ${t('opt_sys_clim', 'Climatisation')}</span>
            <div class="system-name">${escapeHtml(sys.name)}</div>
          </div>
          <div style="display:flex; align-items:center; gap:10px;">
            <span class="system-status-pill ${isOperational ? 'operational' : 'incomplete'}">
              ${isOperational ? '● ' + t('system_status_operational', 'Opérationnel') : '▲ ' + t('system_status_incomplete', 'Incomplet')}
            </span>
            <button class="action-btn delete-btn" style="padding:4px 8px;" onclick="deleteSystem('${sys.id}')" title="Supprimer">
              <svg viewBox="0 0 24 24" width="14" height="14"><path d="M19,4H15.5L14.5,3H9.5L8.5,4H5V6H19M6,19A2,2 0 0,0 8,21H16A2,2 0 0,0 18,19V7H6V19Z"/></svg>
            </button>
          </div>
        </div>

        <div class="system-slots-grid">
          ${buildSlotHtml('temp_air_id', t('slot_air_name', 'Sonde Température Air'), t('slot_air_desc', '1-Wire DS18B20 ou NTC 10k / ADC'), true, b.temp_air_id, sensorDevices)}
          ${buildSlotHtml('temp_water_id', t('slot_water_name', 'Sonde Température Eau'), t('slot_water_desc', '1-Wire DS18B20 ou NTC 10k / ADC'), false, b.temp_water_id, sensorDevices)}
          ${buildSlotHtml('fan_pwm_id', t('slot_fan_name', 'Ventilateur / Pulseur'), t('slot_fan_desc', 'Variateur PWM (0-100%)'), true, b.fan_pwm_id, pwmDevices)}
          ${buildSlotHtml('pump_relay_id', t('slot_pump_name', 'Pompe de Circulation'), t('slot_pump_desc', 'Relais Tout-ou-Rien (12V)'), true, b.pump_relay_id, relayDevices)}
          ${buildSlotHtml('compressor_relay_id', t('slot_comp_name', 'Compresseur de Froid'), t('slot_comp_desc', 'Relais Tout-ou-Rien / Contact sec (12V)'), true, b.compressor_relay_id, relayDevices)}
        </div>
      </div>
    `;
  }).join('');
}

async function bindSlot(systemId, slot, devId) {
  const numId = parseInt(devId, 10) || 0;
  try {
    const res = await fetch('/api/systems/bind', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ system_id: systemId, slot: slot, device_id: numId })
    });
    const result = await res.json();
    if (!res.ok || !result.success) throw new Error(result.error || "Erreur d'assignation");
    showToast(numId > 0 ? t('toast_slot_bound', "Équipement assigné au slot.") : t('toast_slot_unbound', "Slot détaché."), "success");
  } catch (err) {
    const sys = systemsList.find(s => s.id === systemId);
    if (sys && sys.bindings) {
      sys.bindings[slot] = numId > 0 ? numId : null;
      try { localStorage.setItem('climate_pro_sim_systems', JSON.stringify(systemsList)); } catch(e){}
    }
    showToast(numId > 0 ? t('toast_slot_bound', "Équipement assigné au slot.") : t('toast_slot_unbound', "Slot détaché."), "success");
  }

  await loadSystems();
}

async function unbindSlot(systemId, slot) {
  await bindSlot(systemId, slot, 0);
}

function wireNewDeviceForSlot(systemId, slot) {
  pendingSlotBinding = { systemId: systemId, slot: slot };
  wizardState.id = 0;
  wizardState.isCore = false;

  let defaultName = "Nouvel équipement";
  let defaultCat = "ACTUATOR";
  let defaultMode = "OUTPUT_RELAY";
  let defaultVolt = "12V";

  if (slot === 'temp_air_id') {
    defaultName = "Sonde Habitacle Air";
    defaultCat = "SENSOR";
    defaultMode = "INPUT_ONEWIRE";
    defaultVolt = "3.3V";
  } else if (slot === 'temp_water_id') {
    defaultName = "Sonde Boucle Eau";
    defaultCat = "SENSOR";
    defaultMode = "INPUT_ONEWIRE";
    defaultVolt = "3.3V";
  } else if (slot === 'fan_pwm_id') {
    defaultName = "Ventilateur Pulseur";
    defaultCat = "ACTUATOR";
    defaultMode = "OUTPUT_PWM";
    defaultVolt = "12V";
  } else if (slot === 'pump_relay_id') {
    defaultName = "Pompe Circulation 12V";
    defaultCat = "ACTUATOR";
    defaultMode = "OUTPUT_RELAY";
    defaultVolt = "12V";
  } else if (slot === 'compressor_relay_id') {
    defaultName = "Compresseur Glacière";
    defaultCat = "ACTUATOR";
    defaultMode = "OUTPUT_RELAY";
    defaultVolt = "12V";
  }

  document.getElementById('modal-title').innerText = t('modal_dev_title', "1. Déclarer un équipement");
  document.getElementById('device-name').value = defaultName;
  document.getElementById('device-category').value = defaultCat;
  onCategoryChange();
  document.getElementById('device-signal-mode').value = defaultMode;
  updateVoltageOptions();
  document.getElementById('device-voltage').value = defaultVolt;

  populatePinSelect();
  document.getElementById('device-modal').classList.add('active');
}

async function deleteSystem(id) {
  if (!confirm(t('toast_delete_confirm', "Êtes-vous sûr de vouloir supprimer définitivement ce système ?"))) return;

  try {
    const res = await fetch('/api/systems/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: id })
    });
    const result = await res.json();
    if (!res.ok || !result.success) throw new Error(result.error || "Erreur");
    showToast(t('toast_system_deleted', "Système supprimé."), "success");
  } catch (err) {
    systemsList = systemsList.filter(s => s.id !== id);
    try { localStorage.setItem('climate_pro_sim_systems', JSON.stringify(systemsList)); } catch(e){}
    showToast(t('toast_system_deleted', "Système supprimé."), "success");
  }

  await loadSystems();
}

async function setCompressorMode(mode) {
  ['auto', 'on', 'off'].forEach(m => {
    const btn = document.getElementById('btn-comp-' + m);
    if (btn) {
      if (m === mode) btn.classList.add('active');
      else btn.classList.remove('active');
    }
  });

  try {
    const res = await fetch('/api/systems/climatisation/compressor', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ state: mode })
    });
    const data = await res.json();
    showToast(t('toast_comp_mode', 'Mode compresseur : {mode}').replace('{mode}', mode.toUpperCase()), 'info');
  } catch (err) {
    console.warn("Mode simulation / fallback compresseur:", err);
    showToast(t('toast_comp_mode', 'Mode compresseur : {mode}').replace('{mode}', mode.toUpperCase()), 'info');
  }
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
        {"id": 1, "name": "Pompe boucle froide", "category": "ACTUATOR", "voltage": "12V", "mode": "OUTPUT_RELAY", "type": "RELAY", "gpio": 4, "state": 0, "value": 0, "isCore": false},
        {"id": 2, "name": "Ventilateur Habitacle", "category": "ACTUATOR", "voltage": "12V", "mode": "OUTPUT_PWM", "type": "PWM", "gpio": 14, "state": 0, "value": 128, "isCore": false},
        {"id": 3, "name": "Spot Salon", "category": "ACTUATOR", "voltage": "12V", "mode": "OUTPUT_RELAY", "type": "RELAY", "gpio": 23, "state": 0, "value": 0, "isCore": false},
        {"id": 4, "name": "Sonde Température Air", "category": "SENSOR", "voltage": "3.3V", "mode": "INPUT_ONEWIRE", "type": "RELAY", "gpio": 27, "state": 0, "value": 0, "isCore": false},
        {"id": 5, "name": "Compresseur Glacière", "category": "ACTUATOR", "voltage": "12V", "mode": "OUTPUT_RELAY", "type": "RELAY", "gpio": 22, "state": 0, "value": 0, "isCore": false}
      ];
      try { localStorage.setItem('climate_pro_sim_devices', JSON.stringify(devicesList)); } catch(e){}
    }
  }

  // Tous les équipements sont modifiables et supprimables sans exception
  devicesList.forEach(d => { d.isCore = false; });

  renderDeviceTable(devicesList);
  renderDashboardAuxDevices(devicesList);
  await loadSystems();
}

/**
 * Génère le tableau HTML de la vue Matériel
 */
function renderDeviceTable(devices) {
  const tbody = document.getElementById('device-table-body');
  if (!tbody) return;

  if (devices.length === 0) {
    const emptyHtml = `<tr><td colspan="6" style="text-align:center; color:var(--text-muted); padding:30px;">${t('devices_empty', 'Aucun équipement configuré. Cliquez sur "Ajouter un équipement".')}</td></tr>`;
    if (tbody.innerHTML !== emptyHtml) {
      tbody.innerHTML = emptyHtml;
    }
    return;
  }

  const newHtml = devices.map(dev => {
    const isActuator = (dev.category === 'ACTUATOR');
    const catBadge = isActuator
      ? `<span class="badge badge-actuator">${t('badge_actuator', 'Actionneur')}</span> <span class="badge-volt">${dev.voltage || '12V'}</span>`
      : `<span class="badge badge-sensor">${t('badge_sensor', 'Capteur')}</span> <span class="badge-volt">${dev.voltage || '3.3V'}</span>`;

    let signalBadge = '';
    switch(dev.mode) {
      case 'OUTPUT_PWM':
        signalBadge = `<span class="badge badge-pwm">${t('badge_pwm', 'PWM')}</span>`;
        break;
      case 'INPUT_DIGITAL':
        signalBadge = `<span class="badge badge-digital">${t('badge_digital', 'Contact Sec')}</span>`;
        break;
      case 'INPUT_ADC':
        signalBadge = `<span class="badge badge-adc">${t('badge_adc', 'ADC (0-3.3V)')}</span>`;
        break;
      case 'INPUT_ADC_NTC':
        signalBadge = `<span class="badge badge-ntc">${t('badge_ntc', 'NTC (Pont 10k)')}</span>`;
        break;
      case 'INPUT_ONEWIRE':
        signalBadge = `<span class="badge badge-onewire">${t('badge_onewire', '1-Wire')}</span>`;
        break;
      case 'OUTPUT_RELAY':
      default:
        signalBadge = `<span class="badge badge-relay">${t('badge_relay', 'Relais')}</span>`;
        break;
    }

    let stateDisplay = '';
    if (dev.mode === 'OUTPUT_PWM') {
      stateDisplay = (dev.state && dev.value > 0)
        ? `<span style="font-weight:700; color:var(--success);">${Math.round((dev.value / 255) * 100)}%</span>`
        : `<span style="color:var(--text-muted);">OFF (0%)</span>`;
    } else if (dev.mode === 'INPUT_ONEWIRE' || dev.mode === 'INPUT_ADC_NTC') {
      stateDisplay = (dev.state === 1 && dev.value !== undefined && dev.value !== null && dev.value !== 0)
        ? `<span style="font-weight:700; color:var(--accent);">${(dev.value / 100).toFixed(1)} °C</span>`
        : `<span style="color:var(--text-muted);">--</span>`;
    } else if (dev.mode === 'INPUT_ADC') {
      stateDisplay = `<span style="font-weight:700;">${((dev.value / 4095) * 3.3).toFixed(2)} V</span>`;
    } else if (dev.mode === 'INPUT_DIGITAL') {
      stateDisplay = dev.state
        ? `<span style="color:var(--success); font-weight:700;">ON (${t('state_closed', 'Fermé')})</span>`
        : `<span style="color:var(--text-muted);">OFF (${t('state_open', 'Ouvert')})</span>`;
    } else {
      stateDisplay = dev.state
        ? `<span style="color:var(--success); font-weight:700;">ON</span>`
        : `<span style="color:var(--text-muted);">OFF</span>`;
    }

    const deleteBtn = `<button class="action-btn delete-btn" title="${t('btn_delete', 'Supprimer')}" onclick="deleteDevice(${dev.id}, '${escapeHtml(dev.name)}')"><svg viewBox="0 0 24 24"><path d="M19,4H15.5L14.5,3H9.5L8.5,4H5V6H19M6,19A2,2 0 0,0 8,21H16A2,2 0 0,0 18,19V7H6V19Z"/></svg></button>`;

    return `
      <tr>
        <td style="font-weight:700; color:var(--text-main); white-space:nowrap;">
          ${escapeHtml(dev.name)}
        </td>
        <td>${catBadge}</td>
        <td>${signalBadge}</td>
        <td class="col-center"><span class="badge-gpio">GPIO ${dev.gpio}</span></td>
        <td class="col-center">${stateDisplay}</td>
        <td class="col-right">
          <div class="actions-cell">
            <button class="action-btn test-btn" id="btn-test-${dev.id}" title="${t('btn_test', 'Tester')}" onclick="testDevice(${dev.id}, this)">
              <svg viewBox="0 0 24 24"><path d="M7,2V4H8V18A4,4 0 0,0 12,22A4,4 0 0,0 16,18V4H17V2H7M11,16C10.45,16 10,15.55 10,15C10,14.45 10.45,14 11,14C11.55,14 12,14.45 12,15C12,15.55 11.55,16 11,16M13,12C12.45,12 12,11.55 12,11C12,10.45 12.45,10 13,10C13.55,10 14,10.45 14,11C14,11.55 13.55,12 13,12Z"/></svg>
              ${t('btn_test', 'Tester')}
            </button>
            <button class="action-btn" title="${t('btn_wire', 'Câbler')}" onclick="openWizardForExistingDevice(${dev.id})">
              <svg viewBox="0 0 24 24"><path d="M19,2L14,6.5V17.5L19,13V2M6.5,5C4.55,5 2.45,5.4 1,6.5V21.16C1,21.41 1.25,21.66 1.5,21.66C1.6,21.66 1.65,21.61 1.75,21.61C3.1,20.95 5.05,20.5 6.5,20.5C8.45,20.5 10.55,20.95 12,22C13.35,21.05 15.8,20.5 17.5,20.5C19.15,20.5 20.85,20.8 22.25,21.56C22.35,21.61 22.4,21.66 22.5,21.66C22.75,21.66 23,21.41 23,21.16V6.5C22.4,6.05 21.75,5.75 21,5.5V19C19.9,18.65 18.7,18.5 17.5,18.5C15.8,18.5 13.35,19.05 12,20V6.5C10.55,5.4 8.45,5 6.5,5Z"/></svg>
              ${t('btn_wire', 'Câbler')}
            </button>
            <button class="action-btn" title="${t('btn_edit', 'Modifier')}" onclick="openEditDeviceModal(${dev.id})">
              <svg viewBox="0 0 24 24"><path d="M20.71,7.04C21.1,6.65 21.1,6 20.71,5.63L18.37,3.29C18,2.9 17.35,2.9 16.96,3.29L15.12,5.12L18.87,8.87M3,17.25V21H6.75L17.81,9.93L14.06,6.18L3,17.25Z"/></svg>
            </button>
            ${deleteBtn}
          </div>
        </td>
      </tr>
    `;
  }).join('');

  if (tbody.innerHTML !== newHtml) {
    tbody.innerHTML = newHtml;
  }
}

/**
 * Affiche dynamiquement les périphériques sur la page principale (Dashboard)
 */
function renderDashboardAuxDevices(devices) {
  const container = document.getElementById('aux-devices-container');
  if (!container) return;

  if (devices.length === 0) {
    container.innerHTML = `<div style="color:var(--text-muted); font-size:13px;">${t('dash_aux_empty', 'Aucun actionneur ou capteur supplémentaire configuré.')}</div>`;
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
              <span>${t('dash_aux_pwm', 'Variateur PWM')} (${dev.voltage || '12V'})</span>
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
      if (dev.mode === 'INPUT_ADC' || dev.mode === 'INPUT_ADC_NTC') valText = ((dev.value / 4095) * 3.3).toFixed(2) + ' V';
      return `
        <div class="aux-card">
          <div class="aux-header">
            <span class="aux-name">${escapeHtml(dev.name)}</span>
            <span class="badge-gpio">GPIO ${dev.gpio}</span>
          </div>
          <div class="aux-controls" style="justify-content:space-between;">
            <span style="font-size:12px; color:var(--text-muted);">${t('dash_aux_sensor', 'Capteur')} (${dev.voltage || '3.3V'})</span>
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
            <span style="font-size:12px; color:var(--text-muted);">${t('badge_relay', 'Relais')} ${dev.voltage || '12V'}</span>
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
    const devName = dev ? dev.name : t('label_device_fallback', 'Équipement');
    showToast(t('toast_dev_state', '{name} : {state}').replace('{name}', devName).replace('{state}', isChecked ? 'ON' : 'OFF'), 'success');
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
    } catch (e) {
      try { localStorage.setItem('climate_pro_sim_devices', JSON.stringify(devicesList)); } catch(err){}
    }
  }, 150);
}

/**
 * Ouvre la modale Étape 1 : Déclaration d'équipement
 */
async function openAddDeviceModal() {
  wizardState.id = 0;
  wizardState.isCore = false;

  document.getElementById('modal-title').innerText = t('modal_dev_title', "1. Déclarer un équipement");
  document.getElementById('device-name').value = "";
  document.getElementById('device-category').value = "ACTUATOR";
  document.getElementById('btn-submit-step1').innerText = t('btn_next_wire', "Suivant : Câbler sur la carte");
  
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

  document.getElementById('modal-title').innerText = `${t('modal_dev_title_edit', "Modifier l'équipement")} : ${dev.name}`;
  document.getElementById('device-name').value = dev.name;
  document.getElementById('device-category').value = dev.category || 'ACTUATOR';
  document.getElementById('btn-submit-step1').innerText = t('btn_next_wire', "Suivant : Câbler sur la carte");

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
  select.innerHTML = `<option value="auto">${t('opt_gpio_auto', "Attribution automatique optimale par l'ESP32")}</option>`;

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

  const freeLabel = (currentLang === 'en' ? '(Free)' : (currentLang === 'es' ? '(Libre)' : '(Libre)'));
  const currLabel = (currentLang === 'en' ? '(Current)' : (currentLang === 'es' ? '(Actual)' : '(Actuel)'));

  availablePins.forEach(pin => {
    const isCurrent = (pin === currentPin);
    select.innerHTML += `<option value="${pin}" ${isCurrent ? 'selected' : ''}>GPIO ${pin} ${isCurrent ? currLabel : freeLabel}</option>`;
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
    showToast(t('toast_name_required', "Le nom de l'équipement est requis."), "error");
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

  title.innerText = `${t('wizard_wire_prefix', 'Câbler : ')}${wizardState.name}`;
  
  const modeLabels = {
    'OUTPUT_RELAY': t('opt_mode_relay', 'Relais (Tout-ou-Rien)'),
    'OUTPUT_PWM': t('opt_mode_pwm', 'Variateur PWM / MOSFET'),
    'INPUT_DIGITAL': t('opt_mode_digital', 'Contact Sec (Passif)'),
    'INPUT_ADC': t('opt_mode_adc', 'Capteur actif 3 fils (0-3.3V)'),
    'INPUT_ADC_NTC': t('opt_mode_ntc', 'Sonde résistive 2 fils (NTC / CTN)'),
    'INPUT_ONEWIRE': t('opt_mode_onewire', 'Bus numérique 1-Wire')
  };
  const modeName = modeLabels[wizardState.mode] || wizardState.mode;
  const voltDisplay = (wizardState.mode === 'INPUT_DIGITAL' || wizardState.mode === 'INPUT_ADC_NTC') 
    ? (currentLang === 'en' ? 'Passive (3.3V)' : (currentLang === 'es' ? 'Pasivo (3.3V)' : 'Passif (3.3V)'))
    : wizardState.voltage;
  const catName = (wizardState.category === 'ACTUATOR') ? t('badge_actuator', 'Actionneur') : t('badge_sensor', 'Capteur');
  subtitle.innerText = `${catName} • ${voltDisplay} • ${modeName}`;

  testStatus.className = "wizard-test-status";
  testStatus.innerHTML = (wizardState.category === 'ACTUATOR')
    ? t('wizard_test_waiting_act', "En attente du test... (Prévention 5s puis impulsion 3s)")
    : t('wizard_test_waiting_sens', "En attente du test... (Lecture immédiate)");

  // 1. Réservation intelligente de la broche GPIO auprès de l'ESP32 si auto
  if (!wizardState.gpio) {
    pinDisplay.innerText = "...";
    try {
      const res = await fetch(`/api/pins/suggest?type=${wizardState.mode}`);
      const data = await res.json();
      if (data.success && data.gpio) {
        wizardState.gpio = data.gpio;
        pinReason.innerText = data.message || t('wizard_pin_reserved', "Sélectionnée et réservée par l'ESP32");
      } else {
        throw new Error(data.error || "Aucune broche disponible");
      }
    } catch (err) {
      // Fallback local
      const usedPins = devicesList.map(d => d.gpio);
      const candidates = (wizardState.mode === 'INPUT_ADC' || wizardState.mode === 'INPUT_ADC_NTC') 
        ? [32, 33, 34, 35, 36, 39] 
        : [4, 5, 13, 14, 16, 17, 18, 19, 21, 22, 23, 25, 26, 27, 32, 33];
      wizardState.gpio = candidates.find(p => !usedPins.includes(p)) || 18;
      pinReason.innerText = `GPIO ${wizardState.gpio} ${t('wizard_pin_allocated', 'alloué automatiquement')}`;
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
    testBtnText.innerText = t('wizard_btn_test_actuator', "Tester l'actionneur");
  } else {
    testBtnText.innerText = t('wizard_btn_test_sensor', "Tester la lecture du capteur");
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
    btnText.innerText = t('test_starting_in', 'Démarrage dans {sec}s...').replace('{sec}', delaySec);
    statusBox.innerHTML = t('test_warn_starting_html', 'Attention : l\'appareil va démarrer dans <strong>{sec} secondes</strong> !').replace('{sec}', delaySec);
    showToast(t('toast_warn_starting_5s', "Attention : l'appareil va démarrer dans 5 secondes !"), "warning");

    wizardDelayTimer = setInterval(() => {
      delaySec--;
      if (delaySec > 0) {
        btnText.innerText = t('test_starting_in', 'Démarrage dans {sec}s...').replace('{sec}', delaySec);
        statusBox.innerHTML = t('test_warn_starting_html', 'Attention : l\'appareil va démarrer dans <strong>{sec} secondes</strong> !').replace('{sec}', delaySec);
      } else {
        clearInterval(wizardDelayTimer);
        wizardDelayTimer = null;

        // Phase 2 : Mise en marche pendant 3 secondes
        statusBox.className = "wizard-test-status testing";
        let actSec = 3;
        btnText.innerText = t('test_running_sec', 'En marche ({sec}s)...').replace('{sec}', actSec);
        statusBox.innerHTML = t('test_pulse_active_html', 'Impulsion active sur GPIO {gpio} ({sec}s)...').replace('{gpio}', wizardState.gpio).replace('{sec}', actSec);

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
            btnText.innerText = t('test_running_sec', 'En marche ({sec}s)...').replace('{sec}', actSec);
            statusBox.innerHTML = t('test_pulse_active_html', 'Impulsion active sur GPIO {gpio} ({sec}s)...').replace('{gpio}', wizardState.gpio).replace('{sec}', actSec);
          } else {
            clearInterval(wizardActTimer);
            wizardActTimer = null;
            statusBox.className = "wizard-test-status success";
            statusBox.innerHTML = t('test_actuator_validated_html', 'Test validé : Actionneur activé pendant 3 secondes sur GPIO {gpio}.').replace('{gpio}', wizardState.gpio);
            btn.disabled = false;
            btnText.innerText = t('test_retest_actuator', "Re-tester l'actionneur");
            showToast(t('toast_actuator_test_success', "Test actionneur terminé avec succès."), "success");
          }
        }, 1000);
      }
    }, 1000);

  } else {
    // --- TEST CAPTEUR : lecture instantanée avec affichage de la valeur (ON/OFF ou tension) ---
    btn.disabled = true;
    statusBox.className = "wizard-test-status testing";
    btnText.innerText = t('test_reading_signal', "Lecture du signal...");
    statusBox.innerText = t('test_reading_gpio', 'Lecture de la broche GPIO {gpio}...').replace('{gpio}', wizardState.gpio);

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
      statusBox.className = data.success ? "wizard-test-status success" : "wizard-test-status warning";
      if (wizardState.mode === 'INPUT_ONEWIRE') {
        const msg = data.message || (data.reading !== undefined ? `${(data.reading / 100).toFixed(1)} °C` : '--');
        statusBox.innerHTML = t('test_sensor_onewire_html', 'Sonde 1-Wire : <strong>{val}</strong>').replace('{val}', escapeHtml(msg));
        showToast(t('toast_onewire_read', 'Lecture 1-Wire : {msg}').replace('{msg}', msg), data.success ? "success" : "warning");
      } else if (wizardState.mode === 'INPUT_ADC' || wizardState.mode === 'INPUT_ADC_NTC') {
        const volts = (data.voltage !== undefined) ? data.voltage : ((data.reading / 4095) * 3.3);
        statusBox.innerHTML = t('test_measured_volts_html', 'Valeur mesurée : <strong>{volts} V</strong> (ADC : {raw} / 4095)').replace('{volts}', volts.toFixed(2)).replace('{raw}', data.reading);
        showToast(t('toast_sensor_val', 'Valeur capteur : {val}').replace('{val}', volts.toFixed(2) + ' V'), "success");
      } else {
        // Digital / contact sec / tout ou rien (0 = fermé = ON, 1 = ouvert = OFF)
        const isOn = (data.reading === 0);
        const stateStr = isOn ? 'ON' : 'OFF';
        const descStr = isOn ? t('test_contact_closed', 'Contact fermé') : t('test_contact_open', 'Contact ouvert');
        statusBox.innerHTML = t('test_sensor_state_html', 'Valeur du capteur : <strong style="font-size:16px; color:var(--cyan-light);">{state}</strong> ({desc})').replace('{state}', stateStr).replace('{desc}', descStr);
        showToast(t('toast_sensor_val', 'Valeur capteur : {val}').replace('{val}', stateStr), "success");
      }
    } catch (e) {
      statusBox.className = "wizard-test-status warning";
      statusBox.innerText = t('toast_esp32_comm_error', "Erreur de communication avec l'ESP32.");
      showToast(t('toast_hardware_test_error', "Erreur de test matériel"), "warning");
    } finally {
      btn.disabled = false;
      btnText.innerText = t('wizard_btn_test_sensor', "Tester la lecture du capteur");
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

  let savedId = wizardState.id;

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
    if (result.id) savedId = result.id;
    else if (savedId === 0 && result.device && result.device.id) savedId = result.device.id;
    showToast(`"${wizardState.name}" - ${t('toast_wizard_success', 'Équipement activé et configuré avec succès.')} (GPIO ${wizardState.gpio})`, "success");
  } catch (err) {
    if (wizardState.id > 0) {
      const existing = devicesList.find(d => d.id === wizardState.id);
      if (existing) Object.assign(existing, payload);
      savedId = wizardState.id;
    } else {
      const newId = (devicesList.length > 0 ? Math.max(...devicesList.map(d => d.id)) + 1 : 1);
      devicesList.push({ ...payload, id: newId, state: 0, value: 0 });
      savedId = newId;
    }
    try { localStorage.setItem('climate_pro_sim_devices', JSON.stringify(devicesList)); } catch(e){}
    showToast(`"${wizardState.name}" - ${t('toast_wizard_success', 'Équipement activé et configuré avec succès.')} (GPIO ${wizardState.gpio})`, "success");
  }

  // Si on était dans le flux d'assignation d'un slot
  if (pendingSlotBinding && savedId > 0) {
    const { systemId, slot } = pendingSlotBinding;
    pendingSlotBinding = null;
    await bindSlot(systemId, slot, savedId);
  } else {
    pendingSlotBinding = null;
  }

  closeWizardModal();
  await loadDeviceManager();
}

/**
 * Supprime un équipement
 */
async function deleteDevice(id, name) {
  if (!confirm(`${t('toast_delete_confirm', 'Êtes-vous sûr de vouloir supprimer définitivement l\'équipement')} "${name}" ?`)) {
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

    showToast(`"${name}" : ${t('toast_dev_deleted', 'Équipement supprimé avec succès.')}`, "success");
    automationRules = automationRules.filter(r => r.triggerId !== id && r.targetId !== id);
    saveAutomations();
    await loadDeviceManager();
    renderAutomationTable();
  } catch (err) {
    devicesList = devicesList.filter(d => d.id !== id);
    automationRules = automationRules.filter(r => r.triggerId !== id && r.targetId !== id);
    saveAutomations();
    try { localStorage.setItem('climate_pro_sim_devices', JSON.stringify(devicesList)); } catch(e){}
    showToast(`"${name}" : ${t('toast_dev_deleted', 'Équipement supprimé avec succès.')}`, "success");
    renderDeviceTable(devicesList);
    renderDashboardAuxDevices(devicesList);
    renderAutomationTable();
  }
}

let tableTestTimers = {};

/**
 * Lance un test depuis le tableau Matériel
 * - Capteur : lecture immédiate et affichage de la valeur (ON/OFF, tension ou température)
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
    btnElement.innerHTML = t('test_reading_signal', "Lecture...");

    try {
      const res = await fetch('/api/devices/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: dev.id, duration: 100 })
      });
      const data = await res.json();
      let displayVal = '';
      if (dev.mode === 'INPUT_ONEWIRE') {
        const tempC = (data.reading !== undefined && data.reading !== -127) ? (data.reading / 100).toFixed(1) : ((data.voltage !== undefined) ? data.voltage.toFixed(1) : '--');
        displayVal = `${tempC} °C`;
        dev.value = data.reading || 0;
      } else if (dev.mode === 'INPUT_ADC' || dev.mode === 'INPUT_ADC_NTC') {
        const volts = (data.voltage !== undefined) ? data.voltage : ((data.reading / 4095) * 3.3);
        dev.value = (data.reading !== undefined) ? data.reading : Math.round((volts / 3.3) * 4095);
        displayVal = `${volts.toFixed(2)} V`;
      } else {
        // Tout ou rien : 0 = Contact fermé (ON), 1 = Contact ouvert (OFF)
        const isOn = (data.reading === 0);
        dev.state = isOn ? 1 : 0;
        displayVal = isOn ? 'ON' : 'OFF';
      }
      showToast(t('toast_dev_read_val', '{name} : Valeur lue = {val}').replace('{name}', dev.name).replace('{val}', displayVal), 'success');
      renderDeviceTable(devicesList);
      renderDashboardAuxDevices(devicesList);
    } catch (err) {
      showToast(t('toast_device_comm_error', "{name} : Erreur de communication avec l'ESP32").replace('{name}', dev.name), 'warning');
    } finally {
      const btn = document.getElementById(`btn-test-${id}`);
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = `<svg viewBox="0 0 24 24"><path d="M7,2V4H8V18A4,4 0 0,0 12,22A4,4 0 0,0 16,18V4H17V2H7M11,16C10.45,16 10,15.55 10,15C10,14.45 10.45,14 11,14C11.55,14 12,14.45 12,15C12,15.55 11.55,16 11,16M13,12C12.45,12 12,11.55 12,11C12,10.45 12.45,10 13,10C13.55,10 14,10.45 14,11C14,11.55 13.55,12 13,12Z"/></svg> ${t('btn_test', 'Tester')}`;
      }
    }

  } else {
    // --- TEST ACTIONNEUR : Prévention 5s puis mise en marche 3s ---
    btnElement.disabled = true;
    btnElement.classList.add('warning-pulse');

    let delaySec = 5;
    btnElement.innerHTML = t('test_btn_caution_sec', 'Attention ({sec}s)...').replace('{sec}', delaySec);
    showToast(t('toast_dev_warn_start_5s', 'Attention : "{name}" va démarrer dans 5 secondes !').replace('{name}', dev.name), 'warning');

    tableTestTimers[id] = {};
    tableTestTimers[id].delay = setInterval(() => {
      delaySec--;
      const curBtn = document.getElementById(`btn-test-${id}`);
      if (delaySec > 0) {
        if (curBtn) curBtn.innerHTML = t('test_btn_caution_sec', 'Attention ({sec}s)...').replace('{sec}', delaySec);
      } else {
        clearInterval(tableTestTimers[id].delay);
        delete tableTestTimers[id].delay;

        // Phase 2 : Mise en marche pendant 3 secondes
        if (curBtn) {
          curBtn.classList.remove('warning-pulse');
          curBtn.classList.add('testing');
        }

        let actSec = 3;
        if (curBtn) curBtn.innerHTML = t('test_running_sec', 'En marche ({sec}s)...').replace('{sec}', actSec);

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
            if (activeBtn) activeBtn.innerHTML = t('test_running_sec', 'En marche ({sec}s)...').replace('{sec}', actSec);
          } else {
            clearInterval(tableTestTimers[id].act);
            delete tableTestTimers[id];

            if (activeBtn) {
              activeBtn.classList.remove('testing');
              activeBtn.disabled = false;
              activeBtn.innerHTML = `<svg viewBox="0 0 24 24"><path d="M7,2V4H8V18A4,4 0 0,0 12,22A4,4 0 0,0 16,18V4H17V2H7M11,16C10.45,16 10,15.55 10,15C10,14.45 10.45,14 11,14C11.55,14 12,14.45 12,15C12,15.55 11.55,16 11,16M13,12C12.45,12 12,11.55 12,11C12,10.45 12.45,10 13,10C13.55,10 14,10.45 14,11C14,11.55 13.55,12 13,12Z"/></svg> ${t('btn_test', 'Tester')}`;
            }
            showToast(t('toast_dev_test_done', 'Test terminé pour "{name}".').replace('{name}', dev.name), 'success');
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
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; color:var(--text-muted); padding:30px;">${t('auto_empty_nodes', "Aucun équipement configuré. Ajoutez d'abord vos capteurs et actionneurs dans l'onglet Matériel.")}</td></tr>`;
    return;
  }

  if (automationRules.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; color:var(--text-muted); padding:30px;">${t('auto_empty_rules', "Aucune règle d'automatisation. Cliquez sur \"Ajouter une règle\" pour créer un premier scénario.")}</td></tr>`;
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
    const isTriggerTemp = (triggerDev.mode === 'INPUT_ONEWIRE' || triggerDev.mode === 'INPUT_ADC_NTC');
    const isTriggerAdc = (triggerDev.mode === 'INPUT_ADC');
    const isTriggerPwm = (triggerDev.mode === 'OUTPUT_PWM');

    if (isTriggerTemp || isTriggerAdc || isTriggerPwm) {
      const unit = isTriggerTemp ? '°C' : (isTriggerAdc ? 'V' : '%');
      const step = isTriggerTemp ? '0.5' : (isTriggerAdc ? '0.1' : '1');
      const op = rule.operator || '>';
      const defaultThresh = isTriggerTemp ? 23.0 : (isTriggerAdc ? 2.5 : 50);
      const thresh = (rule.threshold !== undefined) ? rule.threshold : defaultThresh;

      conditionHtml = `
        <div class="rule-inline-group">
          <select class="rule-select-op" onchange="onRuleOperatorChange(${rule.id}, this.value); this.blur();">
            <option value="<" ${op === '<' ? 'selected' : ''}>&lt;</option>
            <option value=">" ${op === '>' ? 'selected' : ''}>&gt;</option>
            <option value="=" ${op === '=' ? 'selected' : ''}>=</option>
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
      const typeLabel = (d.category === 'SENSOR') ? t('badge_sensor', 'Capteur') : t('badge_actuator', 'Actionneur');
      return `<option value="${d.id}" ${d.id === triggerDev.id ? 'selected' : ''}>${escapeHtml(d.name)} (${typeLabel})</option>`;
    }).join('');

    // Options pour la liste déroulante cible
    const targetOptions = targetCandidates.map(d => {
      const typeLabel = (d.mode === 'OUTPUT_PWM') ? t('badge_pwm_dimmer', 'Variateur PWM') : t('badge_relay', 'Relais');
      return `<option value="${d.id}" ${d.id === targetDev.id ? 'selected' : ''}>${escapeHtml(d.name)} (${typeLabel})</option>`;
    }).join('');

    return `
      <tr>
        <td class="col-center"><span class="badge-cond-si">${t('auto_badge_si', 'SI')}</span></td>
        <td>
          <select class="rule-select" onchange="onRuleTriggerChange(${rule.id}, this.value)">
            ${triggerOptions}
          </select>
        </td>
        <td>${conditionHtml}</td>
        <td class="col-center"><span class="badge-action-alors">${t('auto_badge_alors', 'ALORS')}</span></td>
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
          <button class="action-btn delete-btn" title="${t('auto_delete_rule', 'Supprimer cette règle')}" onclick="deleteAutomationRule(${rule.id})">
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
    showToast(t('toast_add_dev_first', "Ajoutez d'abord des équipements dans l'onglet Matériel."), "warning");
    return;
  }

  const newId = (automationRules.length > 0 ? Math.max(...automationRules.map(r => r.id)) + 1 : 1);
  const firstSensor = devicesList.find(d => d.category === 'SENSOR') || devicesList[0];
  const actuators = devicesList.filter(d => d.category === 'ACTUATOR');
  const firstActuator = actuators.length > 0 ? actuators[0] : devicesList[0];

  let defaultThresh = 50;
  if (firstSensor.mode === 'INPUT_ONEWIRE' || firstSensor.mode === 'INPUT_ADC_NTC') {
    defaultThresh = 23.0;
  } else if (firstSensor.mode === 'INPUT_ADC') {
    defaultThresh = 2.5;
  }

  automationRules.push({
    id: newId,
    enabled: true,
    triggerId: firstSensor.id,
    conditionValue: 'ON',
    operator: '>',
    threshold: defaultThresh,
    targetId: firstActuator.id,
    actionValue: 'ON',
    actionPercent: 100
  });

  saveAutomations();
  renderAutomationTable();
  showToast(t('toast_rule_added', "Règle ajoutée."), "info");
}

/**
 * Supprime une règle d'automatisation
 */
function deleteAutomationRule(id) {
  automationRules = automationRules.filter(r => r.id !== id);
  saveAutomations();
  renderAutomationTable();
  showToast(t('toast_rule_deleted', "Règle supprimée."), "info");
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
    if (dev.mode === 'INPUT_ONEWIRE' || dev.mode === 'INPUT_ADC_NTC') {
      rule.threshold = 23.0;
      rule.operator = '>';
    } else if (dev.mode === 'INPUT_ADC') {
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
    const statusText = isChecked ? t('status_active', 'activée') : t('status_inactive', 'désactivée');
    showToast(t('toast_rule_status', 'Règle {status}.').replace('{status}', statusText), 'info');
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

    if (triggerDev.mode === 'INPUT_ONEWIRE' || triggerDev.mode === 'INPUT_ADC_NTC') {
      const curTemp = (currentRoomTemp !== undefined && !isNaN(currentRoomTemp)) ? currentRoomTemp : (triggerDev.value > 100 ? (triggerDev.value / 100) : (triggerDev.value || 25));
      const thresh = (rule.threshold !== undefined) ? rule.threshold : 23.0;
      if (rule.operator === '<') isTriggered = (curTemp < thresh);
      else if (rule.operator === '=') isTriggered = (Math.abs(curTemp - thresh) < 0.5);
      else isTriggered = (curTemp > thresh);
    } else if (triggerDev.mode === 'INPUT_ADC') {
      const curVolts = (triggerDev.value / 4095) * 3.3;
      const thresh = (rule.threshold !== undefined) ? rule.threshold : 2.5;
      if (rule.operator === '<') isTriggered = (curVolts < thresh);
      else if (rule.operator === '=') isTriggered = (Math.abs(curVolts - thresh) < 0.1);
      else isTriggered = (curVolts > thresh);
    } else if (triggerDev.mode === 'OUTPUT_PWM') {
      const curPct = Math.round((triggerDev.value / 255) * 100);
      const thresh = (rule.threshold !== undefined) ? rule.threshold : 50;
      if (rule.operator === '<') isTriggered = (curPct < thresh);
      else if (rule.operator === '=') isTriggered = (Math.abs(curPct - thresh) < 1);
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
// COMMUNICATION TEMPS RÉEL (WEBSOCKET & FALLBACK HTTP)
// =========================================================================
let socket = null;
let socketReconnectTimer = null;
let isWsConnected = false;

function initWebSocket() {
  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
    return;
  }

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = window.location.host || '192.168.4.1';
  const wsUrl = `${protocol}//${host}/ws`;

  try {
    socket = new WebSocket(wsUrl);

    socket.onopen = function() {
      console.log("[WebSocket] Connecté à l'ESP32");
      isWsConnected = true;
      updateConnectionStatus(true);
      if (socketReconnectTimer) {
        clearTimeout(socketReconnectTimer);
        socketReconnectTimer = null;
      }
      sendWsCommand({ cmd: 'getState' });
    };

    socket.onmessage = function(event) {
      try {
        const data = JSON.parse(event.data);
        handleIncomingTelemetry(data);
      } catch (e) {
        console.warn("[WebSocket] Erreur JSON reçu:", e);
      }
    };

    socket.onclose = function() {
      isWsConnected = false;
      updateConnectionStatus(false);
      scheduleWsReconnect();
    };

    socket.onerror = function(err) {
      isWsConnected = false;
      updateConnectionStatus(false);
    };
  } catch (e) {
    isWsConnected = false;
    updateConnectionStatus(false);
    scheduleWsReconnect();
  }
}

function scheduleWsReconnect() {
  if (!socketReconnectTimer) {
    socketReconnectTimer = setTimeout(() => {
      socketReconnectTimer = null;
      initWebSocket();
    }, 2500);
  }
}

function updateConnectionStatus(connected) {
  const indicator = document.getElementById('ws-status-indicator');
  const textEl = document.getElementById('ws-status-text');
  if (indicator) {
    indicator.style.background = connected ? 'var(--success)' : 'var(--orange-alert)';
    indicator.style.boxShadow = connected ? '0 0 8px rgba(52, 211, 153, 0.6)' : '0 0 8px rgba(251, 146, 60, 0.6)';
  }
  if (textEl) {
    textEl.innerText = connected ? t('header_connected_ws', 'ESP32 Connecté (Temps Réel)') : t('header_reconnecting', 'ESP32 Reconnexion...');
  }
}

function sendWsCommand(cmdObj) {
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(cmdObj));
  } else {
    // Fallback HTTP si le WebSocket est en cours de reconnexion
    if (cmdObj.cmd === 'setPower' || cmdObj.cmd === 'togglePower') {
      fetch('/action?power=' + (cmdObj.power ? '1' : '0')).catch(() => {});
    } else if (cmdObj.cmd === 'setTarget') {
      if (cmdObj.temp !== undefined) fetch('/action?temp=' + cmdObj.temp).catch(() => {});
      if (cmdObj.enabled !== undefined) fetch('/action?target_enabled=' + (cmdObj.enabled ? '1' : '0')).catch(() => {});
    } else if (cmdObj.cmd === 'setMode') {
      fetch('/action?mode=' + encodeURIComponent(cmdObj.mode)).catch(() => {});
    } else if (cmdObj.cmd === 'setFan') {
      fetch('/action?fan=' + cmdObj.speed).catch(() => {});
    } else if (cmdObj.cmd === 'setHyst') {
      fetch('/action?hyst=' + cmdObj.hyst).catch(() => {});
    } else if (cmdObj.cmd === 'setChiller') {
      fetch('/action?chiller=' + (cmdObj.enabled ? '1' : '0')).catch(() => {});
    } else if (cmdObj.cmd === 'setWaterTemp') {
      fetch('/action?water_temp=' + cmdObj.temp).catch(() => {});
    } else if (cmdObj.cmd === 'setTimer') {
      fetch('/action?timer_enabled=' + (cmdObj.enabled ? '1' : '0') + '&timer_sec=' + (cmdObj.durationSec || 1800)).catch(() => {});
    }
  }
}

function handleIncomingTelemetry(data) {
  if (!data) return;

  if (data.t_amb !== undefined && data.t_amb !== null && !isNaN(data.t_amb)) {
    currentRoomTemp = parseFloat(data.t_amb);
    const ambEl = document.getElementById('v_t_amb');
    if (ambEl) ambEl.innerText = currentRoomTemp.toFixed(1) + '°';
  } else {
    currentRoomTemp = null;
    const ambEl = document.getElementById('v_t_amb');
    if (ambEl) ambEl.innerText = '--';
  }

  if (data.t_water !== undefined && data.t_water !== null && !isNaN(data.t_water)) {
    const wEl = document.getElementById('t_water');
    if (wEl) wEl.innerText = parseFloat(data.t_water).toFixed(1) + '°';
  } else {
    const wEl = document.getElementById('t_water');
    if (wEl) wEl.innerText = '--';
  }

  if (data.target_water_temp !== undefined) {
    targetWaterTemp = parseFloat(data.target_water_temp);
    const twEl = document.getElementById('target_water_temp_val');
    if (twEl) twEl.innerText = targetWaterTemp.toFixed(1) + '°';
    const twDisp = document.getElementById('t_water_target_disp');
    if (twDisp) twDisp.innerText = targetWaterTemp.toFixed(1) + '°';
  }

  if (data.est_time !== undefined) {
    estimatedTimeToTarget = data.est_time > 0 ? (data.est_time + " min") : "Consigne atteinte";
  }
  if (data.est_water) estimatedTimeToReady = data.est_water;
  if (typeof data.water_ready !== 'undefined') isWaterReady = data.water_ready;

  // Statut du compresseur & sécurité anti-court-cycle (Ancienne bannière + Nouvelle carte dédiée)
  const compState = document.getElementById('compressor-state');
  if (compState && data.compressor_status) {
    compState.innerText = data.compressor_status;
    compState.style.color = data.anti_cycle ? 'var(--orange-alert)' : (data.power ? 'var(--cyan-light)' : 'var(--text-muted)');
  }

  const antiCycleBanner = document.getElementById('anti-cycle-banner');
  const antiCycleTimer = document.getElementById('anti-cycle-timer');
  if (data.anti_cycle && data.anti_cycle_sec > 0) {
    if (antiCycleBanner) antiCycleBanner.style.display = 'block';
    if (antiCycleTimer) {
      const m = Math.floor(data.anti_cycle_sec / 60);
      const s = data.anti_cycle_sec % 60;
      antiCycleTimer.innerText = `${m}m${s < 10 ? '0' : ''}${s}s`;
    }
  } else {
    if (antiCycleBanner) antiCycleBanner.style.display = 'none';
  }

  // Mise à jour de la carte dédiée Compresseur (#card-compressor)
  const compBadge = document.getElementById('comp-state-badge');
  const compIconWrap = document.getElementById('comp-icon-wrap');
  const compSubText = document.getElementById('comp-sub-text');

  let compStateStr = 'off';
  let compModeStr = 'auto';
  let remainingSec = 0;

  if (data.compressor) {
    compStateStr = data.compressor.state || 'off';
    compModeStr = data.compressor.mode || 'auto';
    remainingSec = data.compressor.remaining_delay_sec || 0;
  } else if (data.anti_cycle && data.anti_cycle_sec > 0) {
    compStateStr = 'waiting';
    remainingSec = data.anti_cycle_sec;
  } else if (data.compressor_status && data.compressor_status.includes('En marche')) {
    compStateStr = 'running';
  }

  if (compBadge && compIconWrap && compSubText) {
    compIconWrap.classList.remove('running', 'waiting');
    compBadge.classList.remove('running', 'waiting', 'off');

    if (compStateStr === 'running') {
      compIconWrap.classList.add('running');
      compBadge.classList.add('running');
      compBadge.innerText = t('comp_status_running', 'En marche');
      compSubText.innerText = (compModeStr === 'on') ? 'Marche forcée active' : 'Régulation thermique active';
    } else if (compStateStr === 'waiting') {
      compIconWrap.classList.add('waiting');
      compBadge.classList.add('waiting');
      compBadge.innerText = t('comp_status_waiting', 'Temporisation de sécurité');
      const m = Math.floor(remainingSec / 60);
      const s = remainingSec % 60;
      const timeStr = `${m > 0 ? m + 'm ' : ''}${s}s`;
      compSubText.innerText = `${t('comp_delay_prefix', 'Sécurité compresseur : reprise dans')} ${timeStr}`;
    } else {
      compBadge.classList.add('off');
      compBadge.innerText = t('comp_status_off', 'Éteint');
      compSubText.innerText = (compModeStr === 'off') ? 'Compresseur coupé manuellement' : 'Compresseur en veille';
    }
  }

  if (data.compressor && data.compressor.mode) {
    ['auto', 'on', 'off'].forEach(m => {
      const btn = document.getElementById('btn-comp-' + m);
      if (btn) {
        if (m === data.compressor.mode) btn.classList.add('active');
        else btn.classList.remove('active');
      }
    });
  }

  // Synchronisation de l'état système si initié côté ESP32
  if (data.power !== undefined && data.power !== systemOn) {
    systemOn = data.power;
    const dot = document.getElementById('status-dot');
    const powerStatus = document.getElementById('power-status-text');
    if (dot) {
      if (systemOn) { dot.classList.remove('off'); dot.classList.add('on'); }
      else { dot.classList.remove('on'); dot.classList.add('off'); }
    }
    if (powerStatus) {
      if (systemOn) { powerStatus.classList.remove('off'); powerStatus.classList.add('on'); powerStatus.innerText = 'ON'; }
      else { powerStatus.classList.remove('on'); powerStatus.classList.add('off'); powerStatus.innerText = 'OFF'; }
    }

    if (systemOn) {
      if (timerEnabled) {
        startLocalTimerCountdown();
        updateTimerDisplay();
      }
    } else {
      stopLocalTimerCountdown();
      timerRemainingSec = timerDurationSec;
      updateTimerDisplay();
    }
  }

  // Synchronisation de la Minuterie (Temps de fonctionnement)
  if (data.timer_enabled !== undefined) {
    timerEnabled = (data.timer_enabled === true || data.timer_enabled === 1);
    const timerToggle = document.getElementById('timer-toggle');
    const timerControls = document.getElementById('timer-controls-area');
    if (timerToggle) timerToggle.checked = timerEnabled;
    if (timerControls) {
      if (timerEnabled) timerControls.classList.remove('disabled');
      else timerControls.classList.add('disabled');
    }
  }

  if (data.timer_duration_sec !== undefined && data.timer_duration_sec > 0) {
    timerDurationSec = data.timer_duration_sec;
  }

  if (data.timer_remaining_sec !== undefined) {
    timerRemainingSec = data.timer_remaining_sec;
    updateTimerDisplay();
  }

  if (data.target_temp !== undefined) {
    targetTemp = parseFloat(data.target_temp);
    const ttEl = document.getElementById('target_temp');
    if (ttEl) ttEl.innerText = targetTemp.toFixed(1) + '°';
  }

  if (typeof data.target_enabled !== 'undefined') {
    targetEnabled = data.target_enabled;
    const ttToggle = document.getElementById('target-toggle');
    if (ttToggle) ttToggle.checked = targetEnabled;
    const controls = document.getElementById('target-controls');
    const sub = document.getElementById('target-sub');
    if (controls) {
      if (targetEnabled) controls.classList.remove('disabled');
      else controls.classList.add('disabled');
    }
    if (sub) {
      sub.innerText = targetEnabled ? t('card_target_sub_active', 'Thermostat actif') : t('card_target_sub_inactive', 'Thermostat inactif');
      sub.style.color = targetEnabled ? 'var(--cyan-light)' : 'var(--text-muted)';
    }
  }

  if (typeof data.chiller_enabled !== 'undefined') {
    waterCoolingEnabled = (data.chiller_enabled === 1 || data.chiller_enabled === true);
    const cToggle = document.getElementById('chiller-toggle');
    if (cToggle) cToggle.checked = waterCoolingEnabled;
    const sub = document.getElementById('chiller-sub');
    if (sub) {
      sub.innerText = waterCoolingEnabled ? t('settings_chiller_sub', 'Auto-refroidissement à basse température. Économie batterie van.') : t('settings_chiller_sub_off', 'Refroidissement eau COUPÉ (Mode stationnement / Économie batterie).');
      sub.style.color = waterCoolingEnabled ? 'var(--text-muted)' : 'var(--orange-alert)';
    }
  }

  if (data.energy) {
    const eEl = document.getElementById('v_energy');
    if (eEl) eEl.innerText = (data.energy / 1000).toFixed(2) + ' kWh';
  }

  // État des sondes physiques DS18B20 & Watchdog matériel
  const probesStatusEl = document.getElementById('probes-status');
  if (probesStatusEl && data.probes_count !== undefined) {
    if (data.probe_alert) {
      probesStatusEl.innerText = t('probes_status_alert', "ALERTE (-127°C Déconnexion)");
      probesStatusEl.style.color = "var(--orange-alert)";
    } else if (data.probes_count > 0) {
      probesStatusEl.innerText = t('probes_status_active', "OK ({count} sonde(s) active(s))").replace('{count}', data.probes_count);
      probesStatusEl.style.color = "var(--success)";
    } else {
      probesStatusEl.innerText = t('probes_status_none', "Aucune sonde détectée");
      probesStatusEl.style.color = "var(--text-muted)";
    }
  }

  const watchdogBanner = document.getElementById('watchdog-banner');
  if (watchdogBanner) {
    if (data.probe_alert) {
      watchdogBanner.style.display = 'block';
      watchdogBanner.innerHTML = t('probe_alert_disconnected', "⚠️ ALERTE : Sonde de température déconnectée (-127°C). Sécurité compresseur active.");
    } else if (!watchdogInterval) {
      watchdogBanner.style.display = 'none';
    }
  }

  // Synchronisation dynamique ciblée des équipements avec la télémétrie en direct
  if (devicesList && devicesList.length > 0) {
    let changed = false;
    const airSlotId = (systemsList && systemsList[0]?.bindings?.temp_air_id);
    const waterSlotId = (systemsList && systemsList[0]?.bindings?.temp_water_id);

    if (data.t_amb !== undefined) {
      // Trouver la sonde d'air spécifique (ou la 1ère sonde de température déclarée)
      let airDev = airSlotId ? devicesList.find(d => d.id === airSlotId) : null;
      if (!airDev) {
        airDev = devicesList.find(d => d.mode === 'INPUT_ONEWIRE' || d.mode === 'INPUT_ADC_NTC');
      }
      if (airDev) {
        const newVal = (data.t_amb !== null && !isNaN(data.t_amb)) ? Math.round(data.t_amb * 100) : 0;
        const newState = (data.t_amb !== null && !isNaN(data.t_amb)) ? 1 : 0;
        if (airDev.value !== newVal || airDev.state !== newState) {
          airDev.value = newVal;
          airDev.state = newState;
          changed = true;
        }
      }
    }

    if (data.t_water !== undefined && waterSlotId) {
      const waterDev = devicesList.find(d => d.id === waterSlotId);
      if (waterDev) {
        const newVal = (data.t_water !== null && !isNaN(data.t_water)) ? Math.round(data.t_water * 100) : 0;
        const newState = (data.t_water !== null && !isNaN(data.t_water)) ? 1 : 0;
        if (waterDev.value !== newVal || waterDev.state !== newState) {
          waterDev.value = newVal;
          waterDev.state = newState;
          changed = true;
        }
      }
    }

    const devView = document.getElementById('view-devices');
    const isDevTab = devView && devView.classList.contains('active');
    const isModalOpen = document.querySelector('.modal-backdrop.active');
    if (isDevTab && !isModalOpen && changed) {
      renderDeviceTable(devicesList);
    }
  }

  updateRing();
  try { evaluateAutomations(); } catch (e) {}
}

// =========================================================================
// LOGIQUE CLIMATISATION & CONTRÔLEURS
// =========================================================================

function updateRing() {
  const dial = document.getElementById('main-dial');
  const timeEstDisplay = document.getElementById('dial-time-est');
  const dot = document.getElementById('status-dot');
  const powerStatus = document.getElementById('power-status-text');
  if (!dial || !timeEstDisplay) return;
  
  if (!systemOn) {
    dial.style.background = 'conic-gradient(from -90deg, #334155 0%, #334155 100%)';
    timeEstDisplay.classList.remove('standby');
    timeEstDisplay.classList.add('off');
    timeEstDisplay.innerText = waterCoolingEnabled ? (t('ring_est_ready_prefix', 'Temps estimé avant disponibilité : ') + estimatedTimeToReady) : t('ring_chiller_standby', "Refroidissement d'eau (Chiller) arrêté");
    if (dot) {
      dot.classList.remove('on', 'standby');
      dot.classList.add('off');
    }
    if (powerStatus) {
      powerStatus.classList.remove('on', 'standby');
      powerStatus.classList.add('off');
      powerStatus.innerText = 'OFF';
    }
    return;
  }

  // Climatisation en cours de fonctionnement actif (ON)
  if (dot) {
    dot.classList.remove('off', 'standby');
    dot.classList.add('on');
  }
  if (powerStatus) {
    powerStatus.classList.remove('off', 'standby');
    powerStatus.classList.add('on');
    powerStatus.innerText = 'ON';
  }

  if (!waterCoolingEnabled) {
    dial.style.background = 'conic-gradient(from -90deg, #fb923c 0%, #fb923c 100%)';
    timeEstDisplay.classList.remove('off', 'standby');
    timeEstDisplay.innerText = t('ring_chiller_off', "Refroidissement eau COUPÉ (Ventilation seule)");
    return;
  }

  if (!isWaterReady) {
    dial.style.background = 'conic-gradient(from -90deg, #334155 0%, #334155 100%)';
    timeEstDisplay.classList.remove('off', 'standby');
    timeEstDisplay.innerText = t('ring_est_ready_prefix', 'Temps estimé avant disponibilité : ') + estimatedTimeToReady;
    return;
  }

  timeEstDisplay.classList.remove('off', 'standby');
  if (targetEnabled) {
    timeEstDisplay.innerText = t('ring_est_target_prefix', "Temps estimé jusqu'à ") + targetTemp.toFixed(1) + "°: " + estimatedTimeToTarget;
  } else {
    timeEstDisplay.innerText = t('ring_continuous', "Refroidissement continu actif");
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

    // Démarrage du cycle pour l'historique
    currentCycleStartTime = new Date();
    currentCycleStartTemp = currentRoomTemp;
    currentCycleTargetTemp = targetTemp;
    const activeModeBtn = document.querySelector('.mode-btn.active');
    currentCycleMode = activeModeBtn ? activeModeBtn.innerText.trim() : 'NORMAL';

    if (timerEnabled) {
      timerRemainingSec = timerDurationSec;
      startLocalTimerCountdown();
      updateTimerDisplay();
    }
  } else {
    stopLocalTimerCountdown();

    // Fin du cycle et enregistrement dans la base de données
    if (currentCycleStartTime) {
      const reached = (targetEnabled && currentRoomTemp !== null && currentRoomTemp <= targetTemp + 0.3);
      recordCompletedCycle(reached ? "Consigne atteinte" : "Arrêt manuel");
      currentCycleStartTime = null;
    }

    startTemp = null;
    dot.classList.remove('on'); dot.classList.add('off');
    powerStatus.classList.remove('on'); powerStatus.classList.add('off');
    powerStatus.innerText = 'OFF';

    timerRemainingSec = timerDurationSec;
    updateTimerDisplay();
  }
  
  updateRing(); 
  sendWsCommand({ cmd: 'setPower', power: systemOn });
}

function toggleTarget() {
  targetEnabled = document.getElementById('target-toggle').checked;
  const controls = document.getElementById('target-controls');
  const sub = document.getElementById('target-sub');
  
  if(targetEnabled) {
    controls.classList.remove('disabled');
    sub.innerText = t('card_target_sub_active', 'Thermostat actif');
    sub.style.color = 'var(--cyan-light)';
  } else {
    controls.classList.add('disabled');
    sub.innerText = t('card_target_sub_inactive', 'Thermostat inactif');
    sub.style.color = 'var(--text-muted)';
  }

  if(window.myTempChart) {
    window.myTempChart.data.datasets[2].hidden = !targetEnabled;
    window.myTempChart.update();
  }

  updateRing();
  sendWsCommand({ cmd: 'setTarget', enabled: targetEnabled, temp: targetTemp });
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
  sendWsCommand({ cmd: 'setTarget', enabled: targetEnabled, temp: targetTemp });
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
  
  sendWsCommand({ cmd: 'setMode', mode: mode.toUpperCase() });
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
  sendWsCommand({ cmd: 'setFan', speed: parseInt(slider.value, 10) });
}

function returnToAuto() {
  let defaultBtn = document.getElementById('btn-default-mode');
  setMode('normal', defaultBtn);
}

function updateFanSpeed() {
  const val = document.getElementById('fan-slider').value;
  document.getElementById('fan-val').innerText = val + '%';
  sendWsCommand({ cmd: 'setFan', speed: parseInt(val, 10) });
}

function formatTimerDisplay(totalSeconds) {
  if (totalSeconds < 0 || isNaN(totalSeconds)) totalSeconds = 0;
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (systemOn && timerEnabled) {
    return `${String(h).padStart(2, '0')}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`;
  } else {
    return `${String(h).padStart(2, '0')}h ${String(m).padStart(2, '0')}m`;
  }
}

function updateTimerDisplay() {
  const display = document.getElementById('timer-display');
  if (!display) return;
  if (!timerEnabled) {
    display.innerText = '00h 00m';
    return;
  }
  const secToShow = (systemOn && timerEnabled) ? timerRemainingSec : timerDurationSec;
  display.innerText = formatTimerDisplay(secToShow);
}

function startLocalTimerCountdown() {
  stopLocalTimerCountdown();
  localTimerInterval = setInterval(() => {
    if (!systemOn || !timerEnabled) {
      stopLocalTimerCountdown();
      return;
    }
    if (timerRemainingSec > 0) {
      timerRemainingSec--;
      updateTimerDisplay();
    } else {
      stopLocalTimerCountdown();
      timerRemainingSec = 0;
      updateTimerDisplay();
      if (systemOn) {
        showToast(t('toast_timer_done', 'Minuterie terminée : arrêt automatique.'), 'info');
        togglePower();
      }
    }
  }, 1000);
}

function stopLocalTimerCountdown() {
  if (localTimerInterval) {
    clearInterval(localTimerInterval);
    localTimerInterval = null;
  }
}

function toggleTimerSwitch() {
  timerEnabled = document.getElementById('timer-toggle').checked;
  const controlsArea = document.getElementById('timer-controls-area');
  const timerInputs = document.getElementById('timer-inputs');
  
  if (!timerEnabled) {
    controlsArea.classList.add('disabled');
    if (timerInputs) timerInputs.classList.remove('active');
    document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('timer-display').innerText = '00h 00m';
    stopLocalTimerCountdown();
  } else {
    controlsArea.classList.remove('disabled');
    const activePreset = document.querySelector('.preset-btn.active');
    if (!activePreset) {
      const firstBtn = document.querySelector('.preset-btn');
      if (firstBtn) setPreset('30m', firstBtn);
      else {
        timerDurationSec = 1800;
        timerRemainingSec = 1800;
        updateTimerDisplay();
      }
    } else {
      updateTimerDisplay();
    }

    if (systemOn) {
      timerRemainingSec = timerDurationSec;
      startLocalTimerCountdown();
      updateTimerDisplay();
    }
  }

  sendWsCommand({
    cmd: 'setTimer',
    enabled: timerEnabled,
    durationSec: timerDurationSec
  });
}

function setPreset(time, btn) {
  document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  
  const inputs = document.getElementById('timer-inputs');
  
  if (time === 'perso') {
    if (inputs) inputs.classList.add('active');
  } else {
    if (inputs) inputs.classList.remove('active');
    if (time === '30m') timerDurationSec = 1800;
    if (time === '1h') timerDurationSec = 3600;
    if (time === '2h') timerDurationSec = 7200;
    timerRemainingSec = timerDurationSec;
    updateTimerDisplay();

    if (systemOn && timerEnabled) {
      startLocalTimerCountdown();
    }

    sendWsCommand({
      cmd: 'setTimer',
      enabled: timerEnabled,
      durationSec: timerDurationSec
    });
  }
}

function applyCustomTimer() {
  const hInput = document.getElementById('t-hours');
  const mInput = document.getElementById('t-mins');
  const h = parseInt(hInput ? hInput.value : 0, 10) || 0;
  const m = parseInt(mInput ? mInput.value : 0, 10) || 0;
  
  const totalSec = (h * 3600) + (m * 60);
  if (totalSec <= 0) {
    showToast(t('toast_timer_invalid', 'Veuillez saisir une durée supérieure à 0 minute.'), 'warning');
    return;
  }
  
  timerDurationSec = totalSec;
  timerRemainingSec = timerDurationSec;
  
  // Revenir à l'affichage de base sans les cases modifiables
  const inputs = document.getElementById('timer-inputs');
  if (inputs) inputs.classList.remove('active');
  
  updateTimerDisplay();
  
  if (systemOn && timerEnabled) {
    startLocalTimerCountdown();
  }

  sendWsCommand({
    cmd: 'setTimer',
    enabled: timerEnabled,
    durationSec: timerDurationSec
  });
}

function changeHyst(val) { 
  hyst += val; if(hyst < 0.1) hyst = 0.1; 
  document.getElementById('target_hyst').innerText = '±' + hyst.toFixed(1) + '°'; 
  sendWsCommand({ cmd: 'setHyst', hyst: parseFloat(hyst.toFixed(1)) });
}

function toggleChiller() {
  waterCoolingEnabled = document.getElementById('chiller-toggle').checked;
  const sub = document.getElementById('chiller-sub');
  if (waterCoolingEnabled) {
    sub.innerText = t('settings_chiller_sub', 'Auto-refroidissement à basse température. Économie batterie van.');
    sub.style.color = 'var(--text-muted)';
  } else {
    sub.innerText = t('settings_chiller_sub_off', 'Refroidissement eau COUPÉ (Mode stationnement / Économie batterie).');
    sub.style.color = 'var(--orange-alert)';
  }
  updateRing();
  sendWsCommand({ cmd: 'setChiller', enabled: waterCoolingEnabled });
}

function changeWaterTargetTemp(val) {
  targetWaterTemp += val;
  if (targetWaterTemp < 2.0) targetWaterTemp = 2.0;
  if (targetWaterTemp > 20.0) targetWaterTemp = 20.0;
  targetWaterTemp = parseFloat(targetWaterTemp.toFixed(1));
  const twEl = document.getElementById('target_water_temp_val');
  if (twEl) twEl.innerText = targetWaterTemp.toFixed(1) + '°';
  const twDisp = document.getElementById('t_water_target_disp');
  if (twDisp) twDisp.innerText = targetWaterTemp.toFixed(1) + '°';
  sendWsCommand({ cmd: 'setWaterTemp', temp: targetWaterTemp });
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
      document.getElementById('watchdog-banner').innerHTML = t('watchdog_cutoff', 'COUPURE DE SÉCURITÉ DÉCLENCHÉE.');
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

let deviceAutoRefreshTimer = null;

function startDeviceAutoRefresh() {
  if (deviceAutoRefreshTimer) return;
  // Polling immédiat puis toutes les 3 secondes
  const poll = async () => {
    try {
      const res = await fetch('/api/devices');
      if (res.ok) {
        const data = await res.json();
        if (data && Array.isArray(data.devices)) {
          devicesList = data.devices;
          devicesList.forEach(d => { d.isCore = false; });
          
          const devView = document.getElementById('view-devices');
          const isDevTab = devView && devView.classList.contains('active');
          const isModalOpen = document.querySelector('.modal-backdrop.active');
          
          if (isDevTab && !isModalOpen) {
            renderDeviceTable(devicesList);
          }
          renderDashboardAuxDevices(devicesList);
        }
      }
    } catch (e) {
      // Polling discret
    }
  };
  poll();
  deviceAutoRefreshTimer = setInterval(poll, 3000);
}

function startTelemetry() {
  initWebSocket();

  // Polling de secours si le WebSocket est temporairement déconnecté
  setInterval(function() {
    if (!isWsConnected) {
      fetch('/data')
        .then(response => response.json())
        .then(data => handleIncomingTelemetry(data))
        .catch(err => {
          try { evaluateAutomations(); } catch (e) {}
        });
    }
  }, 2500);

  startDeviceAutoRefresh();
}



// =========================================================================
// GESTIONNAIRE DE L'HISTORIQUE DES CYCLES DE CLIMATISATION
// =========================================================================

/**
 * Enregistre un cycle terminé dans la base de données (LittleFS / localStorage)
 */
async function recordCompletedCycle(status = "Terminé") {
  if (!currentCycleStartTime) return;
  
  const endTime = new Date();
  const durationMs = Math.max(1000, endTime.getTime() - currentCycleStartTime.getTime());
  const durationSec = Math.round(durationMs / 1000);
  
  let durStr = "";
  if (durationSec < 60) {
    durStr = `${durationSec}s`;
  } else {
    const m = Math.floor(durationSec / 60);
    const h = Math.floor(m / 60);
    const remM = m % 60;
    durStr = h > 0 ? `${h}h ${remM < 10 ? '0' : ''}${remM}m` : `${m}m`;
  }
  
  const pad = n => (n < 10 ? '0' : '') + n;
  const dateStr = `${pad(endTime.getDate())}/${pad(endTime.getMonth() + 1)}/${pad(endTime.getFullYear())}`;
  const startStr = `${pad(currentCycleStartTime.getHours())}:${pad(currentCycleStartTime.getMinutes())}`;
  const endStr = `${pad(endTime.getHours())}:${pad(endTime.getMinutes())}`;
  
  // Estimation énergétique : puissance selon le mode * temps
  let modePowerKw = 0.6;
  if (currentCycleMode.includes('BOOST')) modePowerKw = 0.95;
  else if (currentCycleMode.includes('ECO')) modePowerKw = 0.35;
  const energyKwh = parseFloat(((durationSec / 3600) * modePowerKw).toFixed(2));
  
  const nextNum = cyclesList.length + 1;
  const newCycle = {
    id: `CYC-${pad(nextNum)}`,
    date: dateStr,
    startTime: startStr,
    endTime: endStr,
    duration: durStr,
    durationSec: durationSec,
    mode: currentCycleMode,
    startTemp: parseFloat((currentCycleStartTemp || currentRoomTemp).toFixed(1)),
    endTemp: parseFloat(currentRoomTemp.toFixed(1)),
    targetTemp: parseFloat((currentCycleTargetTemp || targetTemp).toFixed(1)),
    energy: energyKwh,
    status: status
  };
  
  cyclesList.unshift(newCycle);
  currentCycleStartTime = null;
  
  // Sauvegarde locale
  try { localStorage.setItem('climate_pro_cycles', JSON.stringify(cyclesList)); } catch(e){}
  
  // Sauvegarde sur l'ESP32 dans LittleFS
  fetch('/api/cycles', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cycles: cyclesList })
  }).catch(err => console.warn("Erreur sauvegarde cycle:", err));
  
  const toastMsg = t('toast_cycle_recorded', 'Cycle {id} enregistré ({dur}, {energy} kWh)')
    .replace('{id}', newCycle.id)
    .replace('{dur}', durStr)
    .replace('{energy}', energyKwh);
  showToast(toastMsg, 'info');
  renderCyclesHistory();
}

/**
 * Charge l'historique des cycles depuis l'API LittleFS ou le stockage local
 */
async function loadCyclesHistory(forceRefresh = false) {
  try {
    const res = await fetch('/api/cycles');
    if (!res.ok) throw new Error('Erreur API');
    const data = await res.json();
    if (data && Array.isArray(data.cycles) && data.cycles.length > 0) {
      cyclesList = data.cycles;
      try { localStorage.setItem('climate_pro_cycles', JSON.stringify(cyclesList)); } catch(e){}
    } else {
      throw new Error('Données cycles vides');
    }
  } catch(err) {
    let loaded = false;
    try {
      const stored = localStorage.getItem('climate_pro_cycles');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          cyclesList = parsed;
          loaded = true;
        }
      }
    } catch(e){}
    
    if (!loaded && cyclesList.length === 0) {
      cyclesList = [
        { id: "CYC-006", date: "07/09/2026", startTime: "13:00", endTime: "13:40", duration: "40m", durationSec: 2400, mode: "BOOST+", startTemp: 30.2, endTemp: 23.5, targetTemp: 20.5, energy: 0.74, status: "Arrêt manuel" },
        { id: "CYC-005", date: "07/09/2026", startTime: "10:15", endTime: "11:00", duration: "45m", durationSec: 2700, mode: "ECO+", startTemp: 24.6, endTemp: 22.8, targetTemp: 22.5, energy: 0.29, status: "Consigne atteinte" },
        { id: "CYC-004", date: "06/09/2026", startTime: "16:00", endTime: "17:30", duration: "1h 30m", durationSec: 5400, mode: "NORMAL", startTemp: 28.1, endTemp: 21.2, targetTemp: 21.0, energy: 0.81, status: "Consigne atteinte" },
        { id: "CYC-003", date: "06/09/2026", startTime: "11:20", endTime: "12:05", duration: "45m", durationSec: 2700, mode: "ECO", startTemp: 25.8, endTemp: 22.4, targetTemp: 22.0, energy: 0.38, status: "Minuterie terminée" },
        { id: "CYC-002", date: "05/09/2026", startTime: "14:10", endTime: "15:10", duration: "1h 00m", durationSec: 3600, mode: "BOOST", startTemp: 29.5, endTemp: 22.0, targetTemp: 21.5, energy: 0.92, status: "Consigne atteinte" },
        { id: "CYC-001", date: "05/09/2026", startTime: "09:30", endTime: "10:45", duration: "1h 15m", durationSec: 4500, mode: "NORMAL", startTemp: 27.2, endTemp: 21.0, targetTemp: 21.0, energy: 0.65, status: "Consigne atteinte" }
      ];
      try { localStorage.setItem('climate_pro_cycles', JSON.stringify(cyclesList)); } catch(e){}
    }
  }
  
  if (forceRefresh) {
    showToast(t('toast_db_refreshed', "Base de données des cycles actualisée"), "info");
  }
  renderCyclesHistory();
}

/**
 * Ouvre la modale de l'historique des cycles
 */
function openCyclesHistoryModal() {
  loadCyclesHistory();
  const modal = document.getElementById('cycles-modal');
  if (modal) modal.classList.add('active');
}

/**
 * Ferme la modale de l'historique des cycles
 */
function closeCyclesHistoryModal() {
  const modal = document.getElementById('cycles-modal');
  if (modal) modal.classList.remove('active');
}

/**
 * Filtre l'affichage de l'historique par mode
 */
function filterCyclesHistory() {
  const select = document.getElementById('history-mode-filter');
  const selectedMode = select ? select.value : 'ALL';
  if (selectedMode === 'ALL') {
    renderCyclesHistory(cyclesList);
  } else {
    const filtered = cyclesList.filter(c => c.mode === selectedMode);
    renderCyclesHistory(filtered);
  }
}

/**
 * Traduit le statut du cycle selon la langue active
 */
function formatCycleStatus(status) {
  if (!status) return t('hist_status_done', 'Terminé');
  if (status === 'Consigne atteinte') return t('hist_status_target_reached', 'Consigne atteinte');
  if (status === 'Arrêt manuel') return t('hist_status_interrupted', 'Arrêt manuel');
  if (status === 'Minuterie terminée') return t('hist_status_timer', 'Minuterie terminée');
  if (status === 'Terminé') return t('hist_status_done', 'Terminé');
  return status;
}

/**
 * Génère le tableau HTML de l'historique et calcule les synthèses
 */
function renderCyclesHistory(cyclesToRender = null) {
  const list = cyclesToRender !== null ? cyclesToRender : cyclesList;
  
  // 1. Calcul des statistiques globales sur la base de données complète
  const totalCycles = cyclesList.length;
  let totalSeconds = 0;
  let totalEnergy = 0;
  
  cyclesList.forEach(c => {
    totalSeconds += (c.durationSec || 0);
    totalEnergy += (c.energy || 0);
  });
  
  const totalH = Math.floor(totalSeconds / 3600);
  const totalM = Math.floor((totalSeconds % 3600) / 60);
  const timeStr = `${totalH}h ${totalM < 10 ? '0' : ''}${totalM}m`;
  
  const elTotCycles = document.getElementById('hist-total-cycles');
  const elTotTime = document.getElementById('hist-total-time');
  const elTotEnergy = document.getElementById('hist-total-energy');
  
  if (elTotCycles) elTotCycles.innerText = totalCycles;
  if (elTotTime) elTotTime.innerText = timeStr;
  if (elTotEnergy) elTotEnergy.innerText = totalEnergy.toFixed(1) + ' kWh';
  
  // 2. Rendu du tableau des cycles sans couleurs sur le statut
  const tbody = document.getElementById('history-table-body');
  if (!tbody) return;
  
  if (list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; color:var(--text-muted); padding:30px;">${t('hist_empty', 'Aucun cycle enregistré pour ce critère.')}</td></tr>`;
    return;
  }
  
  tbody.innerHTML = list.map(c => {
    return `
      <tr>
        <td style="font-weight:700; color:var(--text-main);">${escapeHtml(c.id)}</td>
        <td style="white-space:nowrap; color:var(--text-muted); font-size:12px;">${escapeHtml(c.date)} ${escapeHtml(c.startTime || '')}</td>
        <td><span class="badge" style="background:rgba(255,255,255,0.06); font-weight:bold;">${escapeHtml(c.mode)}</span></td>
        <td class="col-center">${c.startTemp !== undefined ? c.startTemp.toFixed(1) + '°C' : '--'}</td>
        <td class="col-center" style="font-weight:bold;">${c.endTemp !== undefined ? c.endTemp.toFixed(1) + '°C' : '--'}</td>
        <td class="col-center">${c.targetTemp !== undefined ? c.targetTemp.toFixed(1) + '°C' : '--'}</td>
        <td class="col-center">${escapeHtml(c.duration || '--')}</td>
        <td class="col-center">${c.energy !== undefined ? c.energy.toFixed(2) + ' kWh' : '--'}</td>
        <td class="col-center">${escapeHtml(formatCycleStatus(c.status))}</td>
      </tr>
    `;
  }).join('');
}

/**
 * Exporte l'historique complet des cycles au format CSV
 */
function exportCyclesCSV() {
  if (cyclesList.length === 0) {
    showToast(t('toast_no_csv', "Aucun cycle à exporter"), "warning");
    return;
  }
  
  const headers = ["ID", "Date", "HeureDebut", "HeureFin", "Mode", "TempDebut_C", "TempFin_C", "Consigne_C", "Duree", "Energie_kWh", "Statut"];
  const rows = cyclesList.map(c => [
    c.id,
    c.date,
    c.startTime || '',
    c.endTime || '',
    c.mode,
    c.startTemp,
    c.endTemp,
    c.targetTemp,
    c.duration,
    c.energy,
    `"${(c.status || '').replace(/"/g, '""')}"`
  ]);
  
  const csvContent = "data:text/csv;charset=utf-8," + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement('a');
  link.setAttribute('href', encodedUri);
  link.setAttribute('download', `historique_cycles_${new Date().toISOString().slice(0,10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  
  showToast(t('toast_csv_success', "Export CSV généré avec succès"), "success");
}

// =========================================================================
// GESTIONNAIRE WI-FI HYBRIDE & RÉSILIENCE (AP + STATION)
// =========================================================================

let lastWifiData = null;
let wifiScanPollingTimer = null;

/**
 * Charge l'état actuel de la connexion Wi-Fi depuis l'ESP32 (/api/wifi/status)
 */
async function loadWifiStatus() {
  try {
    const res = await fetch('/api/wifi/status');
    if (!res.ok) throw new Error('Erreur API Wi-Fi');
    const data = await res.json();
    lastWifiData = data;
    renderWifiStatus(data);
  } catch (err) {
    console.warn("Impossible de récupérer le statut Wi-Fi:", err);
  }
}

/**
 * Met à jour l'affichage de l'interface Wi-Fi selon les données reçues
 */
function renderWifiStatus(data) {
  if (!data) return;

  const badge = document.getElementById('wifi-status-badge');
  const infoAp = document.getElementById('wifi-info-ap');
  const infoSta = document.getElementById('wifi-info-sta');
  const inputSsid = document.getElementById('wifi-input-ssid');

  if (infoAp) {
    infoAp.innerText = `${data.ap_ssid || 'Van-Clim-Local'} (${data.ap_ip || '192.168.4.1'})`;
  }

  if (data.connected && data.ssid) {
    if (badge) {
      badge.style.background = 'rgba(52, 211, 153, 0.15)';
      badge.style.color = 'var(--success)';
      badge.style.border = '1px solid var(--success)';
      badge.innerText = t('wifi_badge_connected', 'Connecté à {ssid} ({ip})')
        .replace('{ssid}', data.ssid)
        .replace('{ip}', data.ip || 'DHCP');
    }
    if (infoSta) {
      const rssiStr = data.rssi ? `, ${data.rssi} dBm` : '';
      infoSta.innerText = `${data.ssid} (${data.ip}${rssiStr})`;
      infoSta.style.color = 'var(--cyan-light)';
    }
  } else if (data.status === 'connecting') {
    if (badge) {
      badge.style.background = 'rgba(251, 146, 60, 0.15)';
      badge.style.color = 'var(--orange-alert)';
      badge.style.border = '1px solid var(--orange-alert)';
      badge.innerText = t('wifi_badge_connecting', 'Connexion à {ssid} en cours...').replace('{ssid}', data.ssid || '');
    }
    if (infoSta) {
      infoSta.innerText = t('wifi_btn_connecting', 'Connexion en cours...');
      infoSta.style.color = 'var(--orange-alert)';
    }
  } else if (data.status === 'failed') {
    if (badge) {
      badge.style.background = 'rgba(239, 68, 68, 0.15)';
      badge.style.color = 'var(--danger)';
      badge.style.border = '1px solid var(--danger)';
      badge.innerText = t('wifi_badge_failed', 'Échec connexion à {ssid}').replace('{ssid}', data.ssid || '');
    }
    if (infoSta) {
      infoSta.innerText = t('wifi_badge_failed', 'Échec connexion à {ssid}').replace('{ssid}', data.ssid || '');
      infoSta.style.color = 'var(--danger)';
    }
  } else {
    if (badge) {
      badge.style.background = 'rgba(14, 165, 233, 0.15)';
      badge.style.color = 'var(--cyan-dark)';
      badge.style.border = '1px solid var(--cyan-dark)';
      badge.innerText = t('wifi_badge_ap_only', 'Mode autonome (Van-Clim-Local)');
    }
    if (infoSta) {
      infoSta.innerText = data.configured ? `Non connecté (${data.ssid})` : 'Mode autonome (Non configuré)';
      infoSta.style.color = 'var(--text-muted)';
    }
  }

  // Pré-remplir le SSID si configuré et si le champ est vide
  if (inputSsid && !inputSsid.value && data.ssid) {
    inputSsid.value = data.ssid;
  }
}

/**
 * Lance un scan asynchrone des réseaux Wi-Fi et peuple la liste déroulante
 */
async function scanWifiNetworks() {
  const btn = document.getElementById('btn-wifi-scan');
  const btnText = document.getElementById('wifi-scan-btn-text');
  const select = document.getElementById('wifi-scan-select');

  if (btn) btn.disabled = true;
  if (btnText) btnText.innerText = t('wifi_btn_scanning', 'Scan en cours...');

  if (wifiScanPollingTimer) {
    clearInterval(wifiScanPollingTimer);
    wifiScanPollingTimer = null;
  }

  let attempts = 0;
  const maxAttempts = 6;

  const pollScan = async () => {
    attempts++;
    try {
      const res = await fetch('/api/wifi/scan');
      if (!res.ok) throw new Error('Erreur scan');
      const data = await res.json();

      if (data.status === 'complete') {
        if (wifiScanPollingTimer) {
          clearInterval(wifiScanPollingTimer);
          wifiScanPollingTimer = null;
        }

        if (select) {
          select.innerHTML = `<option value="">${t('wifi_select_placeholder', '-- Sélectionnez un réseau détecté --')}</option>`;
          if (Array.isArray(data.networks) && data.networks.length > 0) {
            data.networks.forEach(net => {
              const opt = document.createElement('option');
              opt.value = net.ssid;
              const lock = net.secure ? ' 🔒' : '';
              opt.textContent = `${net.ssid} (${net.rssi} dBm${lock})`;
              select.appendChild(opt);
            });
          }
        }

        const count = Array.isArray(data.networks) ? data.networks.length : 0;
        showToast(t('toast_wifi_scan_done', '{count} réseau(x) Wi-Fi détecté(s)').replace('{count}', count), 'info');

        if (btn) btn.disabled = false;
        if (btnText) btnText.innerText = t('wifi_btn_scan', 'Scanner les réseaux');
      } else if (attempts >= maxAttempts) {
        if (wifiScanPollingTimer) {
          clearInterval(wifiScanPollingTimer);
          wifiScanPollingTimer = null;
        }
        if (btn) btn.disabled = false;
        if (btnText) btnText.innerText = t('wifi_btn_scan', 'Scanner les réseaux');
      }
    } catch (err) {
      console.warn("Erreur polling scan Wi-Fi:", err);
      if (attempts >= maxAttempts) {
        if (wifiScanPollingTimer) {
          clearInterval(wifiScanPollingTimer);
          wifiScanPollingTimer = null;
        }
        if (btn) btn.disabled = false;
        if (btnText) btnText.innerText = t('wifi_btn_scan', 'Scanner les réseaux');
      }
    }
  };

  // Première interrogation immédiate puis polling toutes les 1.5s
  await pollScan();
  if (btn && btn.disabled) {
    wifiScanPollingTimer = setInterval(pollScan, 1500);
  }
}

/**
 * Remplit le champ SSID lorsqu'un réseau est sélectionné dans la liste
 */
function onWifiSelectedFromScan(ssid) {
  if (!ssid) return;
  const inputSsid = document.getElementById('wifi-input-ssid');
  const inputPass = document.getElementById('wifi-input-pass');
  if (inputSsid) inputSsid.value = ssid;
  if (inputPass) {
    inputPass.value = '';
    inputPass.focus();
  }
}

/**
 * Valide et envoie la nouvelle configuration Wi-Fi vers l'ESP32 (/api/wifi/connect)
 */
async function submitWifiConnect() {
  const inputSsid = document.getElementById('wifi-input-ssid');
  const inputPass = document.getElementById('wifi-input-pass');
  const btn = document.getElementById('btn-wifi-connect');
  const btnText = document.getElementById('wifi-connect-btn-text');

  const ssid = inputSsid ? inputSsid.value.trim() : '';
  const pass = inputPass ? inputPass.value.trim() : '';

  if (!ssid) {
    showToast(t('toast_wifi_ssid_required', 'Veuillez saisir le nom du réseau Wi-Fi (SSID).'), 'warning');
    if (inputSsid) inputSsid.focus();
    return;
  }

  if (btn) btn.disabled = true;
  if (btnText) btnText.innerText = t('wifi_btn_connecting', 'Connexion en cours...');

  try {
    const res = await fetch('/api/wifi/connect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ssid: ssid, pass: pass })
    });
    const result = await res.json();
    if (!res.ok || !result.success) {
      throw new Error(result.error || 'Erreur connexion');
    }

    showToast(t('toast_wifi_connecting', 'Connexion à "{ssid}" en cours. L\'AP local reste actif.').replace('{ssid}', ssid), 'info');
  } catch (err) {
    // Si la carte coupe brièvement pour changer de canal radio Wi-Fi, la requête est tout de même prise en compte
    console.warn("fetch /api/wifi/connect:", err);
    showToast(t('toast_wifi_connecting', 'Connexion à "{ssid}" en cours. L\'AP local reste actif.').replace('{ssid}', ssid), 'info');
  } finally {
    // Polling du statut à 2s, 5s, 8s et 12s pour afficher la nouvelle IP
    setTimeout(loadWifiStatus, 2000);
    setTimeout(loadWifiStatus, 5000);
    setTimeout(loadWifiStatus, 8000);
    setTimeout(loadWifiStatus, 12000);

    setTimeout(() => {
      if (btn) btn.disabled = false;
      if (btnText) btnText.innerText = t('wifi_btn_connect', 'Valider la connexion');
    }, 2500);
  }
}

/**
 * Réinitialise la configuration Wi-Fi station et repasse en AP local seul (/api/wifi/reset)
 */
async function forgetWifiNetwork() {
  if (!confirm(t('toast_wifi_forget_confirm', 'Êtes-vous sûr de vouloir oublier la connexion au réseau du van ?'))) {
    return;
  }

  try {
    const res = await fetch('/api/wifi/reset', { method: 'POST' });
    const result = await res.json();

    const inputSsid = document.getElementById('wifi-input-ssid');
    const inputPass = document.getElementById('wifi-input-pass');
    const select = document.getElementById('wifi-scan-select');

    if (inputSsid) inputSsid.value = '';
    if (inputPass) inputPass.value = '';
    if (select) select.value = '';

    showToast(t('toast_wifi_reset_done', 'Réseau du van oublié. Retour au mode AP local seul.'), 'info');
    await loadWifiStatus();
  } catch (err) {
    showToast(`Erreur réinitialisation : ${err.message}`, 'warning');
  }
}

// --- INITIALISATION AU CHARGEMENT DU DOCUMENT ---
function initApp() {
  setLanguage(currentLang);
  try { initWebSocket(); } catch (e) {}
  try { loadWifiStatus(); } catch (e) {}
  try { startDeviceAutoRefresh(); } catch (e) {}
  try { loadDeviceManager(); } catch (e) {}
  try { updateTimerDisplay(); } catch (e) {}
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}

