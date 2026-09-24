#include "WebServerRoutes.h"
#include <ArduinoJson.h>
#include <LittleFS.h>

static void addCorsHeaders(AsyncWebServerResponse *response) {
    response->addHeader("Access-Control-Allow-Origin", "*");
    response->addHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    response->addHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

static void sendJsonResponse(AsyncWebServerRequest *request, int code, const String& json) {
    AsyncWebServerResponse *response = request->beginResponse(code, "application/json", json);
    addCorsHeaders(response);
    request->send(response);
}

static void sendJsonDoc(AsyncWebServerRequest *request, int code, const JsonDocument& doc) {
    String output;
    serializeJson(doc, output);
    sendJsonResponse(request, code, output);
}

static void sendSuccess(AsyncWebServerRequest *request, const String& msg = "") {
    JsonDocument doc;
    doc["success"] = true;
    if (msg.length() > 0) doc["message"] = msg;
    sendJsonDoc(request, 200, doc);
}

static void sendError(AsyncWebServerRequest *request, int code, const String& err) {
    JsonDocument doc;
    doc["success"] = false;
    doc["error"] = err;
    sendJsonDoc(request, code, doc);
}

static void handleBodyChunk(AsyncWebServerRequest *request, uint8_t *data, size_t len, size_t index, size_t total) {
    String* body = (String*)request->_tempObject;
    if (index == 0) {
        body = new String();
        request->_tempObject = body;
    }
    if (body) {
        body->concat((const char*)data, len);
    }
}

static bool parseJsonBody(AsyncWebServerRequest *request, JsonDocument& doc) {
    String* body = (String*)request->_tempObject;
    if (!body || body->length() == 0) {
        sendError(request, 400, "Corps JSON vide");
        return false;
    }
    DeserializationError error = deserializeJson(doc, *body);
    delete body;
    request->_tempObject = nullptr;

    if (error) {
        sendError(request, 400, "JSON invalide");
        return false;
    }
    return true;
}

static AsyncWebSocket ws("/ws");

void setupWebServerRoutes(AsyncWebServer& server, DeviceManager& devManager, SystemManager& sysManager, AutomationManager& autoManager, ClimateManager& climManager, WiFiManager& wifiManager) {
    // -------------------------------------------------------------
    // WEBSOCKET TEMPS RÉEL (/ws)
    // -------------------------------------------------------------
    ws.onEvent([&climManager, &sysManager, &devManager](AsyncWebSocket *server, AsyncWebSocketClient *client, AwsEventType type, void *arg, uint8_t *data, size_t len) {
        if (type == WS_EVT_CONNECT) {
            Serial.printf("[WebSocket] Client #%u connecte depuis %s\n", client->id(), client->remoteIP().toString().c_str());
            client->text(climManager.getTelemetryJson(&sysManager, &devManager));
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
        devManager.updateSensors();
        sendJsonResponse(request, 200, devManager.getDevicesJson());
    });

    // -------------------------------------------------------------
    // 2. GET /api/available-pins : Retourne la liste des pins sûrs & libres
    // -------------------------------------------------------------
    server.on("/api/available-pins", HTTP_GET, [&devManager](AsyncWebServerRequest *request) {
        sendJsonResponse(request, 200, devManager.getAvailablePinsJson());
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

        JsonDocument doc;
        if (pin >= 0) {
            doc["success"] = true;
            doc["gpio"] = pin;
            doc["mode"] = DeviceManager::signalModeToString(mode);
            doc["message"] = "Broche GPIO " + String(pin) + " sélectionnée avec succès";
            sendJsonDoc(request, 200, doc);
        } else {
            sendError(request, 400, "Aucune broche compatible disponible pour ce type de signal.");
        }
    });

    // -------------------------------------------------------------
    // 4. POST /api/devices/save : Enregistrement complet (Wizard ou modification)
    // -------------------------------------------------------------
    server.on("/api/devices/save", HTTP_POST,
        [&devManager](AsyncWebServerRequest *request) {
            JsonDocument doc;
            if (!parseJsonBody(request, doc)) return;

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
                sendSuccess(request, "Équipement enregistré et activé avec succès");
            } else {
                sendError(request, 400, errorMsg);
            }
        },
        NULL,
        handleBodyChunk
    );

    // -------------------------------------------------------------
    // 5. POST /api/devices/delete : Suppression d'un équipement
    // -------------------------------------------------------------
    server.on("/api/devices/delete", HTTP_POST,
        [&devManager](AsyncWebServerRequest *request) {
            JsonDocument doc;
            if (!parseJsonBody(request, doc)) return;

            uint8_t id = doc["id"] | 0;
            String errorMsg;

            bool ok = devManager.deleteDevice(id, errorMsg);
            if (ok) {
                sendSuccess(request, "Périphérique supprimé et broche libérée");
            } else {
                int statusCode = errorMsg.indexOf("Core") >= 0 ? 403 : 400;
                sendError(request, statusCode, errorMsg);
            }
        },
        NULL,
        handleBodyChunk
    );

    // -------------------------------------------------------------
    // 6. POST /api/devices/test : Test matériel temporaire (Actionneur 3s ou Capteur)
    // -------------------------------------------------------------
    server.on("/api/devices/test", HTTP_POST,
        [&devManager](AsyncWebServerRequest *request) {
            JsonDocument doc;
            if (!parseJsonBody(request, doc)) return;

            uint16_t duration = doc["duration"] | 3000;
            DeviceTestResult testRes;

            if (doc["id"].is<uint8_t>() && doc["id"].as<uint8_t>() > 0) {
                uint8_t id = doc["id"].as<uint8_t>();
                testRes = devManager.testDevice(id, duration);
            } else if (doc["gpio"].is<uint8_t>()) {
                uint8_t gpio = doc["gpio"].as<uint8_t>();
                String modeStr = doc["mode"] | "OUTPUT_RELAY";
                SignalMode mode = DeviceManager::stringToSignalMode(modeStr);
                testRes = devManager.testPinDirect(gpio, mode, duration);
            } else {
                testRes.success = false;
                testRes.message = "Paramètre 'id' ou 'gpio' manquant pour le test.";
            }

            JsonDocument respDoc;
            respDoc["success"] = testRes.success;
            respDoc["message"] = testRes.message;
            respDoc["reading"] = testRes.rawValue;
            respDoc["voltage"] = testRes.voltageValue;
            sendJsonDoc(request, testRes.success ? 200 : 400, respDoc);
        },
        NULL,
        handleBodyChunk
    );

    // -------------------------------------------------------------
    // 7. POST /api/devices/set-state : Commande en direct depuis l'UI
    // -------------------------------------------------------------
    server.on("/api/devices/set-state", HTTP_POST,
        [&devManager](AsyncWebServerRequest *request) {
            JsonDocument doc;
            if (!parseJsonBody(request, doc)) return;

            uint8_t id = doc["id"] | 0;
            uint8_t state = doc["state"] | 0;
            uint8_t value = doc["value"] | 0;

            bool ok = devManager.setDeviceState(id, state, value);
            if (ok) {
                sendSuccess(request);
            } else {
                sendError(request, 404, "Périphérique introuvable");
            }
        },
        NULL,
        handleBodyChunk
    );

    // -------------------------------------------------------------
    // 8. GET & POST /api/automations : Gestion des règles d'automatisation
    // -------------------------------------------------------------
    server.on("/api/automations", HTTP_GET, [&autoManager](AsyncWebServerRequest *request) {
        sendJsonResponse(request, 200, autoManager.getRulesJson());
    });

    server.on("/api/automations", HTTP_POST,
        [&autoManager](AsyncWebServerRequest *request) {
            String* body = (String*)request->_tempObject;
            if (!body || body->length() == 0) {
                sendError(request, 400, "Corps JSON vide");
                return;
            }
            bool ok = autoManager.saveRules(*body);
            delete body;
            request->_tempObject = nullptr;

            if (ok) {
                sendSuccess(request);
            } else {
                sendError(request, 500, "Échec de sauvegarde");
            }
        },
        nullptr,
        handleBodyChunk
    );

    // -------------------------------------------------------------
    // 9. GESTION DES SYSTÈMES COMPOSITES (/api/systems)
    // -------------------------------------------------------------
    server.on("/api/systems", HTTP_GET, [&sysManager, &devManager, &climManager](AsyncWebServerRequest *request) {
        sendJsonResponse(request, 200, sysManager.getSystemsJson(devManager, &climManager));
    });

    server.on("/api/systems/climatisation/compressor", HTTP_POST,
        [&climManager](AsyncWebServerRequest *request) {
            JsonDocument doc;
            if (!parseJsonBody(request, doc)) return;

            String state = doc["state"] | (doc["mode"] | "auto");
            climManager.setCompressorMode(state);

            JsonDocument respDoc;
            respDoc["success"] = true;
            respDoc["state"] = climManager.getCompressorStateString();
            respDoc["mode"] = climManager.getCompressorModeString();
            respDoc["remaining_delay_sec"] = climManager.getAntiCycleRemainingSec();
            sendJsonDoc(request, 200, respDoc);
        },
        nullptr,
        handleBodyChunk
    );

    server.on("/api/systems/save", HTTP_POST,
        [&sysManager](AsyncWebServerRequest *request) {
            JsonDocument doc;
            if (!parseJsonBody(request, doc)) return;

            SystemConfig sys;
            sys.id = (const char*)(doc["id"] | "clim_main");
            sys.type = (const char*)(doc["type"] | "climatisation");
            sys.name = (const char*)(doc["name"] | "Climatisation");
            sys.enabled = doc["enabled"] | true;

            if (doc["bindings"].is<JsonObject>()) {
                JsonObject b = doc["bindings"].as<JsonObject>();
                sys.bindings.tempAirId = b["temp_air_id"] | 0;
                sys.bindings.tempWaterId = b["temp_water_id"] | 0;
                sys.bindings.fanPwmId = b["fan_pwm_id"] | 0;
                sys.bindings.pumpRelayId = b["pump_relay_id"] | 0;
                sys.bindings.compressorRelayId = b["compressor_relay_id"] | 0;
            }

            if (doc["settings"].is<JsonObject>()) {
                JsonObject s = doc["settings"].as<JsonObject>();
                sys.targetTemp = s["target_temp"] | 21.0f;
                sys.mode = (const char*)(s["mode"] | "NORMAL");
            }

            bool ok = sysManager.saveSystem(sys);
            if (ok) {
                sendSuccess(request);
            } else {
                sendError(request, 500, "Échec sauvegarde système");
            }
        },
        nullptr,
        handleBodyChunk
    );

    server.on("/api/systems/delete", HTTP_POST,
        [&sysManager](AsyncWebServerRequest *request) {
            JsonDocument doc;
            if (!parseJsonBody(request, doc)) return;

            String id = (const char*)(doc["id"] | "");
            bool ok = sysManager.deleteSystem(id);
            if (ok) {
                sendSuccess(request);
            } else {
                sendError(request, 404, "Système introuvable");
            }
        },
        nullptr,
        handleBodyChunk
    );

    server.on("/api/systems/bind", HTTP_POST,
        [&sysManager](AsyncWebServerRequest *request) {
            JsonDocument doc;
            if (!parseJsonBody(request, doc)) return;

            String sysId = (const char*)(doc["system_id"] | "clim_main");
            String slot = (const char*)(doc["slot"] | "");
            uint8_t devId = doc["device_id"] | 0;

            bool ok = sysManager.bindDeviceToSlot(sysId, slot, devId);
            if (ok) {
                sendSuccess(request);
            } else {
                sendError(request, 400, "Slot ou système invalide");
            }
        },
        nullptr,
        handleBodyChunk
    );

    // -------------------------------------------------------------
    // 10. Télémétrie Climate Pro : GET /data
    // -------------------------------------------------------------
    server.on("/data", HTTP_GET, [&climManager, &sysManager, &devManager](AsyncWebServerRequest *request) {
        sendJsonResponse(request, 200, climManager.getTelemetryJson(&sysManager, &devManager));
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
        if (request->hasParam("timer_enabled") || request->hasParam("timer_sec")) {
            bool en = request->hasParam("timer_enabled") ? (request->getParam("timer_enabled")->value() == "1") : climManager.isTimerEnabled();
            uint32_t sec = request->hasParam("timer_sec") ? (uint32_t)request->getParam("timer_sec")->value().toInt() : climManager.getTimerDurationSec();
            climManager.setTimer(en, sec);
        }

        sendJsonResponse(request, 200, "{\"status\":\"ok\"}");
    });

    // -------------------------------------------------------------
    // 12. GET & POST /api/cycles : Base de données des cycles de climatisation
    // -------------------------------------------------------------
    server.on("/api/cycles", HTTP_GET, [](AsyncWebServerRequest *request) {
        if (LittleFS.exists("/cycles.json")) {
            File file = LittleFS.open("/cycles.json", "r");
            if (file) {
                String content = file.readString();
                file.close();
                sendJsonResponse(request, 200, content);
                return;
            }
        }
        sendJsonResponse(request, 200, "{\"cycles\":[]}");
    });

    server.on("/api/cycles", HTTP_POST,
        [](AsyncWebServerRequest *request) {
            String* body = (String*)request->_tempObject;
            if (!body || body->length() == 0) {
                sendError(request, 400, "Corps JSON vide");
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

            if (ok) {
                sendSuccess(request);
            } else {
                sendError(request, 500, "Erreur ecriture LittleFS");
            }
        },
        nullptr,
        handleBodyChunk
    );

    // -------------------------------------------------------------
    // 13. Wi-Fi Hybride : /api/wifi/status, /api/wifi/scan, /api/wifi/connect, /api/wifi/reset
    // -------------------------------------------------------------
    server.on("/api/wifi/status", HTTP_GET, [&wifiManager](AsyncWebServerRequest *request) {
        sendJsonResponse(request, 200, wifiManager.getStatusJson());
    });

    server.on("/api/wifi/scan", HTTP_GET, [&wifiManager](AsyncWebServerRequest *request) {
        sendJsonResponse(request, 200, wifiManager.getScanResultsJson());
    });

    server.on("/api/wifi/connect", HTTP_POST,
        [&wifiManager](AsyncWebServerRequest *request) {
            JsonDocument doc;
            if (!parseJsonBody(request, doc)) return;

            String ssid = doc["ssid"] | "";
            String pass = doc["pass"] | "";

            if (ssid.length() == 0) {
                sendError(request, 400, "Le nom du réseau (SSID) est obligatoire.");
                return;
            }

            bool ok = wifiManager.connectSTA(ssid, pass);
            if (ok) {
                sendSuccess(request, "Connexion en cours vers '" + ssid + "'. L'AP local reste actif.");
            } else {
                sendError(request, 500, "Impossible d'initialiser la connexion station.");
            }
        },
        nullptr,
        handleBodyChunk
    );

    server.on("/api/wifi/reset", HTTP_POST, [&wifiManager](AsyncWebServerRequest *request) {
        wifiManager.resetSTA();
        sendSuccess(request, "Configuration Wi-Fi réinitialisée. Retour au mode AP local seul.");
    });

    // -------------------------------------------------------------
    // 14. Fichiers statiques LittleFS (no-cache)
    // -------------------------------------------------------------
    server.serveStatic("/", LittleFS, "/").setDefaultFile("index.html").setCacheControl("no-cache, no-store, must-revalidate");

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
