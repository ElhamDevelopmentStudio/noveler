import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export function RadioTooltipShowcase() {
  const [selectedRadio, setSelectedRadio] = useState("option-1");

  return (
    <Card>
      <CardHeader>
        <CardTitle>Radio Group & Tooltip</CardTitle>
        <CardDescription>
          Accessible single selection and contextual tooltips.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <RadioGroup
          value={selectedRadio}
          onValueChange={setSelectedRadio}
          className="space-y-2"
        >
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="option-1" id="r1" />
            <Label htmlFor="r1">
              Standard Deployment (PostgreSQL + API)
            </Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="option-2" id="r2" />
            <Label htmlFor="r2">Cluster Mode with Redis Queue</Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="option-3" id="r3" />
            <Label htmlFor="r3">Local Dev with SQLite Fallback</Label>
          </div>
        </RadioGroup>

        <div className="pt-2">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="secondary" size="sm">
                  Hover for Tooltip
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Built with Radix UI Tooltip primitive</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </CardContent>
    </Card>
  );
}

export default RadioTooltipShowcase;
