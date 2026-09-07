#pragma once

#include <Arduino.h>
#include <ArduinoJson.h>
#include <LittleFS.h>
#include <vector>

/**
 * @enum DeviceCategory
 * @brief Catégorie d'équipement : Actionneur ou Capteur
 */
enum DeviceCategory {
    CAT_ACTUATOR = 0, // Actionneur (Relais, Variateur PWM/MOSFET, etc.)
    CAT_SENSOR   = 1  // Capteur (Flotteur, Capteur 1-Wire, Pression analogique, etc.)
};

/**
 * @enum SignalMode
 * @brief Type précis de commande ou signal électrique
 */
enum SignalMode {
    MODE_OUTPUT_RELAY   = 0, // Relais Tout-ou-Rien (HIGH/LOW)
    MODE_OUTPUT_PWM     = 1, // Progressif PWM / MOSFET
    MODE_INPUT_DIGITAL  = 2, // Contact sec / Flotteur (INPUT_PULLUP)
    MODE_INPUT_ADC      = 3, // Analogique 0-3.3V (ADC1)
    MODE_INPUT_ONEWIRE  = 4  // Bus numérique 1-Wire
};

/**
 * @enum DeviceType
 * @brief Types pour rétrocompatibilité RELAY / PWM
 */
enum DeviceType {
    DEVICE_RELAY = 0,
    DEVICE_PWM   = 1
};

/**
 * @struct Device
 * @brief Représentation complète d'un périphérique
 */
struct Device {
    uint8_t id;             // Identifiant unique
    String name;            // Nom lisible (ex: "Pompe boucle froide")
    DeviceCategory category;// CAT_ACTUATOR ou CAT_SENSOR
    String voltage;         // "12V", "5V", "3.3V"
    SignalMode mode;        // Mode précis de signal
    DeviceType type;        // Pour rétro-compatibilité dashboard
    uint8_t gpio;           // Broche GPIO ESP32 assignée
    uint8_t state;          // État logique binaire (0 ou 1)
    uint8_t value;          // Valeur PWM ou ADC (0 - 255 / raw)
    int8_t pwmChannel;      // Canal LEDC alloué (0-15 pour PWM, -1 sinon)
    bool isCore;            // Équipement système protégé contre suppression
};

/**
 * @struct DeviceTestResult
 * @brief Résultat du test de branchement (Actionneur ou Capteur)
 */
struct DeviceTestResult {
    bool success;
    String message;
    int rawValue;
    float voltageValue;
};

/**
 * @class DeviceManager
 * @brief Gestionnaire modulaire et sécurisé des périphériques GPIO de l'ESP32
 */
class DeviceManager {
public:
    DeviceManager();
    ~DeviceManager();

    bool begin(const char* configPath = "/config.json");
    bool loadConfig();
    bool saveConfig();

    std::vector<Device> getDevices();
    Device* getDeviceById(uint8_t id);

    std::vector<uint8_t> getAvailablePins();
    bool isPinSafe(uint8_t pin) const;
    bool isPinUsed(uint8_t pin, uint8_t excludeDeviceId = 0);

    /**
     * @brief Suggère intelligemment la meilleure broche GPIO libre selon le mode de signal
     * @param mode MODE_OUTPUT_RELAY, MODE_OUTPUT_PWM, MODE_INPUT_DIGITAL, MODE_INPUT_ADC, MODE_INPUT_ONEWIRE
     * @return Numéro GPIO suggéré, ou -1 si aucune broche adéquate n'est disponible
     */
    int8_t suggestPin(SignalMode mode);

    /**
     * @brief Sauvegarde ou met à jour un équipement complet (nom, catégorie, tension, mode, gpio)
     */
    bool saveDevice(uint8_t id, const String& name, DeviceCategory category, const String& voltage, 
                    SignalMode mode, uint8_t gpio, bool isCore, String& errorMsg);

    /**
     * @brief Supprime un périphérique et libère proprement son GPIO
     */
    bool deleteDevice(uint8_t id, String& errorMsg);

    /**
     * @brief Modifie l'état d'un équipement
     */
    bool setDeviceState(uint8_t id, uint8_t state, uint8_t value = 0);

    /**
     * @brief Teste le câblage d'un périphérique existant (3s pulse pour actionneur, lecture directe pour capteur)
     */
    DeviceTestResult testDevice(uint8_t id, uint16_t durationMs = 3000);

    /**
     * @brief Teste directement une broche GPIO avant enregistrement (dans le Wizard de câblage)
     */
    DeviceTestResult testPinDirect(uint8_t gpio, SignalMode mode, uint16_t durationMs = 3000);

    String getDevicesJson();
    String getAvailablePinsJson();

    static DeviceType stringToType(const String& str);
    static String typeToString(DeviceType type);

    static DeviceCategory stringToCategory(const String& str);
    static String categoryToString(DeviceCategory cat);

    static SignalMode stringToSignalMode(const String& str);
    static String signalModeToString(SignalMode mode);

private:
    String _configPath;
    std::vector<Device> _devices;
    SemaphoreHandle_t _mutex;

    bool _pwmChannelsInUse[16];

    // Broches de sortie sûres
    static const std::vector<uint8_t> SAFE_OUTPUT_PINS;

    // Broches ADC1 sûres utilisables avec Wi-Fi actif (32, 33, 34, 35, 36, 39)
    static const std::vector<uint8_t> SAFE_ADC1_PINS;

    // Broches d'entrée avec résistance Pull-up interne
    static const std::vector<uint8_t> SAFE_PULLUP_PINS;

    // Liste noire des broches boot/strapping/flash
    static const std::vector<uint8_t> BLACKLIST_PINS;

    void setupHardware(Device& dev);
    void releaseHardware(Device& dev);
    void applyHardwareState(const Device& dev);

    int8_t allocatePwmChannel();
    void freePwmChannel(int8_t channel);

    uint8_t generateUniqueId();
    void createDefaultConfig();
};
