"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Mail, Phone, Shield, User } from "lucide-react";
import { USER_ROLES } from "@/lib/constants";
import type { Profile } from "@/types";

export function TeamMemberCard({ profile, onToggleRole }: { profile: Profile; onToggleRole: (p: Profile) => void }) {
  const isAdmin = profile.role === "admin";
  return (
    <Card className="bg-card border-gray-100 hover:border-gray-200 transition-colors">
      <CardContent className="p-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className={`h-10 w-10 rounded-xl flex items-center justify-center text-white text-sm font-bold shadow-sm ${isAdmin ? "bg-gradient-to-br from-red-500 to-red-700" : "bg-gradient-to-br from-gray-400 to-gray-600"}`}>
            {profile.full_name.charAt(0).toUpperCase()}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-sm">{profile.full_name}</h3>
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold rounded-full ${isAdmin ? "bg-red-50 text-red-600" : "bg-gray-100 text-gray-500"}`}>
                {isAdmin ? <Shield className="h-2.5 w-2.5" /> : <User className="h-2.5 w-2.5" />}
                {USER_ROLES[profile.role]}
              </span>
            </div>
            <div className="flex items-center gap-3 mt-0.5">
              <a href={`mailto:${profile.email}`} className="text-xs text-muted-foreground flex items-center gap-1 hover:text-blue-600 transition-colors">
                <Mail className="h-3 w-3" />{profile.email}
              </a>
              {profile.phone && (
                <a href={`tel:${profile.phone}`} className="text-xs text-muted-foreground flex items-center gap-1 hover:text-blue-600 transition-colors">
                  <Phone className="h-3 w-3" />{profile.phone}
                </a>
              )}
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={() => onToggleRole(profile)}
          className="kasten kasten-muted"
        >
          {isAdmin ? "Zu Techniker" : "Zu Admin"}
        </button>
      </CardContent>
    </Card>
  );
}
