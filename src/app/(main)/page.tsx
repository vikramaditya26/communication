import { LibraryView } from "@/components/library/LibraryView";
import { LIBRARY } from "@/lib/library";

export default function LibraryPage() {
  return <LibraryView books={LIBRARY} />;
}
