/**
 * Kinesis — ESP32S3 Context Agent Camera
 *
 * 两种传输模式，用 USE_WIFI 切换：
 *   USE_WIFI 0 → USB串口模式（当前）：JPEG帧通过串口发到电脑上的 serial_bridge.py
 *   USE_WIFI 1 → WiFi模式：HTTP POST 到 Kinesis 服务器的 /camera_frame 端点
 *
 * Arduino IDE setup:
 *   Board:   Seeed XIAO ESP32S3 Sense
 *   Port:    your serial port
 *   Baud:    921600
 */

// ──────────────────────────────────────────────
// 切换这里：0 = USB串口，1 = WiFi
// ──────────────────────────────────────────────
#define USE_WIFI 0

// ──────────────────────────────────────────────
// WiFi 配置（USE_WIFI 1 时填写）
// ──────────────────────────────────────────────
#if USE_WIFI
  #include <WiFi.h>
  #include <HTTPClient.h>
  const char* WIFI_SSID     = "YOUR_WIFI_SSID";
  const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";
  const char* SERVER_IP     = "192.168.x.x";  // 运行 python run.py 的电脑 IP
  const int   SERVER_PORT   = 8080;
  String serverUrl;
#endif

#include "esp_camera.h"

// How often to capture and send a frame (milliseconds)
const int CAPTURE_INTERVAL_MS = 2000;

// ──────────────────────────────────────────────
// Xiao ESP32S3 Sense — OV2640 pin map
// ──────────────────────────────────────────────
#define PWDN_GPIO_NUM  -1
#define RESET_GPIO_NUM -1
#define XCLK_GPIO_NUM  10
#define SIOD_GPIO_NUM  40
#define SIOC_GPIO_NUM  39
#define Y9_GPIO_NUM    48
#define Y8_GPIO_NUM    11
#define Y7_GPIO_NUM    12
#define Y6_GPIO_NUM    14
#define Y5_GPIO_NUM    16
#define Y4_GPIO_NUM    18
#define Y3_GPIO_NUM    17
#define Y2_GPIO_NUM    15
#define VSYNC_GPIO_NUM 38
#define HREF_GPIO_NUM  47
#define PCLK_GPIO_NUM  13

// ──────────────────────────────────────────────

void setup() {
  // 串口模式需要高波特率传图
  Serial.begin(921600);
  Serial.println("\n[Kinesis] ESP32S3 Context Agent Camera starting...");

  initCamera();

#if USE_WIFI
  connectWiFi();
  serverUrl = "http://" + String(SERVER_IP) + ":" + String(SERVER_PORT) + "/camera_frame";
  Serial.println("[Kinesis] WiFi mode — POST to: " + serverUrl);
#else
  Serial.println("[Kinesis] USB serial mode — run serial_bridge.py on your computer");
#endif
}

void loop() {
#if USE_WIFI
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[WiFi] Lost connection — reconnecting...");
    connectWiFi();
  }
#endif

  camera_fb_t* fb = esp_camera_fb_get();
  if (!fb) {
    Serial.println("[Camera] Capture failed");
    delay(1000);
    return;
  }

#if USE_WIFI
  sendFrameWiFi(fb->buf, fb->len);
#else
  sendFrameSerial(fb->buf, fb->len);
#endif

  esp_camera_fb_return(fb);
  delay(CAPTURE_INTERVAL_MS);
}

// ──────────────────────────────────────────────
// 串口传输：帧格式
//   FRAME:<length>\n
//   <binary JPEG bytes>
// serial_bridge.py 解析这个格式
// ──────────────────────────────────────────────
void sendFrameSerial(uint8_t* buf, size_t len) {
  Serial.printf("FRAME:%u\n", len);
  Serial.write(buf, len);
}

// ──────────────────────────────────────────────
// WiFi 传输（USE_WIFI 1 时启用）
// ──────────────────────────────────────────────
#if USE_WIFI
void sendFrameWiFi(uint8_t* buf, size_t len) {
  HTTPClient http;
  http.begin(serverUrl);
  http.addHeader("Content-Type", "image/jpeg");
  http.setTimeout(5000);

  int code = http.POST(buf, len);

  if (code == 200) {
    Serial.println("[Scene] " + http.getString());
  } else if (code > 0) {
    Serial.printf("[HTTP] Unexpected status: %d\n", code);
  } else {
    Serial.printf("[HTTP] Error: %s\n", http.errorToString(code).c_str());
  }

  http.end();
}

void connectWiFi() {
  Serial.printf("[WiFi] Connecting to %s", WIFI_SSID);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 20) {
    delay(500);
    Serial.print(".");
    attempts++;
  }
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\n[WiFi] Connected: " + WiFi.localIP().toString());
  } else {
    Serial.println("\n[WiFi] Failed — will retry in loop");
  }
}
#endif

// ──────────────────────────────────────────────
// Camera init
// ──────────────────────────────────────────────
void initCamera() {
  camera_config_t config;
  config.ledc_channel = LEDC_CHANNEL_0;
  config.ledc_timer   = LEDC_TIMER_0;
  config.pin_d0       = Y2_GPIO_NUM;
  config.pin_d1       = Y3_GPIO_NUM;
  config.pin_d2       = Y4_GPIO_NUM;
  config.pin_d3       = Y5_GPIO_NUM;
  config.pin_d4       = Y6_GPIO_NUM;
  config.pin_d5       = Y7_GPIO_NUM;
  config.pin_d6       = Y8_GPIO_NUM;
  config.pin_d7       = Y9_GPIO_NUM;
  config.pin_xclk     = XCLK_GPIO_NUM;
  config.pin_pclk     = PCLK_GPIO_NUM;
  config.pin_vsync    = VSYNC_GPIO_NUM;
  config.pin_href     = HREF_GPIO_NUM;
  config.pin_sscb_sda = SIOD_GPIO_NUM;
  config.pin_sscb_scl = SIOC_GPIO_NUM;
  config.pin_pwdn     = PWDN_GPIO_NUM;
  config.pin_reset    = RESET_GPIO_NUM;
  config.xclk_freq_hz = 20000000;
  config.pixel_format = PIXFORMAT_JPEG;
  config.frame_size   = FRAMESIZE_QVGA;  // 320×240 — fast enough for scene recognition
  config.jpeg_quality = 12;              // 0 (best) – 63 (worst); 12 is a good balance
  config.fb_count     = 1;

  esp_err_t err = esp_camera_init(&config);
  if (err != ESP_OK) {
    Serial.printf("[Camera] Init failed: 0x%x — halting\n", err);
    while (true) delay(1000);
  }
  Serial.println("[Camera] OV2640 ready");
}
