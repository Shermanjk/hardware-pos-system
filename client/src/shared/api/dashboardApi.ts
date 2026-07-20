
import axios from "axios";
import { loadToken } from "@/shared/utils/auth";

function authHeaders() {
  const token = loadToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export interface DashboardKpis {
  today_transactions: number;
  today_revenue: number;
  monthly_revenue: number;
  total_products: number;
  out_of_stock: number;
  low_stock: number;
  total_suppliers: number;
  pending_returns: number;
}

export interface WeeklySale {
  sale_date: string;
  transactions: number;
  revenue: number;
}

export interface MonthlySale {
  month: string;
  revenue: number;
}

export interface TopProduct {
  name: string;
  units_sold: number;
  revenue: number;
}

export interface RecentSale {
  invoice_number: string;
  customer_name: string;
  total_amount: number;
  cashier_name: string;
  created_at: string;
}

export interface LowStockItem {
  product_name: string;
  barcode: string;
  quantity: number;
  reorder_level: number;
  urgency: string;
}

export interface DashboardData {
  kpis: DashboardKpis;
  weekly_sales: WeeklySale[];
  monthly_sales: MonthlySale[];
  top_products: TopProduct[];
  recent_sales: RecentSale[];
  low_stock_items: LowStockItem[];
}

export async function getDashboardData(): Promise<DashboardData> {
  const response = await axios.get<DashboardData>("/api/dashboard", {
    headers: authHeaders(),
  });
  return response.data;
}
