export const groupIcons = {
  group: "شبکهٔ مراقبت",
  heart: "قلب",
  "control-mark": "نشان مدورا",
  "routine-health": "سلامت",
  visit: "قرار",
  "visit-ecg": "قلب و عروق",
  "visit-dental": "دندان‌پزشکی",
  "visit-physiotherapy": "فیزیوتراپی",
  "visit-pediatrics": "کودکان",
  bottle: "دارو",
  routine: "روتین",
  sprout: "جوانه",
  "routine-walking": "پیاده‌روی",
  "control-sun": "خورشید",
  "control-calendar": "تقویم"
};

export const groupIconOf = value => Object.hasOwn(groupIcons, value) ? value : "group";
