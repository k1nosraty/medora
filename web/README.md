# نسخهٔ وب مدورا

نسخهٔ وب، برنامهٔ دارو، دوز، موجودی، ثبت آب و قرارها را روی دستگاه نگه می‌دارد. با فعال‌کردن اعلان، زمان‌بندی دارو، تعویق، آب و قرار به همراه اشتراک Push به سرور فرستاده می‌شوند. برای توقف اعلان آب فقط روز رسیدن به هدف فرستاده می‌شود. سوابق به‌صورت پیش‌فرض در مرورگر ذخیره می‌شوند و با فعال‌کردن همگام‌سازی حساب روی سرور هم نگه داشته می‌شوند. متن اعلان به‌صورت پیش‌فرض عمومی است. می‌توانید نمایش جزئیات نوبت در اعلان را از تنظیمات فعال کنید.

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

### چرخش کلیدهای ورود

- برای جدا کردن کلیدها، `EMAIL_ACCOUNT_ID_KEY`، `EMAIL_SESSION_KEY`، `EMAIL_CODE_KEY` و `EMAIL_PASSWORD_KEY` را هرکدام با یک مقدار تصادفی ۳۲ بایتی در قالب هگز تنظیم کنید. برای کلید رمز یک شناسهٔ مستقل مانند `v1` در `EMAIL_PASSWORD_KEY_ID` بگذارید. تا زمان راه‌اندازی کلیدهای مستقل، تنظیم قبلی `EMAIL_AUTH_SECRET` کار می‌کند. شناسهٔ حساب‌های ثبت‌شده از فهرست حساب‌ها خوانده می‌شود و با تغییر کلیدها عوض نمی‌شود.
- برای چرخش عادی، کلید نشست و کد را مستقل عوض کنید. نشست‌ها یا کدهای موقت وابسته به کلیدِ تغییرکرده باطل می‌شوند. در چرخش عادی کلید رمز، شناسه و کلید قبلی را موقتاً در `EMAIL_PREVIOUS_PASSWORD_KEY_ID` و `EMAIL_PREVIOUS_PASSWORD_KEY` نگه دارید. ورود موفق هش را به نسخهٔ جاری منتقل می‌کند. در پایان دورهٔ گذار، دسترسی به کلید قدیمی را ببندید. حساب‌هایی که هنوز هش قدیمی دارند با بازیابی رمز برمی‌گردند.
- در صورت افشای کلید، آن را از تنظیمات کلید قبلی هم بردارید. اگر `EMAIL_AUTH_SECRET` افشا شده، هر چهار کلید مستقل را تنظیم کنید، `EMAIL_ALLOW_LEGACY_PASSWORDS=false` را قرار دهید و کلید قدیمی را حذف کنید. حساب‌های دارای هش قدیمی باید از مسیر ایمیل رمز تازه بسازند. ابتدا ورود، بازیابی رمز، اتصال حساب به همان سوابق و اعتبار پشتیبان را در مقصد آزمایشی بررسی کنید.

## مدیریت پیام تبلیغاتی

نشانی ایمیل مدیر را در متغیر `ADMIN_EMAIL` روی Worker ثبت کنید. مدیر پس از ورود، پیوند «پنل مدیریت» را در حساب مدورا می‌بیند و می‌تواند از `/admin/` پیام صفحهٔ امروز را ویرایش، فعال یا متوقف کند. پیام در شروع استفاده از صفحهٔ امروز، برای هر مرورگر حداکثر یک بار در روز و یک بار برای هر محتوای پیام نمایش داده می‌شود. تغییرات ممکن است تا یک دقیقه در پاسخ‌های عمومی کش شوند.

## آزمون آیفون

۱. نشانی HTTPS را در Safari باز کنید، به صفحهٔ اصلی اضافه کنید و از آیکون مدورا وارد شوید. در «تنظیمات» ← «اعلان‌ها»، «فعال‌کردن اعلان» را بزنید و اجازهٔ اعلان بدهید.

۲. یک داروی آزمایشی برای چند دقیقهٔ آینده ثبت کنید. بعد از نمایش زمان «یادآوری بعدی»، برنامه را ببندید و صفحه را قفل کنید. با لمس اعلان، نوبت‌های همان روز باز می‌شوند.

۳. مدت تعویق آزمایشی را در «تنظیمات» ← «دارو» روی یک دقیقه بگذارید. نوبت را داخل برنامه به تعویق بیندازید و پس از نمایش زمان جدید، صفحه را قفل کنید. برای لغو، مصرف را ثبت کنید و زمان یادآوری بعدی را بررسی کنید.

۴. یادآوری آب را در «تنظیمات» ← «آب» برای چند دقیقهٔ آینده تنظیم کنید. سپس رسیدن به هدف را ثبت کنید و ببینید زمان بعدی به روز بعد منتقل می‌شود. برای قرار، ساعت شروع یادآوری روز قرار را چند دقیقهٔ دیگر بگذارید و یک قرار آزمایشی برای بعد از آن ثبت کنید.

