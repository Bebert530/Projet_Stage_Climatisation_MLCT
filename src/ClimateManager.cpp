#include "ClimateManager.h"
#include <cmath>

ClimateManager::ClimateManager()
    : _configPath("/climate.json"),
      _broadcastCb(nullptr),
      _systemConfigured(true),
      _systemOperational(true),
      _missingSlotsList(""),
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
      _timerEnabled(false),
      _timerDurationSec(1800),
      _timerRemainingSec(1800),
      _compressorActive(false),
      _compressorState(COMP_STATE_OFF),
      _compressorMode(COMP_MODE_AUTO),
      _antiCycleActive(false),
      _antiCycleRemainingSec(0),
      _lastCompressorStartTime(0),
      _lastCompressorStopTime(0),
      _currentAmbientTemp(NAN),
      _currentWaterTemp(NAN),
      _totalEnergyKwh(0.0f),
      _totalRuntimeSec(0),
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
    _dallasSensors->setResolution(10); // 10 bits = 187ms
    _dallasSensors->setWaitForConversion(true); // Conversion synchrone fiable

    Serial.printf("[ClimateManager] Bus 1-Wire initialisé sur GPIO %d.\n", gpio);
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
    _timerEnabled = doc["timerEnabled"] | false;
    _timerDurationSec = doc["timerDurationSec"] | 1800UL;
    _timerRemainingSec = _timerDurationSec;
    _totalEnergyKwh = doc["totalEnergyKwh"] | 0.0f;
    _totalRuntimeSec = doc["totalRuntimeSec"] | 0UL;

    String cMode = doc["compressorMode"] | "auto";
    if (cMode == "on") _compressorMode = COMP_MODE_FORCE_ON;
    else if (cMode == "off") _compressorMode = COMP_MODE_FORCE_OFF;
    else _compressorMode = COMP_MODE_AUTO;

    xSemaphoreGive(_mutex);
    Serial.printf("[ClimateManager] Configuration chargée : Consigne=%.1f°C, Consigne Eau=%.1f°C, Mode=%s, Chiller=%d, CompMode=%s, Timer=%d (%lu s)\n",
                  _targetTemp, _targetWaterTemp, _mode.c_str(), _chillerEnabled, cMode.c_str(), _timerEnabled, (unsigned long)_timerDurationSec);
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
    doc["timerEnabled"] = _timerEnabled;
    doc["timerDurationSec"] = _timerDurationSec;
    doc["totalEnergyKwh"] = _totalEnergyKwh;
    doc["totalRuntimeSec"] = _totalRuntimeSec;
    doc["compressorMode"] = getCompressorModeString();

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
        if (_systemOn) {
            if (_timerEnabled) {
                _timerRemainingSec = _timerDurationSec;
            }
        } else {
            if (_compressorActive) {
                _compressorActive = false;
                _lastCompressorStopTime = millis();
                _antiCycleActive = true;
                _antiCycleRemainingSec = ANTI_CYCLE_DELAY_MS / 1000;
            }
            _timerRemainingSec = _timerDurationSec;
        }
    }
    xSemaphoreGive(_mutex);
    saveConfig();
    broadcastState();
}

