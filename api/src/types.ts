export type UploadType = "listable" | "sold";

export type ProductTypeFilter = "Non-RTV" | "RTV" | "All";
export type UnitMode = "units" | "pallets";

export type QueryFilters = {
  from: string | null;
  to: string | null;
  facility: string | null;
  masterProgram: string | null;
  productType: ProductTypeFilter;
  orderType: string | null;
  marketplace: string | null;
};

export type ListableRow = {
  trgid: string;
  upc: string | null;
  title: string | null;
  program_name: string | null;
  master_program_name: string | null;
  category_name: string | null;
  manufacturer: string | null;
  location_not_listable: boolean | null;
  product_status: string | null;
  mr_lmr_upc_average_category_retail: number | null;
  upc_retail: number | null;
  classification_physical_condition: string | null;
  classification_condition: string | null;
  classification_technical_functionality: string | null;
  pallet_location_id: string | null;
  rtv_type: string | null;
  tag_not_listed_reason: string | null;
  tag_venue_exclusivity: string | null;
  serialized: string | null;
  first_stored_on_listable_location_on: string | null;
  facility: string | null;
};

export type SoldRow = {
  trgid: string;
  program_name: string | null;
  master_program_name: string | null;
  category_name: string | null;
  manufacturer: string | null;
  classification_physical_condition: string | null;
  classification_condition: string | null;
  rtv_type: string | null;
  order_number: string | null;
  sale_price: number | null;
  retail_price_on_sale_date: number | null;
  mr_lmr_upc_average_category_retail: number | null;
  upc_retail: number | null;
  order_type_sold_on: string | null;
  marketplace_sold_on: string | null;
  order_customer_name: string | null;
  order_customer_company_name: string | null;
  marketplace_po_number: string | null;
  sorting_index: string | null;
  location_id: string | null;
  order_created_date: string | null;
  facility: string | null;
};

export const DROP_PROGRAMS = [
  "BRTON-LENOVO-DC-400",
  "BRTON-LENOVO-DC-402",
  "DS-MONTERREY",
  "DS-MERCORP",
] as const;

export const DATA_TAB_DROP_PROGRAMS = [
  "DS-MONTERREY",
  "DS-MERCORP",
  "MIAFL-HEAD-OFFICE",
] as const;

export const PROGRAM_REWRITES: Record<string, string> = {
  "MILON-WM-DOTCA-RTV": "BRTON-WM-DOTCA-RTV",
};

export const WALMART_INSPECT_AND_SELL = [
  "Walmart Computer Parts (Finished)",
  "Walmart Computers Parts (Finished)",
  "Walmart Finished Goods Wide Sku (Finished)",
  "Walmart Headphones & Speakers (Not Apple) (Finished)",
  "Walmart Monitors (Finished)",
] as const;

export const LISTABLE_HEADERS: Record<string, keyof ListableRow | "trgid"> = {
  trgid: "trgid",
  upc: "upc",
  title: "title",
  programname: "program_name",
  masterprogramname: "master_program_name",
  categoryname: "category_name",
  manufacturer: "manufacturer",
  locationnotlistable: "location_not_listable",
  productstatus: "product_status",
  mrlmrupcaveragecategoryretail: "mr_lmr_upc_average_category_retail",
  upcretail: "upc_retail",
  classificationphysicalcondition: "classification_physical_condition",
  classificationcondition: "classification_condition",
  classificationtechnicalfunctionality: "classification_technical_functionality",
  palletlocationid: "pallet_location_id",
  rtvtype: "rtv_type",
  tagnotlistedreason: "tag_not_listed_reason",
  tagvenueexclusivity: "tag_venue_exclusivity",
  serialized: "serialized",
  firststoredonlistablelocationon: "first_stored_on_listable_location_on",
};

export const SOLD_HEADERS: Record<string, keyof SoldRow | "trgid"> = {
  trgid: "trgid",
  programname: "program_name",
  masterprogramname: "master_program_name",
  categoryname: "category_name",
  manufacturer: "manufacturer",
  classificationphysicalcondition: "classification_physical_condition",
  classificationcondition: "classification_condition",
  rtvtype: "rtv_type",
  ordernumber: "order_number",
  "saleprice(discountapplied)": "sale_price",
  saleprice: "sale_price",
  retailpriceonsaledate: "retail_price_on_sale_date",
  mrlmrupcaveragecategoryretail: "mr_lmr_upc_average_category_retail",
  upcretail: "upc_retail",
  ordertypesoldon: "order_type_sold_on",
  marketplacesoldon: "marketplace_sold_on",
  ordercustomername: "order_customer_name",
  ordercustomercompanyname: "order_customer_company_name",
  marketplaceponumber: "marketplace_po_number",
  sortingindex: "sorting_index",
  locationid: "location_id",
  ordercreateddate: "order_created_date",
};
