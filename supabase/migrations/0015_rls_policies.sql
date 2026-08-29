-- CLX Phase 18B-3: Granular Row Level Security (RLS) Policies
-- Implements granular security policies for all 26 public application tables.
-- Uses existing SECURITY DEFINER helper functions:
--   - public.is_admin()
--   - public.has_role(public.app_role)
--   - public.get_user_vendor_ids()
--   - public.owns_vendor(uuid)
-- NOTE: Idempotent - drops existing policy if it exists before creating.

-- ============================================================================
-- 1. CAMPUSES
-- ============================================================================
DROP POLICY IF EXISTS "campuses_select_public" ON public.campuses;
CREATE POLICY "campuses_select_public" ON public.campuses
  FOR SELECT
  USING (is_active = true OR public.is_admin());

DROP POLICY IF EXISTS "campuses_admin_manage" ON public.campuses;
CREATE POLICY "campuses_admin_manage" ON public.campuses
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ============================================================================
-- 2. CATEGORIES
-- ============================================================================
DROP POLICY IF EXISTS "categories_select_public" ON public.categories;
CREATE POLICY "categories_select_public" ON public.categories
  FOR SELECT
  USING (is_active = true OR public.is_admin());

DROP POLICY IF EXISTS "categories_admin_manage" ON public.categories;
CREATE POLICY "categories_admin_manage" ON public.categories
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ============================================================================
-- 3. DELIVERY ZONES
-- ============================================================================
DROP POLICY IF EXISTS "delivery_zones_select_public" ON public.delivery_zones;
CREATE POLICY "delivery_zones_select_public" ON public.delivery_zones
  FOR SELECT
  USING (is_active = true OR public.is_admin());

