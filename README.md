# مدورا

مدورا یک وب‌اپ نصب‌شدنی برای برنامهٔ دارو، نوبت، روتین، خواب، آب و چرخه است. داده‌های دستگاه در IndexedDB می‌مانند و همگام‌سازی حساب اختیاری است. مسیر اصلی `/medication/` و دفتر آزمایشی React و Dexie در `/journal/` است.

**وضعیت انتشار NOT READY است.** توسعه و آزمون به محیط محلی و دادهٔ مصنوعی محدودند. هر انتشار، تغییر محیط میزبانی یا push نیاز به اجازهٔ صریح مالک دارد.

## راه‌اندازی محلی

به Node.js 24.18 یا جدیدتر، pnpm 10.32.1 و برای استک کامل به Docker Compose نیاز دارید. دستورها از ریشهٔ مخزن اجرا می‌شوند.

```sh
pnpm install --frozen-lockfile
pnpm build
mkdir -p .local
node scripts/verification/local-env.mjs .local/dev.env
docker compose --env-file .local/dev.env -p medora-dev up -d --build --wait
```

- [محصول اصلی](http://127.0.0.1:8808/medication/) و [دفتر دستگاه](http://127.0.0.1:8808/journal/)
- [صندوق ایمیل آزمایشی Mailpit](http://127.0.0.1:8810/)
- [گالری طراحی](http://127.0.0.1:8808/design/) و [پنل مدیریت](http://127.0.0.1:8808/admin/)

بار اول فایل محیط را با مولد بسازید و در دفعات بعد همان فایل را استفاده کنید. این فایل در Git وارد نمی‌شود و مولد آن را بازنویسی نمی‌کند. گزینه‌های پورت و حساب آزمایشی در [نمونهٔ محیط](.env.example) آمده‌اند. اگر پورت اشغال است، پورت و `MEDORA_PUBLIC_ORIGIN` را در فایل خصوصی هماهنگ کنید. با دستور زیر کانتینرها متوقف می‌شوند و حجم‌های داده برای اجراهای بعدی باقی می‌مانند.

```sh
docker compose --env-file .local/dev.env -p medora-dev stop
```

Compose حالت سازگاری را برای تمرین مسیر قدیمی هم ارائه می‌کند. برای حالت مستقل PostgreSQL با Workerd از پایگاه تازهٔ لوکال و تنظیم `portable.local.json` استفاده کنید. [راهنمای Cloudflare و اجرای لوکال](docs/CLOUDFLARE_DEPLOYMENT.md)

برای اجرای مستقل رابط، وابستگی‌های workspace را نصب کنید و `pnpm --filter @medora/web dev` را بزنید. سپس مسیر `/medication/` را در آدرسی که Vite چاپ می‌کند باز کنید. عملکردهایی که به API نیاز دارند در استک کامل آزمایش می‌شوند. برای آزمون خودکار ساخت و اجرای رابط در نسخه‌ای که پوشهٔ `web/` در آن وجود ندارد، `node scripts/verification/frontend-independence.mjs` را اجرا کنید.

برای توسعهٔ دفتر React به‌تنهایی، `pnpm --filter @medora/web dev:journal --host 127.0.0.1` را اجرا کنید و آدرسی را که Vite چاپ می‌کند باز کنید. در استک کامل، همین دفتر در `/journal/` قرار دارد.

## نقشهٔ مخزن

| مسیر | مسئولیت |
| --- | --- |
| `apps/web/` | محصول اصلی، دفتر React و Dexie و ساخت Vite |
| `apps/api/src/` | برنامهٔ Hono، قواعد دسترسی، سرویس‌ها و اتصال PostgreSQL |
| `apps/api/src/adapters/` | ورودی‌های Node و Workers و تنظیم اتصال |
| `packages/` | قراردادهای API، قواعد دامنه، سرویس‌های مشترک سرور و ابزار ساخت رابط |
| `apps/web/product-assets/` و `apps/web/tools/` | ترجمه، استایل، دارایی‌ها، ماژول‌های مرورگر و ابزارهای مستقل مدیریت، پایلوت و گالری |
| `apps/compat-worker/` | Worker سازگاری، آلارم‌های قدیمی و ساخت نسخهٔ مرجع |
| `migrations/server/` و `scripts/migration/` | تاریخچهٔ SQL دارای checksum و ابزارهای انتقال، پشتیبان و بازیابی |
| `tests/` و `scripts/verification/` | آزمون‌ها، داده‌های مصنوعی و تمرین‌های بازگشت |
| `infrastructure/cloudflare/` و `infrastructure/docker/` | تنظیم Worker و استک Node و Caddy |
| `branding/` و `docs/` | دارایی مرجع و مستندات توسعه و عملیات |

[فهرست نگهداری مخزن](docs/REPOSITORY.md) جزئیات مسیرهای فعال، سازگاری و خروجی‌های تولیدشده را مشخص می‌کند.

## آزمون‌ها

```sh
pnpm exec playwright install chromium webkit
pnpm typecheck && pnpm lint
pnpm build
pnpm test
pnpm test:compat
pnpm test:e2e
pnpm test:product
pnpm test:incumbent
```

برای آزمون‌های PostgreSQL، `MEDORA_TEST_DATABASE_URL` باید به پایگاه آزمایشی جدا روی loopback با نامی مانند `medora_fixture` اشاره کند. پیش از اجرا با `DATABASE_URL` همان پایگاه، `pnpm db:migrate` را اجرا کنید. آزمون‌های وابسته به PostgreSQL بدون اتصال آزمایشی کنار گذاشته می‌شوند. آزمون‌های Playwright را بعد از ساخت اجرا کنید. `pnpm test:product` محصول بازسازی‌شده و دستور آخر محصول سازگاری را باز می‌کند. تمرین مهاجرت، بازیابی و توقف نوشتن به پایگاه‌های تازه نیاز دارد. [گزارش و دامنهٔ آزمون‌ها](docs/REBUILD_VERIFICATION.md)

## راهنماهای اصلی

- [معماری](docs/ARCHITECTURE.md) و [حفظ داده‌های دستگاه](docs/DATA_PRESERVATION.md)
- [مهاجرت و پشتیبان](docs/MIGRATION.md) و [بازگشت](docs/ROLLBACK.md)
- [Cloudflare](docs/CLOUDFLARE_DEPLOYMENT.md)، [VPS](docs/VPS_DEPLOYMENT.md) و [معیارهای انتشار](docs/DEPLOYMENT.md)
- [نقشهٔ نسخهٔ سازگاری](apps/compat-worker/README.md) و [طراحی و دارایی‌ها](docs/DESIGN_SYSTEM.md)
- [وضعیت انتقال رابط به React و TypeScript](docs/FRONTEND_PORT.md)
