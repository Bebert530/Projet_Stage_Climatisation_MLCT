#include "WiFiManager.h"

WiFiManager::WiFiManager() : 
    _configPath("/wifi.json"),
    _staSSID("iPhone de Bebert"),
    _staPass("pouletgalant"),
    _apSSID("Van-Clim-Local"),
    _apPass("12345678"),
    _apIP(192, 168, 4, 1),
    _apGateway(192, 168, 4, 1),
    _apSubnet(255, 255, 255, 0),
    _staState(STA_STATE_IDLE),
    _isConfigured(true),
    _isScanning(false),
    _apActive(false),
    _needsDisableAP(false),
    _needsEnableAP(false),
    _needsMdnsRestart(false),
    _pendingConnect(false),
    _pendingConnectTimer(500),
    _connectTimeoutTimer(15000),
    _reconnectTimer(30000),
    _reconnectAttempts(0) {
    _mutex = xSemaphoreCreateMutex();
}

WiFiManager::~WiFiManager() {
    if (_mutex) {
        vSemaphoreDelete(_mutex);
    }
}

bool WiFiManager::begin(const char* configPath) {
    if (configPath != nullptr && strlen(configPath) > 0) {
        _configPath = configPath;
    }

    // 1. Initialisation des événements Wi-Fi asynchrones
    setupEvents();

    // 2. Désactiver la mise en veille RF et la persistance NVS non maîtrisée
    WiFi.persistent(false);

    // 3. Chargement de la configuration Wi-Fi sauvegardée (/wifi.json) avec fallback "iPhone de Bebert"
    if (!loadConfig() || _staSSID.length() == 0) {
        _staSSID = "iPhone de Bebert";
        _staPass = "pouletgalant";
        _isConfigured = true;
        saveConfig();
    }

    // 4. Si un réseau Wi-Fi est connu, tenter la connexion pendant 15s en mode Station pure (AP éteint)
    if (_isConfigured && _staSSID.length() > 0) {
        WiFi.mode(WIFI_STA);
        WiFi.setSleep(false);
        _apActive = false;
        Serial.printf("[WiFiManager] Recherche et tentative de connexion au Wi-Fi connu '%s' (délai : 15s)...\n", _staSSID.c_str());
        _staState = STA_STATE_CONNECTING;
        _connectTimeoutTimer.start(15000);
        WiFi.begin(_staSSID.c_str(), _staPass.c_str());
    } else {
        // Aucun Wi-Fi connu configuré : Allumage immédiat de l'Access Point
        Serial.println("[WiFiManager] Aucun Wi-Fi connu configuré. Activation immédiate du point d'accès AP.");
        enableAP();
        setupMDNS();
    }

    return true;
}

void WiFiManager::enableAP() {
    if (_apActive) return;

    WiFiMode_t currentMode = WiFi.getMode();
    if (currentMode == WIFI_STA || currentMode == WIFI_OFF) {
        WiFi.mode(WIFI_AP_STA);
    }
    WiFi.setSleep(false);
    WiFi.softAPConfig(_apIP, _apGateway, _apSubnet);
    bool ok = WiFi.softAP(_apSSID.c_str(), _apPass.c_str(), 1, 0, 4);
    
    Serial.println("\n--------------------------------------------------");
    if (ok) {
        _apActive = true;
        Serial.printf("[WiFiManager] Point d'accès Wi-Fi activé : %s\n", _apSSID.c_str());
        Serial.printf("[WiFiManager] Mot de passe Wi-Fi         : %s\n", _apPass.c_str());
        Serial.printf("[WiFiManager] Adresse IP AP              : http://%s/\n", WiFi.softAPIP().toString().c_str());
        Serial.println("[WiFiManager] Accès mDNS                 : http://clim.local/");
    } else {
        Serial.println("[WiFiManager] ERREUR : Impossible d'activer le point d'accès SoftAP !");
    }
    Serial.println("--------------------------------------------------");
}

void WiFiManager::disableAP() {
    if (!_apActive) return;

    WiFi.softAPdisconnect(true);
    WiFi.enableAP(false);
    WiFi.mode(WIFI_STA);
    WiFi.setSleep(false);
    _apActive = false;
    Serial.println("[WiFiManager] Point d'accès Wi-Fi désactivé (l'ESP32 est connecté à un réseau Wi-Fi connu).");
}

void WiFiManager::setupMDNS() {
    MDNS.end();
    if (MDNS.begin("clim")) {
        MDNS.addService("http", "tcp", 80);
        Serial.println("[WiFiManager] Résolveur mDNS actif : http://clim.local/");
    } else {
        Serial.println("[WiFiManager] Avertissement : échec initialisation mDNS.");
    }
}

