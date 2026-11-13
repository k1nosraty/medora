export const routineCategories = {
  "شخصی": { custom: "دلخواه" },
  "مراقبت و سلامت": {
    skincare: "مراقبت پوست", health: "عادت سلامت", therapy: "تمرین توان‌بخشی",
    breath: "تمرین تنفس", sleep: "روتین خواب", nutrition: "تغذیه"
  },
  "ذهن و سرگرمی": {
    reading: "مطالعه", music: "گوش‌دادن به موسیقی", instrument: "تمرین ساز",
    journaling: "یادداشت روزانه", meditation: "مراقبه"
  },
  "ورزش": {
    workout: "ورزش دلخواه", walking: "پیاده‌روی", running: "دویدن",
    gym: "باشگاه", bodybuilding: "بدنسازی", rope: "طناب‌زدن", football: "فوتبال",
    futsal: "فوتسال", basketball: "بسکتبال", volleyball: "والیبال", handball: "هندبال",
    tennis: "تنیس", "table-tennis": "تنیس روی میز", badminton: "بدمینتون",
    cycling: "دوچرخه‌سواری", swimming: "شنا", yoga: "یوگا", pilates: "پیلاتس",
    stretch: "حرکات کششی", hiking: "کوه‌پیمایی", climbing: "سنگ‌نوردی",
    boxing: "بوکس", "martial-arts": "ورزش رزمی", dance: "رقص",
    skating: "اسکیت", skiing: "اسکی", rowing: "قایق‌رانی"
  }
};

export const routineLabels = Object.assign({}, ...Object.values(routineCategories));
