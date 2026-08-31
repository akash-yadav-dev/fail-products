// src/app/auth/layout.tsx
import { Container } from "@/components/shared/container";

/** Auth screens are single-task: centred, narrow, no page furniture. */
export default function AuthLayout({ children }: LayoutProps<"/auth">) {
  return (
    <Container
      width="prose"
      className="flex flex-1 items-center justify-center py-12 sm:py-20"
    >
      <div className="w-full max-w-md">{children}</div>
    </Container>
  );
}
