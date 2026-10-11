-- Enable public CRUD for the GitHub Pages demo.
-- Anyone with the public site can change rows; use demo data only.

BEGIN;

GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.categories, public.suppliers, public.products, public.stock_movements
  TO anon, authenticated;

DROP POLICY IF EXISTS public_full_categories ON public.categories;
CREATE POLICY public_full_categories ON public.categories
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS public_full_suppliers ON public.suppliers;
CREATE POLICY public_full_suppliers ON public.suppliers
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS public_full_products ON public.products;
CREATE POLICY public_full_products ON public.products
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS public_full_stock_movements ON public.stock_movements;
CREATE POLICY public_full_stock_movements ON public.stock_movements
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

GRANT EXECUTE ON FUNCTION public.record_stock_movement(uuid, text, integer, text)
  TO anon, authenticated;

COMMIT;
