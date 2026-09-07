#include "DeviceManager.h"
#include <algorithm>

// Broches système/boot à ne JAMAIS allouer
const std::vector<uint8_t> DeviceManager::BLACKLIST_PINS = {
    0, 2, 6, 7, 8, 9, 10, 11, 12, 15 // Strapping & SPI Flash
};

// Broches de sortie recommandées et sûres sur ESP32
const std::vector<uint8_t> DeviceManager::SAFE_OUTPUT_PINS = {
    4, 5, 13, 14, 16, 17, 18, 19, 21, 22, 23, 25, 26, 27, 32, 33
};

// Broches ADC1 utilisables sans conflit avec le Wi-Fi
const std::vector<uint8_t> DeviceManager::SAFE_ADC1_PINS = {
    32, 33, 34, 35, 36, 39
};

// Broches d'entrée avec pull-up interne disponible
const std::vector<uint8_t> DeviceManager::SAFE_PULLUP_PINS = {
    4, 5, 13, 14, 16, 17, 18, 19, 21, 22, 23, 25, 26, 27, 32, 33
};

DeviceManager::DeviceManager() : _configPath("/config.json") {
    _mutex = xSemaphoreCreateMutex();
    for (int i = 0; i < 16; i++) {
        _pwmChannelsInUse[i] = false;
    }
}

DeviceManager::~DeviceManager() {
    if (_mutex) {
        vSemaphoreDelete(_mutex);
    }
}

bool DeviceManager::begin(const char* configPath) {
    if (configPath != nullptr && strlen(configPath) > 0) {
        _configPath = configPath;
    }

    Serial.println("[DeviceManager] Initialisation de LittleFS...");
    if (!LittleFS.begin(true)) {
        Serial.println("[DeviceManager] ERREUR : Impossible de monter LittleFS !");
        return false;
    }

    if (!LittleFS.exists(_configPath.c_str())) {
        Serial.printf("[DeviceManager] Configuration absente (%s). Création des périphériques par défaut...\n", _configPath.c_str());
        createDefaultConfig();
    } else {
        if (!loadConfig()) {
            Serial.println("[DeviceManager] Avertissement : échec de lecture, réinitialisation...");
            createDefaultConfig();
        }
    }

    return true;
}

void DeviceManager::createDefaultConfig() {
    xSemaphoreTake(_mutex, portMAX_DELAY);
    _devices.clear();

    // 1. Pompe boucle froide (Relais Core vital)
    Device dev1;
    dev1.id = 1;
    dev1.name = "Pompe boucle froide";
    dev1.category = CAT_ACTUATOR;
    dev1.voltage = "12V";
    dev1.mode = MODE_OUTPUT_RELAY;
    dev1.type = DEVICE_RELAY;
    dev1.gpio = 4;
    dev1.state = 0;
    dev1.value = 0;
    dev1.pwmChannel = -1;
    dev1.isCore = true;
    _devices.push_back(dev1);

    // 2. Lanterneau Fiamma (PWM)
    Device dev2;
    dev2.id = 2;
    dev2.name = "Lanterneau Fiamma";
    dev2.category = CAT_ACTUATOR;
    dev2.voltage = "12V";
    dev2.mode = MODE_OUTPUT_PWM;
    dev2.type = DEVICE_PWM;
    dev2.gpio = 19;
    dev2.state = 0;
    dev2.value = 0;
    dev2.pwmChannel = allocatePwmChannel();
    dev2.isCore = false;
    _devices.push_back(dev2);

    // 3. Spot Salon (Relais)
    Device dev3;
    dev3.id = 3;
    dev3.name = "Spot Salon";
    dev3.category = CAT_ACTUATOR;
    dev3.voltage = "12V";
    dev3.mode = MODE_OUTPUT_RELAY;
    dev3.type = DEVICE_RELAY;
    dev3.gpio = 23;
    dev3.state = 0;
    dev3.value = 0;
    dev3.pwmChannel = -1;
    dev3.isCore = false;
    _devices.push_back(dev3);

    xSemaphoreGive(_mutex);

    for (auto& dev : _devices) {
        setupHardware(dev);
    }

    saveConfig();
}

