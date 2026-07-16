import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function Settings() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-display font-bold text-gray-900">Settings</h1>
        <p className="text-gray-600 mt-1">Configure system preferences and options</p>
      </div>

      {/* Settings Tabs */}
      <Tabs defaultValue="general" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="business">Business</TabsTrigger>
          <TabsTrigger value="security">Security</TabsTrigger>
          <TabsTrigger value="notifications">Notifications</TabsTrigger>
        </TabsList>

        {/* General Settings */}
        <TabsContent value="general" className="space-y-6">
          <Card className="p-6">
            <h2 className="text-lg font-display font-bold text-gray-900 mb-6">General Settings</h2>
            <div className="space-y-4">
              <div>
                <Label>Store Name</Label>
                <Input placeholder="Isra Hardware" className="mt-2" />
              </div>
              <div>
                <Label>Store Email</Label>
                <Input placeholder="store@example.com" type="email" className="mt-2" />
              </div>
              <div>
                <Label>Store Phone</Label>
                <Input placeholder="+1 (555) 000-0000" className="mt-2" />
              </div>
              <div>
                <Label>Store Address</Label>
                <Input placeholder="123 Main Street, City, State" className="mt-2" />
              </div>
              <Button className="mt-6">Save Changes</Button>
            </div>
          </Card>
        </TabsContent>

        {/* Business Settings */}
        <TabsContent value="business" className="space-y-6">
          <Card className="p-6">
            <h2 className="text-lg font-display font-bold text-gray-900 mb-6">Business Settings</h2>
            <div className="space-y-4">
              <div>
                <Label>Currency</Label>
                <Input placeholder="USD" className="mt-2" />
              </div>
              <div>
                <Label>Tax Rate (%)</Label>
                <Input placeholder="8.5" type="number" className="mt-2" />
              </div>
              <div>
                <Label>Business License</Label>
                <Input placeholder="License Number" className="mt-2" />
              </div>
              <div>
                <Label>Default Supplier</Label>
                <Input placeholder="Select default supplier" className="mt-2" />
              </div>
              <Button className="mt-6">Save Changes</Button>
            </div>
          </Card>
        </TabsContent>

        {/* Security Settings */}
        <TabsContent value="security" className="space-y-6">
          <Card className="p-6">
            <h2 className="text-lg font-display font-bold text-gray-900 mb-6">Security Settings</h2>
            <div className="space-y-4">
              <div>
                <Label>Current Password</Label>
                <Input placeholder="Enter current password" type="password" className="mt-2" />
              </div>
              <div>
                <Label>New Password</Label>
                <Input placeholder="Enter new password" type="password" className="mt-2" />
              </div>
              <div>
                <Label>Confirm Password</Label>
                <Input placeholder="Confirm new password" type="password" className="mt-2" />
              </div>
              <Button className="mt-6">Update Password</Button>
            </div>
          </Card>
        </TabsContent>

        {/* Notifications Settings */}
        <TabsContent value="notifications" className="space-y-6">
          <Card className="p-6">
            <h2 className="text-lg font-display font-bold text-gray-900 mb-6">Notification Preferences</h2>
            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 border border-gray-200 rounded-lg">
                <span className="text-gray-900 font-medium">Low Stock Alerts</span>
                <input type="checkbox" defaultChecked className="h-4 w-4" />
              </div>
              <div className="flex items-center justify-between p-3 border border-gray-200 rounded-lg">
                <span className="text-gray-900 font-medium">New Order Notifications</span>
                <input type="checkbox" defaultChecked className="h-4 w-4" />
              </div>
              <div className="flex items-center justify-between p-3 border border-gray-200 rounded-lg">
                <span className="text-gray-900 font-medium">Delivery Alerts</span>
                <input type="checkbox" defaultChecked className="h-4 w-4" />
              </div>
              <div className="flex items-center justify-between p-3 border border-gray-200 rounded-lg">
                <span className="text-gray-900 font-medium">Daily Reports</span>
                <input type="checkbox" className="h-4 w-4" />
              </div>
              <Button className="mt-6">Save Preferences</Button>
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
