import { Link } from "react-router-dom";
import { AlertTriangle, Home } from "lucide-react";
import { Button } from "@novelova/ui";

export function NotFoundPage() {
  return (
    <div className="py-24 flex flex-col items-center justify-center text-center space-y-4">
      <div className="h-16 w-16 rounded-2xl bg-amber-100 dark:bg-amber-950/60 text-amber-600 flex items-center justify-center">
        <AlertTriangle className="h-8 w-8" />
      </div>
      <h1 className="text-3xl font-extrabold tracking-tight">
        404 - Page Not Found
      </h1>
      <p className="text-sm text-slate-500 max-w-md">
        The page you are looking for doesn't exist or has been moved to another
        location.
      </p>
      <Link to="/">
        <Button variant="primary">
          <Home className="h-4 w-4 mr-1.5" />
          Back to Dashboard
        </Button>
      </Link>
    </div>
  );
}

export default NotFoundPage;
