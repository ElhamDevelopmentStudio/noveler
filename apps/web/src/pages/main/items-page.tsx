import React, { useState } from "react";
import useSWR from "swr";
import { Plus, Trash2, Database, AlertCircle, RefreshCw } from "lucide-react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  Button,
  Badge,
} from "@novelova/ui";
import { getItems, createItem, deleteItem } from "../../services/items";

export function ItemsPage() {
  const [selectedStatus, setSelectedStatus] = useState<string>("");
  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { data, error, isLoading, mutate } = useSWR(
    ["/items", selectedStatus],
    () => getItems(1, 50, selectedStatus || undefined),
    { revalidateOnFocus: true },
  );

  const items = data?.items || [];

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    setIsSubmitting(true);
    try {
      await createItem({
        title: newTitle.trim(),
        description: newDescription.trim() || undefined,
        status: "published",
      });
      setNewTitle("");
      setNewDescription("");
      mutate();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to create item");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this item?")) return;
    try {
      await deleteItem(id);
      mutate();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete item");
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Database Items Store
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Real-time CRUD backed by PostgreSQL and SQLAlchemy 2.0.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={() => mutate()}>
            <RefreshCw className="h-4 w-4 mr-1.5" />
            Refresh
          </Button>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200 flex items-center gap-3">
          <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0" />
          <p className="text-sm">
            Error connecting to database: {error.message}
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Create Form */}
        <Card className="lg:col-span-1 h-fit">
          <CardHeader>
            <CardTitle>Create New Record</CardTitle>
            <CardDescription>
              Submit an item to be written to PostgreSQL via Axios.
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
                  placeholder="Enter title..."
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
                  placeholder="Enter item description..."
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <Button type="submit" className="w-full" isLoading={isSubmitting}>
                <Plus className="h-4 w-4 mr-1.5" />
                Add to Database
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Items List */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between pb-4">
            <div>
              <CardTitle>Persisted Records</CardTitle>
              <CardDescription>
                Synced with PostgreSQL via SWR cache.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <select
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                className="text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 focus:outline-none"
              >
                <option value="">All Statuses</option>
                <option value="published">Published</option>
                <option value="draft">Draft</option>
                <option value="archived">Archived</option>
              </select>
              <Badge variant="outline">{items.length} items</Badge>
            </div>
          </CardHeader>

          <CardContent>
            {isLoading ? (
              <div className="py-16 text-center text-sm text-slate-500">
                Fetching records from database...
              </div>
            ) : items.length === 0 ? (
              <div className="py-16 text-center space-y-3">
                <Database className="h-8 w-8 text-slate-400 mx-auto" />
                <p className="text-sm text-slate-500">
                  No records found in the database. Use the form to add one!
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {items.map((item) => (
                  <div
                    key={item.id}
                    className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 flex items-start justify-between gap-4 hover:border-slate-300 dark:hover:border-slate-700 transition-colors"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <h4 className="font-semibold text-sm">{item.title}</h4>
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
                        ID: {item.id} • Created:{" "}
                        {new Date(item.createdAt).toLocaleString()}
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
  );
}

export default ItemsPage;
