#include "DeviceManager.h"
#include <algorithm>

// Broches système/boot à ne JAMAIS allouer
const std::vector<uint8_t> DeviceManager::BLACKLIST_PINS = {
    0, 2, 6, 7, 8, 9, 10, 11, 12, 15, // Strapping & SPI Flash
    34, 35, 36, 39                    // Input-only (GPI)
};

// Broches de sortie recommandées et sûres sur ESP32 standard
const std::vector<uint8_t> DeviceManager::SAFE_PINS = {
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

    // Charger la configuration ou créer le fichier initial
    if (!LittleFS.exists(_configPath.c_str())) {
        Serial.printf("[DeviceManager] Configuration absente (%s). Création des périphériques par défaut...\n", _configPath.c_str());
        createDefaultConfig();
    } else {
        if (!loadConfig()) {
            Serial.println("[DeviceManager] Avertissement : échec de lecture du fichier config, réinitialisation...");
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
    dev3.type = DEVICE_RELAY;
    dev3.gpio = 23;
    dev3.state = 0;
    dev3.value = 0;
    dev3.pwmChannel = -1;
    dev3.isCore = false;
    _devices.push_back(dev3);

    xSemaphoreGive(_mutex);

    // Initialiser les sorties matérielles
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
        Serial.printf("[DeviceManager] Erreur désérialisation JSON : %s\n", error.c_str());
        xSemaphoreGive(_mutex);
        return false;
    }

    // Réinitialisation des périphériques en cours
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

        dev.gpio = obj["gpio"] | 255;
        dev.state = obj["state"] | 0;
        dev.value = obj["value"] | 0;
        dev.isCore = obj["isCore"] | false;

        if (dev.type == DEVICE_PWM) {
            dev.pwmChannel = allocatePwmChannel();
        } else {
            dev.pwmChannel = -1;
        }

        // Vérification de sécurité de la broche
        if (!isPinSafe(dev.gpio)) {
            Serial.printf("[DeviceManager] ATTENTION : Le GPIO %d assigné à '%s' est interdit. Périphérique désactivé.\n", 
                          dev.gpio, dev.name.c_str());
            continue;
        }

        _devices.push_back(dev);
    }

    xSemaphoreGive(_mutex);

    // Initialisation matérielle
    for (auto& dev : _devices) {
        setupHardware(dev);
    }

    Serial.printf("[DeviceManager] %d périphériques chargés avec succès depuis %s.\n", _devices.size(), _configPath.c_str());
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
    // Vérifier si le pin est dans la liste blanche des broches de sortie recommandées
    for (uint8_t safe : SAFE_PINS) {
        if (safe == pin) {
            return true;
        }
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

    for (uint8_t safePin : SAFE_PINS) {
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

int8_t DeviceManager::allocatePwmChannel() {
    for (int i = 0; i < 16; i++) {
        if (!_pwmChannelsInUse[i]) {
            _pwmChannelsInUse[i] = true;
            return i;
        }
    }
    return -1; // Plus de canaux disponibles
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

    if (dev.type == DEVICE_RELAY) {
        pinMode(dev.gpio, OUTPUT);
        digitalWrite(dev.gpio, dev.state ? HIGH : LOW);
        Serial.printf("[Hardware] Relais '%s' initialisé sur GPIO %d (état: %d)\n", dev.name.c_str(), dev.gpio, dev.state);
    } else if (dev.type == DEVICE_PWM) {
        if (dev.pwmChannel < 0) {
            dev.pwmChannel = allocatePwmChannel();
        }

#if defined(ESP_ARDUINO_VERSION_MAJOR) && (ESP_ARDUINO_VERSION_MAJOR >= 3)
        // Core Arduino ESP32 v3.x API
        ledcAttach(dev.gpio, 5000, 8);
        ledcWrite(dev.gpio, dev.value);
#else
        // Core Arduino ESP32 v2.x API
        if (dev.pwmChannel >= 0) {
            ledcSetup(dev.pwmChannel, 5000, 8);
            ledcAttachPin(dev.gpio, dev.pwmChannel);
            ledcWrite(dev.pwmChannel, dev.value);
        }
#endif
        Serial.printf("[Hardware] PWM '%s' initialisé sur GPIO %d (canal: %d, val: %d)\n", 
                      dev.name.c_str(), dev.gpio, dev.pwmChannel, dev.value);
    }
}

void DeviceManager::releaseHardware(Device& dev) {
    if (!isPinSafe(dev.gpio)) return;

    if (dev.type == DEVICE_RELAY) {
        digitalWrite(dev.gpio, LOW);
        pinMode(dev.gpio, INPUT); // Haute impédance, pin relâchée proprement
    } else if (dev.type == DEVICE_PWM) {
#if defined(ESP_ARDUINO_VERSION_MAJOR) && (ESP_ARDUINO_VERSION_MAJOR >= 3)
        ledcDetach(dev.gpio);
#else
        if (dev.pwmChannel >= 0) {
            ledcDetachPin(dev.gpio);
        }
#endif
        pinMode(dev.gpio, INPUT);
        freePwmChannel(dev.pwmChannel);
        dev.pwmChannel = -1;
    }
    Serial.printf("[Hardware] Broche GPIO %d libérée pour '%s'\n", dev.gpio, dev.name.c_str());
}

void DeviceManager::applyHardwareState(const Device& dev) {
    if (!isPinSafe(dev.gpio)) return;

    if (dev.type == DEVICE_RELAY) {
        digitalWrite(dev.gpio, dev.state ? HIGH : LOW);
    } else if (dev.type == DEVICE_PWM) {
#if defined(ESP_ARDUINO_VERSION_MAJOR) && (ESP_ARDUINO_VERSION_MAJOR >= 3)
        ledcWrite(dev.gpio, dev.value);
#else
        if (dev.pwmChannel >= 0) {
            ledcWrite(dev.pwmChannel, dev.value);
        }
#endif
    }
}

bool DeviceManager::addDevice(const String& name, DeviceType type, uint8_t gpio, bool isCore, String& errorMsg) {
    if (name.length() == 0) {
        errorMsg = "Le nom du périphérique ne peut pas être vide.";
        return false;
    }

    if (!isPinSafe(gpio)) {
        errorMsg = "Le GPIO " + String(gpio) + " est interdit ou non sécurisé.";
        return false;
    }

    xSemaphoreTake(_mutex, portMAX_DELAY);

    if (isPinUsed(gpio)) {
        xSemaphoreGive(_mutex);
        errorMsg = "Le GPIO " + String(gpio) + " est déjà assigné à un autre équipement.";
        return false;
    }

    Device newDev;
    newDev.id = generateUniqueId();
    newDev.name = name;
    newDev.type = type;
    newDev.gpio = gpio;
    newDev.state = 0;
    newDev.value = 0;
    newDev.isCore = isCore;

    if (type == DEVICE_PWM) {
        newDev.pwmChannel = allocatePwmChannel();
        if (newDev.pwmChannel < 0) {
            xSemaphoreGive(_mutex);
            errorMsg = "Nombre maximal de canaux PWM atteint (16).";
            return false;
        }
    } else {
        newDev.pwmChannel = -1;
    }

    _devices.push_back(newDev);
    xSemaphoreGive(_mutex);

    // Initialiser immédiatement le hardware
    setupHardware(newDev);

    // Sauvegarder dans flash
    saveConfig();
    return true;
}

bool DeviceManager::updateDevice(uint8_t id, const String& newName, uint8_t newGpio, String& errorMsg) {
    if (newName.length() == 0) {
        errorMsg = "Le nom ne peut pas être vide.";
        return false;
    }

    if (!isPinSafe(newGpio)) {
        errorMsg = "Le GPIO " + String(newGpio) + " est interdit ou non sécurisé.";
        return false;
    }

    xSemaphoreTake(_mutex, portMAX_DELAY);

    Device* target = nullptr;
    for (auto& dev : _devices) {
        if (dev.id == id) {
            target = &dev;
            break;
        }
    }

    if (!target) {
        xSemaphoreGive(_mutex);
        errorMsg = "Périphérique introuvable (ID: " + String(id) + ").";
        return false;
    }

    // Si le GPIO change, vérifier qu'il est libre
    if (target->gpio != newGpio && isPinUsed(newGpio, id)) {
        xSemaphoreGive(_mutex);
        errorMsg = "Le nouveau GPIO " + String(newGpio) + " est déjà utilisé.";
        return false;
    }

    // Gestion du changement de GPIO
    if (target->gpio != newGpio) {
        releaseHardware(*target);
        target->gpio = newGpio;
        setupHardware(*target);
    }

    target->name = newName;
    xSemaphoreGive(_mutex);

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

    // Libérer la broche physique
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

bool DeviceManager::testDevice(uint8_t id, uint16_t durationMs) {
    uint8_t gpio = 255;
    DeviceType type = DEVICE_RELAY;
    uint8_t prevState = 0;
    uint8_t prevValue = 0;
    int8_t pwmChannel = -1;
    String name;

    xSemaphoreTake(_mutex, portMAX_DELAY);
    Device* dev = getDeviceById(id);
    if (!dev) {
        xSemaphoreGive(_mutex);
        return false;
    }
    gpio = dev->gpio;
    type = dev->type;
    prevState = dev->state;
    prevValue = dev->value;
    pwmChannel = dev->pwmChannel;
    name = dev->name;
    xSemaphoreGive(_mutex);

    Serial.printf("[DeviceManager] Lancement du test pour '%s' (GPIO %d, durée: %d ms)...\n", 
                  name.c_str(), gpio, durationMs);

    if (type == DEVICE_RELAY) {
        // Active le relais temporairement
        digitalWrite(gpio, HIGH);
        delay(durationMs);
        digitalWrite(gpio, prevState ? HIGH : LOW);
    } else if (type == DEVICE_PWM) {
        // Envoie un train PWM de test (ex: 75% puis retour consigne)
#if defined(ESP_ARDUINO_VERSION_MAJOR) && (ESP_ARDUINO_VERSION_MAJOR >= 3)
        ledcWrite(gpio, 200);
        delay(durationMs);
        ledcWrite(gpio, prevValue);
#else
        if (pwmChannel >= 0) {
            ledcWrite(pwmChannel, 200);
            delay(durationMs);
            ledcWrite(pwmChannel, prevValue);
        }
#endif
    }

    Serial.printf("[DeviceManager] Test terminé pour '%s'.\n", name.c_str());
    return true;
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
    if (str.equalsIgnoreCase("PWM")) {
        return DEVICE_PWM;
    }
    return DEVICE_RELAY;
}

String DeviceManager::typeToString(DeviceType type) {
    switch (type) {
        case DEVICE_PWM:
            return "PWM";
        case DEVICE_RELAY:
        default:
            return "RELAY";
    }
}
