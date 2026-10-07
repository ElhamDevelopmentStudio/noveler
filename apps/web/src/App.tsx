import React, { useEffect, useState } from "react";
import {
  Server,
  Layers,
  Zap,
  CheckCircle2,
  Plus,
  Trash2,
  ExternalLink,
  RefreshCw,
  AlertCircle,
  Package,
} from "lucide-react";
import {
  Button,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  Badge,
} from "@novelova/ui";
import type { HealthResponse, Item } from "@novelova/shared-types";
import {
  fetchHealth,
  fetchItems,
  createItem,
  deleteItem,
} from "./services/api";

export function App() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadData = async () => {
    try {
      setError(null);
      const [h, itemsResp] = await Promise.all([fetchHealth(), fetchItems()]);
      setHealth(h);
      setItems(itemsResp.items);
    } catch (err) {
      console.error(err);
      setError(
        err instanceof Error ? err.message : "Failed to connect to backend",
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    setIsSubmitting(true);
    try {
      const created = await createItem({
        title: newTitle.trim(),
        description: newDescription.trim() || undefined,
        status: "published",
      });
      setItems((prev) => [created, ...prev]);
      setNewTitle("");
      setNewDescription("");
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to create item");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteItem(id);
      setItems((prev) => prev.filter((item) => item.id !== id));
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete item");
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 p-4 sm:p-8">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Header */}
        <header className="flex flex-col md:flex-row md:items-center md:justify-between border-b border-slate-200 dark:border-slate-800 pb-6 gap-4">
          <div>
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-md shadow-blue-500/20">
                <Zap className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-2xl font-bold tracking-tight">
                  Novelova Monorepo
                </h1>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Modern Polyglot Monorepo: React 19 + FastAPI + Turborepo + uv
                </p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              isLoading={refreshing}
            >
              <RefreshCw className="h-4 w-4 mr-1.5" />
              Refresh
            </Button>
            <a
              href="http://localhost:8000/docs"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center font-medium rounded-lg px-3 py-1.5 text-xs bg-slate-900 text-white dark:bg-slate-800 hover:bg-slate-800 dark:hover:bg-slate-700 transition-colors"
            >
              FastAPI Docs
              <ExternalLink className="h-3 w-3 ml-1.5" />
            </a>
          </div>
        </header>

        {/* Monorepo Architecture Overview */}
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="border-l-4 border-l-blue-500">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs uppercase font-bold text-blue-600 dark:text-blue-400">
                  Frontend
                </p>
                <h4 className="font-semibold mt-1">apps/web</h4>
                <p className="text-xs text-slate-500 mt-1">
                  React 19, Vite, Tailwind CSS
                </p>
              </div>
              <Layers className="h-5 w-5 text-blue-500" />
            </div>
          </Card>

          <Card className="border-l-4 border-l-emerald-500">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs uppercase font-bold text-emerald-600 dark:text-emerald-400">
                  Backend
                </p>
                <h4 className="font-semibold mt-1">apps/api</h4>
                <p className="text-xs text-slate-500 mt-1">
                  FastAPI, Pydantic, Uvicorn
                </p>
              </div>
              <Server className="h-5 w-5 text-emerald-500" />
            </div>
          </Card>

          <Card className="border-l-4 border-l-purple-500">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs uppercase font-bold text-purple-600 dark:text-purple-400">
                  Shared Types & UI
                </p>
                <h4 className="font-semibold mt-1">packages/ui & types</h4>
                <p className="text-xs text-slate-500 mt-1">
                  TypeScript contract & design system
                </p>
              </div>
              <Package className="h-5 w-5 text-purple-500" />
            </div>
          </Card>

          <Card className="border-l-4 border-l-amber-500">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs uppercase font-bold text-amber-600 dark:text-amber-400">
                  Python Core
                </p>
                <h4 className="font-semibold mt-1">packages/python-core</h4>
                <p className="text-xs text-slate-500 mt-1">
                  uv workspace, logging, models
                </p>
              </div>
              <Zap className="h-5 w-5 text-amber-500" />
            </div>
          </Card>
        </section>

        {/* Backend Connectivity Status */}
        <section>
          {error ? (
            <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200 flex items-start gap-3">
              <AlertCircle className="h-5 w-5 mt-0.5 text-amber-600 flex-shrink-0" />
              <div>
                <h4 className="font-semibold text-sm">Backend Not Reachable</h4>
                <p className="text-xs mt-1 text-amber-700 dark:text-amber-300">
                  Ensure the FastAPI backend is running with{" "}
                  <code className="bg-amber-100 dark:bg-amber-900 px-1 py-0.5 rounded">
                    pnpm dev
                  </code>{" "}
                  or{" "}
                  <code className="bg-amber-100 dark:bg-amber-900 px-1 py-0.5 rounded">
                    uv run uvicorn app.main:app --reload
                  </code>
                  .
                </p>
                <p className="text-xs mt-1 text-amber-600 dark:text-amber-400 font-mono">
                  Error: {error}
                </p>
              </div>
            </div>
          ) : health ? (
            <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="h-5 w-5 text-emerald-600 flex-shrink-0" />
                <div>
                  <h4 className="font-semibold text-sm">
                    {health.service} is Connected & Healthy
                  </h4>
                  <p className="text-xs text-emerald-700 dark:text-emerald-300">
                    Version: v{health.version} • Environment:{" "}
                    {health.environment} • Uptime: {health.uptimeSeconds}s
                  </p>
                </div>
              </div>
              <Badge variant="success">Online</Badge>
            </div>
          ) : (
            <div className="p-4 rounded-xl bg-slate-100 dark:bg-slate-800/50 animate-pulse text-sm text-slate-500">
              Checking backend connection...
            </div>
          )}
        </section>

        {/* Live Interaction with Backend */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Create Form */}
          <Card className="lg:col-span-1 h-fit">
            <CardHeader>
              <CardTitle>Create Item</CardTitle>
              <CardDescription>
                Test end-to-end communication from React to FastAPI.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleCreate} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                    Title
                  </label>
                  <input
                    type="text"
                    required
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    placeholder="Enter item title..."
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                    Description
                  </label>
                  <textarea
                    rows={3}
                    value={newDescription}
                    onChange={(e) => setNewDescription(e.target.value)}
                    placeholder="Enter description..."
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <Button
                  type="submit"
                  className="w-full"
                  isLoading={isSubmitting}
                >
                  <Plus className="h-4 w-4 mr-1.5" />
                  Add Item
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* Items List */}
          <Card className="lg:col-span-2">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Live Items Store</CardTitle>
                <CardDescription>
                  Data fetched directly from the FastAPI REST API.
                </CardDescription>
              </div>
              <Badge variant="outline">{items.length} items</Badge>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="py-12 text-center text-sm text-slate-500">
                  Loading items...
                </div>
              ) : items.length === 0 ? (
                <div className="py-12 text-center text-sm text-slate-500">
                  No items found. Create one using the form on the left!
                </div>
              ) : (
                <div className="space-y-3">
                  {items.map((item) => (
                    <div
                      key={item.id}
                      className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 flex items-start justify-between gap-4 transition-all hover:border-slate-300 dark:hover:border-slate-700"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <h4 className="font-semibold text-sm">
                            {item.title}
                          </h4>
                          <Badge
                            variant={
                              item.status === "published"
                                ? "success"
                                : item.status === "draft"
                                  ? "warning"
                                  : "default"
                            }
                          >
                            {item.status}
                          </Badge>
                        </div>
                        {item.description && (
                          <p className="text-xs text-slate-600 dark:text-slate-400">
                            {item.description}
                          </p>
                        )}
                        <p className="text-[11px] text-slate-400 dark:text-slate-500 font-mono">
                          ID: {item.id} • Updated:{" "}
                          {new Date(item.updatedAt).toLocaleTimeString()}
                        </p>
                      </div>
                      <button
                        onClick={() => handleDelete(item.id)}
                        className="text-slate-400 hover:text-rose-600 transition-colors p-1"
                        title="Delete item"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

export default App;