۵. «بررسی وضعیت» نتیجهٔ آخرین ارسال را نشان می‌دهد و «آزمایش همین گوشی» پیام آزمایشی را به اشتراک همان نصب می‌فرستد. پذیرفته‌شدن پیام در سرویس Push با نمایش آن روی گوشی فرق دارد.

## همگام‌سازی حساب و بکاپ سرور

همگام‌سازی سوابق اختیاری است. داده‌ها برای کار آفلاین روی دستگاه می‌مانند. هر حساب می‌تواند تا ۴ مگابایت داده را با سرور همگام کند. روی دستگاه تازه، پس از ورود، سوابق همگام‌شده قابل بازیابی‌اند. سوابق مهمان و تغییراتی که هنوز همگام نشده‌اند در بکاپ شخصی دستگاه می‌مانند.

در ادغام موجودی، افزایش موجودی و کسر دوزهای متفاوت هر دو اعمال می‌شوند. اگر یک نوبت از دو دستگاه ثبت شود، یک کسر در موجودی باقی می‌ماند. در تعارض‌هایی مثل حذف و ویرایش هم‌زمان یک دارو، مدورا هر دو نسخه را نشان می‌دهد تا یکی را انتخاب کنید. اگر یکی از نسخه‌ها در این فاصله تغییر کند، باید نسخه‌های تازه را دوباره بررسی کنید.

نصب دارای اعلان پس از اولین همگام‌سازی با نسخهٔ جدید به حساب وصل می‌شود. سپس عملیات مراقب، برنامهٔ اعلان همان نصب را از سرور به‌روز می‌کند. زبان، منطقهٔ زمانی و انتخاب نمایش جزئیات اعلان از تنظیمات نصب گرفته می‌شوند. خاموش کردن همگام‌سازی یا خروج از حساب، اتصال نصب به تغییرات حساب را قطع می‌کند و زمان‌بندی محلی دستگاه را حفظ می‌کند. حذف حساب، اعلان نصب‌های متصل را هم متوقف می‌کند.

با حذف حساب، گروه‌هایی که کاربر مدیر آن‌هاست حذف می‌شوند و عضویت، دعوت، مجوز و رخدادهای ممیزی وابسته از سایر گروه‌ها پاک می‌شوند. سایر رخدادهای ممیزی خانواده تا ۹۰ روز و شناسه‌های جلوگیری از ثبت تکراری تا ۷ روز نگهداری می‌شوند.

### آماده‌سازی و تمرین بازیابی

- نسخهٔ همین کد را روی مبدأ و یک مقصد آزمایشی با فضای ذخیرهٔ جدا اجرا کنید. مقصد Worker آزمایشی را عمومی یا متصل به دامنهٔ اصلی نکنید. بازیابی کامل به مقصد تازه با Durable Objectهای SQLite نیاز دارد.
- پیکربندی کلیدهای هش رمز و دورهٔ گذار را مطابق مبدأ روی مقصد تنظیم کنید. برای آرشیوهای قدیمی همان `EMAIL_AUTH_SECRET` لازم است. `VAPID_PUBLIC_KEY`، `VAPID_PRIVATE_KEY`، `VAPID_SUBJECT` و `REMINDER_SIGNING_KEY` را برای ادامهٔ اشتراک‌های اعلان حفظ کنید. تنظیمات ارسال ایمیل، حساب مدیر، حساب‌های پشتیبانی و مسیردهی دامنه را جداگانه بررسی کنید. کلیدهای محیط در بستهٔ جداگانهٔ تداوم ورود و اعلان نگهداری می‌شوند.
- موقتاً برای هر محیط یک `MIGRATION_TOKEN` مستقل با `openssl rand -hex 32` بسازید. `MIGRATION_TOKEN_EXPIRES_AT` را به‌صورت زمان Unix بر حسب میلی‌ثانیه و حداکثر تا ۲۴ ساعت بعد تنظیم کنید. توکن و رمز بکاپِ حداقل ۲۴ نویسه را از طریق متغیرهای محیطی `MEDORA_MIGRATION_TOKEN` و `MEDORA_BACKUP_PASSWORD` به ابزار بدهید. رازها را در مدیر رمز نگه دارید و در تاریخچهٔ ترمینال، لاگ یا ریپو قرار ندهید.
- از مسیر Settings → Variables and Secrets روی **مقصد** هر دو متغیر `MEDORA_MAINTENANCE=true` و `MEDORA_PAUSE_PUSH=true` را ثبت کنید. اولی API برنامه را موقتاً با 503 متوقف می‌کند و دومی ارسال اعلان را متوقف می‌کند. وب‌اپ نصب‌شده همچنان می‌تواند از داده‌های محلی استفاده کند.
- دستورها را از پوشهٔ `web` اجرا کنید. برای هر درخواست، توکن محیطی را که نشانی‌اش در دستور آمده تنظیم کنید.

```sh
node scripts/migrate-care.mjs backup https://source.example medora.medbackup
node scripts/migrate-care.mjs verify https://target.example medora.medbackup
node scripts/migrate-care.mjs restore https://target.example medora.medbackup
```

