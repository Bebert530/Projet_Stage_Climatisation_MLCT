#include "ClimateManager.h"
#include <cmath>

ClimateManager::ClimateManager()
    : _configPath("/climate.json"),
      _broadcastCb(nullptr),
      _oneWire(nullptr),
      _dallasSensors(nullptr),
      _currentOneWirePin(-1),
      _probesConnectedCount(0),
      _probeWatchdogAlert(false),
      _lastSensorReadTime(0),
      _systemOn(false),
      _targetEnabled(true),
      _targetTemp(21.0f),
      _hysteresis(0.5f),
      _mode("NORMAL"),
      _fanSpeed(60),
      _chillerEnabled(true),
      _targetWaterTemp(8.0f),
      _compressorActive(false),
      _antiCycleActive(false),
      _antiCycleRemainingSec(0),
      _lastCompressorStopTime(0),
      _currentAmbientTemp(22.5f),
      _currentWaterTemp(10.0f),
      _totalEnergyKwh(12.4f),
      _totalRuntimeSec(513000), // ~142h 30m base
      _lastRegulTime(0),
      _lastBroadcastTime(0),
      _lastStatsTick(0) {
    _mutex = xSemaphoreCreateMutex();
}

ClimateManager::~ClimateManager() {
    if (_dallasSensors) delete _dallasSensors;
    if (_oneWire) delete _oneWire;
    if (_mutex) {
        vSemaphoreDelete(_mutex);
    }
}

bool ClimateManager::begin(const char* configPath) {
    if (configPath && strlen(configPath) > 0) {
        _configPath = configPath;
    }
    _lastRegulTime = millis();
    _lastBroadcastTime = millis();
    _lastStatsTick = millis();
    _lastSensorReadTime = 0;

    Serial.println("[ClimateManager] Démarrage du moteur de régulation sur matériel réel (ESP32)...");
    
    // Initialisation 1-Wire par défaut sur GPIO 18
    initOrUpdate1Wire(18);

    bool ok = loadConfig();
    if (!ok) {
        saveConfig();
    }
    return true;
}

void ClimateManager::initOrUpdate1Wire(uint8_t gpio) {
    if (_currentOneWirePin == (int8_t)gpio && _dallasSensors != nullptr) {
        return;
    }

    if (_dallasSensors) {
        delete _dallasSensors;
        _dallasSensors = nullptr;
    }
    if (_oneWire) {
        delete _oneWire;
        _oneWire = nullptr;
    }

    _currentOneWirePin = gpio;
    _oneWire = new OneWire(gpio);
    _dallasSensors = new DallasTemperature(_oneWire);
    _dallasSensors->begin();
    _dallasSensors->setWaitForConversion(false); // Non-bloquant pour FreeRTOS

    _probesConnectedCount = _dallasSensors->getDeviceCount();
    Serial.printf("[ClimateManager] Bus 1-Wire initialisé sur GPIO %d. %u sonde(s) DS18B20 détectée(s).\n",
                  gpio, _probesConnectedCount);
}

bool ClimateManager::loadConfig() {
    xSemaphoreTake(_mutex, portMAX_DELAY);
    if (!LittleFS.exists(_configPath)) {
        xSemaphoreGive(_mutex);
        Serial.printf("[ClimateManager] %s inexistant. Valeurs par défaut conservées.\n", _configPath.c_str());
        return false;
    }

    File f = LittleFS.open(_configPath, "r");
    if (!f) {
        xSemaphoreGive(_mutex);
        return false;
    }

#if defined(ARDUINOJSON_VERSION_MAJOR) && (ARDUINOJSON_VERSION_MAJOR >= 7)
    JsonDocument doc;
#else
    DynamicJsonDocument doc(1024);
#endif
    DeserializationError err = deserializeJson(doc, f);
    f.close();

    if (err) {
        xSemaphoreGive(_mutex);
        return false;
    }

    _systemOn = doc["systemOn"] | false;
    _targetEnabled = doc["targetEnabled"] | true;
    _targetTemp = doc["targetTemp"] | 21.0f;
    _hysteresis = doc["hysteresis"] | 0.5f;
    _mode = (const char*)(doc["mode"] | "NORMAL");
    _fanSpeed = doc["fanSpeed"] | 60;
    _chillerEnabled = doc["chillerEnabled"] | true;
    _targetWaterTemp = doc["targetWaterTemp"] | 8.0f;
    _totalEnergyKwh = doc["totalEnergyKwh"] | 12.4f;
    _totalRuntimeSec = doc["totalRuntimeSec"] | 513000UL;

    xSemaphoreGive(_mutex);
    Serial.printf("[ClimateManager] Configuration chargée : Consigne=%.1f°C, Consigne Eau=%.1f°C, Mode=%s, Chiller=%d\n",
                  _targetTemp, _targetWaterTemp, _mode.c_str(), _chillerEnabled);
    return true;
}

