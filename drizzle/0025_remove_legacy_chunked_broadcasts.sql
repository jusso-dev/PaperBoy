DELETE FROM "broadcasts"
WHERE "status" = 'cancelled'
  AND "name" ~ ' — part [1-9][0-9]* of [1-9][0-9]*$';
