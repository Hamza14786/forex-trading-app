import { fmt } from "@/lib/market";

export function Change({ value }: { value: number }) {
  const positive = value >= 0;
  return (
    <span className={`num text-sm font-medium ${positive ? "text-up" : "text-down"}`}>
      {positive ? "+" : ""}
      {value.toFixed(2)}%
    </span>
  );
}

export function Price({ value, decimals, up }: { value: number; decimals: number; up: boolean }) {
  return <span className={`num font-semibold ${up ? "text-up" : "text-down"}`}>{fmt(value, decimals)}</span>;
}
