import { useState } from "react";
import useSWR from "swr";
import { RefreshCw } from "lucide-react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TypographyH2, TypographyMuted } from "@/components/ui/typography";
import { getItems, createItem, deleteItem } from "@/services/items";
import type { CreateItemDto } from "@novelova/shared-types";
import { CreateItemDialog } from "./components/create-item-dialog";
import { ItemsFilter } from "./components/items-filter";
import { ItemsTable } from "./components/items-table";

export function ItemsPage() {
  const [selectedStatus, setSelectedStatus] = useState<string>("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const { data, isLoading, mutate } = useSWR(
    ["/items", selectedStatus],
    () => getItems(1, 50, selectedStatus || undefined),
    { revalidateOnFocus: true },
  );

  const items = data?.items || [];

  const handleCreateItem = async (dto: CreateItemDto) => {
    try {
      await createItem(dto);
      mutate();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to create item");
    }
  };

  const handleDeleteItem = async (id: string) => {
    if (!confirm("Are you sure you want to delete this record?")) return;
    try {
      await deleteItem(id);
      mutate();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete item");
    }
  };

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <TypographyH2 className="border-0 pb-0">Database Items</TypographyH2>
          <TypographyMuted>
            Persisted records managed with React Hook Form, Zod, and PostgreSQL.
          </TypographyMuted>
        </div>

        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={() => mutate()}>
            <RefreshCw className="h-4 w-4 mr-1.5" />
            Refresh
          </Button>

          <CreateItemDialog
            open={isDialogOpen}
            onOpenChange={setIsDialogOpen}
            onSubmit={handleCreateItem}
          />
        </div>
      </div>

      {/* Filter ButtonGroup */}
      <ItemsFilter
        selectedStatus={selectedStatus}
        onStatusChange={setSelectedStatus}
        totalCount={items.length}
      />

      {/* Table / Empty Card */}
      <Card>
        <CardHeader>
          <CardTitle>PostgreSQL Data Table</CardTitle>
          <CardDescription>
            Live tabular display rendered with shadcn Table components.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ItemsTable
            items={items}
            isLoading={isLoading}
            onAddNew={() => setIsDialogOpen(true)}
            onDelete={handleDeleteItem}
          />
        </CardContent>
      </Card>
    </div>
  );
}

export default ItemsPage;
