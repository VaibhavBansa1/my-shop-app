-- F-22: orphan_images()/delete_image() run as shop_owner, but stock_items had no policy for shop_owner, so
-- under FORCE row-level security the "is this image used by an item?" check saw no items at all. Result: the
-- cleanup job treated every item photo older than a day as unused and deleted its files (the row survived
-- only because of the foreign key). Same narrow owner policy as the other tables these functions read.
drop policy if exists owner_definer on stock_items;
create policy owner_definer on stock_items for select to shop_owner using (true);
