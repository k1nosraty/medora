# نسخهٔ وب مدورا

نسخهٔ وب، برنامهٔ دارو، دوز، موجودی، ثبت آب و قرارها را روی دستگاه نگه می‌دارد. با فعال‌کردن اعلان، زمان‌بندی دارو، تعویق، آب و قرار به همراه اشتراک Push به سرور فرستاده می‌شوند. برای توقف اعلان آب فقط روز رسیدن به هدف فرستاده می‌شود. نام دارو و قرار، مقدار آب، دوز، موجودی و سوابق در مرورگر می‌مانند. متن اعلان عمومی است و لمس آن بخش مربوط را باز می‌کند.

زبان رابط را از بالای صفحه یا از تنظیمات عوض کنید. انتخاب زبان روی همان دستگاه ذخیره می‌شود و زبان یادآوری‌ها پس از همگام‌سازی تغییر می‌کند. فارسی به‌طور پیش‌فرض از تقویم شمسی و انگلیسی از تقویم میلادی استفاده می‌کند. تقویم را می‌توان جداگانه از تنظیمات انتخاب کرد.

برای بازیابی، در «تنظیمات» ← «پشتیبان‌گیری» فایل `.medora` و رمز آن را وارد کنید. رمزگشایی و بررسی فایل در مرورگر انجام می‌شود. بازیابی پس از تأیید کاربر، سوابق قبلی را جایگزین و برنامهٔ اعلان را خاموش می‌کند. می‌توانید اعلان را دوباره برای داده‌های بازیابی‌شده فعال کنید.

## ساخت و انتشار

به Node.js نسخهٔ ۲۲ به بالا نیاز دارید. از ریشهٔ ریپو اجرا کنید.

```bash
cd web
npm ci
npm test
npm run test:care
npm run test:alarms
npm run pilot:secrets -- https://github.com/k1nosraty/medora
npm run dev
```

پس از ویرایش قالب، آیکون یا استایل در `web/ui/`، دستور `npm run build` را اجرا کنید. گالری طراحی در `/design/` از قطعات وب‌اپ و دادهٔ آزمایشی استفاده می‌کند.

دستور ساخت کلید فقط برای راه‌اندازی سرویس تازه است. فایل‌های محلی `.dev.vars` و `.pilot-secrets.json` محرمانه‌اند. کد `PILOT_ACCESS_CODE` فقط برای ابزار عیب‌یابی `/pilot/` است. کاربران مدورا اعلان را با مجوز گوشی فعال می‌کنند. کلیدهای VAPID و امضای اشتراک را در انتشارهای بعدی حفظ کنید.

برای انتشار دائمی از حساب Workers Free استفاده کنید.

