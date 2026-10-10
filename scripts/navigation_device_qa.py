#!/usr/bin/env python3
"""Run each targeted device test explicitly and retain screenshots before uninstall."""
from pathlib import Path
import re
import subprocess

results = Path("device-results")
results.mkdir(exist_ok=True)
subprocess.run(["adb", "install", "-r", "app/build/outputs/apk/debug/app-debug.apk"], check=True)
subprocess.run(["adb", "install", "-r", "app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk"], check=True)
tests = [
    "ir.medora.health.WellnessUiTest#compactPersianLightNavigation",
    "ir.medora.health.WellnessUiTest#compactPersianDarkNavigation",
    "ir.medora.health.WellnessUiTest#compactEnglishLightNavigation",
    "ir.medora.health.WellnessUiTest#compactEnglishDarkNavigation",
    "ir.medora.health.WellnessUiTest#medicationTabDoesNotDisplayAppointmentsAfterNavigation",
    "ir.medora.health.TimeDialogTest",
]
failed = []
for index, test in enumerate(tests):
    result = subprocess.run(["adb", "shell", "am", "instrument", "-w", "-e", "class", test,
        "ir.medora.health.android.test/androidx.test.runner.AndroidJUnitRunner"],
        text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    print(result.stdout, flush=True)
    (results / f"{index:02d}.txt").write_text(result.stdout)
    if result.returncode or not re.search(r"OK \([1-9][0-9]* tests?\)", result.stdout):
        failed.append(test)
Path("device-screenshots").mkdir(exist_ok=True)
pull = subprocess.run(["adb", "pull", "/sdcard/Android/data/ir.medora.health.android/files/screenshots",
    "device-screenshots"])
images = list(Path("device-screenshots").rglob("*.png"))
if len(images) < 16:
    failed.append(f"Expected at least 16 screenshots, found {len(images)}")
if failed or pull.returncode:
    raise SystemExit("Device QA failed: " + ", ".join(failed))
print(f"All {len(tests)} targeted device checks passed; {len(images)} screenshots retained.")
