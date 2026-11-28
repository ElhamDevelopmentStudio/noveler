import { AppHeader } from "@/components/app-header";

export function ProfileNavbar() {
  return (
    <AppHeader
      breadcrumbs={[
        { label: "Projects", to: "/projects" },
        { label: "Settings" },
      ]}
    />
  );
}