ابزار فایل را بخش‌به‌بخش رمزگشایی و بررسی می‌کند و اثر انگشت زنجیرهٔ SHA-256 و تعداد حساب‌ها، فایل‌ها و دستگاه‌ها را نشان می‌دهد. هر بخش جایگاه احراز‌شدهٔ خودش را دارد و فایل بدون بخش پایانی معتبر پذیرفته نمی‌شود. هنگام بازیابی، همهٔ بخش‌ها پیش از اولین تغییر در مقصد بررسی می‌شوند و پس از قطع‌شدن از آخرین بخش ثبت‌شده ادامه پیدا می‌کند. فایل خروجی خصوصی است و ابزار فایل قبلی را بازنویسی نمی‌کند. گزارش و نسخهٔ رمزدار را جدا از مبدأ نگه دارید. رمز در جای جداگانه‌ای نگهداری شود. Verify هیچ داده‌ای را تغییر نمی‌دهد. برای آزمون ورود به مقصد آزمایشی، فقط حالت نگهداری مقصد را بردارید و ارسال اعلان را متوقف نگه دارید. ورود با رمز قبلی، سوابق، تنظیمات، تبلیغات و فایل‌ها را بررسی کنید. بعد از تمرین، مقصد آزمایشی دارای داده است و برای مهاجرت نهایی باید مقصد تازه داشته باشید.

گزارش `family` تعداد گروه‌ها، عضویت‌ها، دعوت‌ها، مجوزها و رخدادهای ممیزی را نشان می‌دهد. مقدار `null` یعنی آرشیو بخش خانواده ندارد. تعداد حساب‌های دارای منطقهٔ زمانی و تعداد حساب‌هایی که فیلد منطقهٔ زمانی در آرشیو آن‌ها وجود دارد جداگانه گزارش می‌شوند. در تمرین مقصد، بعد از ورود وجود گروه، اعتبار دعوت باز و رفتار مجوز فعال و منقضی را بررسی کنید. برای حسابی با منطقهٔ زمانی دیگر، ثبت نزدیک نیمه‌شب را هم آزمایش کنید.

### جابه‌جایی دامنه و بازگشت

1. انتشارهای هم‌زمان را متوقف کنید. روی **مبدأ** نیز هر دو متغیر نگهداری و توقف اعلان را فعال کنید. از بیرون 503 را بررسی کنید و اجازه دهید درخواست‌ها و اعلان‌های در‌حال اجرا تمام شوند. بکاپ نهایی را با نامی تازه بگیرید. نسخهٔ نهایی و SHA-256 آن را نگه دارید.
2. روی مقصد تازه در حالت نگهداری فایل را Verify و Restore کنید. اگر قطع شد، همان فایل را دوباره بفرستید. مقصد تنها همان آرشیو را می‌پذیرد. در صورت `restore_in_progress` بگذارید عملیات جاری تمام شود. اگر فرآیند قطع اجباری شده باشد، قفل بخش پس از دو دقیقه آزاد می‌شود.
3. مبدأ را متوقف نگه دارید و روی مقصد همین فایل را با `restore ... --resume-reminders` دوباره اجرا کنید تا نوبت‌ها نصب شوند. تأیید کنید تعدادها با گزارش Verify هم‌خوان‌اند. نشانی عمومی `medorapp.ir` را حفظ کنید تا داده‌های مرورگر و نصب PWA با همان مبدأ وب در دسترس بمانند. دامنه را به مقصد متصل کنید، سپس حالت نگهداری و توقف اعلان را فقط روی مقصد بردارید.
4. ورود و همگام‌سازی یک حساب آزمایشی، بازیابی رمز، تبلیغ، و دریافت اعلان با اپ بسته روی آیفون را بررسی کنید. از زمان باز شدن API مقصد، هر برگشت باید با توقف مقصد و حفظ تغییرات نوشته‌شده روی آن برنامه‌ریزی شود. پیش از باز شدن API مقصد، می‌توانید دامنه را به مبدأ برگردانید و مبدأ را دوباره فعال کنید. هم‌زمان فقط یک فرستندهٔ اعلان فعال باشد.
5. توکن‌های موقت را از هر دو محیط حذف کنید. مبدأ و بکاپ نهایی را تا پایان دورهٔ بازگشت حفظ کنید. نشست‌های قبلی روی مقصد تازه‌اند و کاربران برای همگام‌سازی دوباره وارد می‌شوند. نصب‌هایی که قبلاً در فهرست مهاجرت ثبت نشده‌اند با باز کردن اپ و همگام‌سازی زمان‌بندی دوباره وارد فهرست می‌شوند. اعلان‌هایی که بیشتر از پنجرهٔ ارسال گذشته‌اند دوباره ارسال نمی‌شوند.

### بستهٔ کلیدهای تداوم

صدور بسته به‌صورت پیش‌فرض غیرفعال است. فقط برای یک پنجرهٔ کوتاه، روی مبدأ `MEDORA_EXPORT_CONTINUITY=true` و یک `MIGRATION_TOKEN_EXPIRES_AT` به‌صورت زمان Unix بر حسب میلی‌ثانیه تنظیم کنید. صدور کلید فقط تا ۱۵ دقیقه پیش از انقضا فعال می‌شود و توکن مستقل لازم دارد. برای بستهٔ کلیدها از رمزی جدا از بکاپ داده‌ها استفاده کنید.

