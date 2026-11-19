import {
  artworkFilter,
  artworkPath,
} from "../../../product-assets/public/medication/design/three-dimensional.js";
import {
  appearanceColors,
  defaultMedicineColor,
  defaultMedicineIcon,
  medicineShapes,
} from "../../../product-assets/public/medication/features/medicines/appearance-options.js";

export function medicineShape(shape?: string): keyof typeof medicineShapes {
  return shape && Object.hasOwn(medicineShapes, shape)
    ? (shape as keyof typeof medicineShapes)
    : defaultMedicineIcon;
}
export function medicineColor(color?: string): keyof typeof appearanceColors {
  return color && Object.hasOwn(appearanceColors, color)
    ? (color as keyof typeof appearanceColors)
    : defaultMedicineColor;
}

export function MedicineArt({
  shape,
  color,
  banner = false,
}: {
  shape?: string | undefined;
  color?: string | undefined;
  banner?: boolean;
}) {
  const type = medicineShape(shape);
  const ink = medicineColor(color);
  function badge(id: string, echo = false) {
    const finish = document.body.dataset.finish;
    const filter = artworkFilter(
      id,
      "medicine",
      ink === defaultMedicineColor ? undefined : ink,
    );
    return (
      <img
        data-art={id}
        data-ink={ink}
        className={
          "glass-object medication-badge" + (echo ? " banner-echo" : "")
        }
        src={artworkPath(id, finish, undefined)}
        width={256}
        height={256}
        decoding="async"
        loading="lazy"
        alt=""
        style={filter ? { filter } : undefined}
        onError={(event) => {
          const image = event.currentTarget;
          const fallback = artworkPath(
            defaultMedicineIcon,
            document.body.dataset.finish,
            undefined,
          );
          if (image.getAttribute("src") !== fallback) image.src = fallback;
        }}
      />
    );
  }
  if (!banner) return badge(type);
  return (
    <div
      className="medication-banner"
      data-shape={type}
      data-ink={ink}
      aria-hidden="true"
    >
      {badge(type, true)}
      {badge(type === "tablet" ? "blister" : type)}
      <span>{medicineShapes[type]}</span>
    </div>
  );
}
