import { t } from "../../../../../web/public/medication/shared/i18n/locale.js";

export const categoryGroups: {
  label: string | null;
  options: [string, string][];
}[] = [
  { label: null, options: [["general", t("ui.general")]] },
  {
    label: t("پزشکان و تخصص\u200cها"),
    options: [
      ["family", t("ui.family-medicine")],
      ["internal", t("ui.internal-medicine")],
      ["pediatrics", t("ui.pediatrics")],
      ["obgyn", t("ui.obstetrics-and-gynecology")],
      ["midwife", t("ui.midwifery")],
      ["eye", t("ui.eye-care")],
      ["ent", t("ui.ear-nose-and-throat")],
      ["skin", t("ui.dermatology")],
      ["heart", t("ui.cardiology")],
      ["neurology", t("ui.neurology")],
      ["psychiatry", t("ui.psychiatry")],
      ["endocrine", t("ui.endocrinology")],
      ["gastro", t("ui.gastroenterology-and-hepatology")],
      ["pulmonology", t("ui.pulmonology")],
      ["nephrology", t("ui.nephrology")],
      ["urology", t("ui.urology")],
      ["rheumatology", t("ui.rheumatology")],
      ["allergy", t("ui.allergy-and-immunology")],
      ["infectious", t("ui.infectious-diseases")],
      ["hematology", t("ui.hematology")],
      ["oncology", t("ui.oncology")],
      ["geriatrics", t("ui.geriatrics")],
      ["general-surgery", t("ui.general-surgery")],
      ["orthopedics", t("ui.orthopedics")],
      ["pain", t("ui.pain-medicine")],
      ["sleep", t("ui.sleep-medicine")],
      ["occupational-medicine", t("ui.occupational-medicine")],
    ],
  },
  {
    label: t("دندان و خدمات درمانی"),
    options: [
      ["dental", t("ui.dental")],
      ["orthodontics", t("ui.orthodontics")],
      ["endodontics", t("ui.endodontics")],
      ["psychology", t("ui.psychology")],
      ["physiotherapy", t("ui.physiotherapy")],
      ["occupational-therapy", t("ui.occupational-therapy")],
      ["speech", t("ui.speech-therapy")],
      ["audiology", t("ui.audiology")],
      ["optometry", t("ui.optometry")],
      ["nutrition", t("ui.nutrition")],
      ["sports", t("ui.sports-medicine")],
    ],
  },
  {
    label: t("آزمایش، تصویربرداری و سایر خدمات"),
    options: [
      ["lab", t("ui.laboratory")],
      ["imaging", t("ui.imaging")],
      ["radiology", t("ui.radiology")],
      ["ultrasound", t("ui.ultrasound")],
      ["mri", t("ui.mri")],
      ["ct", t("ui.ct-scan")],
      ["mammography", t("ui.mammography")],
      ["densitometry", t("ui.bone-density-scan")],
      ["ecg", t("ui.ecg")],
      ["echocardiography", t("ui.echocardiogram")],
      ["endoscopy", t("ui.endoscopy")],
      ["dialysis", t("ui.dialysis")],
      ["vaccination", t("ui.vaccination")],
      ["nuclear-medicine", t("ui.nuclear-medicine")],
    ],
  },
  { label: null, options: [["custom", t("ui.custom")]] },
];

const labels = new Map<string, string>(
  categoryGroups.flatMap((group) => [...group.options]),
);
export function categoryOf(value?: string) {
  return value && labels.has(value) ? value : "general";
}
export function categoryLabel(value: string) {
  return labels.get(value) ?? t("ui.general");
}
