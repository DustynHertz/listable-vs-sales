import type { PoolClient } from "pg";
import type { ListableRow, SoldRow, UploadType } from "../types";

const BATCH = 500;

export async function upsertListableBatch(
  client: PoolClient,
  rows: ListableRow[],
): Promise<number> {
  if (rows.length === 0) return 0;
  const values: unknown[] = [];
  const placeholders: string[] = [];
  let i = 1;
  for (const r of rows) {
    placeholders.push(
      `($${i++}, TRUE, $${i++}, $${i++}, $${i++}, $${i++}, $${i++}, $${i++}, $${i++}, $${i++}, $${i++}, $${i++}, $${i++}, $${i++}, $${i++}, $${i++}, $${i++}, $${i++}, $${i++}, $${i++}, $${i++}, $${i++}, NOW())`,
    );
    values.push(
      r.trgid,
      r.upc,
      r.title,
      r.program_name,
      r.master_program_name,
      r.category_name,
      r.manufacturer,
      r.location_not_listable,
      r.product_status,
      r.mr_lmr_upc_average_category_retail,
      r.upc_retail,
      r.classification_physical_condition,
      r.classification_condition,
      r.classification_technical_functionality,
      r.pallet_location_id,
      r.rtv_type,
      r.tag_not_listed_reason,
      r.tag_venue_exclusivity,
      r.serialized,
      r.first_stored_on_listable_location_on,
      r.facility,
    );
  }
  const result = await client.query(
    `INSERT INTO inventory_items (
      trgid, has_putaway, upc, title, program_name, master_program_name, category_name,
      manufacturer, location_not_listable, product_status,
      mr_lmr_upc_average_category_retail, upc_retail,
      classification_physical_condition, classification_condition,
      classification_technical_functionality, pallet_location_id, rtv_type,
      tag_not_listed_reason, tag_venue_exclusivity, serialized,
      first_stored_on_listable_location_on, facility, updated_at
    ) VALUES ${placeholders.join(",")}
    ON CONFLICT (trgid) DO UPDATE SET
      has_putaway = TRUE,
      upc = EXCLUDED.upc,
      title = EXCLUDED.title,
      program_name = EXCLUDED.program_name,
      master_program_name = EXCLUDED.master_program_name,
      category_name = EXCLUDED.category_name,
      manufacturer = EXCLUDED.manufacturer,
      location_not_listable = EXCLUDED.location_not_listable,
      product_status = EXCLUDED.product_status,
      mr_lmr_upc_average_category_retail = EXCLUDED.mr_lmr_upc_average_category_retail,
      upc_retail = EXCLUDED.upc_retail,
      classification_physical_condition = EXCLUDED.classification_physical_condition,
      classification_condition = EXCLUDED.classification_condition,
      classification_technical_functionality = EXCLUDED.classification_technical_functionality,
      pallet_location_id = EXCLUDED.pallet_location_id,
      rtv_type = EXCLUDED.rtv_type,
      tag_not_listed_reason = EXCLUDED.tag_not_listed_reason,
      tag_venue_exclusivity = EXCLUDED.tag_venue_exclusivity,
      serialized = EXCLUDED.serialized,
      first_stored_on_listable_location_on = EXCLUDED.first_stored_on_listable_location_on,
      facility = EXCLUDED.facility,
      updated_at = NOW()`,
    values,
  );
  return result.rowCount ?? rows.length;
}

export async function upsertSoldBatch(client: PoolClient, rows: SoldRow[]): Promise<number> {
  if (rows.length === 0) return 0;
  const values: unknown[] = [];
  const placeholders: string[] = [];
  let i = 1;
  for (const r of rows) {
    placeholders.push(
      `($${i++}, TRUE, $${i++}, $${i++}, $${i++}, $${i++}, $${i++}, $${i++}, $${i++}, $${i++}, $${i++}, $${i++}, $${i++}, $${i++}, $${i++}, $${i++}, $${i++}, $${i++}, $${i++}, $${i++}, $${i++}, $${i++}, $${i++}, NOW())`,
    );
    values.push(
      r.trgid,
      r.program_name,
      r.master_program_name,
      r.category_name,
      r.manufacturer,
      r.classification_physical_condition,
      r.classification_condition,
      r.rtv_type,
      r.order_number,
      r.sale_price,
      r.retail_price_on_sale_date,
      r.mr_lmr_upc_average_category_retail,
      r.upc_retail,
      r.order_type_sold_on,
      r.marketplace_sold_on,
      r.order_customer_name,
      r.order_customer_company_name,
      r.marketplace_po_number,
      r.sorting_index,
      r.location_id,
      r.order_created_date,
      r.facility,
    );
  }
  const result = await client.query(
    `INSERT INTO inventory_items (
      trgid, has_sold_upload, program_name_sold, master_program_name_sold, category_name_sold,
      manufacturer_sold, classification_physical_condition_sold, classification_condition_sold,
      rtv_type_sold, order_number, sale_price, retail_price_on_sale_date,
      mr_lmr_upc_average_category_retail_sold, upc_retail_sold, order_type_sold_on,
      marketplace_sold_on, order_customer_name, order_customer_company_name,
      marketplace_po_number, sorting_index, location_id, order_created_date, facility_sold,
      updated_at
    ) VALUES ${placeholders.join(",")}
    ON CONFLICT (trgid) DO UPDATE SET
      has_sold_upload = TRUE,
      program_name_sold = EXCLUDED.program_name_sold,
      master_program_name_sold = EXCLUDED.master_program_name_sold,
      category_name_sold = EXCLUDED.category_name_sold,
      manufacturer_sold = EXCLUDED.manufacturer_sold,
      classification_physical_condition_sold = EXCLUDED.classification_physical_condition_sold,
      classification_condition_sold = EXCLUDED.classification_condition_sold,
      rtv_type_sold = EXCLUDED.rtv_type_sold,
      order_number = EXCLUDED.order_number,
      sale_price = EXCLUDED.sale_price,
      retail_price_on_sale_date = EXCLUDED.retail_price_on_sale_date,
      mr_lmr_upc_average_category_retail_sold = EXCLUDED.mr_lmr_upc_average_category_retail_sold,
      upc_retail_sold = EXCLUDED.upc_retail_sold,
      order_type_sold_on = EXCLUDED.order_type_sold_on,
      marketplace_sold_on = EXCLUDED.marketplace_sold_on,
      order_customer_name = EXCLUDED.order_customer_name,
      order_customer_company_name = EXCLUDED.order_customer_company_name,
      marketplace_po_number = EXCLUDED.marketplace_po_number,
      sorting_index = EXCLUDED.sorting_index,
      location_id = EXCLUDED.location_id,
      order_created_date = EXCLUDED.order_created_date,
      facility_sold = EXCLUDED.facility_sold,
      updated_at = NOW()`,
    values,
  );
  return result.rowCount ?? rows.length;
}

export { BATCH };
