"use client";

import { useEffect, useState } from "react";

export function LiveTimer({ clockIn }: { clockIn: string }) {
  const [elapsed, setElapsed] = useState("");

  useEffect(() => {
    function update() {
      const diff = Date.now() - new Date(clockIn).getTime();
      const h = Math.floor(diff / 3600000).toString().padStart(2, "0");
      const m = Math.floor((diff % 3600000) / 60000).toString().padStart(2, "0");
      setElapsed(`${h}:${m}`);
    }
    update();
    const interval = setInterval(update, 30000);
    return () => clearInterval(interval);
  }, [clockIn]);

  return <span className="text-sm font-mono font-semibold text-green-700">{elapsed}</span>;
}
