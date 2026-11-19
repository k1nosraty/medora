import { accessCare } from "../../product-assets/public/medication/shared/storage.js";
import type { CareState } from "./product";

export const initialCare = accessCare().then(
  (state: CareState) => ({ state }),
  (error: unknown) => ({ error }),
);
