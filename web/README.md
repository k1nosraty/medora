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

در ادغام موجودی، افزایش موجودی و کسر دوزهای متفاوت هر دو اعمال می‌شوند. اگر یک نوبت از دو دستگاه ثبت شود، یک کسر در موجودی باقی می‌ماند. حذف هم‌زمان دارو بر ویرایش آن مقدم است. در تعارض روی یک فیلد دارو یا مبنای ثبت موجودی، مقدار دستگاهی که تعارض را ادغام می‌کند اعمال می‌شود.

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
- Test with `npm run typecheck`, `npm test`, `npm run test:care`, `npm run test:alarms`, and `npm run test:browser`. Playwright uses real Workerd and SQLite for restore and sync and a fixture server for layout and fault injection. Use `node browser/measure.mjs` for cold-start comparisons.
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