DROP POLICY IF EXISTS "delivery_zones_admin_manage" ON public.delivery_zones;
CREATE POLICY "delivery_zones_admin_manage" ON public.delivery_zones
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ============================================================================
-- 4. PROFILES
-- ============================================================================
DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
CREATE POLICY "profiles_select_own" ON public.profiles
  FOR SELECT
  TO authenticated
  USING (id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "profiles_insert_own" ON public.profiles;
CREATE POLICY "profiles_insert_own" ON public.profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (id = auth.uid() OR public.is_admin())
  WITH CHECK (id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "profiles_admin_delete" ON public.profiles;
CREATE POLICY "profiles_admin_delete" ON public.profiles
  FOR DELETE
  TO authenticated
  USING (public.is_admin());

-- ============================================================================
-- 5. ADDRESSES
-- ============================================================================
DROP POLICY IF EXISTS "addresses_select_own" ON public.addresses;
CREATE POLICY "addresses_select_own" ON public.addresses
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "addresses_insert_own" ON public.addresses;
CREATE POLICY "addresses_insert_own" ON public.addresses
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "addresses_update_own" ON public.addresses;
CREATE POLICY "addresses_update_own" ON public.addresses
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid() OR public.is_admin())
  WITH CHECK (user_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "addresses_delete_own" ON public.addresses;
CREATE POLICY "addresses_delete_own" ON public.addresses
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid() OR public.is_admin());

-- ============================================================================
-- 6. USER ROLES
-- ============================================================================
DROP POLICY IF EXISTS "user_roles_select_own" ON public.user_roles;
CREATE POLICY "user_roles_select_own" ON public.user_roles
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "user_roles_super_admin_manage" ON public.user_roles;
CREATE POLICY "user_roles_super_admin_manage" ON public.user_roles
  FOR ALL
  TO authenticated
  USING (public.has_role('SUPER_ADMIN'::public.app_role))
  WITH CHECK (public.has_role('SUPER_ADMIN'::public.app_role));

-- ============================================================================
-- 7. VENDORS
-- ============================================================================
DROP POLICY IF EXISTS "vendors_select_public" ON public.vendors;
CREATE POLICY "vendors_select_public" ON public.vendors
  FOR SELECT
  USING (
    status = 'ACTIVE'::public.vendor_status
    OR (auth.uid() IS NOT NULL AND owner_user_id = auth.uid())
    OR public.is_admin()
  );

DROP POLICY IF EXISTS "vendors_owner_update" ON public.vendors;
CREATE POLICY "vendors_owner_update" ON public.vendors
  FOR UPDATE
  TO authenticated
  USING (public.owns_vendor(id) OR public.is_admin())
  WITH CHECK (public.owns_vendor(id) OR public.is_admin());

DROP POLICY IF EXISTS "vendors_admin_insert" ON public.vendors;
CREATE POLICY "vendors_admin_insert" ON public.vendors
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "vendors_admin_delete" ON public.vendors;
CREATE POLICY "vendors_admin_delete" ON public.vendors
  FOR DELETE
  TO authenticated
  USING (public.is_admin());

-- ============================================================================
-- 8. VENDOR CAMPUSES
-- ============================================================================
DROP POLICY IF EXISTS "vendor_campuses_select_public" ON public.vendor_campuses;
CREATE POLICY "vendor_campuses_select_public" ON public.vendor_campuses
  FOR SELECT
  USING (
    (is_active = true AND EXISTS (
      SELECT 1 FROM public.vendors v
      WHERE v.id = vendor_campuses.vendor_id AND v.status = 'ACTIVE'::public.vendor_status
    ))
    OR public.owns_vendor(vendor_id)
    OR public.is_admin()
  );

DROP POLICY IF EXISTS "vendor_campuses_owner_insert" ON public.vendor_campuses;
CREATE POLICY "vendor_campuses_owner_insert" ON public.vendor_campuses
  FOR INSERT
  TO authenticated
  WITH CHECK (public.owns_vendor(vendor_id) OR public.is_admin());

DROP POLICY IF EXISTS "vendor_campuses_owner_update" ON public.vendor_campuses;
CREATE POLICY "vendor_campuses_owner_update" ON public.vendor_campuses
  FOR UPDATE
  TO authenticated
  USING (public.owns_vendor(vendor_id) OR public.is_admin())
  WITH CHECK (public.owns_vendor(vendor_id) OR public.is_admin());

DROP POLICY IF EXISTS "vendor_campuses_owner_delete" ON public.vendor_campuses;
CREATE POLICY "vendor_campuses_owner_delete" ON public.vendor_campuses
  FOR DELETE
  TO authenticated
  USING (public.owns_vendor(vendor_id) OR public.is_admin());

-- ============================================================================
-- 9. VENDOR OPERATING HOURS
-- ============================================================================
DROP POLICY IF EXISTS "vendor_operating_hours_select_public" ON public.vendor_operating_hours;
CREATE POLICY "vendor_operating_hours_select_public" ON public.vendor_operating_hours
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.vendors v
      WHERE v.id = vendor_operating_hours.vendor_id AND v.status = 'ACTIVE'::public.vendor_status
    )
    OR public.owns_vendor(vendor_id)
    OR public.is_admin()
  );

DROP POLICY IF EXISTS "vendor_operating_hours_owner_insert" ON public.vendor_operating_hours;
CREATE POLICY "vendor_operating_hours_owner_insert" ON public.vendor_operating_hours
  FOR INSERT
  TO authenticated
  WITH CHECK (public.owns_vendor(vendor_id) OR public.is_admin());

DROP POLICY IF EXISTS "vendor_operating_hours_owner_update" ON public.vendor_operating_hours;
CREATE POLICY "vendor_operating_hours_owner_update" ON public.vendor_operating_hours
  FOR UPDATE
  TO authenticated
  USING (public.owns_vendor(vendor_id) OR public.is_admin())
  WITH CHECK (public.owns_vendor(vendor_id) OR public.is_admin());

DROP POLICY IF EXISTS "vendor_operating_hours_owner_delete" ON public.vendor_operating_hours;
CREATE POLICY "vendor_operating_hours_owner_delete" ON public.vendor_operating_hours
  FOR DELETE
  TO authenticated
  USING (public.owns_vendor(vendor_id) OR public.is_admin());

