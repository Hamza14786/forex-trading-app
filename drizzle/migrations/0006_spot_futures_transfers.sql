ALTER TABLE public.user_balances
  ADD COLUMN IF NOT EXISTS futures_usdt NUMERIC(20, 8) NOT NULL DEFAULT 0 CHECK (futures_usdt >= 0);

CREATE OR REPLACE FUNCTION public.transfer_usdt_between_accounts(
  _from_account TEXT,
  _to_account TEXT,
  _amount NUMERIC
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  member_id UUID := auth.uid();
  spot_balance NUMERIC(20, 8);
  futures_balance NUMERIC(20, 8);
BEGIN
  IF member_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF _from_account IS NULL OR _to_account IS NULL
     OR _from_account NOT IN ('Spot', 'Futures') OR _to_account NOT IN ('Spot', 'Futures')
     OR _from_account = _to_account THEN
    RAISE EXCEPTION 'Invalid transfer accounts';
  END IF;
  IF _amount IS NULL OR _amount <= 0 OR _amount > 1000000000 THEN
    RAISE EXCEPTION 'Invalid transfer amount';
  END IF;

  INSERT INTO public.user_balances (user_id) VALUES (member_id)
  ON CONFLICT (user_id) DO NOTHING;
  SELECT usdt, futures_usdt INTO spot_balance, futures_balance
  FROM public.user_balances WHERE user_id = member_id FOR UPDATE;

  IF _from_account = 'Spot' THEN
    IF spot_balance < _amount THEN RAISE EXCEPTION 'Insufficient balance'; END IF;
    UPDATE public.user_balances
    SET usdt = usdt - _amount, futures_usdt = futures_usdt + _amount, updated_at = now()
    WHERE user_id = member_id;
  ELSE
    IF futures_balance < _amount THEN RAISE EXCEPTION 'Insufficient balance'; END IF;
    UPDATE public.user_balances
    SET futures_usdt = futures_usdt - _amount, usdt = usdt + _amount, updated_at = now()
    WHERE user_id = member_id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.transfer_usdt_between_accounts(TEXT, TEXT, NUMERIC) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.transfer_usdt_between_accounts(TEXT, TEXT, NUMERIC) TO authenticated;
