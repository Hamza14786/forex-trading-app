-- Allow admins to set a member's simulated USDT balance to an exact amount.
CREATE OR REPLACE FUNCTION public.admin_set_user_balance(_user_id UUID, _amount NUMERIC)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  next_balance NUMERIC(20, 8);
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;
  IF _amount IS NULL OR _amount < 0 OR _amount > 1000000000 THEN
    RAISE EXCEPTION 'Amount must be between zero and 1000000000';
  END IF;
  INSERT INTO public.user_balances (user_id, usdt)
  SELECT id, _amount FROM public.profiles WHERE id = _user_id
  ON CONFLICT (user_id) DO UPDATE
    SET usdt = EXCLUDED.usdt,
        updated_at = now()
  RETURNING usdt INTO next_balance;
  IF next_balance IS NULL THEN
    RAISE EXCEPTION 'Registered user not found';
  END IF;
  RETURN next_balance;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_set_user_balance(UUID, NUMERIC) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_set_user_balance(UUID, NUMERIC) TO authenticated;
