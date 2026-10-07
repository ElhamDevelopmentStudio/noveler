import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Badge } from "@/components/ui/badge";

interface JobsFilterProps {
  filterMode: string;
  onFilterChange: (mode: string) => void;
  count: number;
}

export function JobsFilter({
  filterMode,
  onFilterChange,
  count,
}: JobsFilterProps) {
  return (
    <div className="flex items-center justify-between gap-4">
      <ToggleGroup
        type="single"
        value={filterMode}
        onValueChange={(val) => val && onFilterChange(val)}
        className="justify-start"
      >
        <ToggleGroupItem value="all" aria-label="Show all jobs">
          All Jobs
        </ToggleGroupItem>
        <ToggleGroupItem value="active" aria-label="Show active jobs">
          Active Only
        </ToggleGroupItem>
        <ToggleGroupItem value="paused" aria-label="Show paused jobs">
          Paused
        </ToggleGroupItem>
      </ToggleGroup>

      <Badge variant="outline">{count} configured</Badge>
    </div>
  );
}

export default JobsFilter;
