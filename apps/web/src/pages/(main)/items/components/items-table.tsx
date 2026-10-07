import { Database, Plus, Trash2 } from "lucide-react";
import type { Item } from "@novelova/shared-types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Empty,
  EmptyIcon,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";

interface ItemsTableProps {
  items: Item[];
  isLoading: boolean;
  onAddNew: () => void;
  onDelete: (id: string) => void;
}

export function ItemsTable({
  items,
  isLoading,
  onAddNew,
  onDelete,
}: ItemsTableProps) {
  if (isLoading) {
    return (
      <div className="py-16 text-center text-sm text-muted-foreground">
        Loading records from PostgreSQL...
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <Empty>
        <EmptyIcon>
          <Database className="h-6 w-6" />
        </EmptyIcon>
        <EmptyTitle>No items found</EmptyTitle>
        <EmptyDescription>
          There are currently no items matching the selected filter. Create one
          to get started.
        </EmptyDescription>
        <Button size="sm" onClick={onAddNew}>
          <Plus className="h-4 w-4 mr-1.5" />
          Add First Item
        </Button>
      </Empty>
    );
  }

  return (
    <>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[100px]">ID</TableHead>
              <TableHead>Title</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <TableRow key={item.id}>
                <TableCell className="font-mono text-xs font-semibold">
                  {item.id}
                </TableCell>
                <TableCell className="font-medium">{item.title}</TableCell>
                <TableCell className="text-muted-foreground text-xs max-w-xs truncate">
                  {item.description || "—"}
                </TableCell>
                <TableCell>
                  <Badge
                    variant={
                      item.status === "published"
                        ? "success"
                        : item.status === "draft"
                          ? "warning"
                          : "outline"
                    }
                  >
                    {item.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {new Date(item.createdAt).toLocaleDateString()}
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => onDelete(item.id)}
                    className="h-8 w-8 text-destructive hover:bg-destructive/10"
                  >
                    <Trash2 className="h-4 w-4" />
                    <span className="sr-only">Delete</span>
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      <div className="pt-4">
        <Pagination>
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious href="#" onClick={(e) => e.preventDefault()} />
            </PaginationItem>
            <PaginationItem>
              <PaginationLink href="#" isActive onClick={(e) => e.preventDefault()}>
                1
              </PaginationLink>
            </PaginationItem>
            <PaginationItem>
              <PaginationNext href="#" onClick={(e) => e.preventDefault()} />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      </div>
    </>
  );
}

export default ItemsTable;
