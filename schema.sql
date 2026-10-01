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

REVOKE ALL ON FUNCTION public.record_stock_movement(uuid, text, integer, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_stock_movement(uuid, text, integer, text) TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.categories, public.suppliers, public.products, public.stock_movements TO service_role;
