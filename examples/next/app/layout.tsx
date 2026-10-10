import type { ReactNode } from "react";
import { Shell } from "./shell";
import "./globals.css";

export const metadata = { title: "Scree × Next.js", description: "Route changes as Scree transitions." };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
