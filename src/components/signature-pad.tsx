"use client";

import { useRef } from "react";
import SignatureCanvas from "react-signature-canvas";
import { Button } from "@/components/ui/button";
import { Eraser } from "lucide-react";

interface SignaturePadProps {
  label: string;
  onSave: (dataUrl: string) => void;
  savedUrl?: string | null;
}

export function SignaturePad({ label, onSave, savedUrl }: SignaturePadProps) {
  const sigRef = useRef<SignatureCanvas>(null);

  function handleEnd() {
    if (sigRef.current && !sigRef.current.isEmpty()) {
      onSave(sigRef.current.toDataURL("image/png"));
    }
  }

  function handleClear() {
    sigRef.current?.clear();
    onSave("");
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className="text-sm font-medium">{label}</label>
        <Button type="button" variant="outline" size="sm" onClick={handleClear}>
          <Eraser className="h-3.5 w-3.5 mr-1" />Löschen
        </Button>
      </div>
      <div className="border-2 border-gray-200 rounded-xl overflow-hidden bg-white">
        <SignatureCanvas
          ref={sigRef}
          canvasProps={{
            className: "w-full",
            style: { width: "100%", height: "150px" },
          }}
          onEnd={handleEnd}
          penColor="#1a1a1a"
          backgroundColor="white"
        />
      </div>
      <p className="text-[10px] text-muted-foreground mt-1 text-center">Hier unterschreiben</p>
    </div>
  );
}
