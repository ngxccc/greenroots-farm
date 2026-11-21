UPDATE "farms"
SET "shipping_config" = '{"maxRadiusKm": 25, "subscriptionFreeRadiusKm": 20}'::jsonb
  || jsonb_strip_nulls("shipping_config")
WHERE NOT ("shipping_config" ?& array['maxRadiusKm', 'subscriptionFreeRadiusKm'])
   OR ("shipping_config" ->> 'maxRadiusKm') IS NULL
   OR ("shipping_config" ->> 'subscriptionFreeRadiusKm') IS NULL;
