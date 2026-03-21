import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Buildy — AI Agent Marketplace",
  description:
    "Buildy connects people who build AI agents with people who want to use them. A no-code marketplace to discover and run specialized agents.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