bool DeviceManager::loadConfig() {
    xSemaphoreTake(_mutex, portMAX_DELAY);

    File file = LittleFS.open(_configPath.c_str(), "r");
    if (!file) {
        Serial.printf("[DeviceManager] Impossible d'ouvrir %s en lecture.\n", _configPath.c_str());
        xSemaphoreGive(_mutex);
        return false;
    }

#if defined(ARDUINOJSON_VERSION_MAJOR) && (ARDUINOJSON_VERSION_MAJOR >= 7)
    JsonDocument doc;
#else
    DynamicJsonDocument doc(4096);
#endif

    DeserializationError error = deserializeJson(doc, file);
    file.close();

    if (error) {
        Serial.printf("[DeviceManager] Erreur JSON : %s\n", error.c_str());
        xSemaphoreGive(_mutex);
        return false;
    }

    for (auto& dev : _devices) {
        releaseHardware(dev);
    }
    _devices.clear();
    for (int i = 0; i < 16; i++) {
        _pwmChannelsInUse[i] = false;
    }

    JsonArray array = doc["devices"].as<JsonArray>();
    for (JsonObject obj : array) {
        Device dev;
        dev.id = obj["id"] | 0;
        dev.name = obj["name"] | "Sans nom";
        
        String typeStr = obj["type"] | "RELAY";
        dev.type = stringToType(typeStr);

        String catStr = obj["category"] | (dev.type == DEVICE_PWM || dev.type == DEVICE_RELAY ? "ACTUATOR" : "SENSOR");
        dev.category = stringToCategory(catStr);

        dev.voltage = obj["voltage"] | "12V";

        if (obj.containsKey("mode")) {
            dev.mode = stringToSignalMode(obj["mode"].as<String>());
        } else {
            dev.mode = (dev.type == DEVICE_PWM) ? MODE_OUTPUT_PWM : MODE_OUTPUT_RELAY;
        }

        dev.gpio = obj["gpio"] | 255;
        dev.state = obj["state"] | 0;
        dev.value = obj["value"] | 0;
        dev.isCore = obj["isCore"] | false;

        if (dev.mode == MODE_OUTPUT_PWM) {
            dev.pwmChannel = allocatePwmChannel();
        } else {
            dev.pwmChannel = -1;
        }

        if (!isPinSafe(dev.gpio)) {
            Serial.printf("[DeviceManager] GPIO %d interdit pour '%s'. Périphérique désactivé.\n", dev.gpio, dev.name.c_str());
            continue;
        }

        _devices.push_back(dev);
    }

    xSemaphoreGive(_mutex);

    for (auto& dev : _devices) {
        setupHardware(dev);
    }

    Serial.printf("[DeviceManager] %d périphériques chargés depuis %s.\n", _devices.size(), _configPath.c_str());
    return true;
}

bool DeviceManager::saveConfig() {
    xSemaphoreTake(_mutex, portMAX_DELAY);

#if defined(ARDUINOJSON_VERSION_MAJOR) && (ARDUINOJSON_VERSION_MAJOR >= 7)
    JsonDocument doc;
#else
    DynamicJsonDocument doc(4096);
#endif

    JsonArray array = doc["devices"].to<JsonArray>();

    for (const auto& dev : _devices) {
        JsonObject obj = array.add<JsonObject>();
        obj["id"] = dev.id;
        obj["name"] = dev.name;
        obj["category"] = categoryToString(dev.category);
        obj["voltage"] = dev.voltage;
        obj["mode"] = signalModeToString(dev.mode);
        obj["type"] = typeToString(dev.type);
        obj["gpio"] = dev.gpio;
        obj["state"] = dev.state;
        obj["value"] = dev.value;
        obj["isCore"] = dev.isCore;
    }

    File file = LittleFS.open(_configPath.c_str(), "w");
    if (!file) {
        Serial.printf("[DeviceManager] Erreur ouverture %s en écriture.\n", _configPath.c_str());
        xSemaphoreGive(_mutex);
        return false;
    }

    if (serializeJsonPretty(doc, file) == 0) {
        Serial.println("[DeviceManager] Échec écriture du JSON.");
        file.close();
        xSemaphoreGive(_mutex);
        return false;
    }

    file.close();
    xSemaphoreGive(_mutex);
    Serial.println("[DeviceManager] Configuration sauvegardée dans la mémoire flash.");
    return true;
}

std::vector<Device> DeviceManager::getDevices() {
    xSemaphoreTake(_mutex, portMAX_DELAY);
    std::vector<Device> copy = _devices;
    xSemaphoreGive(_mutex);
    return copy;
}

Device* DeviceManager::getDeviceById(uint8_t id) {
    for (auto& dev : _devices) {
        if (dev.id == id) {
            return &dev;
        }
    }
    return nullptr;
}