void WiFiManager::setupEvents() {
    WiFi.onEvent([this](WiFiEvent_t event, WiFiEventInfo_t info) {
        this->onWiFiEvent(event, info);
    });
}

void WiFiManager::onWiFiEvent(WiFiEvent_t event, WiFiEventInfo_t info) {
    switch (event) {
        case ARDUINO_EVENT_WIFI_STA_START:
            Serial.println("[WiFiManager] Interface Station démarrée.");
            break;

        case ARDUINO_EVENT_WIFI_STA_CONNECTED:
            Serial.printf("[WiFiManager] Connecté au point d'accès station '%s'. En attente d'IP...\n", WiFi.SSID().c_str());
            break;

        case ARDUINO_EVENT_WIFI_STA_GOT_IP:
            xSemaphoreTake(_mutex, portMAX_DELAY);
            _staState = STA_STATE_CONNECTED;
            _reconnectAttempts = 0;
            _connectTimeoutTimer.stop();
            _needsDisableAP = true;
            _needsMdnsRestart = true;
            xSemaphoreGive(_mutex);

            Serial.println("==================================================");
            Serial.printf("[WiFiManager] IP Station obtenue (DHCP) : %s\n", WiFi.localIP().toString().c_str());
            Serial.printf("[WiFiManager] Force du signal (RSSI)   : %d dBm\n", WiFi.RSSI());
            Serial.printf("[WiFiManager] Accès réseau du van      : http://%s/\n", WiFi.localIP().toString().c_str());
            Serial.printf("[WiFiManager] Accès mDNS local         : http://clim.local/\n");
            Serial.println("==================================================");
            break;

        case ARDUINO_EVENT_WIFI_STA_DISCONNECTED:
            xSemaphoreTake(_mutex, portMAX_DELAY);
            _staState = STA_STATE_DISCONNECTED;
            if (!_apActive && !_connectTimeoutTimer.isRunning()) {
                // Laisser 15s pour retenter la connexion avant de rallumer l'AP de secours
                _connectTimeoutTimer.start(15000);
            }
            xSemaphoreGive(_mutex);
            Serial.println("[WiFiManager] Déconnexion du réseau Station (Van).");
            break;

        case ARDUINO_EVENT_WIFI_AP_STACONNECTED:
            Serial.println("[WiFiManager] Nouveau client connecté à l'AP 'Van-Clim-Local'.");
            break;

        case ARDUINO_EVENT_WIFI_AP_STADISCONNECTED:
            Serial.println("[WiFiManager] Client déconnecté de l'AP 'Van-Clim-Local'.");
            break;

        default:
            break;
    }
}

void WiFiManager::update() {
    // 0. Actions asynchrones déclenchées par les événements réseau (hors ISR/Event task)
    xSemaphoreTake(_mutex, portMAX_DELAY);
    bool doDisableAP = _needsDisableAP;
    bool doEnableAP = _needsEnableAP;
    bool doRestartMdns = _needsMdnsRestart;
    _needsDisableAP = false;
    _needsEnableAP = false;
    _needsMdnsRestart = false;
    xSemaphoreGive(_mutex);

    if (doDisableAP) {
        disableAP();
    }
    if (doEnableAP) {
        enableAP();
    }
    if (doRestartMdns) {
        setupMDNS();
    }

    // 1. Lancement différé de la connexion pour laisser le temps à la réponse HTTP 200 de partir
    xSemaphoreTake(_mutex, portMAX_DELAY);
    if (_pendingConnect && _pendingConnectTimer.hasExpired()) {
        _pendingConnect = false;
        _pendingConnectTimer.stop();
        String ssid = _staSSID;
        String pass = _staPass;
        xSemaphoreGive(_mutex);

        Serial.printf("[WiFiManager] Démarrage connexion vers '%s'...\n", ssid.c_str());
        WiFi.disconnect(false);
        WiFi.mode(_apActive ? WIFI_AP_STA : WIFI_STA);
        WiFi.setSleep(false);
        WiFi.begin(ssid.c_str(), pass.c_str());
        return;
    }
    xSemaphoreGive(_mutex);

    // 2. Timeout de recherche de connexion station (15 secondes)
    // Si aucun réseau connu n'est joint après 15 secondes -> allumage de l'AP de secours
    xSemaphoreTake(_mutex, portMAX_DELAY);
    if (_staState == STA_STATE_CONNECTING || _staState == STA_STATE_DISCONNECTED) {
        if (_connectTimeoutTimer.isRunning() && _connectTimeoutTimer.hasExpired()) {
            Serial.println("[WiFiManager] Aucun Wi-Fi connu trouvé après 15s de recherche -> Allumage du point d'accès AP.");
            _connectTimeoutTimer.stop();
            _staState = STA_STATE_FAILED;
            _reconnectTimer.start(30000);
            xSemaphoreGive(_mutex);

            enableAP();
            setupMDNS();
            return;
        }
    }

    // 3. Reconnexion automatique non-bloquante si configuré et déconnecté (toutes les 30 secondes)
    if (_isConfigured && !_pendingConnect && _staSSID.length() > 0 && (_staState == STA_STATE_DISCONNECTED || _staState == STA_STATE_FAILED)) {
        if (!_reconnectTimer.isRunning() || _reconnectTimer.hasExpired()) {
            _reconnectTimer.start(30000);
            _reconnectAttempts++;
            Serial.printf("[WiFiManager] Tentative de reconnexion station #%d à '%s'...\n", _reconnectAttempts, _staSSID.c_str());
            _staState = STA_STATE_CONNECTING;
            _connectTimeoutTimer.start(15000);
            WiFi.begin(_staSSID.c_str(), _staPass.c_str());
        }
    }
    xSemaphoreGive(_mutex);
}

