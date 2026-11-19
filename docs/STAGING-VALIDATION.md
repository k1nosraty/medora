# اعتبارسنجی Staging مدورا

**PARTIALLY READY** برای آماده‌سازی محلی. **BLOCKED** برای آزمون Cloudflare میزبانی‌شده. Production **NOT READY** است. این سند مربوط به ۱۹ نوامبر ۲۰۲۶ است.

## محدوده و نسخهٔ مبنا

- شاخهٔ بازسازی هنگام شروع روی `6f7883268f07be5c70c4c78ee08bd685e42c7644` و شاخهٔ `origin/deploy` روی `5ee5e47cafe7644b5dd15ae7408e909c755ee211` بود. هنگام بررسی، شاخهٔ بازسازی به `d117d01be4b3fe2ae73022ed5f021bdbc7ff2844` رسید. هر دو کامیت `b7565c4` و `9038fd1` در تاریخچهٔ آن حاضرند و درخت کد آن با انتهای شاخهٔ اصلاحات یکسان است. انتقال تکراری انجام نشد.
- `rebuild.yml` شاخهٔ بازسازی را با منابع مصنوعی آزمایش می‌کند. گزینهٔ دستی آرشیو جداگانه است. `web.yml` تست سازگاری PR و شاخه‌های `feature/**` و `fix/**` را اجرا می‌کند. `deploy-web.yml` با Push روی `deploy` اقدام به انتشار Worker اصلی می‌کند. فقط نتایج CI موجود خوانده شدند. کامیت‌های محلی پس از `d117d01` از GitHub قابل آزمایش نیستند. [CI مبنا](https://github.com/k1nosraty/medora/actions/runs/44550076170) · [CI ادغام موجود](https://github.com/k1nosraty/medora/actions/runs/44574250545)
- هیچ Worker، حساب، Bucket، Hyperdrive، پروژهٔ PostgreSQL، DNS یا Secret میزبانی‌شده ایجاد یا تغییر نکرد. Discovery نسخه‌های کنترل‌شده، نام متغیرهای محیطی و وجود فایل‌های خصوصی پیکربندی را بررسی کرد. هیچ ورودی تأییدشدهٔ میزبانی‌شده یا مجوز انتشار در دسترس نبود. داده و Durable Object مربوط به Production خارج از این اعتبارسنجی‌اند.

## معماری و جداسازی

فرانت‌اند React/TypeScript با IndexedDB و Dexie و Service Worker مبتنی بر Workbox به API هم‌مبدأ متصل می‌شود. `medora-portable-staging` ورودی Cloudflare برای همان برنامهٔ Hono است که در VPS با Node اجرا می‌شود. Worker از Hyperdrive به PostgreSQL مستقل و از Binding خصوصی `BACKUPS` به R2 وصل می‌شود. Node رشتهٔ اتصال مستقیم PostgreSQL و Storage سازگار با S3 را به‌کار می‌گیرد. منطق احراز هویت، مجوزها، Sync، Outbox و قراردادها در دو Runtime مشترک است. [معماری](ARCHITECTURE.md)

- برای اجرای عادی از `--portable` استفاده شود. این پیکربندی هیچ Binding برای Durable Objects ندارد. `medora-v2-staging` فقط برای تمرین عبور از معماری قدیمی است و هفت Namespace آن ایزوله و متعلق به همان Worker آزمایشی‌اند.
- نام پیشنهادی پروژه/دیتابیس `medora-staging`، Hyperdrive با نام `medora-staging-pg` و Bucket با نام `medora-staging-archives` است. مقصد Restore باید PostgreSQL و Bucket خالی جداگانه داشته باشد، مانند `medora-staging-recovery`. برای تمرین Handoff نیز مبدأ، مقصد، مسیر شکست و مسیر بازگشت جدا بمانند.
- مبدأ وب `workers.dev` با HTTPS حساب آزمایشی کافی است. هیچ Custom Domain، مسیر Production یا Preview URL در تنظیمات تولیدشده وجود ندارد. دو حالت به‌صورت پیش‌فرض ارسال Push را متوقف می‌کنند. زمان‌بند یک‌دقیقه‌ای برقرار می‌ماند و می‌تواند روی مصرف PostgreSQL اثر بگذارد. [مسیریابی workers.dev](https://developers.cloudflare.com/workers/configuration/routing/workers-dev/)
- Renderer به ورودی‌های `MEDORA_STAGE_ACCOUNT`، `MEDORA_STAGE_HYPERDRIVE` و `MEDORA_STAGE_BUCKET` نیاز دارد. نوع اتصال‌ها و شکل نام را بررسی می‌کند، فیلدهای خارج از قالب مانند Service Binding خارجی و انتقال کلاس از Worker دیگر را رد می‌کند و در حالت Portable هیچ Namespace قدیمی نمی‌پذیرد. این بررسی آفلاین، تعلق شناسه به حساب آزمایشی یا اتصال Hyperdrive به دیتابیس آزمایشی را اثبات نمی‌کند. مالک محیط باید آن تطابق را پیش از استفاده تأیید کند. [Renderer](../infrastructure/cloudflare/staging.mjs)

با ارجاع‌هایی که از مسیر خصوصی در محیط تنظیم شده‌اند، `node infrastructure/cloudflare/staging.mjs --portable --check` تنظیمات را بدون نوشتن فایل بررسی می‌کند. اجرای همان دستور بدون `--check` یک فایل نادیده‌گرفته‌شده توسط Git با سطح دسترسی `0600` می‌سازد و از بازنویسی فایل موجود خودداری می‌کند. این دو دستور درخواست شبکه یا انتشار ندارند. نام‌های قبلی مشخص `medora-fixture-staging`، `medora-v2-staging` و `medora-portable-staging` نیز پذیرفته می‌شوند.

## ظرفیت و هزینهٔ Staging

| سرویس | سهمیه یا قیمت قابل بررسی | اثر برای مدورا |
| --- | --- | --- |
| Cloudflare Workers Free | ۱۰۰٬۰۰۰ درخواست در روز، ۱۰ میلی‌ثانیه CPU برای درخواست و Cron، ۱۲۸ مگابایت حافظه، ۵۰ Subrequest در هر درخواست، ۱۰۰ Worker و ۵ Cron Trigger در هر حساب، ۲۰٬۰۰۰ فایل ثابت در هر نسخه | ساخت محلی ۱٬۴۲۳ فایل ثابت دارد. ورود با scrypt، خروجی مدیریتی، Backup و اجرای Outbox باید در Worker واقعی اندازه‌گیری شوند. سقف CPU خود Cloudflare با زمان اندازه‌گیری محلی قابل جایگزینی نیست. [محدودیت Workers](https://developers.cloudflare.com/workers/platform/limits/) |
| Hyperdrive روی Free | ۱۰۰٬۰۰۰ دستور SQL در روز، ۱۰ پیکربندی در هر حساب و حدود ۲۰ اتصال مستقیم به مبدأ برای هر پیکربندی. سقف اتصال نرم است | سقف را با سهمیهٔ ارائه‌دهنده هماهنگ کنید و برای مهاجرت و Restore ظرفیت جدا بگذارید. Cache کوئری باید برای نشست‌ها، مجوزها و بازبینی Sync خاموش باشد. [قیمت Hyperdrive](https://developers.cloudflare.com/hyperdrive/platform/pricing/) · [محدودیت اتصال](https://developers.cloudflare.com/hyperdrive/platform/limits/) |
| R2 Standard | ماهانه ۱۰ GB-month، یک میلیون عملیات Class A و ده میلیون Class B در سهمیهٔ رایگان. ترافیک خروجی اینترنت بدون هزینهٔ R2 است. مازاد ذخیره‌سازی Standard برابر ۰٫۰۱۵ دلار برای هر GB-month است و عملیات مازاد جدا حساب می‌شوند | R2 به فعال‌سازی اشتراک و فرایند checkout نیاز دارد. فعال‌سازی و استفادهٔ بیشتر از ظرفیت رایگان در این اجرا مجاز نبود. Bucket خصوصی Standard برای این آزمون کافی است. سقف پیش‌فرض حساب ۱۰۰٬۰۰۰ Bucket است و سقف اسمی Object حدود ۵ TiB است. سقف API مدورا برای هر Backup برابر ۱۶ MiB است و باید مصرف حافظهٔ آن در مرحلهٔ Hosted اندازه‌گیری شود. [محدودیت R2](https://developers.cloudflare.com/r2/platform/limits/) · [قیمت R2](https://developers.cloudflare.com/r2/pricing/) · [فعال‌سازی R2](https://developers.cloudflare.com/r2/get-started/) |
| PostgreSQL مستقل | گزینهٔ پیشنهادی برای فیکسچر میزبانی‌شده، Neon Free با صفر دلار هزینهٔ پلن، ۱ گیگابایت و ۱۰۰ CU-hour در ماه به‌ازای پروژه است. امکان بازیابی سریع تا ۶ ساعت یا ۱ گیگابایت تغییرات محدود است. پلن Launch مصرفی است و قیمت اعلام‌شدهٔ پایهٔ منابع آن ۰٫۱۰۶ دلار/CU-hour و ۰٫۳۵ دلار/GB-month است | Neon به Hyperdrive متصل می‌شود. PostgreSQL 17 و اتصال مستقیم TLS بدون Pooler ارائه‌دهنده را برای تطابق با فیکسچر انتخاب کنید. سقف نمونهٔ Compute معادل ۰٫۲۵ CU، ۱۱۲ اتصال با ۷ جایگاه رزرو است. مقدار واقعی با `SHOW max_connections` بررسی شود. Cron مکرر ممکن است مانع Scale-to-zero و باعث مصرف سهمیه شود. برای Restore مستقل Dump آزموده لازم است. هیچ سرویس Postgres میزبانی‌شده انتخاب عملیاتی یا خریداری نشد. [قیمت Neon](https://neon.com/pricing) · [اتصال مستقیم Neon و Hyperdrive](https://developers.cloudflare.com/hyperdrive/examples/connect-to-postgres/postgres-database-providers/neon/) · [سقف اتصال Neon](https://neon.com/docs/connect/connection-pooling) |

## حداقل دسترسی برای مرحلهٔ میزبانی‌شده

| دسترسی | کمترین محدوده و کاربرد | اثر روی Production و جایگزین |
| --- | --- | --- |
| بررسی Cloudflare | شناسهٔ حساب اختصاصی، شناسهٔ Hyperdrive، نام Bucket، نام Worker و مدرک مالکیت. برای خواندن متادیتا `Workers Scripts Read`، `Hyperdrive Read` و در صورت نیاز `Workers R2 Storage Read` در همان حساب کافی‌اند | این مجوزها در سطح Account هستند و اگر روی حساب مشترک صادر شوند می‌توانند متادیتای منابع Production را هم نشان دهند. حساب اختصاصی یا تأیید متادیتا از طرف مالک، بدون دادن Token حساب Production، کافی است. |
| ایجاد R2 و Hyperdrive | پس از تأیید جدایی، برای ساخت پیکربندی Hyperdrive از `Hyperdrive Write` و برای ساخت Bucket از `Workers R2 Storage Write` فقط در حساب آزمایشی استفاده شود. مالک می‌تواند هر دو را در Dashboard بسازد | مجوز ساخت Bucket سطح Account دارد. پس از ساخت، برای دسترسی S3 اپراتور Restore فقط `Object Read & Write` روی Bucketهای همان تمرین لازم است. خود Worker با R2 Binding کار می‌کند. |
| Worker و HTTPS | انتشار بعدی به مجوز مستقل و `Workers Scripts Write` روی حساب صرفاً آزمایشی نیاز دارد. برای آزمودن Worker از قبل آماده، HTTPS و در صورت نیاز دسترسی به حساب‌های تست کافی است. `Workers Tail Read` اختیاری است | نیازی به DNS Edit، دسترسی Billing یا Worker اصلی نیست. Dashboard برای بازبینی مالک و در صورت نیاز فعال‌سازی اولیهٔ R2/workers.dev کاربرد دارد. |
| PostgreSQL اجرا | Host، Port، Database، نقش اجرا و ارجاع امن رشتهٔ اتصال مستقیم با TLS. به نقش اجرا فقط دسترسی اتصال، استفاده از Schema و مجوزهای لازم روی جدول‌ها، Sequenceها و Functionهای همان دیتابیس داده شود | نقش اجرا به ساخت دیتابیس، تغییر Schema یا دسترسی به پروژهٔ Production نیاز ندارد. |
| PostgreSQL مهاجرت و Restore | نقش جدا برای DDL روی مقصد خالی و خواندن کامل اشیای مبدأ آزمایشی برای Dump. برای Restore، یک دیتابیس خالی مستقل با اجازهٔ ایجاد Schema، جدول، Sequence و Constraint لازم است. اتصال مستقیم از ماشین آزمون برای `pg_dump`، `pg_restore` و بررسی تطبیق لازم است | ساخت دیتابیس را مالک می‌تواند انجام دهد. در آن حالت مجوز `CREATEDB` به مجری آزمون لازم نیست. از اتصال‌های اختصاصی هر مقصد استفاده شود. |
| GitHub | برای ممیزی و خواندن اجرای موجود، دسترسی `Contents: read` و `Actions: read` کافی است. مجوز `Actions: write` فقط برای راه‌اندازی مجاز CI دستی لازم می‌شود | برای کار محلی یا گزارش CI موجود، Write و GitHub Secrets لازم نیست. شاخهٔ `deploy` خارج از محدوده است. |
| ایمیل، کلیدها و دستگاه | کلیدهای اختصاصی برای `MEDORA_PASSWORD_KEYS`، `MEDORA_CODE_KEY` و `MEDORA_MAIL_KEY` در Secret Store. ثبت‌نام خودکار به Test Mailbox کنترل‌شده یا فرستنده و Token محدود Staging نیاز دارد. برای Reminder، کلید امضا و VAPID مخصوص آزمایش لازم‌اند. Chrome/WebKit روی HTTPS کافی‌اند تا مرحلهٔ ثبت و همگام‌سازی خودکار آزموده شود | فقط گیرندگان آزمایشی. Push واقعی، نصب از Home Screen، اعلان پس‌زمینه و بعضی رفتارهای Safari دستگاه به iPhone/Android واقعی نیاز دارند. این موارد پس از تأیید محیط و مجوز مربوط اجرا می‌شوند. |

اطلاعات اتصال و Secretها از Dashboard یا Secret Store به محیط مجاز تزریق شوند. هیچ مقدار خصوصی در چت یا فایل گزارش ثبت نشود. محیط عادی Portable به Seed یا کلید Production نیاز ندارد. در صورت تمرین سازگاری نشستِ نسخهٔ قدیمی، از کلید جداگانهٔ مبدأ مصنوعی در همان تمرین استفاده شود. [مجوزهای Cloudflare](https://developers.cloudflare.com/fundamentals/api/reference/permissions/) · [کلیدهای محدود R2](https://developers.cloudflare.com/r2/api/tokens/) · [مجوزهای GitHub Actions](https://docs.github.com/en/rest/actions/workflows)

## ترتیب آزمون روی محیط مستقل پس از فراهم‌شدن آن

۱. مالک به‌صورت مستقل حساب، نام و شناسهٔ منابع و خالی‌بودن مقصدهای Restore را تأیید کند. شناسهٔ Build، HTTPS، خاموش بودن Cache در Hyperdrive و محدود بودن مسیر وب به مبدأ آزمایشی ثبت شوند. اگر فقط PostgreSQL و R2 مستقل آماده باشند، می‌توان مهاجرت و تطبیق فایل مصنوعی را با اتصال مستقیم انجام داد. آزمون Hyperdrive و مرورگر به Worker آزمایشی فعال وابسته می‌ماند. هیچ Workflow انتشار در این مرحلهٔ بدون Deploy اجرا نمی‌شود.

۲. PostgreSQL خالی را با نقش مهاجرت و اتصال مستقیم، در هر دو اجرا با `pnpm db:migrate` بررسی کنید. برای نصب آزمایشی تازهٔ PostgreSQL، از `postgres-handoff.mjs initialize` روی بانک خالی استفاده کنید. برای تمرین تبدیل Durable Objects، ابتدا مبدأ مصنوعی مستقل را با `legacy-source.mjs` بسازید. Census و نگاشت مصنوعی را به‌صورت مستقل نگه دارید و مسیر `objects.mjs` برای export، import، verify، project و verify-projection را فقط روی مقصد تأییدشده اجرا کنید. مسیر `verify:source` و تست‌های خودکار محلی محافظ loopback دارند و برای دور زدن آن محافظ استفاده نمی‌شوند. [تطبیق فیزیکی و منطقی](MIGRATION.md)

۳. در مرورگر دو حساب مصنوعی با پروفایل، مجوز جهت‌دار خانوادگی و نشست مستقل بسازید. کار با داده، آپلود و دریافت Backup رمزگذاری‌شده، دریافت و بازپخش عملیات آفلاین و رفتار درخواست هم‌زمان را بسنجید. اندازه، SHA-256 و ارجاع PostgreSQL هر Object را از Bucket مستقل R2 مقایسه کنید. دریافت دادهٔ حساب دیگر، درخواست بدون نشست، Origin نامعتبر، کوکی‌ها و محدودیت نرخ را بررسی کنید.

۴. در HTTPS همان Staging، Chromium و WebKit را با همان نشانی پس از تغییر مقصد اجرا کنید. Service Worker و IndexedDB باید عملیات آفلاین را نگه دارند و بازپخش تکراری یک نتیجه بدهد. ثبت‌نام، خروج، حفظ نشست بعد از Restart، تعارض و رسید عملیات، دسترسی خانوادگی، Outbox و رفتار پس از قطع مجاز PostgreSQL را با فیکسچر مصنوعی ثبت کنید. در محیط واقعی، خطای API در قطعی و رسیدن دوبارهٔ مقصد به سلامت لازم است. حساب یا گیرندهٔ واقعی وارد این آزمون نشود.

۵. با Runbook انتقال، PostgreSQL و Objectها را به مقصد مجزای Restore یا Node/S3 انتقال دهید. برابری Hash و شمارش رکورد، تعریف Index و Constraint، موقعیت Sequence، ماندن Outbox و خواندن Backup را ثبت کنید. شکست کپی قبل از Commit و بازگشت بعد از نوشتن را مستقل آزمایش کنید. [مسیر Handoff به VPS](MIGRATION.md#move-an-established-postgresql-installation-between-runtimes) · [برگشت و بازیابی](ROLLBACK.md)

## بررسی قرارداد و مسیر شواهد

- React قبل از انتخاب مسیر نوشتن به `/api/v2/product-writer` رجوع می‌کند. در حالت PostgreSQL درخواست‌های حساب، نشست، خانواده و Care به مسیرهای متناظر Hono ترجمه می‌شوند. `/api/v2/health` آمادگی Schema را می‌سنجد. ابزار مستقل Pilot همچنان به پل سازگاری وابسته است. [ارتباط فرانت‌اند و API](../apps/web/src/product/accountTransport.ts) · [Adapter Worker](../apps/api/src/adapters/worker.ts) · [قرارداد API](../apps/api/src/app.ts)
- Hono و Node مسیر احراز هویت، الزام Origin هم‌مبدأ و کنترل مجوزها را به اشتراک می‌گذارند. آزمون‌های امنیتی احراز هویت، Origin نامعتبر، خروج، Grant جهت‌دار خانواده، دسترسی به Backup حساب دیگر، Idempotency و سقف نرخ را پوشش می‌دهند. [آزمون API](../tests/integration/api.test.ts) · [Backup و دسترسی](../tests/security/access.test.ts) · [مجوز خانوادگی](../tests/security/family.test.ts)
- مسیر محلی `postgres-handoff.mjs` تراکنش نویسنده، receipt، Outbox، درخواست هم‌زمان، دو Tab، به‌روزرسانی Service Worker و بازیابی عملیات معلق را همراه با خواندن مجدد Backup آزمون می‌کند. نقش Dashboard، ظرفیت حساب Cloudflare، اتصال Hyperdrive شبکه‌ای و رفتار ارائه‌دهندهٔ ایمیل به آزمون Hosted وابسته‌اند. [Handoff خودکار](../scripts/verification/postgres-handoff.mjs) · [ماندگاری عملیات آفلاین](DATA_PRESERVATION.md)

## نتیجهٔ آزمون‌های محلی

زیرساخت آزمون شامل PostgreSQL 17.11 روی loopback، Workerd و R2 محلی، Node، Caddy و Versity S3 با Volume مستقل بود. داده‌ها مصنوعی بودند. آزمون‌ها از سرویس محلی موجود یا از دیتابیس و فضای Production استفاده نکردند.

| بررسی | نتیجه |
| --- | --- |
| نصب ثابت، TypeScript، ESLint، Audit، Build وب و Node و دو Bundle Worker | پاس. Audit آسیب‌پذیری شناخته‌شده‌ای گزارش نکرد. هر دو پیکربندی مصنوعی با Parser بستهٔ Wrangler تأیید شدند. |
| Unit، Integration، API، Security و Migration | ۳۳ آزمون از ۱۷ فایل پاس. ۵ آزمون مربوط به Renderer بودند، شامل اتصال خارجی، انتقال کلاس، قالب Portable و ساخت فایل خصوصی. |
| Compatibility و Care | ۴۵ Compatibility و ۱۳ Care پاس. سناریوی Alarm شامل دارو، آب، روتین، خواب، Cycle، Snooze و نوبت با تحویل شبیه‌سازی‌شده پاس شد. |
| Journal، ساخت مستقل، UI و آفلاین | ۱۸ آزمون Journal، ۱۳۸ آزمون مرورگر در ساخت مستقل، ۱۶۰ تصویر دقیق و ۶۴ نمونهٔ Axe پاس. Service Worker در نصب ناقص به نسخهٔ قبلی برگشت و پس از Retry فعال شد. WebKit گزارش مستقیم را پشت Caddy HTTPS در ۱٫۱۱ ثانیه و آفلاین در ۲٫۰۹ ثانیه باز کرد. |
| ظرفیت آغاز کار محلی | سه نمونه در هر مسیر. میانهٔ کنترل شروع ۴٫۵۱ ثانیه در ورودی و ۴٫۵۶ در لینک مستقیم بود. سقف ۶ ثانیه حفظ شد. |
| قطعی PostgreSQL و بازیابی Node | در قطعی، وضعیت سلامت ۵۰۳ برگشت. پس از برگشت اتصال، همان نشست، تغییر و فایل Backup پیدا شدند. در لاگ تنها کد ثابت خطای اتصال ثبت شد و شیء اتصال دیده نشد. [آزمون Runtime](../scripts/verification/runtime.mjs) |
| تطبیق مصنوعی قدیمی به PostgreSQL | ۷ Namespace، ۱۵ تصویر SQLite، ۲۵ ردیف فیزیکی و ۱٬۶۰۷ ردیف داده/تنظیم بررسی شدند. ۲۰ مهاجرت با تاریخچهٔ مرتب بررسی شدند. Hashهای فایل مبدأ قبل و بعد از تمرین یکسان بودند. هر سه سناریوی Rollback شامل ۷ نوشتۀ پذیرفته‌شده، رد بازیابی در تغییر پشتیبانی‌نشده و حذف حساب واردشده پاس شدند. [تطبیق مبدأ](../scripts/verification/source-reconciliation.mjs) · [تمرین Rollback](../scripts/verification/rehearse.mjs) |
| انتقال Worker ↔ Node و بازیابی فایل | ۴۸ جدول، ۹ Sequence، ۱۰۹ قید، دو حساب، هشت عملیات آفلاین و یک Object رمزگذاری‌شده تطبیق یافتند. نشست، مجوز، Outbox، بازگشت بعد از نوشتن و شکست تزریقی کپی پاس شدند. تلاش اول پیش از تمرین، با پاسخ اتصال ردشده از درگاه S3 محلی پایان یافت. تکرار روی مقصدهای تازه با Volume اختصاصی و کنترل آمادگی Versity پاس شد. |
| Backup و Restore مستقل Compose | Hash هر سه فایل PostgreSQL، Object و Namespace تأیید شد. برابری موجودی PostgreSQL و Sequenceها و خواندن امضاشدهٔ Backup در مقصد بازیابی، پاس شدند. [راهنمای بازیابی](OPERATIONS.md#verified-portable-recovery-drill) |

## CI میزبانی‌شده

[اجرای موجود روی `d117d01`](https://github.com/k1nosraty/medora/actions/runs/44574250545) پایان یافت. هر ۱۹۴ آزمون محصول پاس شدند. کار مرجع ۸۱ قبولی، یک شکست و ۱۱۲ Skip مخصوص React داشت. WebKit در انتهای آزمون بزرگ‌نمایی متن ۳۲۰ پیکسل به سقف ۳۰ ثانیه رسید. کار وابستهٔ `verify` اجرا نشد. تست صفحه‌ها و Backup به چهار سناریوی مستقل فارسی و انگلیسی تقسیم شد. همهٔ نماها و شرط‌های قبلی، از جمله بررسی بازچینی، اندازهٔ کنترل و بازیابی، همچنان آزموده می‌شوند و سقف ۳۰ ثانیه تغییر نکرد. [آزمون بزرگ‌نمایی](../tests/browser/frontend.spec.mjs)

در اجرای کامل محلی پس از این اصلاح، محصول ۲۰۰ قبولی داشت، ۱۰۰ در هر موتور و بدون شکست یا Skip. مرجع ۸۸ قبولی، ۴۴ در هر موتور، بدون شکست و با همان ۱۱۲ Skip مخصوص React داشت. چهار سناریوی WebKit مرجع با محدودیت یک CPU، هرکدام سه بار پاس شدند. نصب مستقل فرانت‌اند نیز تمام ۱۳۸ آزمون را با تست‌های تفکیک‌شده اجرا کرد. CI تغییرات محلی نیازمند قرارگرفتن آن‌ها در یک Ref میزبانی‌شده در مأموریتی جداگانه است.

## تصمیم‌گیری مرحلهٔ بعد

- برای تطبیق مستقل Staging، شناسه‌ها و تأیید مالکیت حساب Cloudflare آزمایشی، Hyperdrive و Bucketهای مستقل، دیتابیس‌های خالی PostgreSQL برای مهاجرت و Restore و ارجاع اتصال مستقیم TLS لازم‌اند. نقش‌ها در همان پروژه و حساب آزمایشی محدود باشند.
- برای آزمون مرورگر، CPU، Hyperdrive شبکه‌ای و Outbox، URL HTTPS یک Worker آزمایشی از قبل فعال یا مجوز صریح جداگانهٔ انتشار Staging لازم است. برای ایمیل و Push واقعی، گیرنده و کلید مخصوص آزمایش و مجوز ارسال جداگانه لازم است.
- معیارهای تأیید Hosted شامل مقایسهٔ SQL و فایل‌ها، رفتار هنگام قطع Hyperdrive، حفظ نشست و Sync، بازیابی مستقل و سنجش راه‌های سنگین روی پلن Free هستند. هر مورد در این اجرا **BLOCKED** است.
- برای انتشار Production، تطبیق مجاز مبدأ واقعی، توقف کنترل‌شدهٔ نویسنده‌ها، شواهد بازگشت با دادهٔ مجاز و اجازهٔ مستقل انتشار همچنان لازم‌اند. این مأموریت فقط از دادهٔ مصنوعی استفاده کرد.