bool DeviceManager::isPinSafe(uint8_t pin) const {
    for (uint8_t b : BLACKLIST_PINS) {
        if (b == pin) return false;
    }
    for (uint8_t s : SAFE_OUTPUT_PINS) {
        if (s == pin) return true;
    }
    for (uint8_t a : SAFE_ADC1_PINS) {
        if (a == pin) return true;
    }
    return false;
}

bool DeviceManager::isPinUsed(uint8_t pin, uint8_t excludeDeviceId) {
    for (const auto& dev : _devices) {
        if (dev.id != excludeDeviceId && dev.gpio == pin) {
            return true;
        }
    }
    return false;
}

std::vector<uint8_t> DeviceManager::getAvailablePins() {
    xSemaphoreTake(_mutex, portMAX_DELAY);
    std::vector<uint8_t> available;

    for (uint8_t safePin : SAFE_OUTPUT_PINS) {
        bool used = false;
        for (const auto& dev : _devices) {
            if (dev.gpio == safePin) {
                used = true;
                break;
            }
        }
        if (!used) {
            available.push_back(safePin);
        }
    }

    xSemaphoreGive(_mutex);
    return available;
}

int8_t DeviceManager::suggestPin(SignalMode mode) {
    xSemaphoreTake(_mutex, portMAX_DELAY);

    const std::vector<uint8_t>* pool = &SAFE_OUTPUT_PINS;
    if (mode == MODE_INPUT_ADC) {
        pool = &SAFE_ADC1_PINS;
    } else if (mode == MODE_INPUT_DIGITAL || mode == MODE_INPUT_ONEWIRE) {
        pool = &SAFE_PULLUP_PINS;
    }

    for (uint8_t pin : *pool) {
        bool used = false;
        for (const auto& dev : _devices) {
            if (dev.gpio == pin) {
                used = true;
                break;
            }
        }
        if (!used) {
            xSemaphoreGive(_mutex);
            return pin;
        }
    }

    xSemaphoreGive(_mutex);
    return -1;
}

int8_t DeviceManager::allocatePwmChannel() {
    for (int i = 0; i < 16; i++) {
        if (!_pwmChannelsInUse[i]) {
            _pwmChannelsInUse[i] = true;
            return i;
        }
    }
    return -1;
}

void DeviceManager::freePwmChannel(int8_t channel) {
    if (channel >= 0 && channel < 16) {
        _pwmChannelsInUse[channel] = false;
    }
}

uint8_t DeviceManager::generateUniqueId() {
    uint8_t candidate = 1;
    bool exists = true;
    while (exists) {
        exists = false;
        for (const auto& dev : _devices) {
            if (dev.id == candidate) {
                candidate++;
                exists = true;
                break;
            }
        }
    }
    return candidate;
}

void DeviceManager::setupHardware(Device& dev) {
    if (!isPinSafe(dev.gpio)) return;

    if (dev.mode == MODE_OUTPUT_RELAY) {
        pinMode(dev.gpio, OUTPUT);
        digitalWrite(dev.gpio, dev.state ? HIGH : LOW);
        Serial.printf("[Hardware] Relais '%s' sur GPIO %d (état: %d)\n", dev.name.c_str(), dev.gpio, dev.state);
    } else if (dev.mode == MODE_OUTPUT_PWM) {
        if (dev.pwmChannel < 0) {
            dev.pwmChannel = allocatePwmChannel();
        }
#if defined(ESP_ARDUINO_VERSION_MAJOR) && (ESP_ARDUINO_VERSION_MAJOR >= 3)
        ledcAttach(dev.gpio, 5000, 8);
        ledcWrite(dev.gpio, dev.value);
#else
        if (dev.pwmChannel >= 0) {
            ledcSetup(dev.pwmChannel, 5000, 8);
            ledcAttachPin(dev.gpio, dev.pwmChannel);
            ledcWrite(dev.pwmChannel, dev.value);
        }
#endif
        Serial.printf("[Hardware] PWM '%s' sur GPIO %d (canal: %d, val: %d)\n", dev.name.c_str(), dev.gpio, dev.pwmChannel, dev.value);
    } else if (dev.mode == MODE_INPUT_DIGITAL || dev.mode == MODE_INPUT_ONEWIRE) {
        pinMode(dev.gpio, INPUT_PULLUP);
        Serial.printf("[Hardware] Capteur Digital '%s' sur GPIO %d (INPUT_PULLUP)\n", dev.name.c_str(), dev.gpio);
    } else if (dev.mode == MODE_INPUT_ADC) {
        pinMode(dev.gpio, INPUT);
        Serial.printf("[Hardware] Capteur ADC '%s' sur GPIO %d (INPUT)\n", dev.name.c_str(), dev.gpio);
    }
}

