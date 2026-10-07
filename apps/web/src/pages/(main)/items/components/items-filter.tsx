import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { Badge } from "@/components/ui/badge";

interface ItemsFilterProps {
  selectedStatus: string;
  onStatusChange: (status: string) => void;
  totalCount: number;
}

export function ItemsFilter({
  selectedStatus,
  onStatusChange,
  totalCount,
}: ItemsFilterProps) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <ButtonGroup>
        <Button
          variant={selectedStatus === "" ? "default" : "outline"}
          size="sm"
          onClick={() => onStatusChange("")}
        >
          All
        </Button>
        <Button
          variant={selectedStatus === "published" ? "default" : "outline"}
          size="sm"
          onClick={() => onStatusChange("published")}
        >
          Published
        </Button>
        <Button
          variant={selectedStatus === "draft" ? "default" : "outline"}
          size="sm"
          onClick={() => onStatusChange("draft")}
        >
          Draft
        </Button>
        <Button
          variant={selectedStatus === "archived" ? "default" : "outline"}
          size="sm"
          onClick={() => onStatusChange("archived")}
        >
          Archived
        </Button>
      </ButtonGroup>

      <Badge variant="outline">{totalCount} records</Badge>
    </div>
  );
}

export default ItemsFilter;
