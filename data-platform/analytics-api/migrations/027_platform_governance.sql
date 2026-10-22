-- V3.4 additive metadata migration. Review/deploy explicitly, never at startup.
-- Prerequisite:026_analysis_modules.sql. No fact rows/views are replaced.
-- No credential values or business-user ownership guesses belong in this file.
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '30s';

DO $$ BEGIN
    IF to_regclass('analytics.saved_reports') IS NULL
       OR to_regclass('analytics.analysis_modules') IS NULL THEN
        RAISE EXCEPTION 'Apply the baseline report schema and026_analysis_modules.sql first';
    END IF;
END $$;

ALTER TABLE analytics.saved_reports ADD COLUMN IF NOT EXISTS owner_key text;
ALTER TABLE analytics.saved_reports ADD COLUMN IF NOT EXISTS owner_type text NOT NULL DEFAULT 'legacy';
ALTER TABLE analytics.saved_reports ADD COLUMN IF NOT EXISTS access_policy_fingerprint text;
ALTER TABLE analytics.saved_reports ADD COLUMN IF NOT EXISTS semantic_contract_version text;
-- Existing ownerless reports deliberately remain legacy/admin-quarantined.
CREATE INDEX IF NOT EXISTS saved_reports_owner_recent
    ON analytics.saved_reports(owner_key, updated_at DESC);

CREATE TABLE IF NOT EXISTS analytics.audit_events (
    event_id uuid PRIMARY KEY,
    actor_key text NOT NULL,
    action varchar(80) NOT NULL,
    resource_type varchar(40) NOT NULL,
    resource_key varchar(256),
    decision varchar(16) NOT NULL CHECK (decision IN ('allowed','denied','failed','completed')),
    policy_fingerprint varchar(64),
    scope_fingerprint varchar(64),
    query_fingerprint varchar(64),
    request_id varchar(64),
    job_id varchar(100),
    occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    details jsonb NOT NULL DEFAULT '{}'::jsonb
        CHECK (jsonb_typeof(details) = 'object'
               AND details - ARRAY['reason','duration_ms','rows','status','dataset_id']::text[] = '{}'::jsonb)
);
CREATE INDEX IF NOT EXISTS audit_events_actor_recent ON analytics.audit_events(actor_key, occurred_at DESC);
CREATE INDEX IF NOT EXISTS audit_events_request ON analytics.audit_events(request_id, job_id);

CREATE TABLE IF NOT EXISTS analytics.ingestion_checkpoints (
    dataset_id text PRIMARY KEY,
    cursor_time timestamptz,
    cursor_keys jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(cursor_keys) = 'array'),
    source_upper_bound timestamptz,
    generation bigint NOT NULL DEFAULT 0 CHECK (generation >= 0),
    schema_fingerprint varchar(64),
    last_attempt_at timestamptz,
    last_success_at timestamptz,
    last_full_reconcile_at timestamptz,
    observed_rows bigint CHECK (observed_rows >= 0),
    completeness varchar(16) NOT NULL DEFAULT 'unknown' CHECK (completeness IN ('unknown','partial','complete')),
    certificate jsonb,
    error_code varchar(80),
    CHECK (completeness <> 'complete' OR certificate IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS analytics.pipeline_runs (
    run_id varchar(100) PRIMARY KEY,
    dataset_id text NOT NULL,
    pipeline varchar(60) NOT NULL,
    status varchar(20) NOT NULL CHECK (status IN ('staged','partial','committed','failed')),
    contract_fingerprint varchar(64) NOT NULL,
    manifest_fingerprint varchar(64),
    started_at timestamptz NOT NULL,
    finished_at timestamptz,
    manifest jsonb NOT NULL CHECK (jsonb_typeof(manifest) = 'object')
);
CREATE INDEX IF NOT EXISTS pipeline_runs_dataset_recent ON analytics.pipeline_runs(dataset_id, started_at DESC);

CREATE TABLE IF NOT EXISTS analytics.stream_checkpoints (
    stream_id varchar(100) PRIMARY KEY,
    generation bigint NOT NULL DEFAULT 0 CHECK (generation >= 0),
    contract_fingerprint varchar(64) NOT NULL,
    state jsonb NOT NULL CHECK (jsonb_typeof(state) = 'object'),
    last_success_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE IF NOT EXISTS analytics.gold_dataset_versions (
    pipeline varchar(60) NOT NULL,
    run_id varchar(100) NOT NULL,
    dataset_id varchar(150) NOT NULL,
    content_hash varchar(64) NOT NULL,
    row_count bigint NOT NULL CHECK (row_count >= 0),
    payload jsonb NOT NULL,
    PRIMARY KEY (pipeline,run_id,dataset_id)
);
CREATE TABLE IF NOT EXISTS analytics.pipeline_publications (
    pipeline varchar(60) PRIMARY KEY,
    run_id varchar(100) NOT NULL REFERENCES analytics.pipeline_runs(run_id),
    manifest_fingerprint varchar(64) NOT NULL,
    requested_as_of timestamptz NOT NULL,
    published_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

-- Kafka projection is idempotent by broker position. Legacy events have NULL
-- positions and are not retroactively represented as deduplicated events.
CREATE TABLE IF NOT EXISTS public.realtime_events (
    id bigserial PRIMARY KEY,
    topic varchar(100) NOT NULL,
    event_key varchar(255),
    event_type varchar(100),
    payload jsonb NOT NULL,
    received_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.realtime_events ADD COLUMN IF NOT EXISTS kafka_partition integer;
ALTER TABLE public.realtime_events ADD COLUMN IF NOT EXISTS kafka_offset bigint;
ALTER TABLE public.realtime_events ADD COLUMN IF NOT EXISTS event_id varchar(64);
CREATE UNIQUE INDEX IF NOT EXISTS realtime_events_broker_position
    ON public.realtime_events(topic, kafka_partition, kafka_offset)
    WHERE kafka_partition IS NOT NULL AND kafka_offset IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS realtime_events_stable_event
    ON public.realtime_events(event_id) WHERE event_id IS NOT NULL;

-- Non-login permission groups. Deployment creates separate login credentials
-- and grants membership after testing the reader/writer connection adapters.
-- Dataset/column SELECT grants are generated from the governed catalog policy;
-- no blanket grants on raw commerce schemas or sensitive columns are made here.
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='avengers_analytics_reader') THEN
        CREATE ROLE avengers_analytics_reader NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='avengers_report_writer') THEN
        CREATE ROLE avengers_report_writer NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='avengers_pipeline_writer') THEN
        CREATE ROLE avengers_pipeline_writer NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
    END IF;
END $$;
GRANT USAGE ON SCHEMA silver TO avengers_analytics_reader;
GRANT USAGE ON SCHEMA analytics TO avengers_analytics_reader;
GRANT SELECT ON analytics.ingestion_checkpoints,analytics.pipeline_publications TO avengers_analytics_reader;
GRANT USAGE ON SCHEMA analytics TO avengers_report_writer, avengers_pipeline_writer;
GRANT SELECT, INSERT, UPDATE, DELETE ON analytics.saved_reports, analytics.analysis_modules TO avengers_report_writer;
GRANT INSERT ON analytics.audit_events TO avengers_report_writer;
GRANT SELECT, INSERT, UPDATE ON analytics.ingestion_checkpoints, analytics.pipeline_runs,
    analytics.stream_checkpoints, analytics.pipeline_publications TO avengers_pipeline_writer;
GRANT SELECT, INSERT ON analytics.gold_dataset_versions TO avengers_pipeline_writer;
-- API roles cannot UPDATE/DELETE audit history; no startup/request DDL granted.
COMMIT;
