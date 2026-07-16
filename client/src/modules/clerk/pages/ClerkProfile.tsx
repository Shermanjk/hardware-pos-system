import { Card } from "@/components/ui/card";
import { useClerkAuth } from "@/shared/contexts/ClerkAuthContext";
import { UserCircle, ShieldCheck, Clock } from "lucide-react";

export default function ClerkProfile() {
  const { clerkUser } = useClerkAuth();

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">My Profile</h1>
        <p className="text-gray-500 mt-1">Your account information</p>
      </div>

      <Card className="p-6">
        <div className="flex items-center gap-5 mb-6">
          <div className="w-16 h-16 bg-blue-600 rounded-xl flex items-center justify-center text-white font-bold text-xl">
            {clerkUser?.avatar ?? "IC"}
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-900">{clerkUser?.name}</h2>
            <p className="text-blue-600 font-medium text-sm">Inventory Clerk</p>
            <p className="text-gray-500 text-sm">@{clerkUser?.username}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="flex items-start gap-3 p-4 bg-gray-50 rounded-lg">
            <UserCircle className="h-5 w-5 text-blue-600 mt-0.5" />
            <div>
              <p className="text-xs text-gray-500 font-medium">Full Name</p>
              <p className="text-sm font-semibold text-gray-900">{clerkUser?.name}</p>
            </div>
          </div>
          <div className="flex items-start gap-3 p-4 bg-gray-50 rounded-lg">
            <ShieldCheck className="h-5 w-5 text-green-600 mt-0.5" />
            <div>
              <p className="text-xs text-gray-500 font-medium">Role</p>
              <p className="text-sm font-semibold text-gray-900">Inventory Clerk</p>
            </div>
          </div>
          <div className="flex items-start gap-3 p-4 bg-gray-50 rounded-lg">
            <Clock className="h-5 w-5 text-purple-600 mt-0.5" />
            <div>
              <p className="text-xs text-gray-500 font-medium">Shift</p>
              <p className="text-sm font-semibold text-gray-900">Day Shift</p>
            </div>
          </div>
        </div>
      </Card>

      <Card className="p-6 border-amber-200 bg-amber-50">
        <p className="text-sm text-amber-800 font-medium">
          To update your profile information or change your password, please contact the System Administrator.
        </p>
      </Card>
    </div>
  );
}
