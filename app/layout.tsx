import type { ReactNode } from "react";
import "./globals.css";
import "katex/dist/katex.min.css";

export const metadata = { title: "취업좀하자 — 프로젝트와 공부 기록", description: "공대생의 프로젝트와 공부 기록을 연결하는 포트폴리오 아카이브" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="ko"><body>{children}</body></html>;
}
