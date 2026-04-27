export function formatTime(date: string) {
  return new Date(date).toLocaleTimeString("de-CH", { hour: "2-digit", minute: "2-digit" });
}

export function formatDate(date: string) {
  return new Date(date).toLocaleDateString("de-CH", { weekday: "short", day: "2-digit", month: "2-digit" });
}

export function formatDuration(clockIn: string, clockOut: string, breakMin: number) {
  const diff = new Date(clockOut).getTime() - new Date(clockIn).getTime() - breakMin * 60000;
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  return `${h}h ${m}m`;
}
