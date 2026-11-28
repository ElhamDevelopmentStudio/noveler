import { Link } from "react-router-dom";
import { RiAlertLine, RiHomeLine } from "@remixicon/react";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyIcon,
  EmptyTitle,
  EmptyDescription,
  EmptyAction,
} from "@/components/ui/empty";

export function NotFoundCard() {
  return (
    <Empty className="max-w-md">
      <EmptyIcon className="bg-destructive/10 text-destructive">
        <RiAlertLine className="h-6 w-6" />
      </EmptyIcon>
      <EmptyTitle>404 - Page Not Found</EmptyTitle>
      <EmptyDescription>
        The page you requested could not be located or may have been relocated.
      </EmptyDescription>
      <EmptyAction>
        <Button asChild>
          <Link to="/">
            <RiHomeLine className="h-4 w-4 mr-1.5" aria-hidden="true" />
            Back to Projects
          </Link>
        </Button>
      </EmptyAction>
    </Empty>
  );
}

export default NotFoundCard;
