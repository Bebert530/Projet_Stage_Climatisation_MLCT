#pragma once

#include <Arduino.h>
#include <ArduinoJson.h>
#include <LittleFS.h>
#include <OneWire.h>
#include <DallasTemperature.h>
#include <functional>
#include "DeviceManager.h"
#include "SystemManager.h"

enum CompressorState {
    COMP_STATE_OFF,
    COMP_STATE_WAITING_DELAY,
    COMP_STATE_RUNNING
};

enum CompressorMode {
    COMP_MODE_AUTO,
    COMP_MODE_FORCE_ON,
    COMP_MODE_FORCE_OFF
};

/**
 * @class ClimateManager
 * @brief Gestionnaire de climatisation autonome 24/24 pour ESP32
 * 
 * Assure la régulation thermique continue sur matériel réel (Sondes DS18B20 1-Wire & ADC1/NTC),
 * la protection frigorifique anti-court-cycle du compresseur (180s),
 * le temps de fonctionnement minimal anti-microcycle (60s),
 * la surveillance de sécurité Watchdog (coupure d'urgence si sonde débranchée),
 * et la liaison dynamique aux slots du système de Climatisation (SystemManager).
 */
class ClimateManager {
public:
    using BroadcastCallback = std::function<void(const String& message)>;

    ClimateManager();
    ~ClimateManager();

    bool begin(const char* configPath = "/climate.json");
    bool loadConfig();
    bool saveConfig();

    /**
     * @brief Boucle principale de régulation appelée 24/24 dans loop()
     */
    void update(DeviceManager& devManager, SystemManager& sysManager);
    void update(DeviceManager& devManager); // Rétro-compatibilité

    // Commandes utilisateur
    void setPower(bool on);
    void setTarget(bool enabled, float temp);
    void setMode(const String& newMode);
    void setFanSpeed(uint8_t speed);
    void setHysteresis(float hyst);
    void setChiller(bool enabled);
    void setWaterTargetTemp(float temp);
    void setCompressorMode(const String& mode); // "auto", "on", "off"
    void setTimer(bool enabled, uint32_t durationSec);

    // Traitement des commandes JSON (WebSocket ou REST)
    bool handleJsonCommand(const String& jsonStr);

    // Sérialisation de l'état complet
    String getTelemetryJson(SystemManager* sysManager = nullptr, DeviceManager* devManager = nullptr);

    // Configuration du diffuseur WebSocket
    void setBroadcastCallback(BroadcastCallback cb);

    // Getters d'état
    bool isSystemOn() const { return _systemOn; }
    bool isTargetEnabled() const { return _targetEnabled; }
    float getTargetTemp() const { return _targetTemp; }
    float getAmbientTemp() const { return _currentAmbientTemp; }
    float getWaterTemp() const { return _currentWaterTemp; }
    float getWaterTargetTemp() const { return _targetWaterTemp; }
    bool isCompressorActive() const { return _compressorActive; }
    CompressorState getCompressorState() const { return _compressorState; }
    String getCompressorStateString() const;
    CompressorMode getCompressorMode() const { return _compressorMode; }
    String getCompressorModeString() const;
    bool isAntiCycleActive() const { return _antiCycleActive; }
    uint16_t getAntiCycleRemainingSec() const { return _antiCycleRemainingSec; }
    uint8_t getProbesCount() const { return _probesConnectedCount; }
    bool isProbeWatchdogAlert() const { return _probeWatchdogAlert; }
    bool isSystemConfigured() const { return _systemConfigured; }
    bool isSystemOperational() const { return _systemOperational; }
    bool isTimerEnabled() const { return _timerEnabled; }
    uint32_t getTimerDurationSec() const { return _timerDurationSec; }
    uint32_t getTimerRemainingSec() const { return _timerRemainingSec; }
    bool isCoolingDemand() const { return _coolingDemand; }

    // Constantes de sécurité frigorifique
    static const uint32_t ANTI_CYCLE_DELAY_MS = 180000; // 180 s (3 minutes) délai de repos minimal
    static const uint32_t MIN_RUN_TIME_MS = 60000;       // 60 s temps de fonctionnement minimal

private:
    String _configPath;
    SemaphoreHandle_t _mutex;
    BroadcastCallback _broadcastCb;

    // Statut du Système composite Climatisation
    bool _systemConfigured;
    bool _systemOperational;
    String _missingSlotsList;

    // Gestion du bus 1-Wire et sondes Dallas DS18B20
    OneWire* _oneWire;
    DallasTemperature* _dallasSensors;
    int8_t _currentOneWirePin;
    uint8_t _probesConnectedCount;
    bool _probeWatchdogAlert;
    unsigned long _lastSensorReadTime;

    // Paramètres de fonctionnement
    bool _systemOn;
    bool _targetEnabled;
    float _targetTemp;
    float _hysteresis;
    String _mode;
    uint8_t _fanSpeed;
    bool _chillerEnabled;
    float _targetWaterTemp;
    bool _coolingDemand;

    // Minuterie de fonctionnement (décompte dynamique)
    bool _timerEnabled;
    uint32_t _timerDurationSec;
    uint32_t _timerRemainingSec;

    // Protection compresseur (Anti-court-cycle & Anti-microcycle)
    bool _compressorActive;
    CompressorState _compressorState;
    CompressorMode _compressorMode;
    bool _antiCycleActive;
    uint16_t _antiCycleRemainingSec;
    unsigned long _lastCompressorStartTime;
    unsigned long _lastCompressorStopTime;

    // Températures réelles mesurées
    float _currentAmbientTemp;
    float _currentWaterTemp;

    // Métriques et chronométrage
    float _totalEnergyKwh;
    unsigned long _totalRuntimeSec;
    unsigned long _lastRegulTime;
    unsigned long _lastBroadcastTime;
    unsigned long _lastStatsTick;

    void initOrUpdate1Wire(uint8_t gpio);
    void readPhysicalSensors(DeviceManager& devManager, SystemManager& sysManager);
    void evaluateRegulation(DeviceManager& devManager, SystemManager& sysManager, float dtSec);
    void applyModePreset(const String& newMode);
    void broadcastState();
};
