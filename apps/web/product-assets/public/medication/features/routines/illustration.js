import { routineGlass } from "../../design/three-dimensional.js";
import { routineLabels } from "./catalog.js";

export function routineIllustration(category, color) {
  const symbol = Object.hasOwn(routineLabels, category) ? category : "custom";
  const art = routineGlass(symbol, color === "coral" ? undefined : color);
  art.classList.add("routine-illustration");
  return art;
}
