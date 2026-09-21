# Phase 4C migration provenance

The managed JARVIS reader mapping hardening SQL was reviewed locally as
`20260921054905_harden_jarvis_reader_identities_service_role_privileges.sql`.

The Supabase `apply_migration` mechanism generated and recorded the same SQL
in Production under version `20260921055629`.

The recorded Production statement is semantically identical to the reviewed
local artifact. Its normalized SQL MD5 is
`48889c9b941a7cf6f36952a50b9043fb`; the only serialization difference is the
omitted terminal newline in the recorded statement. The local artifact SHA-256
is `E397C8B66949505565CAB6EFFDB30EDAE7C02416E36DEDA4EEAFFB73EFF7C6AE`.

The local unpublished migration was aligned to the Production-generated
version before publication. Production migration history was not edited or
repaired. No migration should be replayed solely to repair this provenance
alignment.
