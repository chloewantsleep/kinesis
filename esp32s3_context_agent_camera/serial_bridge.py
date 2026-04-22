"""
serial_bridge.py — 读取 ESP32S3 串口 JPEG 帧，POST 到 Kinesis 服务器

用法：
    python serial_bridge.py --port /dev/cu.usbmodem* --server http://localhost:8080

串口帧格式（Arduino 端发送）：
    FRAME:<length>\n
    <binary JPEG bytes>
"""

import argparse
import sys
import time
import requests
import serial
import serial.tools.list_ports


def find_esp32_port() -> str | None:
    """自动找 ESP32S3 的串口。"""
    for port in serial.tools.list_ports.comports():
        desc = (port.description or "").lower()
        if any(k in desc for k in ["xiao", "esp32", "usb serial", "cp210", "ch340", "silabs", "jtag", "usbmodem"]):
            return port.device
    return None


def run(port: str, baud: int, server: str) -> None:
    print(f"[Bridge] Connecting to {port} @ {baud} baud")
    ser = serial.Serial(port, baud, timeout=5)
    time.sleep(2)  # 等 ESP32 重启
    print(f"[Bridge] Connected. Forwarding frames to {server}/camera_frame")

    while True:
        try:
            line = ser.readline().decode("ascii", errors="ignore").strip()
            if not line.startswith("FRAME:"):
                # 普通日志，直接打印
                if line:
                    print(f"[ESP32] {line}")
                continue

            frame_len = int(line.split(":")[1])
            jpeg_bytes = ser.read(frame_len)

            if len(jpeg_bytes) != frame_len:
                print(f"[Bridge] Incomplete frame: got {len(jpeg_bytes)}/{frame_len} bytes")
                continue

            try:
                resp = requests.post(
                    f"{server}/camera_frame",
                    data=jpeg_bytes,
                    headers={"Content-Type": "image/jpeg"},
                    timeout=10,
                )
                if resp.status_code == 200:
                    print(f"[Scene] {resp.text}")
                else:
                    print(f"[Bridge] Server error {resp.status_code}: {resp.text[:80]}")
            except requests.RequestException as e:
                print(f"[Bridge] HTTP error: {e}")

        except serial.SerialException as e:
            print(f"[Bridge] Serial error: {e} — reconnecting in 3s")
            time.sleep(3)
            ser = serial.Serial(port, baud, timeout=5)
        except KeyboardInterrupt:
            print("\n[Bridge] Stopped.")
            ser.close()
            sys.exit(0)


def main() -> None:
    parser = argparse.ArgumentParser(description="ESP32S3 serial → Kinesis bridge")
    parser.add_argument("--port", help="Serial port (e.g. /dev/cu.usbmodem101). Auto-detect if omitted.")
    parser.add_argument("--baud", type=int, default=921600)
    parser.add_argument("--server", default="http://localhost:8080")
    args = parser.parse_args()

    port = args.port or find_esp32_port()
    if not port:
        print("[Bridge] ESP32 not found. Specify --port manually. Available ports:")
        for p in serial.tools.list_ports.comports():
            print(f"  {p.device}  {p.description}")
        sys.exit(1)

    run(port, args.baud, args.server)


if __name__ == "__main__":
    main()