-- ============================================================================
-- 10. PRODUCTS
-- ============================================================================
DROP POLICY IF EXISTS "products_select_public" ON public.products;
CREATE POLICY "products_select_public" ON public.products
  FOR SELECT
  USING (
    (is_in_stock = true AND EXISTS (
      SELECT 1 FROM public.vendors v
      WHERE v.id = products.vendor_id AND v.status = 'ACTIVE'::public.vendor_status
    ))
    OR public.owns_vendor(vendor_id)
    OR public.is_admin()
  );

DROP POLICY IF EXISTS "products_owner_insert" ON public.products;
CREATE POLICY "products_owner_insert" ON public.products
  FOR INSERT
  TO authenticated
  WITH CHECK (public.owns_vendor(vendor_id) OR public.is_admin());

DROP POLICY IF EXISTS "products_owner_update" ON public.products;
CREATE POLICY "products_owner_update" ON public.products
  FOR UPDATE
  TO authenticated
  USING (public.owns_vendor(vendor_id) OR public.is_admin())
  WITH CHECK (public.owns_vendor(vendor_id) OR public.is_admin());

DROP POLICY IF EXISTS "products_owner_delete" ON public.products;
CREATE POLICY "products_owner_delete" ON public.products
  FOR DELETE
  TO authenticated
  USING (public.owns_vendor(vendor_id) OR public.is_admin());

-- ============================================================================
-- 11. PRODUCT IMAGES
-- ============================================================================
DROP POLICY IF EXISTS "product_images_select_public" ON public.product_images;
CREATE POLICY "product_images_select_public" ON public.product_images
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.products p
      JOIN public.vendors v ON p.vendor_id = v.id
      WHERE p.id = product_images.product_id
        AND p.is_in_stock = true
        AND v.status = 'ACTIVE'::public.vendor_status
    )
    OR EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = product_images.product_id AND public.owns_vendor(p.vendor_id)
    )
    OR public.is_admin()
  );

DROP POLICY IF EXISTS "product_images_owner_insert" ON public.product_images;
CREATE POLICY "product_images_owner_insert" ON public.product_images
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = product_images.product_id AND public.owns_vendor(p.vendor_id)
    )
    OR public.is_admin()
  );

DROP POLICY IF EXISTS "product_images_owner_update" ON public.product_images;
CREATE POLICY "product_images_owner_update" ON public.product_images
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = product_images.product_id AND public.owns_vendor(p.vendor_id)
    )
    OR public.is_admin()
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = product_images.product_id AND public.owns_vendor(p.vendor_id)
    )
    OR public.is_admin()
  );

DROP POLICY IF EXISTS "product_images_owner_delete" ON public.product_images;
CREATE POLICY "product_images_owner_delete" ON public.product_images
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = product_images.product_id AND public.owns_vendor(p.vendor_id)
    )
    OR public.is_admin()
  );

-- ============================================================================
-- 12. SERVICES
-- ============================================================================
DROP POLICY IF EXISTS "services_select_public" ON public.services;
CREATE POLICY "services_select_public" ON public.services
  FOR SELECT
  USING (
    is_active = true
    OR (auth.uid() IS NOT NULL AND provider_user_id = auth.uid())
    OR (vendor_id IS NOT NULL AND public.owns_vendor(vendor_id))
    OR public.is_admin()
  );

DROP POLICY IF EXISTS "services_provider_insert" ON public.services;
CREATE POLICY "services_provider_insert" ON public.services
  FOR INSERT
  TO authenticated
  WITH CHECK (
    provider_user_id = auth.uid()
    OR (vendor_id IS NOT NULL AND public.owns_vendor(vendor_id))
    OR public.is_admin()
  );

DROP POLICY IF EXISTS "services_provider_update" ON public.services;
CREATE POLICY "services_provider_update" ON public.services
  FOR UPDATE
  TO authenticated
  USING (
    provider_user_id = auth.uid()
    OR (vendor_id IS NOT NULL AND public.owns_vendor(vendor_id))
    OR public.is_admin()
  )
  WITH CHECK (
    provider_user_id = auth.uid()
    OR (vendor_id IS NOT NULL AND public.owns_vendor(vendor_id))
    OR public.is_admin()
  );

