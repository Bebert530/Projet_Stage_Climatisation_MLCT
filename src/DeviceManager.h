#pragma once

#include <Arduino.h>
#include <ArduinoJson.h>
#include <LittleFS.h>
#include <vector>

/**
 * @enum DeviceType
 * @brief Types d'équipements pris en charge par le gestionnaire de matériel
 */
enum DeviceType {
    DEVICE_RELAY = 0, // Relais tout-ou-rien (HIGH / LOW)
    DEVICE_PWM   = 1  // Variateur de vitesse ou intensité (LEDC PWM)
};

/**
 * @struct Device
 * @brief Représentation d'un périphérique dynamique
 */
struct Device {
    uint8_t id;         // Identifiant unique
    String name;        // Nom lisible (ex: "Pompe boucle froide")
    DeviceType type;    // Type (RELAY ou PWM)
    uint8_t gpio;       // Broche GPIO ESP32 assignée
    uint8_t state;      // État logique binaire (0 = OFF, 1 = ON)
    uint8_t value;      // Valeur analogique / PWM (0 - 255)
    int8_t pwmChannel;  // Canal LEDC alloué (0-15 pour PWM, -1 pour RELAY)
    bool isCore;        // Équipement système protégé contre la suppression
};

/**
 * @class DeviceManager
 * @brief Gestionnaire modulaire et sécurisé des périphériques GPIO de l'ESP32
 */
class DeviceManager {
public:
    DeviceManager();
    ~DeviceManager();

    /**
     * @brief Initialise le système de fichiers LittleFS, charge /config.json et configure le hardware
     * @param configPath Chemin vers le fichier JSON dans LittleFS (défaut: "/config.json")
     * @return true si succès, false en cas d'erreur
     */
    bool begin(const char* configPath = "/config.json");

    /**
     * @brief Charge et parse la configuration JSON depuis la mémoire flash
     */
    bool loadConfig();

    /**
     * @brief Sauvegarde l'état actuel des périphériques dans /config.json
     */
    bool saveConfig();

    /**
     * @brief Renvoie la liste complète des périphériques enregistrés
     */
    std::vector<Device> getDevices();

    /**
     * @brief Recherche un périphérique par son identifiant
     * @return Pointeur vers Device ou nullptr si introuvable
     */
    Device* getDeviceById(uint8_t id);

    /**
     * @brief Renvoie la liste des GPIO ESP32 sûrs et non attribués
     */
    std::vector<uint8_t> getAvailablePins();

    /**
     * @brief Vérifie si un numéro de GPIO est sûr (hors liste noire et hors input-only)
     */
    bool isPinSafe(uint8_t pin) const;

    /**
     * @brief Vérifie si un GPIO est déjà utilisé par un périphérique existant
     * @param pin Numéro du GPIO
     * @param excludeDeviceId ID éventuel à exclure du contrôle (ex: lors d'une mise à jour)
     */
    bool isPinUsed(uint8_t pin, uint8_t excludeDeviceId = 0);

    /**
     * @brief Ajoute dynamiquement un périphérique, initialise son GPIO et met à jour config.json
     * @param name Nom de l'équipement
     * @param type DEVICE_RELAY ou DEVICE_PWM
     * @param gpio Broche GPIO désirée
     * @param isCore Protection système (défaut false)
     * @param errorMsg Message d'erreur détaillé en cas d'échec
     * @return true si l'ajout est réussi
     */
    bool addDevice(const String& name, DeviceType type, uint8_t gpio, bool isCore, String& errorMsg);

    /**
     * @brief Modifie un équipement existant (changement de nom ou migration de GPIO)
     * @param id Identifiant de l'équipement
     * @param newName Nouveau nom
     * @param newGpio Nouveau GPIO
     * @param errorMsg Message d'erreur en cas d'échec
     */
    bool updateDevice(uint8_t id, const String& newName, uint8_t newGpio, String& errorMsg);

    /**
     * @brief Supprime un périphérique et libère proprement son GPIO
     * @note Échoue si isCore == true
     */
    bool deleteDevice(uint8_t id, String& errorMsg);

    /**
     * @brief Modifie l'état matériel d'un équipement (ON/OFF ou PWM)
     * @param id Identifiant de l'équipement
     * @param state État binaire (0 ou 1)
     * @param value Valeur PWM (0 à 255, optionnel)
     */
    bool setDeviceState(uint8_t id, uint8_t state, uint8_t value = 0);

    /**
     * @brief Effectue un test matériel temporaire (pulse ou toggle) pour tester le câblage
     * @param id Identifiant du périphérique à tester
     * @param durationMs Durée du pulse de test en millisecondes
     */
    bool testDevice(uint8_t id, uint16_t durationMs = 1200);

    /**
     * @brief Sérialise la liste des périphériques au format JSON (pour l'API REST)
     */
    String getDevicesJson();

    /**
     * @brief Sérialise la liste des pins disponibles au format JSON
     */
    String getAvailablePinsJson();

    /**
     * @brief Convertit une chaîne de caractères en DeviceType
     */
    static DeviceType stringToType(const String& str);

    /**
     * @brief Convertit un DeviceType en chaîne lisible
     */
    static String typeToString(DeviceType type);

private:
    String _configPath;
    std::vector<Device> _devices;
    SemaphoreHandle_t _mutex;

    // Masque des canaux PWM LEDC alloués (16 canaux: 0 à 15)
    bool _pwmChannelsInUse[16];

    // Liste blanche des broches sûres en sortie sur l'ESP32
    static const std::vector<uint8_t> SAFE_PINS;

    // Liste noire des broches système/flash/boot (0, 2, 6, 7, 8, 9, 10, 11, 12, 15)
    static const std::vector<uint8_t> BLACKLIST_PINS;

    // Initialisation du GPIO au niveau matériel (pinMode ou ledcAttach)
    void setupHardware(Device& dev);

    // Libération sûre d'un GPIO (détachement PWM, remise en état neutre INPUT)
    void releaseHardware(Device& dev);

    // Application de la consigne matérielle
    void applyHardwareState(const Device& dev);

    // Gestionnaire de canaux PWM
    int8_t allocatePwmChannel();
    void freePwmChannel(int8_t channel);

    // Génère un nouvel ID unique
    uint8_t generateUniqueId();

    // Crée la configuration par défaut si le fichier n'existe pas
    void createDefaultConfig();
};

