#include <Arduino.h>
#include <WiFi.h>
#include <LittleFS.h>
#include <ESPAsyncWebServer.h>

#include "DeviceManager.h"
#include "WebServerRoutes.h"

// Configuration du point d'accès Wi-Fi autonome de l'ESP32
const char* AP_SSID = "Prototype_Clim";
const char* AP_PASS = "12345678";

// Instances globales
AsyncWebServer server(80);
DeviceManager devManager;

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

    // 2. Configuration du Wi-Fi en mode Point d'Accès (Access Point)
    WiFi.mode(WIFI_AP_STA);
    WiFi.softAP(AP_SSID, AP_PASS);
    
    IPAddress IP = WiFi.softAPIP();
    Serial.printf("[MAIN] Point d'accès Wi-Fi actif : %s\n", AP_SSID);
    Serial.printf("[MAIN] Mot de passe Wi-Fi       : %s\n", AP_PASS);
    Serial.printf("[MAIN] Interface Web disponible : http://%s/\n", IP.toString().c_str());

    // 3. Configuration des endpoints API REST et distribution des fichiers LittleFS
    setupWebServerRoutes(server, devManager);

    // 4. Lancement du serveur Web asynchrone
    server.begin();
    Serial.println("[MAIN] Serveur HTTP démarré avec succès.");
    Serial.println("==================================================\n");
}

void loop() {
    // Le serveur AsyncWebServer et FreeRTOS gèrent les requêtes de manière asynchrone.
    // Vous pouvez placer ici la logique de régulation thermique, lecture de sondes DS18B20, etc.
    vTaskDelay(pdMS_TO_TICKS(1000));
}

