-- Optional: enable read-only access for the GitHub Pages frontend.
-- The publishable key is public; these grants and policies are the security boundary.

BEGIN;

REVOKE ALL PRIVILEGES ON TABLE
  public.categories,
  public.suppliers,
  public.products,
  public.stock_movements
FROM anon, authenticated;

GRANT USAGE ON SCHEMA public TO anon;

GRANT SELECT (id, name) ON public.categories TO anon;
GRANT SELECT (id, name) ON public.suppliers TO anon;
GRANT SELECT (id, sku, name, category_id, supplier_id, unit, unit_cost, minimum_stock, stock_quantity, created_at)
  ON public.products TO anon;
GRANT SELECT (id, product_id, movement_type, quantity, note, created_at)
  ON public.stock_movements TO anon;

DROP POLICY IF EXISTS public_read_categories ON public.categories;
CREATE POLICY public_read_categories ON public.categories
  FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS public_read_suppliers ON public.suppliers;
CREATE POLICY public_read_suppliers ON public.suppliers
  FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS public_read_products ON public.products;
CREATE POLICY public_read_products ON public.products
  FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS public_read_stock_movements ON public.stock_movements;
CREATE POLICY public_read_stock_movements ON public.stock_movements
  FOR SELECT TO anon USING (true);

COMMIT;