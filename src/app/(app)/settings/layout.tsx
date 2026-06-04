import { redirect } from "next/navigation";
import Link from "next/link";
import { getServerPermissions } from "@/lib/permissions";

const SETTINGS_NAV = [
  { href: "/settings/users", label: "Users", icon: "👥" },
  { href: "/settings/roles", label: "Roles & Permissions", icon: "🔑" },
  { href: "/settings/clients", label: "Clients", icon: "🏢" },
  { href: "/settings/icds", label: "ICDs", icon: "🏭" },
  { href: "/settings/vessels", label: "Vessels", icon: "🚢" },
];

export default async function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const perms = await getServerPermissions();
  if (!perms?.isAdmin) redirect("/");

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground tracking-tight">Settings</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Manage users, roles, and system configuration.
        </p>
      </div>

      <div className="flex gap-6">
        {/* Side nav */}
        <nav className="w-48 shrink-0">
          <ul className="space-y-1">
            {SETTINGS_NAV.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
                >
                  <span>{item.icon}</span>
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        {/* Content */}
        <div className="flex-1 min-w-0">{children}</div>
      </div>
    </div>
  );
}