DROP POLICY IF EXISTS "services_provider_delete" ON public.services;
CREATE POLICY "services_provider_delete" ON public.services
  FOR DELETE
  TO authenticated
  USING (
    provider_user_id = auth.uid()
    OR (vendor_id IS NOT NULL AND public.owns_vendor(vendor_id))
    OR public.is_admin()
  );

-- ============================================================================
-- 13. SERVICE REQUESTS
-- ============================================================================
DROP POLICY IF EXISTS "service_requests_select_involved" ON public.service_requests;
CREATE POLICY "service_requests_select_involved" ON public.service_requests
  FOR SELECT
  TO authenticated
  USING (
    requester_user_id = auth.uid()
    OR provider_user_id = auth.uid()
    OR (vendor_id IS NOT NULL AND public.owns_vendor(vendor_id))
    OR public.is_admin()
  );

DROP POLICY IF EXISTS "service_requests_insert_requester" ON public.service_requests;
CREATE POLICY "service_requests_insert_requester" ON public.service_requests
  FOR INSERT
  TO authenticated
  WITH CHECK (
    requester_user_id = auth.uid()
    OR public.is_admin()
  );

DROP POLICY IF EXISTS "service_requests_update_involved" ON public.service_requests;
CREATE POLICY "service_requests_update_involved" ON public.service_requests
  FOR UPDATE
  TO authenticated
  USING (
    requester_user_id = auth.uid()
    OR provider_user_id = auth.uid()
    OR (vendor_id IS NOT NULL AND public.owns_vendor(vendor_id))
    OR public.is_admin()
  )
  WITH CHECK (
    requester_user_id = auth.uid()
    OR provider_user_id = auth.uid()
    OR (vendor_id IS NOT NULL AND public.owns_vendor(vendor_id))
    OR public.is_admin()
  );

DROP POLICY IF EXISTS "service_requests_admin_delete" ON public.service_requests;
CREATE POLICY "service_requests_admin_delete" ON public.service_requests
  FOR DELETE
  TO authenticated
  USING (public.is_admin());

-- ============================================================================
-- 14. MARKETPLACE LISTINGS
-- ============================================================================
DROP POLICY IF EXISTS "marketplace_listings_select_public" ON public.marketplace_listings;
CREATE POLICY "marketplace_listings_select_public" ON public.marketplace_listings
  FOR SELECT
  USING (
    (status = 'PUBLISHED'::public.listing_status AND deleted_at IS NULL)
    OR (auth.uid() IS NOT NULL AND seller_user_id = auth.uid())
    OR public.is_admin()
  );

DROP POLICY IF EXISTS "marketplace_listings_insert_seller" ON public.marketplace_listings;
CREATE POLICY "marketplace_listings_insert_seller" ON public.marketplace_listings
  FOR INSERT
  TO authenticated
  WITH CHECK (
    seller_user_id = auth.uid()
    OR public.is_admin()
  );

DROP POLICY IF EXISTS "marketplace_listings_update_seller" ON public.marketplace_listings;
CREATE POLICY "marketplace_listings_update_seller" ON public.marketplace_listings
  FOR UPDATE
  TO authenticated
  USING (
    seller_user_id = auth.uid()
    OR public.is_admin()
  )
  WITH CHECK (
    seller_user_id = auth.uid()
    OR public.is_admin()
  );

DROP POLICY IF EXISTS "marketplace_listings_delete_seller" ON public.marketplace_listings;
CREATE POLICY "marketplace_listings_delete_seller" ON public.marketplace_listings
  FOR DELETE
  TO authenticated
  USING (
    seller_user_id = auth.uid()
    OR public.is_admin()
  );

