// Completed-plan persistence only. No search, calculation, apply or publication.
const stable = value => JSON.stringify(sort(value));
function sort(value) {
  if (Array.isArray(value)) return value.map(sort);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map(k => [k, sort(value[k])]));
  return value;
}
export function sameCompletedPlan(a, b) {
  return !!a?.run?.runId && a.run.runId === b?.run?.runId && stable(a) === stable(b);
}
export async function saveCompletedPlan({projectId, versionId, plan, readVersion, writePlan, current, deadlineMs = 20000, onStage = () => {}}) {
  if (!plan?.run?.runId || plan.projectId !== projectId || plan.versionId !== versionId ||
      !plan.designFingerprint) throw new Error("The completed plan has no matching project, version or design identity.");
  const bounded = (stage, work) => {
    onStage(stage);
    let timer;
    return Promise.race([Promise.resolve().then(work), new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(stage + " timed out; persistence is not yet verified.")), deadlineMs);
    })]).finally(() => clearTimeout(timer));
  };
  const read = async stage => {
    if (!current()) throw new Error("The design changed before plan persistence could be verified.");
    const row = await bounded(stage, readVersion);
    if (row?.id !== versionId || row?.project_id !== projectId) throw new Error("The saved version identity does not match the completed plan.");
    if (!current()) throw new Error("The design changed during plan persistence.");
    return row.design_state?.optimiser_plan || null;
  };
  const existing = await read("plan-read-before-save");
  if (sameCompletedPlan(existing, plan)) return {at: Date.now(), reused: true};
  if (existing?.run?.runId !== plan.run.runId &&
      Date.parse(existing?.run?.startedAt) > Date.parse(plan.run.startedAt)) {
    throw new Error("A newer optimisation is saved for this version; the older plan was retained without overwriting it.");
  }
  let writeError;
  try { await bounded("plan-version-update", () => writePlan(plan)); }
  catch (error) { writeError = error; }
  // An acknowledgement may fail after a successful write. Always read first;
  // a Retry must reuse an exact stored result rather than create another run.
  let saved;
  try { saved = await read("plan-readback-verification"); }
  catch (error) { throw new Error([writeError?.message, error.message].filter(Boolean).join(" / ")); }
  if (!sameCompletedPlan(saved, plan)) {
    throw new Error(writeError?.message || "The version update returned, but readback did not contain the exact completed plan.");
  }
  return {at: Date.now(), reused: false, acknowledgementRecovered: !!writeError};
}
