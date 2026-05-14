-- 054_prompts_activate_function.sql
-- Atomic activate_prompt(id) — siblings deactivate + self activate 를 단일 트랜잭션으로 묶음.
-- PostgREST 의 분리된 두 UPDATE 요청 사이 race 가 unique partial index 위반을 일으키는 문제 회피.
--
-- Author: SPEC-PROMPT-REGISTRY-001 review fix (2026-05-14)

BEGIN;

CREATE OR REPLACE FUNCTION activate_prompt(p_id bigint)
RETURNS prompts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_situation text;
  v_row prompts;
BEGIN
  -- 대상 row lock + situation 획득
  SELECT situation INTO v_situation
    FROM prompts WHERE id = p_id FOR UPDATE;
  IF v_situation IS NULL THEN
    RAISE EXCEPTION 'prompt id % not found', p_id;
  END IF;

  -- 같은 situation 의 다른 row 들 deactivate (자기 자신 제외)
  UPDATE prompts
    SET is_active = false
    WHERE situation = v_situation AND id <> p_id AND is_active = true;

  -- 본인 activate
  UPDATE prompts
    SET is_active = true
    WHERE id = p_id
    RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

COMMENT ON FUNCTION activate_prompt IS
  'Atomically set is_active=true for given prompt id, deactivating sibling rows of the same situation. Avoids race violations of idx_prompts_active_per_situation between two separate UPDATEs.';

-- PostgREST 가 RPC 로 노출하려면 public schema 함수면 자동 노출.
-- app_user role 에 EXECUTE 권한 부여
GRANT EXECUTE ON FUNCTION activate_prompt(bigint) TO app_user;

COMMIT;
