// Only a process configured for the fenced source cohort may write to a
// PostgreSQL rehearsal. Old processes have no setting and fail the SQL guard.
export function writerConnectionOptions(sourceFence: string | undefined) {
  return sourceFence === "true"
    ? { options: "-c medora.source_fenced=true" }
    : {};
}