bool WiFiManager::connectSTA(const String& ssid, const String& pass) {
    if (ssid.length() == 0) return false;

    xSemaphoreTake(_mutex, portMAX_DELAY);
    _staSSID = ssid;
    _staPass = pass;
    _isConfigured = true;
    _staState = STA_STATE_CONNECTING;
    _connectTimeoutTimer.start(15000);
    _reconnectAttempts = 0;
    _pendingConnect = true;
    _pendingConnectTimer.start(500); // 500ms de répit pour vider la réponse HTTP 200 vers le client
    xSemaphoreGive(_mutex);

    // Sauvegarde persistante dans LittleFS
    saveConfig();

    Serial.printf("[WiFiManager] Paramètres Wi-Fi enregistrés pour '%s'. Connexion programmée dans 500ms...\n", ssid.c_str());
    return true;
}

bool WiFiManager::resetSTA() {
    xSemaphoreTake(_mutex, portMAX_DELAY);
    _staSSID = "";
    _staPass = "";
    _isConfigured = false;
    _staState = STA_STATE_IDLE;
    _connectTimeoutTimer.stop();
    _reconnectTimer.stop();
    xSemaphoreGive(_mutex);

    if (LittleFS.exists(_configPath.c_str())) {
        LittleFS.remove(_configPath.c_str());
        Serial.printf("[WiFiManager] Configuration %s supprimée.\n", _configPath.c_str());
    }

    WiFi.disconnect(false);
    // S'assurer que l'AP est actif pour ne pas perdre l'accès
    enableAP();
    setupMDNS();
    Serial.println("[WiFiManager] Mode station réinitialisé. Seul le point d'accès 'Van-Clim-Local' est actif.");
    return true;
}

bool WiFiManager::startScan() {
    WiFiMode_t currentMode = WiFi.getMode();
    if (currentMode == WIFI_AP) {
        WiFi.mode(WIFI_AP_STA);
    }
    int16_t scanRes = WiFi.scanComplete();
    if (scanRes == -1) {
        // Scan déjà en cours
        return true;
    }
    // Lancement asynchrone non-bloquant
    WiFi.scanNetworks(true, false);
    _isScanning = true;
    Serial.println("[WiFiManager] Scan Wi-Fi asynchrone lancé.");
    return true;
}

String WiFiManager::getScanResultsJson() {
    int16_t scanRes = WiFi.scanComplete();

#if defined(ARDUINOJSON_VERSION_MAJOR) && (ARDUINOJSON_VERSION_MAJOR >= 7)
    JsonDocument doc;
#else
    DynamicJsonDocument doc(2048);
#endif

    if (scanRes == -1) {
        doc["status"] = "scanning";
        doc["count"] = 0;
        doc["networks"].to<JsonArray>();
    } else if (scanRes == -2) {
        // Pas encore scanné, lancer automatiquement
        startScan();
        doc["status"] = "scanning";
        doc["count"] = 0;
        doc["networks"].to<JsonArray>();
    } else {
        doc["status"] = "complete";
        doc["count"] = scanRes;
        JsonArray arr = doc["networks"].to<JsonArray>();

        for (int i = 0; i < scanRes; i++) {
            String ssid = WiFi.SSID(i);
            if (ssid.length() == 0) continue; // Ignorer les réseaux masqués

            JsonObject net = arr.add<JsonObject>();
            net["ssid"] = ssid;
            net["rssi"] = WiFi.RSSI(i);
            net["channel"] = WiFi.channel(i);
            net["secure"] = (WiFi.encryptionType(i) != WIFI_AUTH_OPEN);
        }

        // Nettoyer les résultats du scan en mémoire
        WiFi.scanDelete();
        _isScanning = false;
    }

    String output;
    serializeJson(doc, output);
    return output;
}

