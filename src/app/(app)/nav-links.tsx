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
            aria-current={active ? "page" : undefined}
            className={[
              "relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors duration-150",
              active
                ? "bg-brand/12 text-brand"
                : "text-sidebar-foreground/65 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
            ].join(" ")}
          >
            {active && (
              <span
                aria-hidden
                className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-brand"
              />
            )}
            {item.icon}
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
