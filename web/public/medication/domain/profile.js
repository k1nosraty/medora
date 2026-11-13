export const genders = ["", "female", "male", "undisclosed"];
export const finishes = ["glass", "matte"];

export const canEnableCycle = state => state.gender !== "male";
export const cycleIsEnabled = state => canEnableCycle(state) && state.cycleEnabled === true;
export const finishOf = value => value === "matte" ? "matte" : "glass";