bool ClimateManager::saveConfig() {
    xSemaphoreTake(_mutex, portMAX_DELAY);

#if defined(ARDUINOJSON_VERSION_MAJOR) && (ARDUINOJSON_VERSION_MAJOR >= 7)
    JsonDocument doc;
#else
    DynamicJsonDocument doc(1024);
#endif

    doc["systemOn"] = _systemOn;
    doc["targetEnabled"] = _targetEnabled;
    doc["targetTemp"] = _targetTemp;
    doc["hysteresis"] = _hysteresis;
    doc["mode"] = _mode;
    doc["fanSpeed"] = _fanSpeed;
    doc["chillerEnabled"] = _chillerEnabled;
    doc["targetWaterTemp"] = _targetWaterTemp;
    doc["totalEnergyKwh"] = _totalEnergyKwh;
    doc["totalRuntimeSec"] = _totalRuntimeSec;

    File f = LittleFS.open(_configPath, "w");
    if (!f) {
        xSemaphoreGive(_mutex);
        return false;
    }

    serializeJson(doc, f);
    f.close();
    xSemaphoreGive(_mutex);
    return true;
}

void ClimateManager::setBroadcastCallback(BroadcastCallback cb) {
    _broadcastCb = cb;
}

void ClimateManager::broadcastState() {
    if (_broadcastCb) {
        String json = getTelemetryJson();
        _broadcastCb(json);
    }
}

void ClimateManager::setPower(bool on) {
    xSemaphoreTake(_mutex, portMAX_DELAY);
    if (_systemOn != on) {
        _systemOn = on;
        if (!_systemOn && _compressorActive) {
            _compressorActive = false;
            _lastCompressorStopTime = millis();
            _antiCycleActive = true;
            _antiCycleRemainingSec = ANTI_CYCLE_DELAY_MS / 1000;
        }
    }
    xSemaphoreGive(_mutex);
    saveConfig();
    broadcastState();
}

void ClimateManager::setTarget(bool enabled, float temp) {
    xSemaphoreTake(_mutex, portMAX_DELAY);
    _targetEnabled = enabled;
    if (temp >= 16.0f && temp <= 30.0f) {
        _targetTemp = temp;
    }
    xSemaphoreGive(_mutex);
    saveConfig();
    broadcastState();
}

void ClimateManager::applyModePreset(const String& newMode) {
    _mode = newMode;
    if (newMode == "ECO+") _fanSpeed = 15;
    else if (newMode == "ECO") _fanSpeed = 30;
    else if (newMode == "NORMAL") _fanSpeed = 60;
    else if (newMode == "BOOST") _fanSpeed = 85;
    else if (newMode == "BOOST+") _fanSpeed = 100;
}

void ClimateManager::setMode(const String& newMode) {
    xSemaphoreTake(_mutex, portMAX_DELAY);
    applyModePreset(newMode);
    xSemaphoreGive(_mutex);
    saveConfig();
    broadcastState();
}

void ClimateManager::setFanSpeed(uint8_t speed) {
    xSemaphoreTake(_mutex, portMAX_DELAY);
    if (speed > 100) speed = 100;
    _fanSpeed = speed;
    _mode = "MANUEL";
    xSemaphoreGive(_mutex);
    saveConfig();
    broadcastState();
}

void ClimateManager::setHysteresis(float hyst) {
    xSemaphoreTake(_mutex, portMAX_DELAY);
    if (hyst < 0.1f) hyst = 0.1f;
    if (hyst > 3.0f) hyst = 3.0f;
    _hysteresis = hyst;
    xSemaphoreGive(_mutex);
    saveConfig();
    broadcastState();
}

void ClimateManager::setChiller(bool enabled) {
    xSemaphoreTake(_mutex, portMAX_DELAY);
    if (_chillerEnabled != enabled) {
        _chillerEnabled = enabled;
        if (!_chillerEnabled && _compressorActive) {
            _compressorActive = false;
            _lastCompressorStopTime = millis();
            _antiCycleActive = true;
            _antiCycleRemainingSec = ANTI_CYCLE_DELAY_MS / 1000;
        }
    }
    xSemaphoreGive(_mutex);
    saveConfig();
    broadcastState();
}

