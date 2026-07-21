import axios from "axios";
import { loadToken } from "@/shared/utils/auth";

export interface StoreSettings {
  store_name:       string;
  store_fb:         string;
  store_phone:      string;
  store_address:    string;
  currency:         string;
  tax_rate:         number;
  business_license: string;
  pos_min:          string | undefined;
  pos_serial:       string | undefined;
  vat_registered:   boolean;
}

function authHeaders() {
  const token = loadToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function getSettings(): Promise<StoreSettings> {
  const res = await axios.get<StoreSettings>("/api/settings", {
    headers: { ...authHeaders(), "Cache-Control": "no-cache" },
    params: { _t: Date.now() },
  });
  return res.data;
}

export async function updateSettings(payload: Partial<StoreSettings>): Promise<StoreSettings> {
  const res = await axios.put<StoreSettings>("/api/settings", payload, { headers: authHeaders() });
  return res.data;
}
