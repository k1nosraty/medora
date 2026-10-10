# اعتبارسنجی Medora 0.2.0

تاریخ بررسی: ۲۰۲۶-۱۰-۱۰.

## ساخت و آزمون موفق

در محیط Windows با JBR 25.0.3، Android SDK 35، AGP 9.4.0، Gradle 9.6.0 و افزونه Kotlin Compose 2.4.21، دستور زیر موفق بود:

```powershell
.\gradlew.bat testDebugUnitTest assembleDebug --offline
```

- کد اصلی و آزمون‌ها در پکیج `ir.medora.health` کامپایل شدند.
- آزمون `ir.medora.health.DomainTest.healthScenarios` بدون خطا اجرا شد؛ این آزمون هر ۵۲ بررسی CoreChecks را اجرا و تعداد آن‌ها را کنترل می‌کند.
- بررسی‌ها شامل ثبت و ویرایش آب، برنامه و تاریخچه دارو، روزها و تاریخ‌های مصرف، زمان‌بندی و تعویق، مناطق زمانی و DST، JSON، رمزگذاری و کنترل رضایت اعلان هستند.
- APK آزمایشی در `app/build/outputs/apk/debug/app-debug.apk` ساخته شد.
- با `aapt dump badging` نام نمایشی `Medora`، شناسه نصب `ir.medora.health.android` و Activity اصلی `ir.medora.health.MainActivity` در APK تأیید شدند.
- جست‌وجوی کدها، منابع، تنظیمات و مستندات پروژه هیچ شناسه قدیمی باقی‌مانده‌ای نشان نداد.
- `git diff --check` بدون خطای فاصله‌گذاری موفق بود.

هدف بایت‌کد Java و Kotlin همچنان JVM 17 است. اجرا با JBR 25.0.3 به معنی آزمودن ساخت روی همه نسخه‌های JDK نیست.

## بررسی Lint

اجرای اولیه `lintDebug --offline` به علت نبود بسته `com.android.tools.lint:lint-gradle:32.4.0` در کش متوقف شد. پس از دریافت وابستگی، اجرای آنلاین `lintDebug` موفق بود: **۰ خطا و ۱۰ هشدار**. گزارش در `app/build/reports/lint-results-debug.html` ساخته شد.

## بررسی‌های روی دستگاه

در این نوبت برنامه روی گوشی یا شبیه‌ساز اجرا و نصب نشد. رفتار بصری، مجوزها و اعلان‌های واقعی، راه‌اندازی مجدد، Doze و انتخابگر ساعت باید مطابق [فهرست آزمون روی دستگاه](DEVICE-QA.md) بررسی شوند. موفقیت آزمون‌های JVM و ساخت APK جایگزین این بررسی‌ها نیست.

تغییر شناسه نصب، Medora را از نصب قبلی جدا می‌کند. انتقال خودکار داده‌ها و مجوزهای نسخه قبلی پیاده نشده است.

## بازتولید

```powershell
.\gradlew.bat testDebugUnitTest assembleDebug
.\gradlew.bat lintDebug
```

گزارش آزمون: `app/build/reports/tests/testDebugUnitTest/index.html`.
