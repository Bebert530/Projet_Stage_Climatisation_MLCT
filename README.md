# Climate Pro - ESP32 Smart Climate & Van Automation System

[![PlatformIO](https://img.shields.io/badge/PlatformIO-ESP32-orange.svg)](https://platformio.org/)
[![Framework](https://img.shields.io/badge/Framework-Arduino%20ESP32-blue.svg)](https://espressif.com/)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Status](https://img.shields.io/badge/Status-Industrial%20Grade%20%2F%20Zero--SAV-brightgreen.svg)](#)

**Climate Pro** is an autonomous, commercial-ready embedded climate regulation and hardware automation system designed for campervans, RVs, boats, and off-grid mobile installations. Powered by an **ESP32** micro-controller, it operates 24/7 with zero-maintenance ("Zero-SAV") design principles, resilient hybrid Wi-Fi networking, a local responsive Web interface, and real-time WebSocket telemetry.

---

## 🚀 Key Features

- **Autonomous 24/7 Water-Loop Climate Control:**
  - Continuous thermal regulation with adjustable setpoint and hysteresis.
  - Automatic chiller compressor management: starts cooling when water temperature exceeds **15°C** (up to 2h continuous run), and shuts off when water drops below **10°C**.
  - Built-in **30-minute compressor rest delay** (anti-short-cycle safety) and **60s minimal runtime protection**.
- **Modular Hardware & Pinout Allocation (DeviceManager):**
  - Dynamic pin configuration with built-in hardware blacklist (protects strapping & SPI flash pins).
  - Intelligent GPIO suggestion engine for Relays, PWM MOSFETs, 1-Wire DS18B20 digital probes, Analog 0-3.3V, and NTC thermistors.
  - Interactive, step-by-step wiring tutorial (Wizard) with live schematics and electrical test pulses.
- **Hardware Watchdog & Self-Recovery (Zero-SAV Architecture):**
  - FreeRTOS Task Watchdog Timer (**10-second timeout**) with automated reboot on lockups.
  - Boot reason inspection (`Power-on`, `Task Watchdog`, `Brownout`, `Software Reset`).
  - Fail-safe state enforcement: all high-power actuators automatically default to `OFF` on disconnection or boot.
- **Autonomous Rule Engine (AutomationManager):**
  - User-configurable conditional rules (*IF sensor condition THEN actuator action*).
- **Hybrid Resilient Wi-Fi (WiFiManager):**
  - Permanent standalone Access Point (`Van-Clim-Local`) for guaranteed offline access.
  - Dynamic Station (STA) client mode to connect to local van routers or 4G mobile hotspots.
  - Local **mDNS** resolution at [http://clim.local](http://clim.local).
- **Interactive Multi-Language Web Dashboard:**
  - Modern, responsive Dark Theme UI stored in **LittleFS** flash memory.
  - Full real-time bi-directional sync via **WebSockets** (`/ws`) with HTTP REST fallback.
  - Multi-language support: **English (EN)**, **Français (FR)**, and **Español (ES)**.
  - Cycle history tracking and energy consumption analytics.

---

## 📁 Project Structure

```
.
├── data/                          # Frontend Web Application (Stored in LittleFS)
│   ├── index.html                 # Single Page Application HTML markup
│   ├── style.css                  # Responsive CSS styles & Dark theme
│   ├── app.js                     # Vanilla JS controller, WebSocket client & i18n
│   ├── chart.min.js               # Offline Chart.js library
│   ├── config.json                # Default devices and pin allocations
│   ├── climate.json               # Climate regulation setpoints & state
│   ├── systems.json               # Composite system slot definitions
│   └── automations.json           # User-defined automation rules
├── src/                           # Embedded C++ Firmware
│   ├── main.cpp                   # Main FreeRTOS setup & loop entry point
│   ├── DeviceManager.h/.cpp       # Dynamic GPIO, sensors & actuators manager
│   ├── SystemManager.h/.cpp       # Composite systems & slot binding abstraction
│   ├── ClimateManager.h/.cpp      # 24/7 autonomous climate & compressor regulation
│   ├── AutomationManager.h/.cpp   # Automation rule evaluator
│   ├── DiagnosticManager.h/.cpp   # Task Watchdog & system health monitoring
│   ├── WiFiManager.h/.cpp         # Hybrid AP+STA Wi-Fi & mDNS manager
│   ├── WebServerRoutes.h/.cpp     # REST API endpoints & WebSocket server
│   ├── ActuatorOutput.h           # Actuator abstraction (Relay / PWM)
│   └── TimerUtil.h                # Non-blocking millis() timer utilities
├── partitions.csv                 # 4MB Custom Flash Partition Table (2MB App / 2MB LittleFS)
├── platformio.ini                 # PlatformIO build configuration & dependencies
└── README.md                      # Project documentation
```

---

## 🛠️ Prerequisites & Installation

### 1. Requirements
- **PlatformIO IDE** (recommended with VS Code) or **PlatformIO Core (CLI)**.
- **ESP32 Development Board** (NodeMCU-32S, ESP32-WROOM-32, etc.).
- Micro-USB / USB-C data cable.

### 2. Clone the Repository
```bash
git clone https://github.com/Bebert530/Projet_Stage_Climatisation_MLCT.git
cd Projet_Stage_Climatisation_MLCT
```

### 3. Build & Flash the Project

The project consists of two components: the **C++ Firmware** and the **LittleFS Filesystem Image** (Web Dashboard).

#### Step A: Build & Upload Firmware (C++)
Using VS Code PlatformIO Extension:
1. Open the project folder in VS Code.
2. Click the **PlatformIO** icon in the sidebar.
3. Under `Project Tasks > esp32dev > General`, click **`Upload`** (or press `Ctrl+Alt+U`).

Using PlatformIO CLI:
```bash
pio run --target upload
```

#### Step B: Build & Upload Web Filesystem (LittleFS)
Using VS Code PlatformIO Extension:
1. Under `Project Tasks > esp32dev > Platform`, click **`Upload Filesystem Image`**.

Using PlatformIO CLI:
```bash
pio run --target uploadfs
```

---

## 🌐 Initial Connection & Usage

1. **Power up the ESP32** (via USB or 12V buck regulator).
2. On your smartphone, tablet, or laptop, connect to the Wi-Fi network:
   - **SSID:** `Van-Clim-Local`
   - **Password:** `12345678`
3. Open your web browser and navigate to:
   - **IP Address:** [http://192.168.4.1/](http://192.168.4.1/)
   - **mDNS Hostname:** [http://clim.local/](http://clim.local/)
4. **Log in:**
   - **Username:** `admin`
   - **Password:** `admin`
5. **Run Hardware Self-Test:**
   - Navigate to the **Diagnostic** tab.

---

## 📡 REST API & WebSocket Reference

### WebSocket Endpoint (`ws://<IP>/ws`)
Provides real-time bi-directional telemetry and remote control.
- **Incoming Broadcasts:** Temperature readings (`t_amb`, `t_water`), compressor state, timer countdown, and system operational flags.
- **Outgoing Commands:**
  ```json
  {"cmd": "setPower", "power": true}
  {"cmd": "setTarget", "enabled": true, "temp": 21.5}
  {"cmd": "setFan", "speed": 80}
  {"cmd": "setCompressorMode", "mode": "auto"}
  ```

### Key REST Endpoints

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/diagnostics` | Complete system health, Watchdog state, memory, and probe status |
| `POST` | `/api/system/restart` | Triggers a clean software reboot of the ESP32 |
| `GET` | `/api/devices` | Lists all declared actuators and sensors with their current state |
| `POST` | `/api/devices/save` | Creates or updates a device pinout configuration |
| `POST` | `/api/devices/test` | Triggers a safe 3-second non-blocking test pulse on a device |
| `GET` | `/api/wifi/status` | Current AP and STA network connection details |
| `GET` | `/api/wifi/scan` | Asynchronously scans nearby Wi-Fi networks |
| `POST` | `/api/wifi/connect` | Configures and connects to a van station Wi-Fi network |
| `GET` | `/api/cycles` | Retrieves historical recorded climate cycles from LittleFS |

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
