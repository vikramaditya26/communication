import { ReviewHub } from "@/components/review/ReviewHub";

export const metadata = { title: "Review" };

export default function ReviewPage() {
  return <ReviewHub initial="review" />;
}
