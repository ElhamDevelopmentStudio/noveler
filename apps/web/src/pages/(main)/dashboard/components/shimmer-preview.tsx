import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { GlobalLoading } from "@/components/ui/global-loading";

interface ShimmerPreviewProps {
  onClose: () => void;
}

export function ShimmerPreview({ onClose }: ShimmerPreviewProps) {
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={onClose}>
          Close Shimmer Preview
        </Button>
      </div>
      <Card className="p-8">
        <GlobalLoading text="Demonstrating shadcn shimmer loading...." />
      </Card>
    </div>
  );
}

export default ShimmerPreview;
