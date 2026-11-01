# MongoDB live diagnostic

The owner requested a live credential test in the local workspace. The original
connector failed to load databases because the configured host did not resolve
to an address (ENOTFOUND); it did have MongoDB SRV records. The current
connector supports a direct TLS hostname, not SRV/replica-set discovery.

For diagnosis only, a temporary local patch resolved the SRV record and used
one returned host through the existing guarded DNS connection. Listing
databases succeeded. An owner-requested live manual-trigger workflow then ran
`find` on a probe collection in the `test` database with a filter matching
missing `_id` and a limit of one; the node succeeded and returned zero
documents. No insert, update, or delete was performed. The test workflow was
deactivated and the temporary patch was removed; source returned to the
previous commit. This diagnostic does not qualify the current SRV connector,
replica-set failover, insert, or production deployment.

No credentials, hostname, or personal documents are included in this report.
