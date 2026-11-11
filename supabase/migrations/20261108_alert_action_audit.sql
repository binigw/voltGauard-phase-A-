-- SIGMO P0-A §3 — durable actor audit for alert dismiss/restore actions.
-- Append-only by database trigger; inaccessible to anon/authenticated clients.

BEGIN;

CREATE TABLE IF NOT EXISTS public.alert_action_audit (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    alert_id            TEXT        NOT NULL,
    motor_id            TEXT        NOT NULL,
    alert_key           TEXT        NOT NULL,
    action              TEXT        NOT NULL CHECK (action IN ('dismiss', 'restore')),
    actor_user_id       UUID        NOT NULL,
    actor_role          TEXT        NOT NULL CHECK (actor_role IN ('admin', 'technician')),
    actor_email         TEXT,
    acted_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    request_id          TEXT        NOT NULL CHECK (length(request_id) BETWEEN 1 AND 128),
    outcome             TEXT        NOT NULL CHECK (
        outcome IN ('dismissed', 'restored', 'already_visible')
    )
);

CREATE INDEX IF NOT EXISTS idx_alert_action_audit_alert
    ON public.alert_action_audit (alert_id, acted_at DESC);
CREATE INDEX IF NOT EXISTS idx_alert_action_audit_actor
    ON public.alert_action_audit (actor_user_id, acted_at DESC);

CREATE OR REPLACE FUNCTION public.prevent_alert_action_audit_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'alert_action_audit is append-only';
END;
$$;

DROP TRIGGER IF EXISTS trg_alert_action_audit_append_only
    ON public.alert_action_audit;
CREATE TRIGGER trg_alert_action_audit_append_only
BEFORE UPDATE OR DELETE ON public.alert_action_audit
FOR EACH ROW EXECUTE FUNCTION public.prevent_alert_action_audit_mutation();

ALTER TABLE public.alert_action_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.alert_action_audit FROM anon, authenticated;
REVOKE ALL ON SEQUENCE public.alert_action_audit_id_seq FROM anon, authenticated;

COMMIT;