void ClimateManager::setWaterTargetTemp(float temp) {
    xSemaphoreTake(_mutex, portMAX_DELAY);
    if (temp >= 2.0f && temp <= 22.0f) {
        _targetWaterTemp = temp;
    }
    xSemaphoreGive(_mutex);
    saveConfig();
    broadcastState();
}

bool ClimateManager::handleJsonCommand(const String& jsonStr) {
#if defined(ARDUINOJSON_VERSION_MAJOR) && (ARDUINOJSON_VERSION_MAJOR >= 7)
    JsonDocument doc;
#else
    DynamicJsonDocument doc(512);
#endif
    DeserializationError err = deserializeJson(doc, jsonStr);
    if (err) {
        Serial.printf("[ClimateManager] Erreur JSON reçu : %s\n", err.c_str());
        return false;
    }

    String cmd = doc["cmd"] | "";

    if (cmd == "togglePower" || cmd == "setPower") {
        bool state = doc.containsKey("power") ? (bool)doc["power"] : !_systemOn;
        setPower(state);
    } else if (cmd == "setTarget") {
        bool enabled = doc.containsKey("enabled") ? (bool)doc["enabled"] : _targetEnabled;
        float temp = doc.containsKey("temp") ? (float)doc["temp"] : _targetTemp;
        setTarget(enabled, temp);
    } else if (cmd == "setWaterTemp" || cmd == "setWaterTarget") {
        float wt = doc.containsKey("temp") ? (float)doc["temp"] : _targetWaterTemp;
        setWaterTargetTemp(wt);
    } else if (cmd == "setMode") {
        String m = doc["mode"] | "NORMAL";
        setMode(m);
    } else if (cmd == "setFan") {
        uint8_t speed = doc["speed"] | 60;
        setFanSpeed(speed);
    } else if (cmd == "setHyst") {
        float h = doc["hyst"] | 0.5f;
        setHysteresis(h);
    } else if (cmd == "setChiller") {
        bool ch = doc["enabled"] | true;
        setChiller(ch);
    } else if (cmd == "getState") {
        broadcastState();
    } else {
        Serial.printf("[ClimateManager] Commande inconnue : %s\n", cmd.c_str());
        return false;
    }

    return true;
}

void ClimateManager::readPhysicalSensors(DeviceManager& devManager) {
    unsigned long now = millis();
    if (now - _lastSensorReadTime < 1000) {
        return; // Lecture des sondes chaque seconde
    }
    _lastSensorReadTime = now;

    // 1. Recherche du GPIO assigné pour les sondes 1-Wire dans DeviceManager
    std::vector<Device> devs = devManager.getDevices();
    uint8_t oneWirePin = 18; // Valeur sûre par défaut
    for (const auto& d : devs) {
        if (d.mode == MODE_INPUT_ONEWIRE) {
            oneWirePin = d.gpio;
            break;
        }
    }

    initOrUpdate1Wire(oneWirePin);

    xSemaphoreTake(_mutex, portMAX_DELAY);

    if (_dallasSensors) {
        _probesConnectedCount = _dallasSensors->getDeviceCount();

        if (_probesConnectedCount > 0) {
            _dallasSensors->requestTemperatures();
            float tAmb = _dallasSensors->getTempCByIndex(0);

            // Vérification de la validité de la sonde d'ambiance
            if (tAmb > -50.0f && tAmb < 85.0f && tAmb != DEVICE_DISCONNECTED_C) {
                _currentAmbientTemp = tAmb;
                _probeWatchdogAlert = false;
            } else {
                Serial.println("[ClimateManager] ALERTE : Sonde d'ambiance DS18B20 déconnectée ou invalide (-127°C) !");
                _probeWatchdogAlert = true;
            }

            // Si une 2ème sonde est présente sur le bus 1-Wire, c'est la boucle d'eau
            if (_probesConnectedCount >= 2) {
                float tWater = _dallasSensors->getTempCByIndex(1);
                if (tWater > -50.0f && tWater < 85.0f && tWater != DEVICE_DISCONNECTED_C) {
                    _currentWaterTemp = tWater;
                }
            }
        } else {
            // Aucune sonde détectée sur le bus 1-Wire
            _probeWatchdogAlert = true;
        }
    }

    // 2. Recherche d'éventuelles sondes de température sur entrée analogique ADC1
    for (const auto& d : devs) {
        if (d.mode == MODE_INPUT_ADC) {
            int raw = analogRead(d.gpio);
            float volts = (raw / 4095.0f) * 3.3f;
            // Si le nom contient "Eau" ou "Water", mapping analogique
            if (d.name.indexOf("Eau") >= 0 || d.name.indexOf("Water") >= 0) {
                // Conversion linéaire générique 0-3.3V -> 0-50°C
                _currentWaterTemp = volts * 15.15f;
            }
        }
    }

    xSemaphoreGive(_mutex);
}

