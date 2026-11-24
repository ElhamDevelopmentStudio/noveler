import { AppHeader } from "@/components/app-header";

export function CreateProjectHeader() {
  return (
    <AppHeader
      breadcrumbs={[
        { label: "Projects", to: "/projects" },
        { label: "New Project" },
      ]}
    />
  );
}
