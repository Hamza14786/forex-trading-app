CREATE TABLE public.profit_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  admin_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  account TEXT NOT NULL CHECK (account IN ('Spot', 'Futures')),
  amount NUMERIC(20, 8) NOT NULL CHECK (amount > 0),
  percentage NUMERIC(20, 8) CHECK (percentage IS NULL OR percentage > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.profit_history ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.profit_history TO authenticated;

CREATE POLICY "admins read profit history" ON public.profit_history FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.admin_send_profit(
  _user_id UUID,
  _account TEXT,
  _amount NUMERIC DEFAULT NULL,
  _percentage NUMERIC DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  admin_id UUID := auth.uid();
  current_balance NUMERIC(20, 8);
  profit_amount NUMERIC(20, 8);
  percentage_used NUMERIC(20, 8);
  next_balance NUMERIC(20, 8);
  entry_id UUID;
  entry_created_at TIMESTAMPTZ;
BEGIN
  IF admin_id IS NULL OR NOT public.has_role(admin_id, 'admin') THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;
  IF _account IS NULL OR _account NOT IN ('Spot', 'Futures') THEN
    RAISE EXCEPTION 'Account must be Spot or Futures';
  END IF;
  IF (_amount IS NULL) = (_percentage IS NULL) THEN
    RAISE EXCEPTION 'Provide either a fixed amount or a percentage';
  END IF;
  IF _amount IS NOT NULL AND (_amount <= 0 OR _amount > 1000000000) THEN
    RAISE EXCEPTION 'Fixed profit must be greater than zero and at most 1000000000 USDT';
  END IF;
  IF _percentage IS NOT NULL AND (_percentage <= 0 OR _percentage > 10000) THEN
    RAISE EXCEPTION 'Percentage must be greater than zero and at most 10000';
  END IF;
  IF _percentage IS NOT NULL THEN
    percentage_used := round(_percentage, 8);
    IF percentage_used <= 0 THEN
      RAISE EXCEPTION 'Percentage must be at least 0.00000001';
    END IF;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = _user_id) THEN
    RAISE EXCEPTION 'Registered user not found';
  END IF;

  INSERT INTO public.user_balances (user_id) VALUES (_user_id)
  ON CONFLICT (user_id) DO NOTHING;
  SELECT CASE WHEN _account = 'Spot' THEN usdt ELSE futures_usdt END
    INTO current_balance
    FROM public.user_balances
    WHERE user_id = _user_id
    FOR UPDATE;

  IF _percentage IS NOT NULL THEN
    IF current_balance <= 0 THEN
      RAISE EXCEPTION 'Cannot calculate percentage profit from a zero balance';
    END IF;
    profit_amount := round(current_balance * percentage_used / 100, 8);
  ELSE
    profit_amount := _amount;
  END IF;
  IF profit_amount <= 0 OR profit_amount > 1000000000 THEN
    RAISE EXCEPTION 'Calculated profit must be greater than zero and at most 1000000000 USDT';
  END IF;

  UPDATE public.user_balances
    SET usdt = CASE WHEN _account = 'Spot' THEN usdt + profit_amount ELSE usdt END,
        futures_usdt = CASE WHEN _account = 'Futures' THEN futures_usdt + profit_amount ELSE futures_usdt END,
        updated_at = now()
    WHERE user_id = _user_id
    RETURNING CASE WHEN _account = 'Spot' THEN usdt ELSE futures_usdt END INTO next_balance;

  INSERT INTO public.profit_history (user_id, admin_user_id, account, amount, percentage)
    VALUES (_user_id, admin_id, _account, profit_amount, percentage_used)
    RETURNING id, created_at INTO entry_id, entry_created_at;

  RETURN jsonb_build_object(
    'id', entry_id,
    'user_id', _user_id,
    'account', _account,
    'amount', profit_amount,
    'percentage', percentage_used,
    'balance', next_balance,
    'created_at', entry_created_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_send_profit(UUID, TEXT, NUMERIC, NUMERIC) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_send_profit(UUID, TEXT, NUMERIC, NUMERIC) TO authenticated;