-- ============================================================================
-- 15. LISTING IMAGES
-- ============================================================================
DROP POLICY IF EXISTS "listing_images_select_public" ON public.listing_images;
CREATE POLICY "listing_images_select_public" ON public.listing_images
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.marketplace_listings m
      WHERE m.id = listing_images.listing_id
        AND m.status = 'PUBLISHED'::public.listing_status
        AND m.deleted_at IS NULL
    )
    OR EXISTS (
      SELECT 1 FROM public.marketplace_listings m
      WHERE m.id = listing_images.listing_id AND m.seller_user_id = auth.uid()
    )
    OR public.is_admin()
  );

DROP POLICY IF EXISTS "listing_images_seller_insert" ON public.listing_images;
CREATE POLICY "listing_images_seller_insert" ON public.listing_images
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.marketplace_listings m
      WHERE m.id = listing_images.listing_id AND m.seller_user_id = auth.uid()
    )
    OR public.is_admin()
  );

DROP POLICY IF EXISTS "listing_images_seller_update" ON public.listing_images;
CREATE POLICY "listing_images_seller_update" ON public.listing_images
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.marketplace_listings m
      WHERE m.id = listing_images.listing_id AND m.seller_user_id = auth.uid()
    )
    OR public.is_admin()
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.marketplace_listings m
      WHERE m.id = listing_images.listing_id AND m.seller_user_id = auth.uid()
    )
    OR public.is_admin()
  );

DROP POLICY IF EXISTS "listing_images_seller_delete" ON public.listing_images;
CREATE POLICY "listing_images_seller_delete" ON public.listing_images
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.marketplace_listings m
      WHERE m.id = listing_images.listing_id AND m.seller_user_id = auth.uid()
    )
    OR public.is_admin()
  );

-- ============================================================================
-- 16. CARTS
-- ============================================================================
DROP POLICY IF EXISTS "carts_select_own" ON public.carts;
CREATE POLICY "carts_select_own" ON public.carts
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "carts_insert_own" ON public.carts;
CREATE POLICY "carts_insert_own" ON public.carts
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "carts_update_own" ON public.carts;
CREATE POLICY "carts_update_own" ON public.carts
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid() OR public.is_admin())
  WITH CHECK (user_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "carts_delete_own" ON public.carts;
CREATE POLICY "carts_delete_own" ON public.carts
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid() OR public.is_admin());

-- ============================================================================
-- 17. CART ITEMS
-- ============================================================================
DROP POLICY IF EXISTS "cart_items_select_own" ON public.cart_items;
CREATE POLICY "cart_items_select_own" ON public.cart_items
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.carts c
      WHERE c.id = cart_items.cart_id AND (c.user_id = auth.uid() OR public.is_admin())
    )
  );

DROP POLICY IF EXISTS "cart_items_insert_own" ON public.cart_items;
CREATE POLICY "cart_items_insert_own" ON public.cart_items
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.carts c
      WHERE c.id = cart_items.cart_id AND (c.user_id = auth.uid() OR public.is_admin())
    )
  );

DROP POLICY IF EXISTS "cart_items_update_own" ON public.cart_items;
CREATE POLICY "cart_items_update_own" ON public.cart_items
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.carts c
      WHERE c.id = cart_items.cart_id AND (c.user_id = auth.uid() OR public.is_admin())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.carts c
      WHERE c.id = cart_items.cart_id AND (c.user_id = auth.uid() OR public.is_admin())
    )
  );

DROP POLICY IF EXISTS "cart_items_delete_own" ON public.cart_items;
CREATE POLICY "cart_items_delete_own" ON public.cart_items
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.carts c
      WHERE c.id = cart_items.cart_id AND (c.user_id = auth.uid() OR public.is_admin())
    )
  );

-- ============================================================================
-- 18. ORDERS
-- ============================================================================
DROP POLICY IF EXISTS "orders_select_involved" ON public.orders;
CREATE POLICY "orders_select_involved" ON public.orders
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR public.owns_vendor(vendor_id)
    OR (
      delivery_request_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.delivery_requests dr
        WHERE dr.id = orders.delivery_request_id AND dr.rider_user_id = auth.uid()
      )
    )
    OR public.is_admin()
  );

