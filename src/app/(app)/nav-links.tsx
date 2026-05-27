"use client";

import Link from "next/link";
import type { NavItem } from "./app-shell";

type Props = {
  items: NavItem[];
  pathname: string;
  onItemClick?: () => void;
};

/**
 * Top-level component (not defined inside render) to satisfy the
 * react/no-unstable-nested-components ESLint rule.
 */
export function NavLinks({ items, pathname, onItemClick }: Props) {
  return (
    <nav className="flex-1 space-y-0.5 px-3 py-4">
      {items.map((item) => {
        const active =
          item.href === "/"
            ? pathname === "/"
            : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onItemClick}
            className={[
              "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-150",
              active
                ? "bg-brand text-brand-foreground shadow-sm shadow-brand/20"
                : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
            ].join(" ")}
          >
            {item.icon}
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