پوش به شاخهٔ `deploy`، قالب‌ها و کش آفلاین را می‌سازد، تست‌های وب را اجرا می‌کند و وب‌اپ را روی Worker فعلی منتشر می‌کند. برای راه‌اندازی، `CLOUDFLARE_ACCOUNT_ID` و `CLOUDFLARE_API_TOKEN` را در [Actions secrets مخزن](https://github.com/k1nosraty/medora/settings/secrets/actions) ثبت کنید. توکن باید دسترسی ویرایش Workers را فقط برای حسابی داشته باشد که مدورا روی آن اجرا می‌شود.

برای انتشار دستی از پوشهٔ `web` اجرا کنید.

```bash
npx wrangler login
npm run deploy -- --keep-vars
```

برای راه‌اندازی Worker تازه، پس از ساخت کلیدها دستور `npm run deploy -- --secrets-file .pilot-secrets.json` را اجرا کنید.

Durable Objectهای SQLite روی Workers Free اجرا می‌شوند. هر نصب فقط یک alarm برای نزدیک‌ترین نوبت دارد. درخواست همگام‌سازی قدیمی، جای زمان‌بندی جدید را نمی‌گیرد. نوبت‌های هم‌زمان در یک اعلان جمع می‌شوند. تغییرات آفلاین تا اتصال و همگام‌سازی دوباره روی زمان‌بندی سرور اثر نمی‌گذارند. اگر نشانی سایت عوض شود، نصب و اجازهٔ اعلان باید روی نشانی جدید انجام شوند. دادهٔ مرورگر هم به نشانی قبلی وابسته است.

## ثبت‌نام با ایمیل و ورود با رمز عبور

برای فعال‌کردن ورود، دامنهٔ فرستنده را در Resend تأیید کنید و کلید محدود به ارسال روی همان دامنه بسازید. برای دامنهٔ اصلی مدورا از `auth.medorapp.ir` استفاده کنید. [راهنمای تأیید دامنه در Resend](https://resend.com/docs/guides/dns/cloudflare)

- `RESEND_API_KEY` کلید ارسال ایمیل
- `EMAIL_FROM` نشانی فرستنده روی دامنهٔ تأییدشده، مانند `Medora <login@auth.medorapp.ir>`
- `EMAIL_AUTH_SECRET` کلید تصادفی اختصاصی با خروجی `openssl rand -hex 32` برای راه‌اندازی اولیه

می‌توانید مقادیر را با `npx wrangler secret put NAME` ثبت کنید. کاربر برای ثبت‌نام، ایمیلش را با کد یک‌بارمصرف تأیید می‌کند و سپس نام کاربری و رمز می‌سازد. برای ورودهای بعدی همان نام کاربری و رمز کافی است. حساب‌های قدیمی با نشست معتبر می‌توانند از پنجرهٔ حساب مستقیماً نام کاربری و رمز بسازند. رمز با scrypt و نمک اختصاصی هش می‌شود. سوابق روی دستگاه می‌مانند و استفادهٔ مهمان همچنان اختیاری است.

## مدیریت پیام تبلیغاتی

نشانی ایمیل مدیر را در متغیر `ADMIN_EMAIL` روی Worker ثبت کنید. مدیر پس از ورود، پیوند «پنل مدیریت» را در حساب مدورا می‌بیند و می‌تواند از `/admin/` پیام صفحهٔ امروز را ویرایش، فعال یا متوقف کند. پیام در شروع استفاده از صفحهٔ امروز، برای هر مرورگر حداکثر یک بار در روز و یک بار برای هر محتوای پیام نمایش داده می‌شود. تغییرات ممکن است تا یک دقیقه در پاسخ‌های عمومی کش شوند.

## آزمون آیفون

۱. نشانی HTTPS را در Safari باز کنید، به صفحهٔ اصلی اضافه کنید و از آیکون مدورا وارد شوید. در «تنظیمات» ← «اعلان‌ها»، «فعال‌کردن اعلان» را بزنید و اجازهٔ اعلان بدهید.

۲. یک داروی آزمایشی برای چند دقیقهٔ آینده ثبت کنید. بعد از نمایش زمان «یادآوری بعدی»، برنامه را ببندید و صفحه را قفل کنید. با لمس اعلان، نوبت‌های همان روز باز می‌شوند.

۳. مدت تعویق آزمایشی را در «تنظیمات» ← «دارو» روی یک دقیقه بگذارید. نوبت را داخل برنامه به تعویق بیندازید و پس از نمایش زمان جدید، صفحه را قفل کنید. برای لغو، مصرف را ثبت کنید و زمان یادآوری بعدی را بررسی کنید.

۴. یادآوری آب را در «تنظیمات» ← «آب» برای چند دقیقهٔ آینده تنظیم کنید. سپس رسیدن به هدف را ثبت کنید و ببینید زمان بعدی به روز بعد منتقل می‌شود. برای قرار، ساعت شروع یادآوری روز قرار را چند دقیقهٔ دیگر بگذارید و یک قرار آزمایشی برای بعد از آن ثبت کنید.

۵. «بررسی وضعیت» نتیجهٔ آخرین ارسال را نشان می‌دهد و «آزمایش همین گوشی» پیام آزمایشی را به اشتراک همان نصب می‌فرستد. پذیرفته‌شدن پیام در سرویس Push با نمایش آن روی گوشی فرق دارد.

## Account sync and server migration

A signed-in user can enable record sync in their account. Browser storage remains the source for offline use. Sync uses revision-checked snapshots with a three-way merge keyed by record ID. For simultaneous edits to the same record, the change from the device performing the sync takes precedence. An empty device restores the existing account snapshot after sign-in. Each uploaded snapshot is limited to 4 MiB.

The migration routes are disabled until the Worker has a dedicated 64-character hexadecimal `MIGRATION_TOKEN`. Set this only for the migration window. Use the same `EMAIL_AUTH_SECRET`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, and `REMINDER_SIGNING_KEY` on both environments. Set the migration token and archive password in your shell securely. Keep them out of command-line arguments and version control.

```sh
node scripts/migrate-care.mjs backup https://source.example medora.medbackup
node scripts/migrate-care.mjs restore https://target.example medora.medbackup
```

Restore into an empty target and verify password login, synced records and ad assets before switching traffic. For the live cutover, stop source writes and take a final archive. Stop the source notification sender before restoring with `--resume-reminders` so the same subscription does not receive duplicate notifications. Existing notification devices enter the migration registry when the updated app next refreshes their schedule. Users who have not opened the updated app may need to reopen it to resync notifications. Old account sessions are recreated on sign-in. Health records that have not synced remain in the device's own encrypted backup. Archives use the existing authenticated encryption format and have a 16 MiB limit. A larger production dataset needs a streaming archive before moving. The current restore targets a clean Cloudflare-compatible runtime. A server running PostgreSQL still needs a storage and scheduler adapter.
