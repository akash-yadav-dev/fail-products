ALTER TABLE "product_slug_history" DROP CONSTRAINT "product_slug_history_product_id_products_id_fk";
--> statement-breakpoint
ALTER TABLE "products" DROP CONSTRAINT "products_owner_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "product_slug_history" ALTER COLUMN "product_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ALTER COLUMN "owner_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "product_slug_history" ADD CONSTRAINT "product_slug_history_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
-- ADR-019: slug uniqueness spans current and retired slugs. Advisory locking
-- makes the cross-table check safe when two requests race on the same slug.
CREATE OR REPLACE FUNCTION enforce_product_slug_global_uniqueness()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.slug, 0));

  IF TG_TABLE_NAME = 'products' THEN
    IF EXISTS (
      SELECT 1 FROM product_slug_history WHERE slug = NEW.slug
    ) THEN
      RAISE EXCEPTION 'product slug is reserved: %', NEW.slug
        USING ERRCODE = '23505';
    END IF;
  ELSE
    IF EXISTS (
      SELECT 1 FROM products WHERE slug = NEW.slug
    ) THEN
      RAISE EXCEPTION 'product slug is currently in use: %', NEW.slug
        USING ERRCODE = '23505';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER products_slug_global_unique
  BEFORE INSERT OR UPDATE OF slug ON products
  FOR EACH ROW EXECUTE FUNCTION enforce_product_slug_global_uniqueness();
--> statement-breakpoint
CREATE TRIGGER product_slug_history_global_unique
  BEFORE INSERT OR UPDATE OF slug ON product_slug_history
  FOR EACH ROW EXECUTE FUNCTION enforce_product_slug_global_uniqueness();