DROP POLICY IF EXISTS "orders_admin_insert" ON public.orders;
CREATE POLICY "orders_admin_insert" ON public.orders
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "orders_admin_update" ON public.orders;
CREATE POLICY "orders_admin_update" ON public.orders
  FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "orders_admin_delete" ON public.orders;
CREATE POLICY "orders_admin_delete" ON public.orders
  FOR DELETE
  TO authenticated
  USING (public.is_admin());

-- ============================================================================
-- 19. ORDER ITEMS
-- ============================================================================
DROP POLICY IF EXISTS "order_items_select_involved" ON public.order_items;
CREATE POLICY "order_items_select_involved" ON public.order_items
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_items.order_id
        AND (o.user_id = auth.uid() OR public.owns_vendor(o.vendor_id) OR public.is_admin())
    )
  );

DROP POLICY IF EXISTS "order_items_admin_insert" ON public.order_items;
CREATE POLICY "order_items_admin_insert" ON public.order_items
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "order_items_admin_update" ON public.order_items;
CREATE POLICY "order_items_admin_update" ON public.order_items
  FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "order_items_admin_delete" ON public.order_items;
CREATE POLICY "order_items_admin_delete" ON public.order_items
  FOR DELETE
  TO authenticated
  USING (public.is_admin());

-- ============================================================================
-- 20. ORDER PAYMENTS
-- ============================================================================
DROP POLICY IF EXISTS "order_payments_select_involved" ON public.order_payments;
CREATE POLICY "order_payments_select_involved" ON public.order_payments
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_payments.order_id
        AND (o.user_id = auth.uid() OR public.is_admin())
    )
  );

DROP POLICY IF EXISTS "order_payments_admin_insert" ON public.order_payments;
CREATE POLICY "order_payments_admin_insert" ON public.order_payments
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "order_payments_admin_update" ON public.order_payments;
CREATE POLICY "order_payments_admin_update" ON public.order_payments
  FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "order_payments_admin_delete" ON public.order_payments;
CREATE POLICY "order_payments_admin_delete" ON public.order_payments
  FOR DELETE
  TO authenticated
  USING (public.is_admin());

-- ============================================================================
-- 21. DELIVERY REQUESTS
-- ============================================================================
DROP POLICY IF EXISTS "delivery_requests_select_involved" ON public.delivery_requests;
CREATE POLICY "delivery_requests_select_involved" ON public.delivery_requests
  FOR SELECT
  TO authenticated
  USING (
    requester_user_id = auth.uid()
    OR (
      public.has_role('RIDER'::public.app_role)
      AND (rider_user_id = auth.uid() OR status = 'REQUESTED'::public.delivery_status)
    )
    OR public.is_admin()
  );

DROP POLICY IF EXISTS "delivery_requests_insert_requester" ON public.delivery_requests;
CREATE POLICY "delivery_requests_insert_requester" ON public.delivery_requests
  FOR INSERT
  TO authenticated
  WITH CHECK (
    requester_user_id = auth.uid()
    OR public.is_admin()
  );

DROP POLICY IF EXISTS "delivery_requests_update_involved" ON public.delivery_requests;
CREATE POLICY "delivery_requests_update_involved" ON public.delivery_requests
  FOR UPDATE
  TO authenticated
  USING (
    requester_user_id = auth.uid()
    OR (
      public.has_role('RIDER'::public.app_role)
      AND (rider_user_id = auth.uid() OR (rider_user_id IS NULL AND status = 'REQUESTED'::public.delivery_status))
    )
    OR public.is_admin()
  )
  WITH CHECK (
    requester_user_id = auth.uid()
    OR (
      public.has_role('RIDER'::public.app_role)
      AND rider_user_id = auth.uid()
    )
    OR public.is_admin()
  );

DROP POLICY IF EXISTS "delivery_requests_admin_delete" ON public.delivery_requests;
CREATE POLICY "delivery_requests_admin_delete" ON public.delivery_requests
  FOR DELETE
  TO authenticated
  USING (public.is_admin());

