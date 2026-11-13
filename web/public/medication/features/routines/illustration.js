import { illustration } from "../../design/artwork.js";
import { routineLabels } from "./catalog.js";

export function routineIllustration(category) {
  const symbol = category !== "custom" && Object.hasOwn(routineLabels, category) ? category : "banner";
  const banner = symbol === "banner";
  return illustration("/medication/assets/icons/routines.svg#" + symbol, {
    viewBox: banner ? "0 0 128 100" : "0 0 24 24",
    className: banner ? "routine-illustration routine-category-art" : "routine-illustration"
  });
}
