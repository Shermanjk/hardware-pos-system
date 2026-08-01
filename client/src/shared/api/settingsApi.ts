import httpClient from "@/shared/api/httpClient";

export interface StoreSettings {
  // General
  store_name:               string;
  store_fb:                 string;
  store_phone:              string;
  store_address:            string;
  currency:                 string;
  // Business / taxpayer
  registered_taxpayer_name: string;
  tin:                      string;
  business_license:         string;
  document_type:            string;
  tax_rate:                 number;
  vat_registered:           boolean;
  // POS machine
  pos_min:                  string | undefined;
  pos_serial:               string | undefined;
}

export async function getSettings(): Promise<StoreSettings> {
  const res = await httpClient.get<StoreSettings>("/api/settings", {
    headers: { "Cache-Control": "no-cache" },
    params: { _t: Date.now() },
  });
  return res.data;
}

export async function updateSettings(payload: Partial<StoreSettings>): Promise<StoreSettings> {
  const res = await httpClient.put<StoreSettings>("/api/settings", payload);
  return res.data;
}