void DeviceManager::releaseHardware(Device& dev) {
    if (!isPinSafe(dev.gpio)) return;

    if (dev.mode == MODE_OUTPUT_PWM) {
#if defined(ESP_ARDUINO_VERSION_MAJOR) && (ESP_ARDUINO_VERSION_MAJOR >= 3)
        ledcDetach(dev.gpio);
#else
        if (dev.pwmChannel >= 0) {
            ledcDetachPin(dev.gpio);
        }
#endif
        freePwmChannel(dev.pwmChannel);
        dev.pwmChannel = -1;
    } else if (dev.mode == MODE_OUTPUT_RELAY) {
        digitalWrite(dev.gpio, LOW);
    }

    pinMode(dev.gpio, INPUT);
    Serial.printf("[Hardware] GPIO %d libéré pour '%s'\n", dev.gpio, dev.name.c_str());
}

void DeviceManager::applyHardwareState(const Device& dev) {
    if (!isPinSafe(dev.gpio)) return;

    if (dev.mode == MODE_OUTPUT_RELAY) {
        digitalWrite(dev.gpio, dev.state ? HIGH : LOW);
    } else if (dev.mode == MODE_OUTPUT_PWM) {
#if defined(ESP_ARDUINO_VERSION_MAJOR) && (ESP_ARDUINO_VERSION_MAJOR >= 3)
        ledcWrite(dev.gpio, dev.value);
#else
        if (dev.pwmChannel >= 0) {
            ledcWrite(dev.pwmChannel, dev.value);
        }
#endif
    }
}

bool DeviceManager::saveDevice(uint8_t id, const String& name, DeviceCategory category, const String& voltage, 
                               SignalMode mode, uint8_t gpio, bool isCore, String& errorMsg) {
    if (name.length() == 0) {
        errorMsg = "Le nom de l'équipement est obligatoire.";
        return false;
    }

    if (!isPinSafe(gpio)) {
        errorMsg = "Le GPIO " + String(gpio) + " est interdit ou réservé.";
        return false;
    }

    xSemaphoreTake(_mutex, portMAX_DELAY);

    // Vérifier si un autre appareil utilise ce pin
    if (isPinUsed(gpio, id)) {
        xSemaphoreGive(_mutex);
        errorMsg = "Le GPIO " + String(gpio) + " est déjà assigné.";
        return false;
    }

    Device* target = nullptr;
    if (id > 0) {
        for (auto& d : _devices) {
            if (d.id == id) {
                target = &d;
                break;
            }
        }
    }

    if (target) {
        // Mise à jour équipement existant
        if (target->isCore && !isCore) {
            xSemaphoreGive(_mutex);
            errorMsg = "Protection : impossible de retirer le statut système d'un équipement Core.";
            return false;
        }

        if (target->gpio != gpio || target->mode != mode) {
            releaseHardware(*target);
            target->gpio = gpio;
            target->mode = mode;
            target->type = (mode == MODE_OUTPUT_PWM) ? DEVICE_PWM : DEVICE_RELAY;
            setupHardware(*target);
        }

        target->name = name;
        target->category = category;
        target->voltage = voltage;
        xSemaphoreGive(_mutex);
        saveConfig();
        return true;
    }

    // Nouvel équipement
    Device newDev;
    newDev.id = generateUniqueId();
    newDev.name = name;
    newDev.category = category;
    newDev.voltage = voltage;
    newDev.mode = mode;
    newDev.type = (mode == MODE_OUTPUT_PWM) ? DEVICE_PWM : DEVICE_RELAY;
    newDev.gpio = gpio;
    newDev.state = 0;
    newDev.value = 0;
    newDev.isCore = isCore;
    newDev.pwmChannel = -1;

    _devices.push_back(newDev);
    xSemaphoreGive(_mutex);

    setupHardware(newDev);
    saveConfig();
    return true;
}

