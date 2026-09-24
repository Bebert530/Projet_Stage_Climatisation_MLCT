#pragma once

#include <Arduino.h>
#include <ArduinoJson.h>
#include <LittleFS.h>
#include <vector>
#include "DeviceManager.h"

/**
 * @struct ClimateBindings
 * @brief Association des rôles fonctionnels de climatisation aux équipements réels
 */
struct ClimateBindings {
    uint8_t tempAirId;        // Slot 1: Sonde Température Air (1-Wire / NTC / Analogique) [Requis]
    uint8_t tempWaterId;      // Slot 2: Sonde Température Eau (1-Wire / NTC / Analogique) [Optionnel]
    uint8_t fanPwmId;         // Slot 3: Ventilateur / Pulseur (PWM) [Requis]
    uint8_t pumpRelayId;      // Slot 4: Pompe de circulation (Relais Tout-ou-Rien) [Requis]
    uint8_t compressorRelayId;// Slot 5: Compresseur de Froid (Relais Tout-ou-Rien) [Requis]

    ClimateBindings() : tempAirId(0), tempWaterId(0), fanPwmId(0), pumpRelayId(0), compressorRelayId(0) {}
};

/**
 * @struct SystemConfig
 * @brief Définition d'un système composite (ex: Climatisation)
 */
struct SystemConfig {
    String id;               // Identifiant unique (ex: "clim_main")
    String type;             // Type de système ("climatisation")
    String name;             // Nom d'affichage (ex: "Climatisation Salon")
    bool enabled;            // Actif / Inactif
    ClimateBindings bindings;// Bindings matériels
    float targetTemp;        // Consigne par défaut (°C)
    String mode;             // Mode de fonctionnement par défaut ("NORMAL", "ECO", etc.)

    SystemConfig() : id(""), type("climatisation"), name("Climatisation"), enabled(true), targetTemp(21.0f), mode("NORMAL") {}
};

class ClimateManager;

/**
 * @class SystemManager
 * @brief Gestionnaire modulaire des systèmes composites pour ESP32
 */
class SystemManager {
public:
    SystemManager();
    ~SystemManager();

    bool begin(const char* configPath = "/systems.json");
    bool loadConfig();
    bool saveConfig();

    std::vector<SystemConfig> getSystems();
    SystemConfig* getSystemById(const String& id);
    SystemConfig* getPrimaryClimateSystem();

    bool saveSystem(const SystemConfig& sys);
    bool deleteSystem(const String& id);
    bool bindDeviceToSlot(const String& systemId, const String& slotName, uint8_t deviceId);

    /**
     * @brief Vérifie si un système est complet et fonctionnel
     * @param systemId Identifiant du système
     * @param devManager Référence au DeviceManager pour valider l'existence des équipements
     * @param missingSlots Vecteur recevant les identifiants de slots manquants
     * @return true si le système dispose de tous les équipements requis valides
     */
    bool isSystemOperational(const String& systemId, DeviceManager& devManager, std::vector<String>& missingSlots);

    /**
     * @brief Retourne la sérialisation JSON complète des systèmes avec statuts et état compresseur
     */
    String getSystemsJson(DeviceManager& devManager, ClimateManager* climManager = nullptr);

private:
    String _configPath;
    std::vector<SystemConfig> _systems;
    SemaphoreHandle_t _mutex;

    void createDefaultConfig();
};
