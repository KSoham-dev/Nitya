"""
Away-from-desk alarm using MediaPipe's Face Landmarker (Tasks API).

Watches your webcam. If no face is detected continuously for
AWAY_THRESHOLD_SECONDS, it starts an alarm siren that will NOT stop
until your face is detected again. There is no manual "dismiss" —
only coming back stops it.

Install:
    pip install opencv-python mediapipe sounddevice numpy

The face landmarker model file (face_landmarker.task) will be
downloaded automatically on first run if it isn't already present
in the same folder as this script.

Run:
    python eye_away_alarm.py

Press 'q' in the video window to quit the program entirely
(this also stops any currently playing alarm).
"""

import os
import sys
import time
import threading
import urllib.request

import cv2
import numpy as np
import ctypes
import mediapipe as mp
from mediapipe.tasks import python as mp_python
from mediapipe.tasks.python import vision as mp_vision

MODEL_PATH = "face_landmarker.task"
MODEL_URL = (
    "https://storage.googleapis.com/mediapipe-models/face_landmarker/"
    "face_landmarker/float16/1/face_landmarker.task"
)

# ----------------------- Config -----------------------
AWAY_THRESHOLD_SECONDS = 10  # default, will be overridden by sys.argv
CAMERA_INDEX = 0
SIREN_FREQ_LOW = 600               # Hz
SIREN_FREQ_HIGH = 1200             # Hz
SIREN_SWEEP_SECONDS = 0.8
SAMPLE_RATE = 44100
# --------------------------------------------------------


class AlarmSiren:
    """Plays an mp3 file in the background using Windows MCI."""

    def __init__(self):
        self._lock = threading.Lock()
        self._is_sounding = False
        self._sound_file = os.path.abspath("sound.mp3")

    def start(self):
        with self._lock:
            if self._is_sounding:
                return
            self._is_sounding = True
            if os.path.exists(self._sound_file):
                ctypes.windll.winmm.mciSendStringW(f'open "{self._sound_file}" type mpegvideo alias alarm_audio', None, 0, None)
                ctypes.windll.winmm.mciSendStringW('play alarm_audio repeat', None, 0, None)
            else:
                print(f"Warning: {self._sound_file} not found.")

    def stop(self):
        with self._lock:
            if not self._is_sounding:
                return
            self._is_sounding = False
            ctypes.windll.winmm.mciSendStringW('stop alarm_audio', None, 0, None)
            ctypes.windll.winmm.mciSendStringW('close alarm_audio', None, 0, None)

    @property
    def is_sounding(self):
        return self._is_sounding


def ensure_model_downloaded():
    """Download the face landmarker model if it isn't already on disk."""
    if os.path.exists(MODEL_PATH):
        return
    print(f"'{MODEL_PATH}' not found — downloading it now "
          f"(one-time, a few MB)...")
    try:
        tmp_path = MODEL_PATH + ".part"
        urllib.request.urlretrieve(MODEL_URL, tmp_path)
        os.replace(tmp_path, MODEL_PATH)
        print("Model downloaded successfully.")
    except Exception as e:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)
        raise RuntimeError(
            f"Failed to download the model automatically ({e}). "
            f"You can download it manually from:\n{MODEL_URL}\n"
            f"and save it as '{MODEL_PATH}' next to this script."
        ) from e


def main():
    global AWAY_THRESHOLD_SECONDS
    if len(sys.argv) > 1:
        try:
            AWAY_THRESHOLD_SECONDS = int(sys.argv[1])
        except ValueError:
            pass
            
    ensure_model_downloaded()

    base_options = mp_python.BaseOptions(model_asset_path=MODEL_PATH)
    options = mp_vision.FaceLandmarkerOptions(
        base_options=base_options,
        running_mode=mp_vision.RunningMode.VIDEO,
        num_faces=1,
        min_face_detection_confidence=0.5,
        min_tracking_confidence=0.5,
    )
    face_landmarker = mp_vision.FaceLandmarker.create_from_options(options)

    cap = cv2.VideoCapture(CAMERA_INDEX)
    if not cap.isOpened():
        raise RuntimeError("Could not open webcam. Check CAMERA_INDEX.")

    siren = AlarmSiren()
    last_seen = time.time()

    print("Tracking started. Press 'q' in the video window to quit.")

    try:
        while True:
            ok, frame = cap.read()
            if not ok:
                continue

            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
            timestamp_ms = int(time.time() * 1000)
            result = face_landmarker.detect_for_video(mp_image, timestamp_ms)

            face_present = bool(result.face_landmarks)
            now = time.time()

            if face_present:
                last_seen = now
                if siren.is_sounding:
                    siren.stop()
                    print("Face detected again — alarm stopped.")
            else:
                away_for = now - last_seen
                if away_for > AWAY_THRESHOLD_SECONDS and not siren.is_sounding:
                    print(f"No face for over {AWAY_THRESHOLD_SECONDS} "
                          f"seconds — ALARM STARTED.")
                    siren.start()
                    
            # Headless run: slight sleep to avoid maxing CPU
            time.sleep(0.1)
    finally:
        siren.stop()
        cap.release()
        cv2.destroyAllWindows()
        face_landmarker.close()


if __name__ == "__main__":
    main()