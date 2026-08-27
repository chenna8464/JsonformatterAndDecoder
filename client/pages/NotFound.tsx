import { useLocation, Link } from "react-router-dom";
import { useEffect } from "react";
import { FileQuestion, Home, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error(
      "404 Error: User attempted to access non-existent route:",
      location.pathname,
    );
  }, [location.pathname]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background text-foreground p-4">
      <div className="max-w-md w-full text-center space-y-6 p-8 rounded-2xl border border-border/40 bg-card/60 backdrop-blur-md shadow-2xl">
        <div className="w-16 h-16 rounded-2xl bg-teal-500/10 text-teal-500 border border-teal-500/20 flex items-center justify-center mx-auto">
          <FileQuestion className="w-8 h-8" />
        </div>

        <div className="space-y-2">
          <h1 className="text-4xl font-extrabold tracking-tight">404 Page Not Found</h1>
          <p className="text-muted-foreground text-sm">
            We couldn't find the page or route at <code className="text-teal-400 bg-muted px-1.5 py-0.5 rounded font-mono text-xs">{location.pathname}</code>.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
          <Button asChild variant="default" className="w-full sm:w-auto bg-teal-600 hover:bg-teal-700 text-white gap-2">
            <Link to="/">
              <Home className="w-4 h-4" />
              Launch Workspace
            </Link>
          </Button>
          <Button asChild variant="outline" className="w-full sm:w-auto gap-2">
            <Link to="#" onClick={() => window.history.back()}>
              <ArrowLeft className="w-4 h-4" />
              Go Back
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
};

export default NotFound;