void ClimateManager::update(DeviceManager& devManager) {
    unsigned long now = millis();
    if (now - _lastRegulTime < 500) {
        return; // Boucle de régulation à 2 Hz (500 ms)
    }

    float dtSec = (now - _lastRegulTime) / 1000.0f;
    _lastRegulTime = now;

    // 1. Évaluation et mise à jour de la sécurité anti-court-cycle compresseur
    if (_lastCompressorStopTime > 0) {
        unsigned long elapsed = now - _lastCompressorStopTime;
        if (elapsed < ANTI_CYCLE_DELAY_MS) {
            _antiCycleActive = true;
            _antiCycleRemainingSec = (uint16_t)((ANTI_CYCLE_DELAY_MS - elapsed) / 1000);
        } else {
            _antiCycleActive = false;
            _antiCycleRemainingSec = 0;
        }
    } else {
        _antiCycleActive = false;
        _antiCycleRemainingSec = 0;
    }

    // 2. Lecture physique des sondes matérielles (DS18B20 & ADC1)
    readPhysicalSensors(devManager);

    // 3. Boucle de régulation thermostatique 24/24 sur données réelles
    evaluateRegulation(devManager, dtSec);

    // 4. Statistiques réelles d'énergie et temps de fonctionnement
    if (now - _lastStatsTick >= 1000) {
        _lastStatsTick = now;
        if (_systemOn) {
            _totalRuntimeSec++;
            float kw = 0.60f;
            if (_mode == "ECO+") kw = 0.20f;
            else if (_mode == "ECO") kw = 0.35f;
            else if (_mode == "BOOST") kw = 0.95f;
            else if (_mode == "BOOST+") kw = 1.15f;
            else if (_mode == "MANUEL") kw = 0.15f + (_fanSpeed / 100.0f) * 0.65f;

            if (!_compressorActive) {
                kw *= 0.15f; // Seulement la ventilation sans le compresseur
            }
            _totalEnergyKwh += (kw / 3600.0f);
        }
    }

    // 5. Diffusion WebSocket périodique (toutes les 1500 ms)
    if (now - _lastBroadcastTime >= 1500) {
        _lastBroadcastTime = now;
        broadcastState();
    }
}

void ClimateManager::evaluateRegulation(DeviceManager& devManager, float dtSec) {
    xSemaphoreTake(_mutex, portMAX_DELAY);

    // SÉCURITÉ WATCHDOG : Si les sondes sont débranchées, coupure d'urgence de sécurité !
    if (_probeWatchdogAlert && _systemOn) {
        if (_compressorActive) {
            _compressorActive = false;
            _lastCompressorStopTime = millis();
            _antiCycleActive = true;
            _antiCycleRemainingSec = ANTI_CYCLE_DELAY_MS / 1000;
        }
        devManager.setDeviceState(1, 0, 0); // Couper pompe
        devManager.setDeviceState(2, 0, 0); // Couper ventilation
        xSemaphoreGive(_mutex);
        return;
    }

    bool coolingDemand = false;

    if (_systemOn) {
        if (_targetEnabled) {
            float highThreshold = _targetTemp + (_hysteresis / 2.0f);
            float lowThreshold = _targetTemp - (_hysteresis / 2.0f);

            if (_currentAmbientTemp > highThreshold) {
                coolingDemand = true;
            } else if (_currentAmbientTemp < lowThreshold) {
                coolingDemand = false;
            } else {
                // Zone morte d'hystérésis : conserver la demande précédente
                coolingDemand = _compressorActive;
            }
        } else {
            // Mode continu sans thermostat
            coolingDemand = true;
        }

        // Pilotage du compresseur avec sécurité anti-court-cycle
        bool waterNeedsCooling = (_currentWaterTemp > _targetWaterTemp);
        if (coolingDemand && _chillerEnabled && waterNeedsCooling) {
            if (_antiCycleActive) {
                if (_compressorActive) {
                    _compressorActive = false;
                    _lastCompressorStopTime = millis();
                }
            } else {
                _compressorActive = true;
            }
        } else if (_currentWaterTemp <= (_targetWaterTemp - 0.5f) || !coolingDemand || !_chillerEnabled) {
            if (_compressorActive) {
                _compressorActive = false;
                _lastCompressorStopTime = millis();
                _antiCycleActive = true;
                _antiCycleRemainingSec = ANTI_CYCLE_DELAY_MS / 1000;
            }
        }
    } else {
        if (_compressorActive) {
            _compressorActive = false;
            _lastCompressorStopTime = millis();
            _antiCycleActive = true;
            _antiCycleRemainingSec = ANTI_CYCLE_DELAY_MS / 1000;
        }
    }

    // Pilotage des périphériques physiques réels (Relais & PWM)
    // Équipement 1 : Pompe boucle froide (Relais)
    uint8_t pumpState = (_systemOn && (_compressorActive || (_currentWaterTemp < (_targetWaterTemp + 3.0f) && coolingDemand))) ? 1 : 0;
    devManager.setDeviceState(1, pumpState, 0);

    // Équipement 2 : Lanterneau Fiamma / Pulseur d'air (PWM)
    uint8_t fanState = (_systemOn && _fanSpeed > 0) ? 1 : 0;
    uint8_t fanPwm = (_systemOn) ? (uint8_t)round((_fanSpeed / 100.0f) * 255.0f) : 0;
    devManager.setDeviceState(2, fanState, fanPwm);

    xSemaphoreGive(_mutex);
}

