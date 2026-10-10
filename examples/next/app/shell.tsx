"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { MouseEvent, ReactNode } from "react";
import { ScreeStage, useScreeStage } from "scree-react";

const ROUTES = [
  { href: "/", label: "Overview" },
  { href: "/orders", label: "Orders" },
  { href: "/customer", label: "Customer" },
];

/** A link that plays the route change as a Scree transition. Modifier clicks open tabs as usual. */
function ScreeLink({ href, children }: { href: string; children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { go } = useScreeStage();
  const onClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
    event.preventDefault();
    // `to` lets quick clicks queue correctly and ignores a click on where you already are.
    void go(() => router.push(href), { to: href });
  };
  return (
    <Link href={href} onClick={onClick} aria-current={pathname === href ? "page" : undefined}>
      {children}
    </Link>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return (
    <main className="page">
      <ScreeStage routeKey={pathname} effect="pieces" className="app">
        <aside className="side">
          <div className="brand">
            <span className="dot" /> Northwind
          </div>
          <nav>
            {ROUTES.map((route) => (
              <ScreeLink key={route.href} href={route.href}>
                {route.label}
              </ScreeLink>
            ))}
          </nav>
        </aside>
        <section className="content">{children}</section>
      </ScreeStage>
    </main>
  );
}