void ClimateManager::setTimer(bool enabled, uint32_t durationSec) {
    xSemaphoreTake(_mutex, portMAX_DELAY);
    _timerEnabled = enabled;
    if (durationSec > 0) {
        _timerDurationSec = durationSec;
    }
    if (_systemOn && _timerEnabled) {
        _timerRemainingSec = _timerDurationSec;
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

void ClimateManager::setCompressorMode(const String& mode) {
    xSemaphoreTake(_mutex, portMAX_DELAY);
    if (mode.equalsIgnoreCase("on") || mode.equalsIgnoreCase("force_on") || mode.equalsIgnoreCase("1")) {
        _compressorMode = COMP_MODE_FORCE_ON;
    } else if (mode.equalsIgnoreCase("off") || mode.equalsIgnoreCase("force_off") || mode.equalsIgnoreCase("0")) {
        _compressorMode = COMP_MODE_FORCE_OFF;
    } else {
        _compressorMode = COMP_MODE_AUTO;
    }
    xSemaphoreGive(_mutex);
    saveConfig();
    broadcastState();
}

String ClimateManager::getCompressorStateString() const {
    switch (_compressorState) {
        case COMP_STATE_RUNNING: return "RUNNING";
        case COMP_STATE_WAITING_DELAY: return "WAITING_DELAY";
        case COMP_STATE_OFF:
        default: return "OFF";
    }
}

String ClimateManager::getCompressorModeString() const {
    switch (_compressorMode) {
        case COMP_MODE_FORCE_ON: return "on";
        case COMP_MODE_FORCE_OFF: return "off";
        case COMP_MODE_AUTO:
        default: return "auto";
    }
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
        bool state = doc["power"].is<bool>() ? (bool)doc["power"] : !_systemOn;
        setPower(state);
    } else if (cmd == "setTarget") {
        bool enabled = doc["enabled"].is<bool>() ? (bool)doc["enabled"] : _targetEnabled;
        float temp = doc["temp"].is<float>() ? (float)doc["temp"] : _targetTemp;
        setTarget(enabled, temp);
    } else if (cmd == "setWaterTemp" || cmd == "setWaterTarget") {
        float wt = doc["temp"].is<float>() ? (float)doc["temp"] : _targetWaterTemp;
        setWaterTargetTemp(wt);
    } else if (cmd == "setCompressor" || cmd == "setCompressorMode") {
        String cm = doc["mode"] | (doc["state"] | "auto");
        setCompressorMode(cm);
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
    } else if (cmd == "setTimer") {
        bool enabled = doc["enabled"].is<bool>() ? (bool)doc["enabled"] : _timerEnabled;
        uint32_t durationSec = doc["durationSec"].is<uint32_t>() ? (uint32_t)doc["durationSec"] : _timerDurationSec;
        setTimer(enabled, durationSec);
    } else if (cmd == "getState") {
        broadcastState();
    } else {
        Serial.printf("[ClimateManager] Commande inconnue : %s\n", cmd.c_str());
        return false;
    }

    return true;
}

void ClimateManager::readPhysicalSensors(DeviceManager& devManager, SystemManager& sysManager) {
    unsigned long now = millis();
    if (now - _lastSensorReadTime < 2000) {
        return; // Lecture physique toutes les 2 secondes
    }
    _lastSensorReadTime = now;

    SystemConfig* climSys = sysManager.getPrimaryClimateSystem();
    if (!climSys) {
        _systemConfigured = false;
        _systemOperational = false;
        _missingSlotsList = "no_system";
    } else {
        _systemConfigured = true;
        std::vector<String> missing;
        _systemOperational = sysManager.isSystemOperational(climSys->id, devManager, missing);
        
        String missStr = "";
        for (size_t i = 0; i < missing.size(); ++i) {
            if (i > 0) missStr += ",";
            missStr += missing[i];
        }
        _missingSlotsList = missStr;
    }

    xSemaphoreTake(_mutex, portMAX_DELAY);

    // 1. Détection de la broche GPIO de la sonde d'air
    uint8_t tempAirGpio = 255;
    uint8_t tempAirId = 0;
    if (climSys && climSys->bindings.tempAirId > 0) {
        Device* dAir = devManager.getDeviceById(climSys->bindings.tempAirId);
        if (dAir) {
            tempAirGpio = dAir->gpio;
            tempAirId = dAir->id;
        }
    }
    
    // Si aucun système configuré ou id non relié, chercher le premier capteur 1-Wire dans DeviceManager
    if (tempAirGpio == 255) {
        std::vector<Device> devs = devManager.getDevices();
        for (const auto& d : devs) {
            if (d.mode == MODE_INPUT_ONEWIRE) {
                tempAirGpio = d.gpio;
                tempAirId = d.id;
                break;
            }
        }
    }

    // Lecture de la sonde d'air
    if (tempAirGpio != 255) {
        initOrUpdate1Wire(tempAirGpio);
        if (_dallasSensors) {
            _dallasSensors->requestTemperatures();
            float tAmb = _dallasSensors->getTempCByIndex(0);

            if (tAmb != DEVICE_DISCONNECTED_C && tAmb > -50.0f && tAmb < 125.0f && tAmb != 85.0f) {
                _currentAmbientTemp = tAmb;
                _probesConnectedCount = 1;
                _probeWatchdogAlert = false;
                if (tempAirId > 0) {
                    devManager.setDeviceState(tempAirId, 1, (int16_t)round(tAmb * 100.0f));
                }
            } else if (tAmb == 85.0f) {
                // Échantillon 85°C transitoire au démarrage : conserver l'état actuel
            } else {
                // Sonde déconnectée / débranchée (-127°C)
                _currentAmbientTemp = NAN;
                _probesConnectedCount = 0;
                _probeWatchdogAlert = true;
                if (tempAirId > 0) {
                    devManager.setDeviceState(tempAirId, 0, 0);
                }
            }
        }
    } else if (climSys && climSys->bindings.tempAirId > 0) {
        Device* devAir = devManager.getDeviceById(climSys->bindings.tempAirId);
        if (devAir && (devAir->mode == MODE_INPUT_ADC || devAir->mode == MODE_INPUT_ADC_NTC)) {
            int raw = analogRead(devAir->gpio);
            float volts = (raw / 4095.0f) * 3.3f;
            if (devAir->mode == MODE_INPUT_ADC_NTC) {
                if (volts > 0.1f && volts < 3.2f) {
                    float rNtc = 10000.0f * (3.3f / volts - 1.0f);
                    float steinhart = log(rNtc / 10000.0f) / 3950.0f + 1.0f / (25.0f + 273.15f);
                    _currentAmbientTemp = (1.0f / steinhart) - 273.15f;
                    _probesConnectedCount = 1;
                    _probeWatchdogAlert = false;
                    devManager.setDeviceState(devAir->id, 1, (int16_t)round(_currentAmbientTemp * 100.0f));
                } else {
                    _currentAmbientTemp = NAN;
                    _probesConnectedCount = 0;
                    _probeWatchdogAlert = true;
                    devManager.setDeviceState(devAir->id, 0, 0);
                }
            } else {
                _currentAmbientTemp = volts * 15.15f;
                _probesConnectedCount = 1;
                _probeWatchdogAlert = false;
                devManager.setDeviceState(devAir->id, 1, (int16_t)round(_currentAmbientTemp * 100.0f));
            }
        }
    }

    // 2. Lecture de la sonde d'eau (Slot 2 : tempWaterId - Optionnelle)
    if (climSys && climSys->bindings.tempWaterId > 0) {
        Device* devWater = devManager.getDeviceById(climSys->bindings.tempWaterId);
        if (devWater) {
            if (devWater->mode == MODE_INPUT_ONEWIRE) {
                if (tempAirGpio == devWater->gpio && _dallasSensors) {
                    float tWater = _dallasSensors->getTempCByIndex(1);
                    if (tWater != DEVICE_DISCONNECTED_C && tWater > -50.0f && tWater < 125.0f && tWater != 85.0f) {
                        _currentWaterTemp = tWater;
                        devManager.setDeviceState(devWater->id, 1, (int16_t)round(tWater * 100.0f));
                    } else {
                        _currentWaterTemp = NAN;
                        devManager.setDeviceState(devWater->id, 0, 0);
                    }
                }
            } else if (devWater->mode == MODE_INPUT_ADC || devWater->mode == MODE_INPUT_ADC_NTC) {
                int raw = analogRead(devWater->gpio);
                float volts = (raw / 4095.0f) * 3.3f;
                _currentWaterTemp = volts * 15.15f;
                devManager.setDeviceState(devWater->id, 1, (int16_t)round(_currentWaterTemp * 100.0f));
            }
        }
    }

    xSemaphoreGive(_mutex);
}

void ClimateManager::update(DeviceManager& devManager, SystemManager& sysManager) {
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
    readPhysicalSensors(devManager, sysManager);

    // 3. Boucle de régulation thermostatique 24/24 sur données réelles
    evaluateRegulation(devManager, sysManager, dtSec);

    // 4. Statistiques réelles d'énergie, temps de fonctionnement et décompte minuterie
    if (now - _lastStatsTick >= 1000) {
        _lastStatsTick = now;
        if (_systemOn && _systemOperational) {
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

            // Décompte autonome de la minuterie
            if (_timerEnabled) {
                if (_timerRemainingSec > 0) {
                    _timerRemainingSec--;
                }
                if (_timerRemainingSec == 0) {
                    Serial.println("[ClimateManager] Minuterie terminée -> Arrêt automatique du système.");
                    setPower(false);
                }
            }
        }
    }

    // 5. Diffusion WebSocket périodique (toutes les 1500 ms)
    if (now - _lastBroadcastTime >= 1500) {
        _lastBroadcastTime = now;
        broadcastState();
    }
}

void ClimateManager::update(DeviceManager& devManager) {
    // Surcharge de compatibilité si appelée sans SystemManager
    // Utilisera les périphériques 1 et 2 par défaut
}

void ClimateManager::evaluateRegulation(DeviceManager& devManager, SystemManager& sysManager, float dtSec) {
    xSemaphoreTake(_mutex, portMAX_DELAY);
    unsigned long now = millis();

    SystemConfig* climSys = sysManager.getPrimaryClimateSystem();
    if (!climSys || !_systemOperational) {
        if (_compressorActive) {
            _compressorActive = false;
            _lastCompressorStopTime = now;
            _antiCycleActive = true;
            _antiCycleRemainingSec = ANTI_CYCLE_DELAY_MS / 1000;
        }
        _compressorState = COMP_STATE_OFF;
        xSemaphoreGive(_mutex);
        return;
    }

    uint8_t fanPwmId = climSys->bindings.fanPwmId;
    uint8_t pumpRelayId = climSys->bindings.pumpRelayId;
    uint8_t compressorRelayId = climSys->bindings.compressorRelayId;

    // SÉCURITÉ WATCHDOG : Si les sondes sont débranchées, coupure d'urgence de sécurité !
    if (_probeWatchdogAlert && _systemOn) {
        if (_compressorActive) {
            _compressorActive = false;
            _lastCompressorStopTime = now;
            _antiCycleActive = true;
            _antiCycleRemainingSec = ANTI_CYCLE_DELAY_MS / 1000;
        }
        _compressorState = COMP_STATE_OFF;
        if (compressorRelayId > 0) devManager.setDeviceState(compressorRelayId, 0, 0); // Couper compresseur
        if (pumpRelayId > 0) devManager.setDeviceState(pumpRelayId, 0, 0);             // Couper pompe
        if (fanPwmId > 0) devManager.setDeviceState(fanPwmId, 0, 0);                   // Couper ventilation
        xSemaphoreGive(_mutex);
        return;
    }

    bool coolingDemand = false;

    if (_systemOn) {
        if (_compressorMode == COMP_MODE_FORCE_ON) {
            coolingDemand = true;
        } else if (_compressorMode == COMP_MODE_FORCE_OFF) {
            coolingDemand = false;
        } else {
            // Mode AUTO : évaluation thermostatique
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

            // Condition Chiller (eau froide)
            bool waterNeedsCooling = (_currentWaterTemp > _targetWaterTemp);
            if (!_chillerEnabled || !waterNeedsCooling) {
                coolingDemand = false;
            }
        }
    } else {
        coolingDemand = false;
    }

    // Protection frigorifique compresseur :
    // 1. Délai minimal de repos de 180s (3 minutes) avant redémarrage (Anti-court-cycle)
    // 2. Temps de fonctionnement minimal de 60s avant extinction (Anti-microcycle)
    if (coolingDemand) {
        if (_compressorActive) {
            _compressorState = COMP_STATE_RUNNING;
            _antiCycleActive = false;
            _antiCycleRemainingSec = 0;
        } else {
            // Tentative de démarrage du compresseur
            if (_lastCompressorStopTime > 0 && (now - _lastCompressorStopTime < ANTI_CYCLE_DELAY_MS)) {
                // Temporisation de sécurité active
                _compressorActive = false;
                _compressorState = COMP_STATE_WAITING_DELAY;
                _antiCycleActive = true;
                _antiCycleRemainingSec = (uint16_t)((ANTI_CYCLE_DELAY_MS - (now - _lastCompressorStopTime)) / 1000);
            } else {
                // Démarrage autorisé
                _compressorActive = true;
                _compressorState = COMP_STATE_RUNNING;
                _lastCompressorStartTime = now;
                _antiCycleActive = false;
                _antiCycleRemainingSec = 0;
            }
        }
    } else {
        // Pas de demande de froid
        if (_compressorActive) {
            // Vérification du temps de fonctionnement minimum (60 secondes)
            if (_lastCompressorStartTime > 0 && (now - _lastCompressorStartTime < MIN_RUN_TIME_MS) && _systemOn && _compressorMode != COMP_MODE_FORCE_OFF) {
                // Maintenir en marche jusqu'à la fin des 60s pour préserver le compresseur
                _compressorState = COMP_STATE_RUNNING;
            } else {
                // Extinction du compresseur et armement du délai de repos de 180s
                _compressorActive = false;
                _compressorState = COMP_STATE_OFF;
                _lastCompressorStopTime = now;
                _antiCycleActive = true;
                _antiCycleRemainingSec = ANTI_CYCLE_DELAY_MS / 1000;
            }
        } else {
            _compressorState = (_antiCycleActive && _antiCycleRemainingSec > 0 && _systemOn && _chillerEnabled)
                ? COMP_STATE_WAITING_DELAY
                : COMP_STATE_OFF;
        }
    }

    // Pilotage des périphériques physiques dynamiquement liés via SystemManager
    // Slot 5 : Compresseur Glacière (Relais Tout-ou-Rien)
    if (compressorRelayId > 0) {
        uint8_t compState = _compressorActive ? 1 : 0;
        devManager.setDeviceState(compressorRelayId, compState, 0);
    }

    // Slot 4 : Pompe boucle froide (Relais)
    if (pumpRelayId > 0) {
        uint8_t pumpState = (_systemOn && (_compressorActive || (_currentWaterTemp < (_targetWaterTemp + 3.0f) && (_systemOn && _chillerEnabled)))) ? 1 : 0;
        devManager.setDeviceState(pumpRelayId, pumpState, 0);
    }

    // Slot 3 : Ventilateur / Pulseur d'air (PWM) - Régulé seulement si le système Climatisation est actif
    if (fanPwmId > 0 && _systemOn) {
        uint8_t fanState = (_fanSpeed > 0) ? 1 : 0;
        uint8_t fanPwm = (uint8_t)round((_fanSpeed / 100.0f) * 255.0f);
        devManager.setDeviceState(fanPwmId, fanState, fanPwm);
    }

    xSemaphoreGive(_mutex);
}

String ClimateManager::getTelemetryJson(SystemManager* sysManager, DeviceManager* devManager) {
    xSemaphoreTake(_mutex, portMAX_DELAY);

#if defined(ARDUINOJSON_VERSION_MAJOR) && (ARDUINOJSON_VERSION_MAJOR >= 7)
    JsonDocument doc;
#else
    DynamicJsonDocument doc(1024);
#endif

    if (isnan(_currentAmbientTemp) || _currentAmbientTemp < -50.0f || _currentAmbientTemp > 125.0f) {
        doc["t_amb"] = nullptr;
    } else {
        doc["t_amb"] = (float)round(_currentAmbientTemp * 10.0f) / 10.0f;
    }

    if (isnan(_currentWaterTemp) || _currentWaterTemp < -50.0f || _currentWaterTemp > 125.0f) {
        doc["t_water"] = nullptr;
    } else {
        doc["t_water"] = (float)round(_currentWaterTemp * 10.0f) / 10.0f;
    }

    doc["target_water_temp"] = (float)round(_targetWaterTemp * 10.0f) / 10.0f;
    doc["power"] = _systemOn;
    doc["target_enabled"] = _targetEnabled;
    doc["target_temp"] = _targetTemp;
    doc["mode"] = _mode;
    doc["fan"] = _fanSpeed;
    doc["hyst"] = _hysteresis;
    doc["chiller_enabled"] = _chillerEnabled;
    doc["timer_enabled"] = _timerEnabled;
    doc["timer_duration_sec"] = _timerDurationSec;
    doc["timer_remaining_sec"] = _timerRemainingSec;
    doc["water_ready"] = (!isnan(_currentWaterTemp) && _currentWaterTemp <= (_targetWaterTemp + 1.0f));
    doc["probes_count"] = _probesConnectedCount;
    doc["probe_alert"] = _probeWatchdogAlert;

    // Informations du système Climatisation
    doc["system_configured"] = _systemConfigured;
    doc["system_operational"] = _systemOperational;
    doc["missing_slots"] = _missingSlotsList;

    // Objet compresseur frigorifique dédié
    JsonObject compJson = doc["compressor"].to<JsonObject>();
    compJson["state"] = getCompressorStateString();
    compJson["mode"] = getCompressorModeString();
    compJson["remaining_delay_sec"] = _antiCycleRemainingSec;

    if (sysManager && devManager) {
        SystemConfig* climSys = sysManager->getPrimaryClimateSystem();
        if (climSys && climSys->bindings.compressorRelayId > 0) {
            Device* devComp = devManager->getDeviceById(climSys->bindings.compressorRelayId);
            if (devComp) compJson["gpio"] = devComp->gpio;
            else compJson["gpio"] = nullptr;
        } else {
            compJson["gpio"] = nullptr;
        }
    } else {
        compJson["gpio"] = nullptr;
    }

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
    if (!_systemOperational) {
        doc["compressor_status"] = "Systeme Incomplet";
        doc["anti_cycle"] = false;
        doc["anti_cycle_sec"] = 0;
    } else if (_probeWatchdogAlert) {
        doc["compressor_status"] = "ALERTE : Sonde deconnectee";
        doc["anti_cycle"] = false;
        doc["anti_cycle_sec"] = 0;
    } else if (_compressorState == COMP_STATE_WAITING_DELAY || (_antiCycleActive && _antiCycleRemainingSec > 0)) {
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
