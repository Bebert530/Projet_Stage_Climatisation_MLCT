#include "WebServerRoutes.h"
#include <ArduinoJson.h>
#include <LittleFS.h>

static void addCorsHeaders(AsyncWebServerResponse *response) {
    response->addHeader("Access-Control-Allow-Origin", "*");
    response->addHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    response->addHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

static AsyncWebSocket ws("/ws");

void setupWebServerRoutes(AsyncWebServer& server, DeviceManager& devManager, AutomationManager& autoManager, ClimateManager& climManager, WiFiManager& wifiManager) {
    // -------------------------------------------------------------
    // WEBSOCKET TEMPS RÉEL (/ws)
    // -------------------------------------------------------------
    ws.onEvent([&climManager](AsyncWebSocket *server, AsyncWebSocketClient *client, AwsEventType type, void *arg, uint8_t *data, size_t len) {
        if (type == WS_EVT_CONNECT) {
            Serial.printf("[WebSocket] Client #%u connecte depuis %s\n", client->id(), client->remoteIP().toString().c_str());
            client->text(climManager.getTelemetryJson());
        } else if (type == WS_EVT_DISCONNECT) {
            Serial.printf("[WebSocket] Client #%u deconnecte\n", client->id());
        } else if (type == WS_EVT_DATA) {
            AwsFrameInfo *info = (AwsFrameInfo*)arg;
            if (info->final && info->index == 0 && info->len == len && info->opcode == WS_TEXT) {
                String msg = "";
                msg.concat((const char*)data, len);
                climManager.handleJsonCommand(msg);
            }
        }
    });

    climManager.setBroadcastCallback([](const String& msg) {
        if (ws.count() > 0) {
            ws.textAll(msg);
        }
    });

    server.addHandler(&ws);

    // -------------------------------------------------------------
    // GESTION GLOBALE CORS (Options pre-flight)
    // -------------------------------------------------------------
    DefaultHeaders::Instance().addHeader("Access-Control-Allow-Origin", "*");
    DefaultHeaders::Instance().addHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS, DELETE");
    DefaultHeaders::Instance().addHeader("Access-Control-Allow-Headers", "Content-Type");

    // -------------------------------------------------------------
    // 1. GET /api/devices : Retourne la liste complète des périphériques
    // -------------------------------------------------------------
    server.on("/api/devices", HTTP_GET, [&devManager](AsyncWebServerRequest *request) {
        String json = devManager.getDevicesJson();
        AsyncWebServerResponse *response = request->beginResponse(200, "application/json", json);
        addCorsHeaders(response);
        request->send(response);
    });

    // -------------------------------------------------------------
    // 2. GET /api/available-pins : Retourne la liste des pins sûrs & libres
    // -------------------------------------------------------------
    server.on("/api/available-pins", HTTP_GET, [&devManager](AsyncWebServerRequest *request) {
        String json = devManager.getAvailablePinsJson();
        AsyncWebServerResponse *response = request->beginResponse(200, "application/json", json);
        addCorsHeaders(response);
        request->send(response);
    });

    // -------------------------------------------------------------
    // 3. GET /api/pins/suggest : Attribution automatique intelligente d'un GPIO
    // -------------------------------------------------------------
    server.on("/api/pins/suggest", HTTP_GET, [&devManager](AsyncWebServerRequest *request) {
        String typeStr = "OUTPUT_RELAY";
        if (request->hasParam("type")) {
            typeStr = request->getParam("type")->value();
        }
        SignalMode mode = DeviceManager::stringToSignalMode(typeStr);
        int8_t pin = devManager.suggestPin(mode);

#if defined(ARDUINOJSON_VERSION_MAJOR) && (ARDUINOJSON_VERSION_MAJOR >= 7)
        JsonDocument doc;
#else
        DynamicJsonDocument doc(256);
#endif
        if (pin >= 0) {
            doc["success"] = true;
            doc["gpio"] = pin;
            doc["mode"] = DeviceManager::signalModeToString(mode);
            doc["message"] = "Broche GPIO " + String(pin) + " sélectionnée avec succès";
        } else {
            doc["success"] = false;
            doc["error"] = "Aucune broche compatible disponible pour ce type de signal.";
        }

        String output;
        serializeJson(doc, output);
        AsyncWebServerResponse *response = request->beginResponse(pin >= 0 ? 200 : 400, "application/json", output);
        addCorsHeaders(response);
        request->send(response);
    });

    // -------------------------------------------------------------
    // 4. POST /api/devices/save : Enregistrement complet (Wizard ou modification)
    // -------------------------------------------------------------
    server.on("/api/devices/save", HTTP_POST,
        [&devManager](AsyncWebServerRequest *request) {
            String* body = (String*)request->_tempObject;
            if (!body || body->length() == 0) {
                AsyncWebServerResponse *response = request->beginResponse(400, "application/json", "{\"success\":false,\"error\":\"Corps JSON vide\"}");
                addCorsHeaders(response);
                request->send(response);
                return;
            }

#if defined(ARDUINOJSON_VERSION_MAJOR) && (ARDUINOJSON_VERSION_MAJOR >= 7)
            JsonDocument doc;
#else
            DynamicJsonDocument doc(1024);
#endif
            DeserializationError error = deserializeJson(doc, *body);
            delete body;
            request->_tempObject = nullptr;

            if (error) {
                AsyncWebServerResponse *response = request->beginResponse(400, "application/json", "{\"success\":false,\"error\":\"JSON invalide\"}");
                addCorsHeaders(response);
                request->send(response);
                return;
            }

            uint8_t id = doc["id"] | 0;
            String name = doc["name"] | "";
            String catStr = doc["category"] | "ACTUATOR";
            String voltage = doc["voltage"] | "12V";
            String modeStr = doc["mode"] | "OUTPUT_RELAY";
            uint8_t gpio = doc["gpio"] | 255;
            bool isCore = doc["isCore"] | false;

            DeviceCategory cat = DeviceManager::stringToCategory(catStr);
            SignalMode mode = DeviceManager::stringToSignalMode(modeStr);
            String errorMsg;

            bool ok = devManager.saveDevice(id, name, cat, voltage, mode, gpio, isCore, errorMsg);
            if (ok) {
                AsyncWebServerResponse *response = request->beginResponse(200, "application/json", "{\"success\":true,\"message\":\"Équipement enregistré et activé avec succès\"}");
                addCorsHeaders(response);
                request->send(response);
            } else {
                String resp = "{\"success\":false,\"error\":\"" + errorMsg + "\"}";
                AsyncWebServerResponse *response = request->beginResponse(400, "application/json", resp);
                addCorsHeaders(response);
                request->send(response);
            }
        },
        NULL,
        [](AsyncWebServerRequest *request, uint8_t *data, size_t len, size_t index, size_t total) {
            String* body = (String*)request->_tempObject;
            if (index == 0) {
                body = new String();
                request->_tempObject = body;
            }
            if (body) {
                body->concat((const char*)data, len);
            }
        }
    );

    // -------------------------------------------------------------
    // 5. POST /api/devices/delete : Suppression d'un équipement
    // -------------------------------------------------------------
    server.on("/api/devices/delete", HTTP_POST,
        [&devManager](AsyncWebServerRequest *request) {
            String* body = (String*)request->_tempObject;
            if (!body || body->length() == 0) {
                AsyncWebServerResponse *response = request->beginResponse(400, "application/json", "{\"success\":false,\"error\":\"Corps JSON vide\"}");
                addCorsHeaders(response);
                request->send(response);
                return;
            }

#if defined(ARDUINOJSON_VERSION_MAJOR) && (ARDUINOJSON_VERSION_MAJOR >= 7)
            JsonDocument doc;
#else
            DynamicJsonDocument doc(512);
#endif
            DeserializationError error = deserializeJson(doc, *body);
            delete body;
            request->_tempObject = nullptr;

            if (error) {
                AsyncWebServerResponse *response = request->beginResponse(400, "application/json", "{\"success\":false,\"error\":\"JSON invalide\"}");
                addCorsHeaders(response);
                request->send(response);
                return;
            }

            uint8_t id = doc["id"] | 0;
            String errorMsg;

            bool ok = devManager.deleteDevice(id, errorMsg);
            if (ok) {
                AsyncWebServerResponse *response = request->beginResponse(200, "application/json", "{\"success\":true,\"message\":\"Périphérique supprimé et broche libérée\"}");
                addCorsHeaders(response);
                request->send(response);
            } else {
                int statusCode = errorMsg.indexOf("Core") >= 0 ? 403 : 400;
                String resp = "{\"success\":false,\"error\":\"" + errorMsg + "\"}";
                AsyncWebServerResponse *response = request->beginResponse(statusCode, "application/json", resp);
                addCorsHeaders(response);
                request->send(response);
            }
        },
        NULL,
        [](AsyncWebServerRequest *request, uint8_t *data, size_t len, size_t index, size_t total) {
            String* body = (String*)request->_tempObject;
            if (index == 0) {
                body = new String();
                request->_tempObject = body;
            }
            if (body) {
                body->concat((const char*)data, len);
            }
        }
    );

    // -------------------------------------------------------------
    // 6. POST /api/devices/test : Test matériel temporaire (Actionneur 3s ou Capteur)
    // -------------------------------------------------------------
    server.on("/api/devices/test", HTTP_POST,
        [&devManager](AsyncWebServerRequest *request) {
            String* body = (String*)request->_tempObject;
            if (!body || body->length() == 0) {
                AsyncWebServerResponse *response = request->beginResponse(400, "application/json", "{\"success\":false,\"error\":\"Corps JSON vide\"}");
                addCorsHeaders(response);
                request->send(response);
                return;
            }

#if defined(ARDUINOJSON_VERSION_MAJOR) && (ARDUINOJSON_VERSION_MAJOR >= 7)
            JsonDocument doc;
#else
            DynamicJsonDocument doc(512);
#endif
            DeserializationError error = deserializeJson(doc, *body);
            delete body;
            request->_tempObject = nullptr;

            if (error) {
                AsyncWebServerResponse *response = request->beginResponse(400, "application/json", "{\"success\":false,\"error\":\"JSON invalide\"}");
                addCorsHeaders(response);
                request->send(response);
                return;
            }

            uint16_t duration = doc["duration"] | 3000;
            DeviceTestResult testRes;

            if (doc.containsKey("id") && doc["id"].as<uint8_t>() > 0) {
                uint8_t id = doc["id"].as<uint8_t>();
                testRes = devManager.testDevice(id, duration);
            } else if (doc.containsKey("gpio")) {
                uint8_t gpio = doc["gpio"].as<uint8_t>();
                String modeStr = doc["mode"] | "OUTPUT_RELAY";
                SignalMode mode = DeviceManager::stringToSignalMode(modeStr);
                testRes = devManager.testPinDirect(gpio, mode, duration);
            } else {
                testRes.success = false;
                testRes.message = "Paramètre 'id' ou 'gpio' manquant pour le test.";
            }

#if defined(ARDUINOJSON_VERSION_MAJOR) && (ARDUINOJSON_VERSION_MAJOR >= 7)
            JsonDocument respDoc;
#else
            DynamicJsonDocument respDoc(512);
#endif
            respDoc["success"] = testRes.success;
            respDoc["message"] = testRes.message;
            respDoc["reading"] = testRes.rawValue;
            respDoc["voltage"] = testRes.voltageValue;

            String resp;
            serializeJson(respDoc, resp);
            AsyncWebServerResponse *response = request->beginResponse(testRes.success ? 200 : 400, "application/json", resp);
            addCorsHeaders(response);
            request->send(response);
        },
        NULL,
        [](AsyncWebServerRequest *request, uint8_t *data, size_t len, size_t index, size_t total) {
            String* body = (String*)request->_tempObject;
            if (index == 0) {
                body = new String();
                request->_tempObject = body;
            }
            if (body) {
                body->concat((const char*)data, len);
            }
        }
    );

    // -------------------------------------------------------------
    // 7. POST /api/devices/set-state : Commande en direct depuis l'UI
    // -------------------------------------------------------------
    server.on("/api/devices/set-state", HTTP_POST,
        [&devManager](AsyncWebServerRequest *request) {
            String* body = (String*)request->_tempObject;
            if (!body || body->length() == 0) {
                AsyncWebServerResponse *response = request->beginResponse(400, "application/json", "{\"success\":false,\"error\":\"Corps JSON vide\"}");
                addCorsHeaders(response);
                request->send(response);
                return;
            }

#if defined(ARDUINOJSON_VERSION_MAJOR) && (ARDUINOJSON_VERSION_MAJOR >= 7)
            JsonDocument doc;
#else
            DynamicJsonDocument doc(512);
#endif
            DeserializationError error = deserializeJson(doc, *body);
            delete body;
            request->_tempObject = nullptr;

            if (error) {
                AsyncWebServerResponse *response = request->beginResponse(400, "application/json", "{\"success\":false,\"error\":\"JSON invalide\"}");
                addCorsHeaders(response);
                request->send(response);
                return;
            }

            uint8_t id = doc["id"] | 0;
            uint8_t state = doc["state"] | 0;
            uint8_t value = doc["value"] | 0;

            bool ok = devManager.setDeviceState(id, state, value);
            if (ok) {
                AsyncWebServerResponse *response = request->beginResponse(200, "application/json", "{\"success\":true}");
                addCorsHeaders(response);
                request->send(response);
            } else {
                AsyncWebServerResponse *response = request->beginResponse(404, "application/json", "{\"success\":false,\"error\":\"Périphérique introuvable\"}");
                addCorsHeaders(response);
                request->send(response);
            }
        },
        NULL,
        [](AsyncWebServerRequest *request, uint8_t *data, size_t len, size_t index, size_t total) {
            String* body = (String*)request->_tempObject;
            if (index == 0) {
                body = new String();
                request->_tempObject = body;
            }
            if (body) {
                body->concat((const char*)data, len);
            }
        }
    );

    // -------------------------------------------------------------
    // 8. GET /api/automations : Retourne les règles d'automatisation
    // -------------------------------------------------------------
    server.on("/api/automations", HTTP_GET, [&autoManager](AsyncWebServerRequest *request) {
        String json = autoManager.getRulesJson();
        AsyncWebServerResponse *response = request->beginResponse(200, "application/json", json);
        addCorsHeaders(response);
        request->send(response);
    });

    // -------------------------------------------------------------
    // 9. POST /api/automations : Sauvegarde les règles dans LittleFS
    // -------------------------------------------------------------
    server.on("/api/automations", HTTP_POST,
        [&autoManager](AsyncWebServerRequest *request) {
            String* body = (String*)request->_tempObject;
            if (!body || body->length() == 0) {
                AsyncWebServerResponse *response = request->beginResponse(400, "application/json", "{\"success\":false,\"error\":\"Corps JSON vide\"}");
                addCorsHeaders(response);
                request->send(response);
                return;
            }

            bool ok = autoManager.saveRules(*body);
            delete body;
            request->_tempObject = nullptr;

            AsyncWebServerResponse *response = request->beginResponse(ok ? 200 : 500, "application/json", ok ? "{\"success\":true}" : "{\"success\":false,\"error\":\"Échec de sauvegarde\"}");
            addCorsHeaders(response);
            request->send(response);
        },
        nullptr,
        [](AsyncWebServerRequest *request, uint8_t *data, size_t len, size_t index, size_t total) {
            String* body = (String*)request->_tempObject;
            if (index == 0) {
                body = new String();
                request->_tempObject = body;
            }
            if (body) {
                body->concat((const char*)data, len);
            }
        }
    );

    // -------------------------------------------------------------
    // 10. Télémétrie Climate Pro : GET /data
    // -------------------------------------------------------------
    server.on("/data", HTTP_GET, [&climManager](AsyncWebServerRequest *request) {
        String telemetry = climManager.getTelemetryJson();
        AsyncWebServerResponse *response = request->beginResponse(200, "application/json", telemetry);
        addCorsHeaders(response);
        request->send(response);
    });

    // -------------------------------------------------------------
    // 11. Actions rapides (GET /action)
    // -------------------------------------------------------------
    server.on("/action", HTTP_GET, [&climManager](AsyncWebServerRequest *request) {
        if (request->hasParam("power")) {
            climManager.setPower(request->getParam("power")->value() == "1");
        }
        if (request->hasParam("temp")) {
            float t = request->getParam("temp")->value().toFloat();
            climManager.setTarget(climManager.isTargetEnabled(), t);
        }
        if (request->hasParam("target_enabled")) {
            bool en = request->getParam("target_enabled")->value() == "1";
            climManager.setTarget(en, climManager.getTargetTemp());
        }
        if (request->hasParam("fan")) {
            int f = request->getParam("fan")->value().toInt();
            climManager.setFanSpeed((uint8_t)f);
        }
        if (request->hasParam("mode")) {
            climManager.setMode(request->getParam("mode")->value());
        }
        if (request->hasParam("hyst")) {
            float h = request->getParam("hyst")->value().toFloat();
            climManager.setHysteresis(h);
        }
        if (request->hasParam("chiller")) {
            climManager.setChiller(request->getParam("chiller")->value() == "1");
        }
        if (request->hasParam("water_temp")) {
            climManager.setWaterTargetTemp(request->getParam("water_temp")->value().toFloat());
        }

        AsyncWebServerResponse *response = request->beginResponse(200, "application/json", "{\"status\":\"ok\"}");
        addCorsHeaders(response);
        request->send(response);
    });

    // -------------------------------------------------------------
    // 10. GET /api/cycles : Base de données des cycles de climatisation
    // -------------------------------------------------------------
    server.on("/api/cycles", HTTP_GET, [](AsyncWebServerRequest *request) {
        if (LittleFS.exists("/cycles.json")) {
            File file = LittleFS.open("/cycles.json", "r");
            if (file) {
                String content = file.readString();
                file.close();
                AsyncWebServerResponse *response = request->beginResponse(200, "application/json", content);
                addCorsHeaders(response);
                request->send(response);
                return;
            }
        }
        AsyncWebServerResponse *response = request->beginResponse(200, "application/json", "{\"cycles\":[]}");
        addCorsHeaders(response);
        request->send(response);
    });

    // -------------------------------------------------------------
    // 11. POST /api/cycles : Sauvegarde de la base de données des cycles
    // -------------------------------------------------------------
    server.on("/api/cycles", HTTP_POST,
        [](AsyncWebServerRequest *request) {
            String* body = (String*)request->_tempObject;
            if (!body || body->length() == 0) {
                AsyncWebServerResponse *response = request->beginResponse(400, "application/json", "{\"success\":false,\"error\":\"Corps JSON vide\"}");
                addCorsHeaders(response);
                request->send(response);
                return;
            }

            File file = LittleFS.open("/cycles.json", "w");
            bool ok = false;
            if (file) {
                file.print(*body);
                file.close();
                ok = true;
            }

            delete body;
            request->_tempObject = nullptr;

            AsyncWebServerResponse *response = request->beginResponse(ok ? 200 : 500, "application/json", ok ? "{\"success\":true}" : "{\"success\":false,\"error\":\"Erreur ecriture LittleFS\"}");
            addCorsHeaders(response);
            request->send(response);
        },
        nullptr,
        [](AsyncWebServerRequest *request, uint8_t *data, size_t len, size_t index, size_t total) {
            String* body = (String*)request->_tempObject;
            if (index == 0) {
                body = new String();
                request->_tempObject = body;
            }
            if (body) {
                body->concat((const char*)data, len);
            }
        }
    );

    // -------------------------------------------------------------
    // 12. GET /api/wifi/status : État de connexion Wi-Fi hybride (AP + STA)
    // -------------------------------------------------------------
    server.on("/api/wifi/status", HTTP_GET, [&wifiManager](AsyncWebServerRequest *request) {
        String json = wifiManager.getStatusJson();
        AsyncWebServerResponse *response = request->beginResponse(200, "application/json", json);
        addCorsHeaders(response);
        request->send(response);
    });

    // -------------------------------------------------------------
    // 13. GET /api/wifi/scan : Scan Wi-Fi asynchrone & résultats
    // -------------------------------------------------------------
    server.on("/api/wifi/scan", HTTP_GET, [&wifiManager](AsyncWebServerRequest *request) {
        String json = wifiManager.getScanResultsJson();
        AsyncWebServerResponse *response = request->beginResponse(200, "application/json", json);
        addCorsHeaders(response);
        request->send(response);
    });

    // -------------------------------------------------------------
    // 14. POST /api/wifi/connect : Connexion à un réseau station (Van / 4G)
    // -------------------------------------------------------------
    server.on("/api/wifi/connect", HTTP_POST,
        [&wifiManager](AsyncWebServerRequest *request) {
            String* body = (String*)request->_tempObject;
            if (!body || body->length() == 0) {
                AsyncWebServerResponse *response = request->beginResponse(400, "application/json", "{\"success\":false,\"error\":\"Corps JSON vide\"}");
                addCorsHeaders(response);
                request->send(response);
                return;
            }

#if defined(ARDUINOJSON_VERSION_MAJOR) && (ARDUINOJSON_VERSION_MAJOR >= 7)
            JsonDocument doc;
#else
            DynamicJsonDocument doc(512);
#endif
            DeserializationError error = deserializeJson(doc, *body);
            delete body;
            request->_tempObject = nullptr;

            if (error) {
                AsyncWebServerResponse *response = request->beginResponse(400, "application/json", "{\"success\":false,\"error\":\"JSON invalide\"}");
                addCorsHeaders(response);
                request->send(response);
                return;
            }

            String ssid = doc["ssid"] | "";
            String pass = doc["pass"] | "";

            if (ssid.length() == 0) {
                AsyncWebServerResponse *response = request->beginResponse(400, "application/json", "{\"success\":false,\"error\":\"Le nom du réseau (SSID) est obligatoire.\"}");
                addCorsHeaders(response);
                request->send(response);
                return;
            }

            bool ok = wifiManager.connectSTA(ssid, pass);
            String resp = ok 
                ? "{\"success\":true,\"message\":\"Connexion en cours vers '" + ssid + "'. L'AP local reste actif.\"}"
                : "{\"success\":false,\"error\":\"Impossible d'initialiser la connexion station.\"}";

            AsyncWebServerResponse *response = request->beginResponse(ok ? 200 : 500, "application/json", resp);
            addCorsHeaders(response);
            request->send(response);
        },
        nullptr,
        [](AsyncWebServerRequest *request, uint8_t *data, size_t len, size_t index, size_t total) {
            String* body = (String*)request->_tempObject;
            if (index == 0) {
                body = new String();
                request->_tempObject = body;
            }
            if (body) {
                body->concat((const char*)data, len);
            }
        }
    );

    // -------------------------------------------------------------
    // 15. POST /api/wifi/reset : Oublier le réseau du van & retour AP seul
    // -------------------------------------------------------------
    server.on("/api/wifi/reset", HTTP_POST, [&wifiManager](AsyncWebServerRequest *request) {
        wifiManager.resetSTA();
        AsyncWebServerResponse *response = request->beginResponse(200, "application/json", "{\"success\":true,\"message\":\"Configuration Wi-Fi réinitialisée. Retour au mode AP local seul.\"}");
        addCorsHeaders(response);
        request->send(response);
    });

    // -------------------------------------------------------------
    // 16. Fichiers statiques LittleFS
    // -------------------------------------------------------------
    server.serveStatic("/", LittleFS, "/").setDefaultFile("index.html").setCacheControl("max-age=300");

    // -------------------------------------------------------------
    // Gestionnaire 404 & OPTIONS
    // -------------------------------------------------------------
    server.onNotFound([](AsyncWebServerRequest *request) {
        if (request->method() == HTTP_OPTIONS) {
            AsyncWebServerResponse *response = request->beginResponse(200);
            addCorsHeaders(response);
            request->send(response);
        } else {
            AsyncWebServerResponse *response = request->beginResponse(404, "text/plain", "404: Not Found");
            addCorsHeaders(response);
            request->send(response);
        }
    });

    Serial.println("[WebServer] Routes API REST, Didacticiel et LittleFS configurées.");
}
