import { redirect } from "next/navigation";

/** Fallback if "/" is not caught by next.config redirects (e.g. local dev edge cases). */
export default function Home() {
  redirect("/index.html");
}
