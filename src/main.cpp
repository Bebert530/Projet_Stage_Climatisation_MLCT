#include <Arduino.h>
#include <WiFi.h>
#include <LittleFS.h>
#include <ESPAsyncWebServer.h>

#include "DeviceManager.h"
#include "AutomationManager.h"
#include "ClimateManager.h"
#include "WiFiManager.h"
#include "WebServerRoutes.h"

// Instances globales
AsyncWebServer server(80);
DeviceManager devManager;
AutomationManager autoManager;
ClimateManager climManager;
WiFiManager wifiManager;

void setup() {
    Serial.begin(115200);
    delay(1000);
    Serial.println("\n==================================================");
    Serial.println("   CLIMATE PRO - ESP32 DYNAMIC DEVICE MANAGER     ");
    Serial.println("==================================================");

    // 1. Initialisation du Gestionnaire de matériel (LittleFS + GPIO + /config.json)
    if (!devManager.begin("/config.json")) {
        Serial.println("[MAIN] ERREUR CRITIQUE : Échec de démarrage du DeviceManager !");
    } else {
        Serial.println("[MAIN] DeviceManager opérationnel.");
    }

    // 2. Initialisation du Moteur d'automatisation (/automations.json)
    if (!autoManager.begin("/automations.json")) {
        Serial.println("[MAIN] Avertissement : Échec chargement initial des automatisations.");
    } else {
        Serial.println("[MAIN] AutomationManager opérationnel.");
    }

    // 3. Initialisation du Moteur de régulation thermique 24/24 (/climate.json)
    if (!climManager.begin("/climate.json")) {
        Serial.println("[MAIN] Avertissement : Échec initialisation ClimateManager.");
    } else {
        Serial.println("[MAIN] ClimateManager 24/24 autonome opérationnel.");
    }

    // 4. Initialisation du Gestionnaire Wi-Fi Hybride résilient (AP 'Van-Clim-Local' + STA /wifi.json + mDNS)
    wifiManager.begin("/wifi.json");

    // 5. Configuration des endpoints API REST, WebSockets et distribution des fichiers LittleFS
    setupWebServerRoutes(server, devManager, autoManager, climManager, wifiManager);

    // 6. Lancement du serveur Web asynchrone
    server.begin();
    Serial.println("[MAIN] Serveur HTTP & WebSockets démarré avec succès.");
    Serial.println("==================================================\n");
}

void loop() {
    // 1. Surveillance & reconnexion non-bloquante du Wi-Fi
    wifiManager.update();

    // 2. Régulation thermique continue 24/24 & acquisition capteurs physiques
    climManager.update(devManager);

    // 3. Évaluation et exécution autonome des règles d'automatisation
    autoManager.update(devManager);

    // 4. Délai FreeRTOS coopératif (50ms)
    vTaskDelay(pdMS_TO_TICKS(50));
}

