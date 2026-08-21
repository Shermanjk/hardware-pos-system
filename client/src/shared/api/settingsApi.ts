import httpClient from "@/shared/api/httpClient";

export interface StoreSettings {
  // General
  store_name:               string;
  facebook:                 string; // renamed from store_fb
  contact_number:           string; // renamed from store_phone
  address:                  string; // renamed from store_address
  currency:                 string;
  // Business / taxpayer
  proprietor:               string; // new field
  registered_taxpayer_name: string;
  tin:                      string;
  branch_code?:             string;
  business_license:         string;
  document_type:            string;
  vat_rate:                 number; // renamed from tax_rate
  vat_enabled:              boolean; // renamed from vat_registered
  vat_registered:           boolean; // alias for compatibility
  pricing_type:             string | null; // new field
  receipt_footer:           string | null; // new field
  printer_name:             string | null; // new field
  cash_drawer_enabled:      boolean; // new field
  // POS machine & Accreditation
  pos_min:                  string | undefined;
  pos_serial:               string | undefined;
  ptu_or_accn_no?:          string | null;
}

export async function getSettings(): Promise<StoreSettings> {
  const res = await httpClient.get<StoreSettings>("/api/settings", {
    headers: { "Cache-Control": "no-cache" },
    params: { _t: Date.now() },
  });
  return res.data;
}

export const getStoreSettings = getSettings;

export async function updateSettings(payload: Partial<StoreSettings>): Promise<StoreSettings> {
  const res = await httpClient.put<StoreSettings>("/api/settings", payload);
  return res.data;
}
