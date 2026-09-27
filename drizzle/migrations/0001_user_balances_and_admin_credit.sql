-- Store registration details and simulated USDT balances for each account.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS serial_num TEXT;

CREATE TABLE IF NOT EXISTS public.user_balances (
  user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  usdt NUMERIC(20, 8) NOT NULL DEFAULT 0 CHECK (usdt >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.user_balances ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.user_balances TO authenticated;
GRANT ALL ON public.user_balances TO service_role;

CREATE POLICY "own balance read" ON public.user_balances FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

ALTER PUBLICATION supabase_realtime ADD TABLE public.user_balances;

INSERT INTO public.user_balances (user_id)
SELECT id FROM public.profiles
ON CONFLICT (user_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.initialize_new_member()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  member_phone TEXT;
BEGIN
  member_phone := COALESCE(NEW.raw_user_meta_data ->> 'phone', NEW.phone);
  IF member_phone IS NOT NULL THEN
    INSERT INTO public.profiles (id, phone, serial_num)
    VALUES (NEW.id, member_phone, NEW.raw_user_meta_data ->> 'serial_num')
    ON CONFLICT (id) DO UPDATE
      SET phone = EXCLUDED.phone,
          serial_num = COALESCE(EXCLUDED.serial_num, public.profiles.serial_num);
    INSERT INTO public.user_balances (user_id) VALUES (NEW.id)
    ON CONFLICT (user_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS initialize_new_member_after_signup ON auth.users;
CREATE TRIGGER initialize_new_member_after_signup
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.initialize_new_member();

CREATE OR REPLACE FUNCTION public.admin_credit_user(_user_id UUID, _amount NUMERIC)
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
  IF _amount IS NULL OR _amount <= 0 OR _amount > 1000000000 THEN
    RAISE EXCEPTION 'Amount must be greater than zero and at most 1000000000';
  END IF;
  INSERT INTO public.user_balances (user_id, usdt)
  SELECT id, _amount FROM public.profiles WHERE id = _user_id
  ON CONFLICT (user_id) DO UPDATE
    SET usdt = public.user_balances.usdt + EXCLUDED.usdt,
        updated_at = now()
  RETURNING usdt INTO next_balance;
  IF next_balance IS NULL THEN
    RAISE EXCEPTION 'Registered user not found';
  END IF;
  RETURN next_balance;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_credit_user(UUID, NUMERIC) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_credit_user(UUID, NUMERIC) TO authenticated;
