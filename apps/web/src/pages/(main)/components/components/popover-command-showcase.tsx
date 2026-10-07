import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";
import { TypographyH4, TypographyP } from "@/components/ui/typography";

export function PopoverCommandShowcase() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Popover & Command</CardTitle>
        <CardDescription>
          Dropdown overlay and filterable command menu.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-4">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm">
                Open Popover
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80">
              <div className="grid gap-2">
                <TypographyH4 className="text-sm">Popover Settings</TypographyH4>
                <TypographyP className="text-xs text-muted-foreground !mt-0">
                  Configure application environment properties directly inside a
                  floating popover.
                </TypographyP>
              </div>
            </PopoverContent>
          </Popover>
        </div>

        <div className="border rounded-lg p-2 bg-card">
          <Command className="rounded-lg border shadow-sm">
            <CommandInput placeholder="Type a command or search..." />
            <CommandList>
              <CommandEmpty>No results found.</CommandEmpty>
              <CommandGroup heading="Suggestions">
                <CommandItem>Dashboard</CommandItem>
                <CommandItem>PostgreSQL Items</CommandItem>
                <CommandItem>APScheduler Jobs</CommandItem>
              </CommandGroup>
            </CommandList>
          </Command>
        </div>
      </CardContent>
    </Card>
  );
}

export default PopoverCommandShowcase;
