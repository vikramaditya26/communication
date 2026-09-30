import { ReviewHub } from "@/components/review/ReviewHub";

export const metadata = { title: "Progress" };

// Progress lives on the same page as Review; this address opens it on the Progress tab.
export default function ProgressPage() {
  return <ReviewHub initial="progress" />;
}
