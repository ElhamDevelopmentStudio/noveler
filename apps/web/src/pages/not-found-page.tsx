import { Link } from "react-router-dom";
import { AlertTriangle, Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyIcon,
  EmptyTitle,
  EmptyDescription,
  EmptyAction,
} from "@/components/ui/empty";

export function NotFoundPage() {
  return (
    <div className="py-20 flex justify-center scroll-fade">
      <Empty className="max-w-md">
        <EmptyIcon className="bg-destructive/10 text-destructive">
          <AlertTriangle className="h-6 w-6" />
        </EmptyIcon>
        <EmptyTitle>404 - Page Not Found</EmptyTitle>
        <EmptyDescription>
          The page you requested could not be located or may have been
          relocated.
        </EmptyDescription>
        <EmptyAction>
          <Link to="/">
            <Button>
              <Home className="h-4 w-4 mr-1.5" />
              Back to Dashboard
            </Button>
          </Link>
        </EmptyAction>
      </Empty>
    </div>
  );
}

export default NotFoundPage;