bool DeviceManager::deleteDevice(uint8_t id, String& errorMsg) {
    xSemaphoreTake(_mutex, portMAX_DELAY);

    auto it = std::find_if(_devices.begin(), _devices.end(), [id](const Device& d) {
        return d.id == id;
    });

    if (it == _devices.end()) {
        xSemaphoreGive(_mutex);
        errorMsg = "Périphérique introuvable (ID: " + String(id) + ").";
        return false;
    }

    if (it->isCore) {
        xSemaphoreGive(_mutex);
        errorMsg = "Impossible de supprimer un équipement système protégé (Core).";
        return false;
    }

    releaseHardware(*it);
    _devices.erase(it);
    xSemaphoreGive(_mutex);

    saveConfig();
    return true;
}

bool DeviceManager::setDeviceState(uint8_t id, uint8_t state, uint8_t value) {
    xSemaphoreTake(_mutex, portMAX_DELAY);

    Device* dev = getDeviceById(id);
    if (!dev) {
        xSemaphoreGive(_mutex);
        return false;
    }

    dev->state = state ? 1 : 0;
    dev->value = value;
    applyHardwareState(*dev);

    xSemaphoreGive(_mutex);
    return true;
}

DeviceTestResult DeviceManager::testPinDirect(uint8_t gpio, SignalMode mode, uint16_t durationMs) {
    DeviceTestResult result;
    result.success = false;
    result.rawValue = 0;
    result.voltageValue = 0.0f;

    if (!isPinSafe(gpio)) {
        result.message = "Erreur : Le GPIO " + String(gpio) + " est interdit.";
        return result;
    }

    Serial.printf("[Test] Test direct sur GPIO %d, mode %d, durée %d ms\n", gpio, mode, durationMs);

    if (mode == MODE_OUTPUT_RELAY) {
        pinMode(gpio, OUTPUT);
        digitalWrite(gpio, HIGH);
        delay(durationMs);
        digitalWrite(gpio, LOW);
        result.success = true;
        result.rawValue = 1;
        result.voltageValue = 3.3f;
        result.message = "Impulsion 3s validée : Relais activé puis coupé.";
    } else if (mode == MODE_OUTPUT_PWM) {
#if defined(ESP_ARDUINO_VERSION_MAJOR) && (ESP_ARDUINO_VERSION_MAJOR >= 3)
        ledcAttach(gpio, 5000, 8);
        ledcWrite(gpio, 128); // 50%
        delay(durationMs);
        ledcWrite(gpio, 0);
        ledcDetach(gpio);
#else
        ledcSetup(15, 5000, 8);
        ledcAttachPin(gpio, 15);
        ledcWrite(15, 128);
        delay(durationMs);
        ledcWrite(15, 0);
        ledcDetachPin(gpio);
#endif
        pinMode(gpio, INPUT);
        result.success = true;
        result.rawValue = 128;
        result.voltageValue = 1.65f;
        result.message = "Signal PWM 50% envoyé pendant 3s avec succès.";
    } else if (mode == MODE_INPUT_DIGITAL || mode == MODE_INPUT_ONEWIRE) {
        pinMode(gpio, INPUT_PULLUP);
        delay(10);
        int val = digitalRead(gpio);
        result.success = true;
        result.rawValue = val;
        result.voltageValue = (val == LOW) ? 0.0f : 3.3f;
        if (val == LOW) {
            result.message = "Contact FERMÉ (0V détecté / relié à GND)";
        } else {
            result.message = "Contact OUVERT (3.3V détecté / Tirage haut Pull-up)";
        }
    } else if (mode == MODE_INPUT_ADC) {
        pinMode(gpio, INPUT);
        delay(10);
        int raw = analogRead(gpio);
        float volts = (raw / 4095.0f) * 3.3f;
        result.success = true;
        result.rawValue = raw;
        result.voltageValue = volts;
        result.message = "Mesure analogique : " + String(volts, 2) + " V (ADC brut : " + String(raw) + " / 4095)";
    }

    return result;
}

