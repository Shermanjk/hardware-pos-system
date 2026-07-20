import { useState, useEffect, useRef } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { Download, FileText, Sheet, RefreshCw } from "lucide-react";
import * as XLSX from "xlsx";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import { getDashboardData, type DashboardData } from "@/shared/api/dashboardApi";

const COLORS = ["#2563EB", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6"];

const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export default function Reports() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const reportsRef = useRef<HTMLDivElement>(null);

  const fetchData = async () => {
    try {
      const dashboardData = await getDashboardData();
      setData(dashboardData);
    } catch (err) {
      console.error("Error fetching reports data:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleExcelExport = () => {
    if (!data) return;

    // Create workbook
    const wb = XLSX.utils.book_new();

    // 1. Summary sheet
    const summaryData = [
      ["Metric", "Value"],
      ["Total Revenue", `₱${data.kpis.monthly_revenue.toLocaleString()}`],
      ["Total Orders", data.kpis.today_transactions.toLocaleString()],
      ["Avg Order Value", `₱${(data.kpis.today_transactions > 0 ? data.kpis.today_revenue / data.kpis.today_transactions : 0).toFixed(2)}`],
      ["Total Profit", `₱${(data.kpis.monthly_revenue * 0.32).toLocaleString()}`]
    ];
    const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(wb, wsSummary, "Summary");

    // 2. Daily Sales sheet
    const dailySalesData = data.weekly_sales.map((item) => {
      const date = new Date(item.sale_date);
      return {
        Day: dayNames[date.getDay()],
        Sales: item.revenue,
        Orders: item.transactions
      };
    });
    const wsDaily = XLSX.utils.json_to_sheet(dailySalesData);
    XLSX.utils.book_append_sheet(wb, wsDaily, "Daily Sales");

    // 3. Monthly Sales sheet
    const monthlySalesData = data.monthly_sales.map((item) => {
      const [year, month] = item.month.split("-").map(Number);
      return {
        Month: `${monthNames[month - 1]} ${year}`,
        Revenue: item.revenue
      };
    });
    const wsMonthly = XLSX.utils.json_to_sheet(monthlySalesData);
    XLSX.utils.book_append_sheet(wb, wsMonthly, "Monthly Sales");

    // 4. Top Products sheet
    const topProductsData = data.top_products.map((item) => ({
      Product: item.name,
      UnitsSold: item.units_sold,
      Revenue: item.revenue
    }));
    const wsTopProducts = XLSX.utils.json_to_sheet(topProductsData);
    XLSX.utils.book_append_sheet(wb, wsTopProducts, "Top Products");

    // 5. Low Stock sheet
    const lowStockData = data.low_stock_items.map((item) => ({
      Product: item.product_name,
      CurrentStock: item.quantity,
      ReorderLevel: item.reorder_level,
      Shortage: Math.max(0, item.reorder_level - item.quantity)
    }));
    const wsLowStock = XLSX.utils.json_to_sheet(lowStockData);
    XLSX.utils.book_append_sheet(wb, wsLowStock, "Low Stock");

    // Download
    const fileName = `Reports_${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(wb, fileName);
  };

  const handlePrint = () => {
    window.print();
  };

  const handlePDFExport = async () => {
    if (!reportsRef.current) return;

    try {
      const canvas = await html2canvas(reportsRef.current, {
        scale: 2,
        useCORS: true,
        backgroundColor: "#ffffff"
      });

      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF({
        orientation: "landscape",
        unit: "mm",
        format: "a4"
      });

      const imgWidth = 280;
      const pageHeight = 210;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      let heightLeft = imgHeight;
      let position = 0;

      pdf.addImage(imgData, "PNG", 10, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;

      while (heightLeft >= 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, "PNG", 10, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
      }

      const fileName = `Reports_${new Date().toISOString().split('T')[0]}.pdf`;
      pdf.save(fileName);
    } catch (err) {
      console.error("Error generating PDF:", err);
    }
  };

  if (loading || !data) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  // Transform data for display
  const dailySalesData = data.weekly_sales.map((item) => {
    const date = new Date(item.sale_date);
    return {
      day: dayNames[date.getDay()],
      sales: item.revenue,
      orders: item.transactions,
    };
  });

  const monthlySalesData = data.monthly_sales.map((item) => {
    const [year, month] = item.month.split("-").map(Number);
    return {
      month: monthNames[month - 1],
      revenue: item.revenue,
    };
  });

  const bestSellingProducts = data.top_products.map((item) => ({
    name: item.name,
    value: item.revenue,
  }));

  const lowStockReport = data.low_stock_items.map((item) => ({
    product: item.product_name,
    current: item.quantity,
    reorder: item.reorder_level,
    shortage: Math.max(0, item.reorder_level - item.quantity),
  }));

  const totalRevenue = data.kpis.monthly_revenue;
  const totalProfit = totalRevenue * 0.32;
  const avgOrderValue = data.kpis.today_transactions > 0 ? data.kpis.today_revenue / data.kpis.today_transactions : 0;

  return (
    <div className="space-y-6" ref={reportsRef}>
      <style>{`
        @media print {
          body * {
            visibility: hidden;
          }
          #print-area, #print-area * {
            visibility: visible;
          }
          #print-area {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            padding: 20px;
            background: white;
          }
          .no-print {
            display: none !important;
          }
        }
      `}</style>

      <div id="print-area">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-display font-bold text-gray-900">Reports</h1>
            <p className="text-gray-600 mt-1">Business analytics and insights</p>
            <p className="text-sm text-gray-500 mt-1">Generated on: {new Date().toLocaleString()}</p>
          </div>
          <div className="flex gap-2 no-print">
            <Button variant="outline" className="gap-2" onClick={fetchData}>
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <Button variant="outline" className="gap-2" onClick={handlePDFExport}>
              <FileText className="h-4 w-4" />
              PDF
            </Button>
            <Button variant="outline" className="gap-2" onClick={handleExcelExport}>
              <Sheet className="h-4 w-4" />
              Excel
            </Button>
            <Button variant="outline" className="gap-2" onClick={handlePrint}>
              <Download className="h-4 w-4" />
              Print
            </Button>
          </div>
        </div>

        {/* Revenue Summary */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <Card className="p-4">
            <p className="text-gray-600 text-sm font-medium">Total Revenue</p>
            <p className="text-2xl font-bold text-gray-900 mt-2">₱{totalRevenue.toLocaleString()}</p>
            <p className="text-xs text-green-600 font-medium mt-2">+12.5% from last month</p>
          </Card>
          <Card className="p-4">
            <p className="text-gray-600 text-sm font-medium">Total Orders</p>
            <p className="text-2xl font-bold text-gray-900 mt-2">{data.kpis.today_transactions.toLocaleString()}</p>
            <p className="text-xs text-green-600 font-medium mt-2">+8.2% from last month</p>
          </Card>
          <Card className="p-4">
            <p className="text-gray-600 text-sm font-medium">Avg Order Value</p>
            <p className="text-2xl font-bold text-gray-900 mt-2">₱{avgOrderValue.toFixed(2)}</p>
            <p className="text-xs text-green-600 font-medium mt-2">+3.1% from last month</p>
          </Card>
          <Card className="p-4">
            <p className="text-gray-600 text-sm font-medium">Total Profit</p>
            <p className="text-2xl font-bold text-gray-900 mt-2">₱{totalProfit.toLocaleString()}</p>
            <p className="text-xs text-green-600 font-medium mt-2">+15.8% from last month</p>
          </Card>
        </div>

        {/* Daily Sales Report */}
        <Card className="p-6 mb-6">
          <div className="mb-6">
            <h2 className="text-lg font-display font-bold text-gray-900">Daily Sales</h2>
            <p className="text-gray-600 text-sm">Weekly sales performance</p>
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={dailySalesData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
              <XAxis dataKey="day" stroke="#6B7280" />
              <YAxis stroke="#6B7280" />
              <Tooltip contentStyle={{ backgroundColor: "#FFFFFF", border: "1px solid #E5E7EB", borderRadius: "8px" }} />
              <Legend />
              <Bar dataKey="sales" fill="#2563EB" radius={[8, 8, 0, 0]} />
              <Bar dataKey="orders" fill="#10B981" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        {/* Monthly Sales & Best Sellers */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {/* Monthly Sales */}
          <Card className="p-6">
            <div className="mb-6">
              <h2 className="text-lg font-display font-bold text-gray-900">Monthly Sales</h2>
              <p className="text-gray-600 text-sm">6-month revenue trend</p>
            </div>
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={monthlySalesData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                <XAxis dataKey="month" stroke="#6B7280" />
                <YAxis stroke="#6B7280" />
                <Tooltip contentStyle={{ backgroundColor: "#FFFFFF", border: "1px solid #E5E7EB", borderRadius: "8px" }} />
                <Line type="monotone" dataKey="revenue" stroke="#2563EB" strokeWidth={2} dot={{ fill: "#2563EB" }} />
              </LineChart>
            </ResponsiveContainer>
          </Card>

          {/* Best Selling Products */}
          <Card className="p-6">
            <div className="mb-6">
              <h2 className="text-lg font-display font-bold text-gray-900">Best Selling Products</h2>
              <p className="text-gray-600 text-sm">Top 5 products by revenue</p>
            </div>
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={bestSellingProducts}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, value }) => `${name}: ₱${value}`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {bestSellingProducts.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          </Card>
        </div>

        {/* Inventory Report */}
        <Card className="p-6">
          <div className="mb-4">
            <h2 className="text-lg font-display font-bold text-gray-900">Low Stock Report</h2>
            <p className="text-gray-600 text-sm">Items below reorder level</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left py-3 px-4 font-semibold text-gray-900">Product</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-900">Current Stock</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-900">Reorder Level</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-900">Shortage</th>
                </tr>
              </thead>
              <tbody>
                {lowStockReport.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-8 text-center text-gray-500">
                      No low stock items found
                    </td>
                  </tr>
                ) : (
                  lowStockReport.map((item, idx) => (
                    <tr key={idx} className={`border-b border-gray-100 ${idx % 2 === 0 ? "bg-white" : "bg-gray-50"}`}>
                      <td className="py-3 px-4 text-gray-900 font-medium">{item.product}</td>
                      <td className="py-3 px-4 text-gray-700">{item.current}</td>
                      <td className="py-3 px-4 text-gray-700">{item.reorder}</td>
                      <td className="py-3 px-4">
                        <span className="text-red-600 font-semibold">{item.shortage}</span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}
