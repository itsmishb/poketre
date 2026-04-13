"use client";

import { LogOut } from "lucide-react";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { isDemoMode } from "@/lib/demo";
import { createClient } from "@/lib/supabase/client";

export function NavUser() {
  async function handleLogout() {
    if (isDemoMode) {
      window.location.href = "/login";
      return;
    }
    const supabase = createClient();
    if (supabase) {
      await supabase.auth.signOut();
    }
    window.location.href = "/login";
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton tooltip="ログアウト" onClick={handleLogout}>
          <LogOut />
          <span>ログアウト</span>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
