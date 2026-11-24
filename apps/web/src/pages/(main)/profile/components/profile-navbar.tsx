import { Link } from "react-router-dom";
import { RiArrowLeftLine } from "@remixicon/react";
import { AppHeader } from "@/components/app-header";

export function ProfileNavbar() {
  return (
    <AppHeader
      breadcrumbs={[
        { label: "Projects", to: "/projects" },
        { label: "Settings" },
      ]}
      actions={
        <Link
          to="/projects"
          className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-card hover:bg-secondary text-xs font-medium text-foreground transition-colors"
        >
          <RiArrowLeftLine className="h-3.5 w-3.5" />
          <span>Projects</span>
        </Link>
      }
    />
  );
}
