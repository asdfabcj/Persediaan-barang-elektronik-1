-- ERD: categories 1..n products, suppliers 1..n products, products 1..n stock_movements.

CREATE TABLE IF NOT EXISTS public.categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  contact_name text,
  phone text,
  email text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sku text NOT NULL UNIQUE,
  name text NOT NULL,
  category_id uuid NOT NULL REFERENCES public.categories(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  supplier_id uuid NOT NULL REFERENCES public.suppliers(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  unit text NOT NULL DEFAULT 'unit',
  unit_cost numeric(14, 2) NOT NULL DEFAULT 0 CHECK (unit_cost >= 0),
  minimum_stock integer NOT NULL DEFAULT 0 CHECK (minimum_stock >= 0),
  stock_quantity integer NOT NULL DEFAULT 0 CHECK (stock_quantity >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.stock_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  movement_type text NOT NULL CHECK (movement_type IN ('in', 'out')),
  quantity integer NOT NULL CHECK (quantity > 0),
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS products_category_id_idx ON public.products(category_id);
CREATE INDEX IF NOT EXISTS products_supplier_id_idx ON public.products(supplier_id);
CREATE INDEX IF NOT EXISTS stock_movements_product_created_idx ON public.stock_movements(product_id, created_at DESC);
CREATE INDEX IF NOT EXISTS stock_movements_created_at_idx ON public.stock_movements(created_at DESC);

ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.record_stock_movement(
  p_product_id uuid,
  p_movement_type text,
  p_quantity integer,
  p_note text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  current_stock integer;
  movement_id uuid := gen_random_uuid();
BEGIN
  IF p_movement_type NOT IN ('in', 'out') THEN
    RAISE EXCEPTION 'Jenis mutasi harus in atau out.' USING ERRCODE = '22023';
  END IF;
  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'Jumlah mutasi harus lebih dari nol.' USING ERRCODE = '22023';
  END IF;

  SELECT stock_quantity INTO current_stock
  FROM public.products
  WHERE id = p_product_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Barang tidak ditemukan.' USING ERRCODE = 'P0002';
  END IF;
  IF p_movement_type = 'out' AND current_stock < p_quantity THEN
    RAISE EXCEPTION 'Stok tidak mencukupi.' USING ERRCODE = '23514';
  END IF;

  UPDATE public.products
  SET stock_quantity = CASE
    WHEN p_movement_type = 'in' THEN stock_quantity + p_quantity
    ELSE stock_quantity - p_quantity
  END,
  updated_at = now()
  WHERE id = p_product_id;

  INSERT INTO public.stock_movements (id, product_id, movement_type, quantity, note)
  VALUES (movement_id, p_product_id, p_movement_type, p_quantity, NULLIF(trim(p_note), ''));

  RETURN movement_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_stock_movement(
  p_movement_id uuid,
  p_product_id uuid,
  p_movement_type text,
  p_quantity integer,
  p_note text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  movement public.stock_movements%ROWTYPE;
  old_delta integer;
  new_delta integer;
  old_stock integer;
  new_stock integer;
BEGIN
  IF p_product_id IS NULL OR p_movement_type IS NULL OR p_movement_type NOT IN ('in', 'out') THEN
    RAISE EXCEPTION 'Barang dan jenis mutasi yang valid wajib diisi.' USING ERRCODE = '22023';
  END IF;
  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'Jumlah mutasi harus lebih dari nol.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO movement
  FROM public.stock_movements
  WHERE id = p_movement_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Mutasi tidak ditemukan.' USING ERRCODE = 'P0002';
  END IF;

  PERFORM id
  FROM public.products
  WHERE id IN (movement.product_id, p_product_id)
  ORDER BY id
  FOR UPDATE;

  SELECT stock_quantity INTO old_stock
  FROM public.products
  WHERE id = movement.product_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Barang mutasi tidak ditemukan.' USING ERRCODE = 'P0002';
  END IF;

  old_delta := CASE WHEN movement.movement_type = 'in' THEN movement.quantity ELSE -movement.quantity END;
  new_delta := CASE WHEN p_movement_type = 'in' THEN p_quantity ELSE -p_quantity END;

  IF movement.product_id = p_product_id THEN
    new_stock := old_stock - old_delta + new_delta;
    IF new_stock < 0 THEN
      RAISE EXCEPTION 'Mutasi tidak dapat diubah karena stok akan menjadi negatif.' USING ERRCODE = '23514';
    END IF;
    UPDATE public.products SET stock_quantity = new_stock, updated_at = now() WHERE id = movement.product_id;
  ELSE
    SELECT stock_quantity INTO new_stock
    FROM public.products
    WHERE id = p_product_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Barang baru tidak ditemukan.' USING ERRCODE = 'P0002';
    END IF;
    old_stock := old_stock - old_delta;
    new_stock := new_stock + new_delta;
    IF old_stock < 0 OR new_stock < 0 THEN
      RAISE EXCEPTION 'Mutasi tidak dapat dipindahkan karena saldo salah satu barang akan menjadi negatif.' USING ERRCODE = '23514';
    END IF;
    UPDATE public.products SET stock_quantity = old_stock, updated_at = now() WHERE id = movement.product_id;
    UPDATE public.products SET stock_quantity = new_stock, updated_at = now() WHERE id = p_product_id;
  END IF;

  UPDATE public.stock_movements
  SET product_id = p_product_id,
      movement_type = p_movement_type,
      quantity = p_quantity,
      note = NULLIF(trim(p_note), '')
  WHERE id = p_movement_id;

  RETURN p_movement_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_stock_movement(p_movement_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  movement public.stock_movements%ROWTYPE;
  stock_delta integer;
  adjusted_stock integer;
BEGIN
  SELECT * INTO movement
  FROM public.stock_movements
  WHERE id = p_movement_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Mutasi tidak ditemukan.' USING ERRCODE = 'P0002';
  END IF;

  SELECT stock_quantity INTO adjusted_stock
  FROM public.products
  WHERE id = movement.product_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Barang mutasi tidak ditemukan.' USING ERRCODE = 'P0002';
  END IF;

  stock_delta := CASE WHEN movement.movement_type = 'in' THEN movement.quantity ELSE -movement.quantity END;
  adjusted_stock := adjusted_stock - stock_delta;
  IF adjusted_stock < 0 THEN
    RAISE EXCEPTION 'Mutasi tidak dapat dihapus karena stok terkait sudah digunakan.' USING ERRCODE = '23514';
  END IF;

  UPDATE public.products SET stock_quantity = adjusted_stock, updated_at = now() WHERE id = movement.product_id;
  DELETE FROM public.stock_movements WHERE id = p_movement_id;
  RETURN p_movement_id;
END;
$$;

REVOKE ALL ON FUNCTION public.record_stock_movement(uuid, text, integer, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_stock_movement(uuid, uuid, text, integer, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.delete_stock_movement(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_stock_movement(uuid, text, integer, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.update_stock_movement(uuid, uuid, text, integer, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.delete_stock_movement(uuid) TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.categories, public.suppliers, public.products, public.stock_movements TO service_role;