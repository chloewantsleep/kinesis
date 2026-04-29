#include <Wire.h>
#include <ArduinoJson.h>

// ===== I2C =====
#define SDA_PIN 21
#define SCL_PIN 22

#define MPU_UPPER_ADDR 0x68   // AD0 → GND  → upper_back
#define MPU_LOWER_ADDR 0x69   // AD0 → 3.3V → lower_back

// ===== Vibration Motors =====
#define MOTOR_LEFT_UPPER   18
#define MOTOR_RIGHT_UPPER  19
#define MOTOR_LOWER_CENTER 23

// ===== EMG =====
#define EMG_PIN 34

// ===== Timing =====
#define IMU_SAMPLE_INTERVAL_MS  40   // ~25 Hz
#define EMG_SAMPLE_INTERVAL_MS 100   // 10 Hz idle; tightened after vibration trigger

const int NUM_IMUS = 2;
const int   IMU_ADDRS[NUM_IMUS]  = {MPU_UPPER_ADDR, MPU_LOWER_ADDR};
const char* IMU_LABELS[NUM_IMUS] = {"upper_back",   "lower_back"};
bool imuAlive[NUM_IMUS] = {false, false};

// Per-motor state
struct MotorState {
  int            pin;
  const char*    name;
  bool           active;
  unsigned long  endTime;
};

MotorState motors[3] = {
  {MOTOR_LEFT_UPPER,   "left_upper",   false, 0},
  {MOTOR_RIGHT_UPPER,  "right_upper",  false, 0},
  {MOTOR_LOWER_CENTER, "center_lower", false, 0},
};

unsigned long lastImuSample = 0;
unsigned long lastEmgSample = 0;

// When true, EMG is sampled at full rate for post-intervention feedback
bool emgActive = false;
unsigned long emgActiveUntil = 0;

// ---------------------------------------------------------------------------
// MPU6050 helpers
// ---------------------------------------------------------------------------

bool mpuInit(int addr) {
  Wire.beginTransmission(addr);
  if (Wire.endTransmission() != 0) return false;

  // Wake up
  Wire.beginTransmission(addr);
  Wire.write(0x6B); Wire.write(0);
  Wire.endTransmission();
  delay(100);

  // ±4g accel
  Wire.beginTransmission(addr);
  Wire.write(0x1C); Wire.write(0x08);
  Wire.endTransmission();

  // ±500°/s gyro
  Wire.beginTransmission(addr);
  Wire.write(0x1B); Wire.write(0x08);
  Wire.endTransmission();

  // 21 Hz low-pass
  Wire.beginTransmission(addr);
  Wire.write(0x1A); Wire.write(0x04);
  Wire.endTransmission();

  return true;
}

bool mpuRead(int addr,
             float &ax, float &ay, float &az,
             float &gx, float &gy, float &gz,
             float &temp) {
  Wire.beginTransmission(addr);
  Wire.write(0x3B);
  Wire.endTransmission(false);
  if (Wire.requestFrom(addr, 14) < 14) return false;

  int16_t raw_ax = (Wire.read() << 8) | Wire.read();
  int16_t raw_ay = (Wire.read() << 8) | Wire.read();
  int16_t raw_az = (Wire.read() << 8) | Wire.read();
  int16_t raw_t  = (Wire.read() << 8) | Wire.read();
  int16_t raw_gx = (Wire.read() << 8) | Wire.read();
  int16_t raw_gy = (Wire.read() << 8) | Wire.read();
  int16_t raw_gz = (Wire.read() << 8) | Wire.read();

  ax = raw_ax / 8192.0 * 9.81;
  ay = raw_ay / 8192.0 * 9.81;
  az = raw_az / 8192.0 * 9.81;
  gx = raw_gx / 65.5  * 0.01745;
  gy = raw_gy / 65.5  * 0.01745;
  gz = raw_gz / 65.5  * 0.01745;
  temp = raw_t / 340.0 + 36.53;
  return true;
}

// ---------------------------------------------------------------------------
// Setup / loop
// ---------------------------------------------------------------------------

void setup() {
  Serial.begin(115200);
  delay(1000);

  // Motor pins
  for (int i = 0; i < 3; i++) {
    pinMode(motors[i].pin, OUTPUT);
    analogWrite(motors[i].pin, 0);
  }

  // EMG pin is input-only (ADC), no pinMode needed for ESP32 ADC

  Wire.begin(SDA_PIN, SCL_PIN);
  delay(250);

  for (int i = 0; i < NUM_IMUS; i++) {
    imuAlive[i] = mpuInit(IMU_ADDRS[i]);
    StaticJsonDocument<128> doc;
    doc["type"]   = "debug";
    doc["sensor"] = IMU_LABELS[i];
    doc["addr"]   = String("0x") + String(IMU_ADDRS[i], HEX);
    doc["status"] = imuAlive[i] ? "ok" : "not found";
    serializeJson(doc, Serial);
    Serial.println();
  }

  Serial.println("{\"type\":\"status\",\"message\":\"esp32_ready\"}");
}