DeviceTestResult DeviceManager::testDevice(uint8_t id, uint16_t durationMs) {
    uint8_t gpio = 255;
    SignalMode mode = MODE_OUTPUT_RELAY;
    uint8_t prevState = 0;
    uint8_t prevValue = 0;

    {
        xSemaphoreTake(_mutex, portMAX_DELAY);
        Device* dev = getDeviceById(id);
        if (!dev) {
            xSemaphoreGive(_mutex);
            DeviceTestResult res;
            res.success = false;
            res.message = "Équipement introuvable.";
            return res;
        }
        gpio = dev->gpio;
        mode = dev->mode;
        prevState = dev->state;
        prevValue = dev->value;
        xSemaphoreGive(_mutex);
    }

    DeviceTestResult res = testPinDirect(gpio, mode, durationMs);

    // Restaurer l'état précédent pour les actionneurs
    if (mode == MODE_OUTPUT_RELAY) {
        digitalWrite(gpio, prevState ? HIGH : LOW);
    } else if (mode == MODE_OUTPUT_PWM) {
#if defined(ESP_ARDUINO_VERSION_MAJOR) && (ESP_ARDUINO_VERSION_MAJOR >= 3)
        ledcAttach(gpio, 5000, 8);
        ledcWrite(gpio, prevValue);
#else
        Device* dev = getDeviceById(id);
        if (dev && dev->pwmChannel >= 0) {
            ledcWrite(dev->pwmChannel, prevValue);
        }
#endif
    }

    return res;
}

String DeviceManager::getDevicesJson() {
    xSemaphoreTake(_mutex, portMAX_DELAY);

#if defined(ARDUINOJSON_VERSION_MAJOR) && (ARDUINOJSON_VERSION_MAJOR >= 7)
    JsonDocument doc;
#else
    DynamicJsonDocument doc(4096);
#endif

    JsonArray array = doc["devices"].to<JsonArray>();

    for (const auto& dev : _devices) {
        JsonObject obj = array.add<JsonObject>();
        obj["id"] = dev.id;
        obj["name"] = dev.name;
        obj["category"] = categoryToString(dev.category);
        obj["voltage"] = dev.voltage;
        obj["mode"] = signalModeToString(dev.mode);
        obj["type"] = typeToString(dev.type);
        obj["gpio"] = dev.gpio;
        obj["state"] = dev.state;
        obj["value"] = dev.value;
        obj["isCore"] = dev.isCore;
    }

    String output;
    serializeJson(doc, output);
    xSemaphoreGive(_mutex);
    return output;
}

String DeviceManager::getAvailablePinsJson() {
    std::vector<uint8_t> pins = getAvailablePins();

#if defined(ARDUINOJSON_VERSION_MAJOR) && (ARDUINOJSON_VERSION_MAJOR >= 7)
    JsonDocument doc;
#else
    DynamicJsonDocument doc(512);
#endif

    JsonArray array = doc["pins"].to<JsonArray>();
    for (uint8_t p : pins) {
        array.add(p);
    }

    String output;
    serializeJson(doc, output);
    return output;
}

DeviceType DeviceManager::stringToType(const String& str) {
    if (str.equalsIgnoreCase("PWM")) return DEVICE_PWM;
    return DEVICE_RELAY;
}

String DeviceManager::typeToString(DeviceType type) {
    return (type == DEVICE_PWM) ? "PWM" : "RELAY";
}

DeviceCategory DeviceManager::stringToCategory(const String& str) {
    if (str.equalsIgnoreCase("SENSOR") || str.equalsIgnoreCase("Capteur")) {
        return CAT_SENSOR;
    }
    return CAT_ACTUATOR;
}

String DeviceManager::categoryToString(DeviceCategory cat) {
    return (cat == CAT_SENSOR) ? "SENSOR" : "ACTUATOR";
}

SignalMode DeviceManager::stringToSignalMode(const String& str) {
    if (str.equalsIgnoreCase("OUTPUT_PWM") || str.equalsIgnoreCase("PWM")) return MODE_OUTPUT_PWM;
    if (str.equalsIgnoreCase("INPUT_DIGITAL") || str.equalsIgnoreCase("DIGITAL")) return MODE_INPUT_DIGITAL;
    if (str.equalsIgnoreCase("INPUT_ADC") || str.equalsIgnoreCase("ADC") || str.equalsIgnoreCase("ANALOG")) return MODE_INPUT_ADC;
    if (str.equalsIgnoreCase("INPUT_ONEWIRE") || str.equalsIgnoreCase("ONEWIRE")) return MODE_INPUT_ONEWIRE;
    return MODE_OUTPUT_RELAY;
}

String DeviceManager::signalModeToString(SignalMode mode) {
    switch (mode) {
        case MODE_OUTPUT_PWM:    return "OUTPUT_PWM";
        case MODE_INPUT_DIGITAL: return "INPUT_DIGITAL";
        case MODE_INPUT_ADC:     return "INPUT_ADC";
        case MODE_INPUT_ONEWIRE: return "INPUT_ONEWIRE";
        case MODE_OUTPUT_RELAY:
        default:                 return "OUTPUT_RELAY";
    }
}
