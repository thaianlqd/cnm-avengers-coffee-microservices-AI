-- Apply through the deployment migration process, never during a request.
CREATE SCHEMA IF NOT EXISTS analytics;
CREATE TABLE IF NOT EXISTS analytics.analysis_modules (
    module_id text NOT NULL,
    owner_key text NOT NULL,
    name varchar(120) NOT NULL,
    description varchar(500) NOT NULL DEFAULT '',
    definition jsonb NOT NULL,
    archived boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    last_run_at timestamptz,
    last_report_id text,
    run_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
    PRIMARY KEY (owner_key, module_id)
);
CREATE INDEX IF NOT EXISTS analysis_modules_owner_recent
    ON analytics.analysis_modules(owner_key, archived, updated_at DESC);
