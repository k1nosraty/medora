export function watchFamilyAccess({ request, changed, denied, today }) {
  let selection;
  let timer;
  let generation = 0;

  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(() => void check(), 15_000);
  }

  async function check({ feedback, force = false } = {}) {
    if (!selection) return;
    const { group, member, data, day } = selection;
    const token = ++generation;
    clearTimeout(timer);
    try {
      const current = await request("view", { group: group.id, target: member.id,
        ...(!force && { knownPolicy: JSON.stringify(data.policy), knownRevision: data.revision }) });
      if (token !== generation) return;
      if (!current.unchanged) changed(group, member, current, feedback, JSON.stringify(data.policy) !== JSON.stringify(current.policy));
      else if (day !== today()) changed(group, member, data);
      schedule();
    } catch (error) {
      if (token === generation) denied(error);
    }
  }

  return {
    check,
    set(value) { selection = value; },
    start() {
      generation++;
      schedule();
    },
    stop() {
      generation++;
      clearTimeout(timer);
      selection = undefined;
    }
  };
}
