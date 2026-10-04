import { notFound } from "next/navigation";
import AuthCheck from "./auth-check.tsx";

export default function Page() {
  // 백엔드 실연결 검증용 화면. 배포 빌드에서는 공개하지 않는다.
  if (process.env.NODE_ENV !== "development") notFound();
  return <AuthCheck />;
}
