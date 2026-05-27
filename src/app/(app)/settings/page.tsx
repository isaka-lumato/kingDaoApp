import { redirect } from "next/navigation";

// /settings → redirect to /settings/users
export default function SettingsIndexPage() {
  redirect("/settings/users");
}