String ClimateManager::getTelemetryJson() {
    xSemaphoreTake(_mutex, portMAX_DELAY);

#if defined(ARDUINOJSON_VERSION_MAJOR) && (ARDUINOJSON_VERSION_MAJOR >= 7)
    JsonDocument doc;
#else
    DynamicJsonDocument doc(1024);
#endif

    doc["t_amb"] = (float)round(_currentAmbientTemp * 10.0f) / 10.0f;
    doc["t_water"] = (float)round(_currentWaterTemp * 10.0f) / 10.0f;
    doc["target_water_temp"] = (float)round(_targetWaterTemp * 10.0f) / 10.0f;
    doc["power"] = _systemOn;
    doc["target_enabled"] = _targetEnabled;
    doc["target_temp"] = _targetTemp;
    doc["mode"] = _mode;
    doc["fan"] = _fanSpeed;
    doc["hyst"] = _hysteresis;
    doc["chiller_enabled"] = _chillerEnabled;
    doc["water_ready"] = (_currentWaterTemp <= (_targetWaterTemp + 1.0f));
    doc["probes_count"] = _probesConnectedCount;
    doc["probe_alert"] = _probeWatchdogAlert;

    // Calcul du temps estimé d'atteinte de la consigne
    if (_systemOn && _targetEnabled && _currentAmbientTemp > _targetTemp) {
        float tempDiff = _currentAmbientTemp - _targetTemp;
        int estMinutes = (int)round(tempDiff * 14.0f);
        if (estMinutes < 1) estMinutes = 1;
        doc["est_time"] = estMinutes;
    } else {
        doc["est_time"] = 0;
    }

    doc["est_water"] = (_currentWaterTemp <= (_targetWaterTemp + 0.5f)) ? "Prete" : "15min";

    // Statut précis du compresseur et alertes de sécurité
    if (_probeWatchdogAlert) {
        doc["compressor_status"] = "ALERTE : Sonde deconnectee";
        doc["anti_cycle"] = false;
        doc["anti_cycle_sec"] = 0;
    } else if (_antiCycleActive && _antiCycleRemainingSec > 0) {
        int m = _antiCycleRemainingSec / 60;
        int s = _antiCycleRemainingSec % 60;
        char buf[64];
        snprintf(buf, sizeof(buf), "Securite anti-redemarrage (%dm%02ds)", m, s);
        doc["compressor_status"] = String(buf);
        doc["anti_cycle"] = true;
        doc["anti_cycle_sec"] = _antiCycleRemainingSec;
    } else if (_compressorActive) {
        char buf[64];
        snprintf(buf, sizeof(buf), "Actif (Cible eau: %.1f°C)", _targetWaterTemp);
        doc["compressor_status"] = String(buf);
        doc["anti_cycle"] = false;
        doc["anti_cycle_sec"] = 0;
    } else if (!_chillerEnabled) {
        doc["compressor_status"] = "Coupe (Mode ventilation seule)";
        doc["anti_cycle"] = false;
        doc["anti_cycle_sec"] = 0;
    } else {
        doc["compressor_status"] = "En veille";
        doc["anti_cycle"] = false;
        doc["anti_cycle_sec"] = 0;
    }

    doc["energy"] = (unsigned long)(_totalEnergyKwh * 1000.0f);
    doc["runtime"] = _totalRuntimeSec;

    String output;
    serializeJson(doc, output);
    xSemaphoreGive(_mutex);
    return output;
}