-- ============================================================================
-- 22. NOTIFICATIONS
-- ============================================================================
DROP POLICY IF EXISTS "notifications_select_own" ON public.notifications;
CREATE POLICY "notifications_select_own" ON public.notifications
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "notifications_update_own" ON public.notifications;
CREATE POLICY "notifications_update_own" ON public.notifications
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid() OR public.is_admin())
  WITH CHECK (user_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "notifications_delete_own" ON public.notifications;
CREATE POLICY "notifications_delete_own" ON public.notifications
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "notifications_admin_insert" ON public.notifications;
CREATE POLICY "notifications_admin_insert" ON public.notifications
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

-- ============================================================================
-- 23. PRODUCT REVIEWS
-- ============================================================================
DROP POLICY IF EXISTS "product_reviews_select_public" ON public.product_reviews;
CREATE POLICY "product_reviews_select_public" ON public.product_reviews
  FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "product_reviews_insert_reviewer" ON public.product_reviews;
CREATE POLICY "product_reviews_insert_reviewer" ON public.product_reviews
  FOR INSERT
  TO authenticated
  WITH CHECK (reviewer_user_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "product_reviews_update_reviewer" ON public.product_reviews;
CREATE POLICY "product_reviews_update_reviewer" ON public.product_reviews
  FOR UPDATE
  TO authenticated
  USING (reviewer_user_id = auth.uid() OR public.is_admin())
  WITH CHECK (reviewer_user_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "product_reviews_admin_delete" ON public.product_reviews;
CREATE POLICY "product_reviews_admin_delete" ON public.product_reviews
  FOR DELETE
  TO authenticated
  USING (public.is_admin());

-- ============================================================================
-- 24. VENDOR REVIEWS
-- ============================================================================
DROP POLICY IF EXISTS "vendor_reviews_select_public" ON public.vendor_reviews;
CREATE POLICY "vendor_reviews_select_public" ON public.vendor_reviews
  FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "vendor_reviews_insert_reviewer" ON public.vendor_reviews;
CREATE POLICY "vendor_reviews_insert_reviewer" ON public.vendor_reviews
  FOR INSERT
  TO authenticated
  WITH CHECK (reviewer_user_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "vendor_reviews_update_reviewer" ON public.vendor_reviews;
CREATE POLICY "vendor_reviews_update_reviewer" ON public.vendor_reviews
  FOR UPDATE
  TO authenticated
  USING (reviewer_user_id = auth.uid() OR public.is_admin())
  WITH CHECK (reviewer_user_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "vendor_reviews_admin_delete" ON public.vendor_reviews;
CREATE POLICY "vendor_reviews_admin_delete" ON public.vendor_reviews
  FOR DELETE
  TO authenticated
  USING (public.is_admin());

-- ============================================================================
-- 25. ORDER REVIEWS
-- ============================================================================
DROP POLICY IF EXISTS "order_reviews_select_public" ON public.order_reviews;
CREATE POLICY "order_reviews_select_public" ON public.order_reviews
  FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "order_reviews_insert_reviewer" ON public.order_reviews;
CREATE POLICY "order_reviews_insert_reviewer" ON public.order_reviews
  FOR INSERT
  TO authenticated
  WITH CHECK (reviewer_user_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "order_reviews_update_reviewer" ON public.order_reviews;
CREATE POLICY "order_reviews_update_reviewer" ON public.order_reviews
  FOR UPDATE
  TO authenticated
  USING (reviewer_user_id = auth.uid() OR public.is_admin())
  WITH CHECK (reviewer_user_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "order_reviews_admin_delete" ON public.order_reviews;
CREATE POLICY "order_reviews_admin_delete" ON public.order_reviews
  FOR DELETE
  TO authenticated
  USING (public.is_admin());

-- ============================================================================
-- 26. AUDIT LOGS
-- ============================================================================
DROP POLICY IF EXISTS "audit_logs_admin_select" ON public.audit_logs;
CREATE POLICY "audit_logs_admin_select" ON public.audit_logs
  FOR SELECT
  TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "audit_logs_admin_manage" ON public.audit_logs;
CREATE POLICY "audit_logs_admin_manage" ON public.audit_logs
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());