```sh
node scripts/migrate-care.mjs backup-keys https://source.example keys.medbackup
node scripts/migrate-care.mjs restore-keys https://target.example keys.medbackup | npx wrangler secret bulk --name medora-rehearsal
```

دستور دوم را تنها برای نام Worker جدا اجرا کنید. Wrangler کلیدها را از ورودی استاندارد می‌خواند. بسته، دسترسی سرویس ایمیل، مجوزهای ادمین و کلیدهای کنترل Cloudflare را منتقل نمی‌کند. پس از دریافت، تنظیمات صدور کلید و توکن را بردارید. [مدیریت رازهای Worker](https://developers.cloudflare.com/workers/configuration/secrets/)

### حدود بازیابی

اندازهٔ کل آرشیو سقف ۱۶ مگابایت ندارد. هر درخواست فقط یک بخش از آرشیو را پردازش می‌کند. بکاپ زنده در حالی که داده عوض می‌شود، یک تصویر تقریبی برای تمرین است. برای نسخهٔ نهایی، مبدأ باید در طول تهیهٔ بکاپ در حالت نگهداری و توقف اعلان بماند. گزارش `consistent` وضعیت این دو متغیر را در شروع بکاپ نشان می‌دهد. اگر آرشیو قدیمی با سربرگ `MEDSRV01` دارید، آن را با `scripts/migrate-care-v1.mjs` بررسی و بازیابی کنید.

بازیابی فعلی با Cloudflare Durable Objects و اجرای سازگار Worker تست می‌شود. قبل از جابه‌جایی به یک VPS مشخص، ذخیرهٔ پایدار SQLite، راه‌اندازی مجدد سرور، زمان‌بندی پس از restart، ایمیل و تحویل اعلان روی آیفون را روی همان VPS آزمون کنید. اگر مقصد PostgreSQL است، به لایهٔ ذخیره‌سازی و زمان‌بندی سازگار نیاز دارد. [محدودیت‌های Workers](https://developers.cloudflare.com/workers/platform/limits/) · [بازیابی SQLite Durable Objects](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/)

## آزمون رابط و بار اولیه

دستورهای زیر Chromium و WebKit را با دادهٔ آزمایشی اجرا می‌کنند. پرچم `--project` اجرای مجموعه را به یک موتور محدود می‌کند. برای اجرای محلی با Chrome نصب‌شده، مسیر فایل اجرایی را در `MEDORA_CHROMIUM` بدهید.

```sh
cd web
npx playwright install --with-deps chromium webkit
npm run test:browser
```

سنجش بار اولیه با `node browser/measure.mjs` انجام می‌شود. برای مقایسه با یک خروجی قبلی، مسیر مطلق پوشهٔ `public` آن نسخه را بعد از نام اسکریپت بدهید. اسکریپت سه بار با نمای ۳۹۰×۸۴۴، کش خالی، تأخیر ۱۶۰ میلی‌ثانیه و سرعت دریافت ۲۰۰ کیلوبایت بر ثانیه اجرا می‌شود. زمان تا نمایش دکمهٔ شروع و انتقال ثبت‌شده تا همان نقطه اندازه‌گیری می‌شوند.

| سنجه | قبل | بعد |
|---|---:|---:|
| میانهٔ زمان تا نمایش دکمهٔ شروع | ۷٫۱۱ ثانیه | ۴٫۵۹ ثانیه |
| میانهٔ درخواست‌های تکمیل‌شده | ۸۰ | ۱۹ |
| میانهٔ دادهٔ منتقل‌شده | ۱٫۱۸ مگابایت | ۰٫۸۳ مگابایت |
| فایل‌های ضروری پیش‌کش | ۱۰۱ | ۲۴ |

پوستهٔ آفلاین، ماژول‌های برنامه و استایل‌ها با نام‌های وابسته به محتوا ساخته می‌شوند. تصویرهای اختیاری هنگام استفاده دریافت و جداگانه ذخیره می‌شوند.


## Engineering and rollout

- `ui/index.html`, `ui/styles/app.css`, the included components in `ui/`, and `ui/pwa/sw.js` are template sources. `public/medication/bootstrap.js` and `public/medication/app/medora.js` are the browser module entry points. `scripts/build-web.mjs` combines them into generated HTML, hashed bundles, and the medication service worker under `public/`. The root push service worker, manifests, and fonts are runtime assets. The design gallery uses `ui/gallery/` and `public/design/`; the live care screens also use the artwork directories under `public/design/`.
- The Worker and browser share pure scheduling rules, subscription identity, the portable care contract, and backup crypto. IndexedDB remains authoritative for offline changes. The per-account Durable Object owns cloud revisions and the manually set account time zone. Reminder time zones belong to installations, and appointment time zones belong to appointments.
- Test with `npm run typecheck`, `npm test`, `npm run test:care`, `npm run test:alarms`, and `npm run test:browser`. Playwright uses real Workerd and SQLite for restore and sync and a fixture server for layout and fault injection. Use `node browser/measure.mjs` for cold-start comparisons and `node scripts/measure-sync.mjs [web-directory]` for a fixed 2,200-record merge workload.
- Browser sync requests are capped at 4 MiB of UTF-8 JSON. The pinned local Worker integration accepts a near-ceiling write and rejects a larger one. Cloudflare lists an 8 MB combined key/value limit for SQLite-backed Durable Objects. Verify the boundary against a disposable hosted Worker before broader production rollout. The on-disk snapshot key, Durable Object identities, and Wrangler schema remain compatible. [Cloudflare limits](https://developers.cloudflare.com/durable-objects/platform/limits/)

### Care privacy

- A current browser seals personal medication instructions, instructions copied into dose history, routine notes (including captured plans and logs), cycle notes, and personal appointment notes and contacts. The encrypted snapshot uses independently generated 96-bit AES-GCM nonces and authenticates the record path. Cloud storage, migration archives, and restores preserve the encrypted envelopes. Family projections omit both the envelopes and legacy cleartext copies of these fields.
- The service can read identity and access metadata, schedules, titles, quantities, outcomes, profile information, and care history for sync and sharing. A caregiver can explicitly provide shared text while acting on a recipient’s behalf. That text follows the recipient’s sharing rules. The reminder scheduler receives a limited scheduling projection, and medication and activity names or amounts appear in notifications only if enabled for the installation. The notification service can use generic copy with that setting off.
- The app generates a random 256-bit recovery key. Keep it in a password manager and enter the same key in a trusted browser. The browser imports it as a non-extractable key and holds it in memory for the current page session. The server receives a key identifier, and email password recovery restores account access independently of that key. If the key is lost, retain the ciphertext and use an existing local copy or a personal encrypted file backup if available. Current and previous local records remain readable within the browser profile. A compromised browser origin or profile can access local plaintext.
- Legacy snapshots stay readable until a current browser unlocks private sync and safely uploads the encrypted revision. A protected account cannot revert to an unprotected snapshot through the regular sync API. Before rollback, take an encrypted archive and verify the target version can preserve protected records. Older archives follow their original confidentiality and retention rules.
- Device-only restore pauses sync. Explicit merge retains existing cloud rows on identity collisions. Cloud replacement uses the revision the user confirmed. Export the previous local records from Backup if recovery is needed. Signing out retains offline records. Clearing the device removes local records and the restore copy and requests that reminders be disabled. Account deletion removes active cloud data, grant and device links, and support tickets. It cannot retract an existing offline copy, a notification already delivered, or an archive held by an operator.

### Operational retention and access

Family audit events age out after 90 days and invitations after 30 days beyond their expiry. Closed support tickets age out after 90 days, with a 180-day maximum for open tickets. Account deletion also removes its support tickets. Caregiver attribution retained in another account's records is part of that account's record history. Use an explicit retention and deletion schedule for operator-held archives and any platform recovery copies. The application cannot expire a downloaded file by itself.

Set a separate temporary `MIGRATION_TOKEN` in each environment and pair it with a required `MIGRATION_TOKEN_EXPIRES_AT` no more than 24 hours ahead. Remove both at the end of the operation. Continuity-key export still has its separate flag and 15-minute window. Deploy separate account identity, session, challenge, and password-pepper keys wherever possible. Recent administrative sign-in is required for account deletion and session revocation.

Use first-party promotional media uploads where possible. If a deployment still uses external promotion media, configure `PROMOTION_MEDIA_HOSTS` as a comma-separated list of exact HTTPS hostnames. Media on unlisted hosts is omitted from the public promotion and can be replaced with an upload. A permitted host can still observe incoming requests from a user's browser.

### Cloud field inventory and recovery limits

| Readable group | Purpose and exposure |
|---|---|
| Account identifiers, normalized email, username, credential verifier and salt, session digests and expiry, challenge counters | Sign-in, delivery, recovery, revocation, and rate control. Login-source counters use account-scoped HMAC identifiers and expire after 15 minutes. |
| Medicine names and display settings, phases and exact dates, units and quantities, stock, dose outcomes, activity schedules and logged outcomes, appointment names and times, water totals, cycle dates and flow | Cross-device records, schedule fidelity, history, and user-granted family access. Notifications compile a smaller schedule projection. Care owners should treat these records as readable by the service. |
| Profile fields, appointment location, caregiver-written shared notes or contact information and recorded-by attribution | Deliberately shareable account context. Family projections allowlist the supported fields and nested medication schedule fields. Old extension fields remain available to the owner and archives, outside family responses. |
| Locale-independent display and reminder settings, account and device time zones, revision and generation identifiers, reminders' push subscription and state | Carry preferences and timing across the relevant account or device, apply optimistic writes, and deliver reminders. Device clearing retains a small revocation request until the Worker confirms disablement. |
| Family group IDs, membership, grants, invitations, audits, support messages and diagnostics, archive metadata | Authorization, support, and recovery operations. Retention is documented above. Archive operators must apply their own deletion schedule. |
| Encrypted envelopes, key identifiers, optional rotation verifiers | Store and migrate encrypted notes and verify key replacement. The account password and recovery key remain separate. |

Newly protected snapshots can rotate the recovery key. Save the new key before choosing **Replace recovery key**. Rotation commits at a specific cloud revision, keeps record content and envelope locations intact, and requires the proof derived from the currently unlocked key. A lost acknowledgement can be checked by retrying with the same replacement key. Keep old keys for older archives. Previously encrypted snapshots without a verifier continue to use their existing recovery key. The stored SHA-256 fingerprint cannot authenticate a first verifier without an additional possession protocol. The Worker rejects attaching a verifier based only on account authentication, even if ciphertext bytes are unchanged. Keep the original recovery key and an encrypted local backup. Password reset restores sign-in access independently.

The account owner receives the full portable snapshot from `/api/account/care`. The [portable records](public/medication/domain/care-records.js) and [private fields](public/medication/domain/private-fields.js) define its top-level settings and encrypted field paths. Legacy row extensions can remain readable to the service and owner. They have no scheduling or sharing requirement and should be reviewed before accepting additional extension fields. `/api/family` uses the [field-by-field projection](public/medication/domain/family.js) after verifying active group membership and a directional, section-specific grant. Group managers can see pending-invite recipient labels or addresses. Other members see group-scoped member IDs and display labels. Account scope IDs and owner keys are used internally for routing and authorization. Care record IDs identify records that the grantee can act on.

The [reminder projection](public/medication/domain/care-plan.js) defines which sync fields can reach per-device scheduling. It uses the configured subscription endpoint and keys, due times and outcomes, device time zone, language and detail preference. Profile fields, full history, and private notes have no scheduling role. Status and test endpoints require the device token and return fixed statuses and numeric provider codes. Clearing a device drops the server-side plan, subscription, and last-test state and retains a revision and revocation marker so the same token cannot be reused. A browser must enroll a new subscription to resume. This action is initiated on the device being cleared. Operator archives can still contain earlier records until their retention period ends.

The family store holds group names and icons, membership labels, invitation addresses and expiry, grant sections and permissions, and audit actor/target/action/time data. The account store also holds temporary challenge digests, delivery timestamps, account generation, pending reset and deletion metadata, and linked device IDs. Support message, optional diagnostics, reply, and ticket status are readable to authorized support staff. Administrators can access operational counters, audit records, account metadata, and promotions through the operations and admin endpoints. Operator migration exports require the migration authorization and can include whole readable snapshots, ciphertext, credential verifiers, reminder state, and the family and operations stores. Downloaded archives require a separate encrypted-storage and expiry policy. Their current contents do not determine what any ongoing device or family API returns.

A damaged or newer IndexedDB database can be read for an encrypted `.medoraid` recovery export. The export is for technical recovery and strips active account and reminder bindings. The application leaves the database version and stored records intact. For manual diagnosis, the file uses the existing encrypted backup codec with the `MEDORAID` header.

The local synthetic integration suite exercises the 4 MiB application boundary with SQLite-backed Workerd, account and family authorization, encrypted archive migration, simultaneous edits, interrupted restores, recovery on a second browser, and reminder fan-out. Hosted verification requires a separately configured Cloudflare account and isolated Worker, representative permissions, and synthetic data. Use scoped staging credentials and keep staging separate from the production Wrangler target.

### Isolated Cloudflare staging

Use the standalone `wrangler.staging.jsonc` from the remediation branch. The account must already have a `workers.dev` subdomain and be dedicated to synthetic staging. On the dashboard, compare the account ID and subdomain with the values you intend to use, confirm there are no production resources, and confirm the Worker name is free on first deployment. Only publish to `https://medora-remediation-stage.STAGING_SUBDOMAIN.workers.dev`. The deployment needs no DNS, custom routes, OAuth callbacks, or billing changes.

| Resource | Staging identifier |
|---|---|
| Worker | `medora-remediation-stage`, account `STAGING_ACCOUNT_ID` |
| Static assets | `ASSETS`, built `web/public`, Worker-first on `/api/*` |
| Cron | `*/5 * * * *` in the staging Worker |
| SQLite Durable Objects | `PILOT/PushPilot`, `REMINDERS/MedicationReminders`, `EMAIL_ACCOUNTS/EmailAccount`, `CREDENTIALS/Credentials`, `PROMOTIONS/Promotions`, `OPERATIONS/Operations`, `FAMILIES/Families`. Migrations `v1` through `v7` provision seven distinct namespace IDs. All seven bindings target classes in the staging Worker. |
| Account rate limiters | `PUSH_ENROLL_LIMIT/760501` (30/min), `PUSH_DEVICE_LIMIT/760502` (60/min), `PROMOTION_EVENT_LIMIT/760504` (60/min), `EMAIL_AUTH_LIMIT/760503` (8/min) |
| Other storage and integrations | A staging-only Resend sender and synthetic test inboxes. The Worker uses no KV namespace, R2 bucket, D1 database, queue, or service binding. |

The operator runs all Cloudflare writes. For the first `wrangler deploy` creating a Worker, authenticate locally with temporary **Workers Admin** at product scope in the staging account only. Subsequent deployments and secret management need **Editor** scoped to `medora-remediation-stage`. Use the dashboard for the account-wide namespace inventory. A temporary read-only Worker role is sufficient for inspecting the Worker itself. Use an existing stage-only Resend key with Sending access restricted to the test sender domain. Keep credential values in the operator's own environment or secret manager. [Cloudflare Workers roles](https://developers.cloudflare.com/workers/authorization/workers/) · [Resend sending scopes](https://resend.com/changelog/new-api-key-permissions)

Prepare an operator-owned JSON file outside the checkout with permissions `0600`. Its required keys are `EMAIL_ACCOUNT_ID_KEY`, `EMAIL_SESSION_KEY`, `EMAIL_CODE_KEY`, `EMAIL_PASSWORD_KEY`, and `REMINDER_SIGNING_KEY` (each a fresh independent 32-byte hex value), `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` (fresh P-256 pair from the existing `scripts/pilot-secrets.mjs`, run in an empty scratch directory), `VAPID_SUBJECT` (test contact), `RESEND_API_KEY`, and `EMAIL_FROM` (verified staging sender). The config sets `EMAIL_PASSWORD_KEY_ID=stage-v1` and `EMAIL_ALLOW_LEGACY_PASSWORDS=false`. Leave `MEDORA_RELEASE`, `PILOT_ACCESS_CODE`, legacy keys, admin accounts, support identities, external promotion hosts, and continuity export unset. For a separately prepared operator archive rehearsal use a temporary staging `MIGRATION_TOKEN` and `MIGRATION_TOKEN_EXPIRES_AT` (Unix milliseconds within 24 hours). A full archive restore needs a second empty staging Worker with matching **synthetic** key continuity and a separate approval for that destination.

From `web`, use Bash and replace only the two staging placeholders. `MEDORA_STAGE_SECRETS_FILE` must already point to the operator-owned JSON file. If the operator uses token-based authentication, keep the temporary staging token in the local Wrangler environment. The explicit account ID in the local config selects the account.

```bash
set -euo pipefail
export MEDORA_STAGE_ACCOUNT_ID=STAGING_ACCOUNT_ID
export MEDORA_STAGE_SUBDOMAIN=STAGING_SUBDOMAIN
: "${MEDORA_STAGE_SECRETS_FILE:?Set the path to your own staging secret JSON file}"
export MEDORA_STAGE_SECRETS_FILE
[[ "$MEDORA_STAGE_ACCOUNT_ID" =~ ^[0-9a-f]{32}$ ]]
[[ "$MEDORA_STAGE_SUBDOMAIN" =~ ^[a-z0-9]+(-[a-z0-9]+)*$ ]]
test -f "$MEDORA_STAGE_SECRETS_FILE"
node --input-type=module -e '
  import {readFileSync, statSync, writeFileSync} from "node:fs";
  const secretFile = process.env.MEDORA_STAGE_SECRETS_FILE;
  const values = JSON.parse(readFileSync(secretFile, "utf8"));
  const names = ["EMAIL_ACCOUNT_ID_KEY", "EMAIL_SESSION_KEY", "EMAIL_CODE_KEY", "EMAIL_PASSWORD_KEY",
    "REMINDER_SIGNING_KEY", "VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY", "VAPID_SUBJECT", "RESEND_API_KEY", "EMAIL_FROM"];
  if ((statSync(secretFile).mode & 0o077) || Object.keys(values).length !== names.length ||
      names.some(name => typeof values[name] !== "string" || !values[name])) {
    throw new Error("Use a private JSON file with exactly the listed staging keys");
  }
  const template = readFileSync("wrangler.staging.jsonc", "utf8");
  writeFileSync(".wrangler.staging.local.jsonc",
    template.replace("STAGING_ACCOUNT_ID", process.env.MEDORA_STAGE_ACCOUNT_ID),
    { flag: "wx", mode: 0o600 });
'
stage_wrangler() {
  env -u CLOUDFLARE_ACCOUNT_ID ./node_modules/.bin/wrangler "$@" \
    --config .wrangler.staging.local.jsonc
}
GITHUB_SHA="$(git rev-parse HEAD)" npm run build
stage_wrangler whoami
stage_wrangler deploy --dry-run
```

Check the dry-run binding list against the inventory and confirm the authenticated account independently in the dashboard. Then execute this **single** write. It creates and deploys the Worker, runs its namespace migrations, and uploads that version's variables and secrets. Future deployments must use the same explicit staging config.

```bash
stage_wrangler deploy --secrets-file "$MEDORA_STAGE_SECRETS_FILE"
```

Immediately verify the deployment, secret **names**, and stage origin. Confirm the version in the dashboard. Open **Workers & Pages → medora-remediation-stage → Bindings** and the account's **Durable Objects** inventory. Record all seven namespace IDs and verify the owning Worker and SQLite backend for each. Keep the deployed version ID, time in UTC, status codes, and redacted test results with the verification record.

```bash
stage_wrangler deployments list
stage_wrangler secret list
MEDORA_STAGE_ORIGIN="https://medora-remediation-stage.$MEDORA_STAGE_SUBDOMAIN.workers.dev"
curl --silent --show-error --fail "$MEDORA_STAGE_ORIGIN/medication/" -o /dev/null
curl --silent --show-error --fail "$MEDORA_STAGE_ORIGIN/api/config" |
  jq -e '.publicKey | test("^[A-Za-z0-9_-]{87}$")'
test "$(curl --silent --show-error -o /dev/null -w '%{http_code}' "$MEDORA_STAGE_ORIGIN/api/account/care")" = 401
```

Use two independent browser profiles for one synthetic account, a second synthetic family account, and an unrelated synthetic account. Verify password reset only through controlled test inboxes. Record p50 and p95 for repeated same-shape requests in each test location. A Cloudflare rate limit binding is approximate and local to a Cloudflare location. [Rate limit behavior](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/)

| Hosted scenario | Procedure and evidence |
|---|---|
| Snapshot limit and concurrent writes | As a synthetic owner, GET `/api/account/care` with its cookie. Use the returned owner and revision for two same-revision PUTs from separate profiles with matching Origin and JSON. Record one 200, one 409, and the committed revision. On a disposable synthetic account build a valid legacy care body just below 4 MiB, repeat with an over-4-MiB body, and compare the revision after rejection. Record UTF-8 byte length, status, and exact configuration. A real storage failure requires controlled injection on staging. The local rollback test covers a transaction aborted after the snapshot write was staged. |
| Restore and conflicts | Export a synthetic personal backup. Restore locally and compare cloud revision. Run cloud merge with an identity collision. For cloud replacement, change the cloud revision from the other profile while confirmation is open. Verify the newer data survives. Repeat with the same base edits and different changes to one record, then change one candidate while its conflict is open. Record the two versions, result, and observed confirmation. |
| Key recovery | Use generated test keys and a unique synthetic private note. Upload plaintext legacy records, then unlock to verify migration to sealed text. Start a second profile without the key, then use an incorrect key and the correct key. Use separate fixtures for damaged ciphertext and legacy encrypted records without a verifier. Verify unchanged remote revision and retained local records after a failure. During a current-format rotation, let the successful PUT reach staging and drop only the response in browser automation. Retry with the saved replacement key, verify a single new revision, then import it on the second profile. |
| Privacy and authorization | Grant only one family section to the second account. Confirm the family projection excludes private text, encrypted payloads, and unknown legacy fields. Revoke the grant and retest. Check that a third unrelated account cannot read or write the first account's care or family records. |
| Auth and abuse controls | Compare identical wrong-password and nonexistent-user responses and record timing distributions. Confirm legitimate sign-in and email password reset from test inboxes, invalidation of the old session, and independent recovery-key import. Verify the staging binding using controlled serial requests from the permitted synthetic source. Multiple locations require explicit measurement and do not establish global throttling. |
| Reminder fan-out and revocation | Link two synthetic browser installations, change a plan, and check applied revision on both. Test a plan rejected by the reminder limits, a lost client response followed by retry, cancellation, and clearing one installation. Expect the cleared token to return 401 for status, test, and subsequent enable requests. Confirm the other installation still has its plan. |

One day of testing should stay below 2,000 dynamic requests, 100 MB of synthetic storage, and 30 emails. An existing staging plan must accommodate the workload. Cloudflare documents an 8 MB SQLite Durable Object key/value ceiling. The application ceiling is 4 MiB of UTF-8 JSON. The hosted test must measure accepted application payloads and rejects on the actual plan. [Durable Object limits](https://developers.cloudflare.com/durable-objects/platform/limits/) · [Workers limits](https://developers.cloudflare.com/workers/platform/limits/) · [Pricing](https://developers.cloudflare.com/workers/platform/pricing/)

For operator-approved cleanup later, collect redacted evidence first. Clear test devices and accounts, remove temporary migration settings, and revoke disposable provider and Cloudflare credentials. Worker or namespace deletion is a separate destructive operation. Confirm the dedicated staging account and the recorded identifiers in the dashboard before authorizing it.

### Physical reminder verification

Use Android Chrome and Safari on a physical iPhone with Medora installed on the Home Screen. Use the same synthetic account with separate subscriptions. Run the matrix on both, recording OS/browser versions, installation mode, time zone, cloud revision, provider result, and actual notification display time.

| Procedure | Expected observation |
|---|---|
| Deny permission, then allow it and enable reminders from a user gesture | No notification while denied. The app reports the permission state, then enrolls or resumes after permission returns. |
| Schedule a synthetic reminder a few minutes ahead and close the app before it fires | The device displays the expected notification inside the reminder window. Reopening shows the correct next occurrence. Repeat after a device restart. |
| Update and cancel a reminder from the other device | Both installations receive the new revision. The prior due time produces no notification. |
| Go offline, edit locally, then reconnect | Local edits remain available offline and fan out after sync. Confirm the eventual applied revision and check for duplicate delivery. |
| Clear one installation during a failed or interrupted network request and reconnect | Local records disappear, the revocation retries, and the old subscription stops working. The second installation stays enrolled. |