String WiFiManager::getStatusJson() {
    xSemaphoreTake(_mutex, portMAX_DELAY);

#if defined(ARDUINOJSON_VERSION_MAJOR) && (ARDUINOJSON_VERSION_MAJOR >= 7)
    JsonDocument doc;
#else
    DynamicJsonDocument doc(512);
#endif

    bool connected = (WiFi.status() == WL_CONNECTED);
    String statusStr = "disconnected";
    if (connected) {
        statusStr = "connected";
    } else if (_staState == STA_STATE_CONNECTING) {
        statusStr = "connecting";
    } else if (_staState == STA_STATE_FAILED) {
        statusStr = "failed";
    }

    doc["status"] = statusStr;
    doc["connected"] = connected;
    doc["configured"] = _isConfigured;
    doc["ssid"] = connected ? WiFi.SSID() : _staSSID;
    doc["ip"] = connected ? WiFi.localIP().toString() : "0.0.0.0";
    doc["rssi"] = connected ? WiFi.RSSI() : 0;
    doc["ap_active"] = _apActive;
    doc["ap_ssid"] = _apActive ? _apSSID : "";
    doc["ap_ip"] = _apActive ? WiFi.softAPIP().toString() : "0.0.0.0";
    doc["mdns"] = "http://clim.local";

    String output;
    serializeJson(doc, output);
    xSemaphoreGive(_mutex);
    return output;
}

bool WiFiManager::loadConfig() {
    xSemaphoreTake(_mutex, portMAX_DELAY);
    if (!LittleFS.exists(_configPath.c_str())) {
        _isConfigured = false;
        xSemaphoreGive(_mutex);
        return false;
    }

    File file = LittleFS.open(_configPath.c_str(), "r");
    if (!file) {
        _isConfigured = false;
        xSemaphoreGive(_mutex);
        return false;
    }

#if defined(ARDUINOJSON_VERSION_MAJOR) && (ARDUINOJSON_VERSION_MAJOR >= 7)
    JsonDocument doc;
#else
    DynamicJsonDocument doc(512);
#endif

    DeserializationError error = deserializeJson(doc, file);
    file.close();

    if (error) {
        Serial.printf("[WiFiManager] Erreur lecture %s : %s\n", _configPath.c_str(), error.c_str());
        _isConfigured = false;
        xSemaphoreGive(_mutex);
        return false;
    }

    _staSSID = doc["ssid"] | "";
    _staPass = doc["pass"] | "";
    _isConfigured = (_staSSID.length() > 0);

    xSemaphoreGive(_mutex);
    return _isConfigured;
}

bool WiFiManager::saveConfig() {
    xSemaphoreTake(_mutex, portMAX_DELAY);

#if defined(ARDUINOJSON_VERSION_MAJOR) && (ARDUINOJSON_VERSION_MAJOR >= 7)
    JsonDocument doc;
#else
    DynamicJsonDocument doc(512);
#endif

    doc["ssid"] = _staSSID;
    doc["pass"] = _staPass;

    File file = LittleFS.open(_configPath.c_str(), "w");
    if (!file) {
        Serial.printf("[WiFiManager] Erreur écriture %s\n", _configPath.c_str());
        xSemaphoreGive(_mutex);
        return false;
    }

    if (serializeJsonPretty(doc, file) == 0) {
        Serial.println("[WiFiManager] Échec écriture JSON Wi-Fi.");
        file.close();
        xSemaphoreGive(_mutex);
        return false;
    }

    file.close();
    xSemaphoreGive(_mutex);
    Serial.printf("[WiFiManager] Configuration Wi-Fi enregistrée dans %s.\n", _configPath.c_str());
    return true;
}

bool WiFiManager::isStaConnected() const {
    return (WiFi.status() == WL_CONNECTED);
}

bool WiFiManager::isApActive() const {
    return _apActive;
}

String WiFiManager::getStaSSID() const {
    return isStaConnected() ? WiFi.SSID() : _staSSID;
}

String WiFiManager::getStaIP() const {
    return isStaConnected() ? WiFi.localIP().toString() : "0.0.0.0";
}

int8_t WiFiManager::getStaRSSI() const {
    return isStaConnected() ? WiFi.RSSI() : 0;
}

String WiFiManager::getApSSID() const {
    return _apSSID;
}

String WiFiManager::getApIP() const {
    return _apActive ? WiFi.softAPIP().toString() : "0.0.0.0";
}

bool WiFiManager::isConfigured() const {
    return _isConfigured;
}
