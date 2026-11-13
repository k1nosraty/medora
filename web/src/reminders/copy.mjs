const copy = {
  fa: {
    general: "یادآوری مدورا",
    dose: ["نوبت دارو", "داروی نوبت فعلی را طبق برنامه مصرف کنید.", "زمان مصرف"],
    water: ["وقت نوشیدن آب", "آب بنوشید و مقدارش را ثبت کنید."],
    appointment: ["یادآوری قرار", "برای قرار پیش‌رو آماده شوید.", "برای این قرار آماده شوید"],
    routine: ["وقت روتین", "روتین این نوبت را انجام دهید و پیشرفت را ثبت کنید.", "وقت انجام"],
    more: "و موارد دیگر"
  },
  en: {
    general: "Medora reminders",
    dose: ["Medicine reminder", "Take your scheduled medicine as planned.", "Time to take"],
    water: ["Time to drink water", "Drink some water and log how much."],
    appointment: ["Appointment reminder", "Get ready for your upcoming appointment.", "Get ready for"],
    routine: ["Routine reminder", "Do your scheduled routine and log your progress.", "Time for"],
    more: "and more"
  }
};

export function reminderCopy(next, kinds, language, zone, now) {
  const words = copy[language] ?? copy.fa;
  const locale = language === "en" ? "en-US" : "fa-IR";
  const title = kinds.length === 1 ? words[kinds[0]][0] : words.general;
  const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 3 });
  const time = new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: zone });
  const body = kinds.map(kind => {
    const [label, fallback, action] = words[kind];
    const details = next.details?.[kind];
    if (!details?.length) return kinds.length === 1 ? fallback : `${label} — ${fallback}`;
    const entries = kind === "appointment"
      ? details.filter(([at, name]) => at > now && name).map(([at, name]) => `${name} (${time.format(at)})`)
      : details.map(({ name, amount, unit }) => {
        if (amount === null) return name;
        const localizedUnit = unit === "tablet" || unit === "قرص"
          ? (language === "en" ? amount > 1 ? "tablets" : "tablet" : "قرص") : unit;
        return `${name} (${[number.format(amount), localizedUnit].filter(Boolean).join(" ")})`;
      });
    if (!entries.length) return fallback;
    const visible = entries.slice(0, 2).join(" · ");
    return `${action}: ${visible}${entries.length > 2 ? ` ${words.more}` : ""}`;
  }).join("\n");
  return { title, body };
}