void loop() {
  unsigned long now = millis();

  handleSerialCommands();
  tickMotors(now);

  if (now - lastImuSample >= IMU_SAMPLE_INTERVAL_MS) {
    lastImuSample = now;
    sendAllIMUFrames(now);
  }

  // EMG runs at 10 Hz normally; switches to ~25 Hz during active window
  unsigned long emgInterval = (emgActive && now < emgActiveUntil)
                              ? IMU_SAMPLE_INTERVAL_MS
                              : EMG_SAMPLE_INTERVAL_MS;
  if (emgActive && now >= emgActiveUntil) {
    emgActive = false;
  }
  if (now - lastEmgSample >= emgInterval) {
    lastEmgSample = now;
    sendEMGFrame(now);
  }
}

// ---------------------------------------------------------------------------
// IMU output
// ---------------------------------------------------------------------------

void sendAllIMUFrames(unsigned long ts) {
  for (int i = 0; i < NUM_IMUS; i++) {
    if (!imuAlive[i]) continue;
    float ax, ay, az, gx, gy, gz, temp;
    if (!mpuRead(IMU_ADDRS[i], ax, ay, az, gx, gy, gz, temp)) continue;

    StaticJsonDocument<320> doc;
    doc["type"]   = "imu";
    doc["sensor"] = IMU_LABELS[i];
    doc["ts"]     = ts;
    doc["ax"] = ax; doc["ay"] = ay; doc["az"] = az;
    doc["gx"] = gx; doc["gy"] = gy; doc["gz"] = gz;
    doc["temp"]   = temp;
    serializeJson(doc, Serial);
    Serial.println();
  }
}

// ---------------------------------------------------------------------------
// EMG output
// ---------------------------------------------------------------------------

void sendEMGFrame(unsigned long ts) {
  int raw = analogRead(EMG_PIN);   // 0–4095 on ESP32 (12-bit ADC)
  // Convert to millivolts assuming 3.3 V reference and ~1000x gain on sensor module
  float mv = (raw / 4095.0) * 3300.0;

  StaticJsonDocument<128> doc;
  doc["type"] = "emg";
  doc["ts"]   = ts;
  doc["raw"]  = raw;
  doc["mv"]   = mv;
  serializeJson(doc, Serial);
  Serial.println();
}

// ---------------------------------------------------------------------------
// Motor management
// ---------------------------------------------------------------------------

void tickMotors(unsigned long now) {
  for (int i = 0; i < 3; i++) {
    if (motors[i].active && now >= motors[i].endTime) {
      analogWrite(motors[i].pin, 0);
      motors[i].active = false;
    }
  }
}

int findMotor(const char* name) {
  for (int i = 0; i < 3; i++) {
    if (strcmp(motors[i].name, name) == 0) return i;
  }
  return -1;
}

void activateMotor(int idx, int pwm, unsigned long duration_ms, unsigned long now) {
  analogWrite(motors[idx].pin, pwm);
  motors[idx].active  = true;
  motors[idx].endTime = now + duration_ms;
}

// ---------------------------------------------------------------------------
// Serial command handler
// ---------------------------------------------------------------------------

void handleSerialCommands() {
  if (!Serial.available()) return;
  String line = Serial.readStringUntil('\n');
  line.trim();
  if (line.length() == 0) return;

  StaticJsonDocument<256> doc;
  if (deserializeJson(doc, line)) return;

  const char* cmd = doc["cmd"];
  if (!cmd) return;

  unsigned long now = millis();

  if (strcmp(cmd, "vibrate") == 0) {
    int duration_ms  = doc["duration_ms"] | 300;
    int pwm          = doc["pwm"]         | 180;
    const char* motor = doc["motor"];     // optional: "left_upper" | "right_upper" | "center_lower"

    StaticJsonDocument<192> ack;
    ack["type"] = "ack";
    ack["cmd"]  = "vibrate";
    ack["duration_ms"] = duration_ms;

    if (motor != nullptr) {
      int idx = findMotor(motor);
      if (idx >= 0) {
        activateMotor(idx, pwm, duration_ms, now);
        ack["motor"] = motor;
      } else {
        ack["error"] = "unknown motor";
      }
    } else {
      // No motor specified → fire all three
      for (int i = 0; i < 3; i++) activateMotor(i, pwm, duration_ms, now);
      ack["motor"] = "all";
    }

    serializeJson(ack, Serial);
    Serial.println();

  } else if (strcmp(cmd, "stop_vibration") == 0) {
    const char* motor = doc["motor"];
    if (motor != nullptr) {
      int idx = findMotor(motor);
      if (idx >= 0) {
        analogWrite(motors[idx].pin, 0);
        motors[idx].active = false;
      }
    } else {
      for (int i = 0; i < 3; i++) {
        analogWrite(motors[i].pin, 0);
        motors[i].active = false;
      }
    }
    StaticJsonDocument<64> ack;
    ack["type"] = "ack";
    ack["cmd"]  = "stop_vibration";
    serializeJson(ack, Serial);
    Serial.println();

  } else if (strcmp(cmd, "emg_start") == 0) {
    // Python side requests high-rate EMG sampling for N ms after an intervention
    unsigned long duration_ms = doc["duration_ms"] | 5000;
    emgActive     = true;
    emgActiveUntil = now + duration_ms;
    StaticJsonDocument<64> ack;
    ack["type"] = "ack";
    ack["cmd"]  = "emg_start";
    ack["duration_ms"] = duration_ms;
    serializeJson(ack, Serial);
    Serial.println();
  }
}
