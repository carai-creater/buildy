import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Buildy — AIエージェントの民主化プラットフォーム",
  description:
    "Buildy（ビルディ）は、AIエージェントを「作る人」と「使う人」をつなぐマーケットプレイス兼ノーコード・プラットフォームです。",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
