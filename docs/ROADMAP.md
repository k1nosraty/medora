# Outstanding release gates

**NOT READY.** Use the [verification record](REBUILD_VERIFICATION.md) for completed local and CI runs and the [deployment checklist](DEPLOYMENT.md) for an authorized release review.

| Gate | Current scope | Remaining evidence |
| --- | --- | --- |
| Product and repository | The React product owns the standard routes. Journal, Admin, Campaign Preview, Pilot and Design Gallery have independent entry points. The clean-room command builds and exercises the product without legacy source packages. | Full candidate CI, native Safari direct navigation, screen-reader and physical mobile review for release. |
| Data and rollback | Local fixtures exercise IndexedDB v1–v3, the encrypted formats present in the repository, lost acknowledgements and the Workerd ↔ Node transfer after writes. | **BLOCKED** on the complete authorized [source input set](MIGRATION.md#authorized-reconciliation-inputs). Confirm historical formats, key continuity, census completeness, pending work and actual source recovery. |
| Hosted staging | The local renderer checks dedicated resource configuration. Synthetic local services exercise PostgreSQL, R2/S3, the gateway, mail and restore. | **BLOCKED** until dedicated hosted resources and separate deployment approval are available. Run the staging checks against those resources. |
| Notifications and installed app | Browser emulation, loopback mail, synthetic Web Push and a prior native iPhone Safari tab check provide separate evidence. | Actual Home Screen install and delivery on iOS, representative delivery from hosted push and email providers, and a production-scale outbox drain. |
| Performance and fleet cutover | Loopback startup benchmarks and isolated write-fence and recovery drills are reproducible. | Representative histories and device limits, hosted capacity, and affirmative verification that all old writers are drained before an approved cutover. |
