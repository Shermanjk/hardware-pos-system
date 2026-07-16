import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function Suppliers() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-display font-bold text-gray-900">Suppliers</h1>
        <p className="text-gray-600 mt-1">Manage supplier information</p>
      </div>
      <Card className="p-8 text-center">
        <p className="text-gray-600">Suppliers module coming soon</p>
        <Button className="mt-4">Feature Coming Soon</Button>
      </Card>
    </div>
  );
}
