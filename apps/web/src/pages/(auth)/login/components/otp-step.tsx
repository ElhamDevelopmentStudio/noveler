import { useState } from "react";
import { KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
  InputOTPSeparator,
} from "@/components/ui/input-otp";

interface OtpStepProps {
  onSuccess: () => void;
  onBack: () => void;
}

export function OtpStep({ onSuccess, onBack }: OtpStepProps) {
  const [otpValue, setOtpValue] = useState("");

  const handleVerify = () => {
    if (otpValue.length >= 6) {
      onSuccess();
    }
  };

  return (
    <div className="space-y-6 pt-2">
      <div className="flex justify-center">
        <InputOTP
          maxLength={6}
          value={otpValue}
          onChange={(value) => setOtpValue(value)}
        >
          <InputOTPGroup>
            <InputOTPSlot index={0} />
            <InputOTPSlot index={1} />
            <InputOTPSlot index={2} />
          </InputOTPGroup>
          <InputOTPSeparator />
          <InputOTPGroup>
            <InputOTPSlot index={3} />
            <InputOTPSlot index={4} />
            <InputOTPSlot index={5} />
          </InputOTPGroup>
        </InputOTP>
      </div>

      <Button
        className="w-full"
        onClick={handleVerify}
        disabled={otpValue.length < 6}
      >
        <KeyRound className="h-4 w-4 mr-1.5" />
        Verify & Enter
      </Button>

      <div className="text-center">
        <Button variant="ghost" size="sm" onClick={onBack}>
          Back to password login
        </Button>
      </div>
    </div>
  );
}

export default OtpStep;
